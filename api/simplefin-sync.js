import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Mirrors src/lib/utils.js transactionId() so SimpleFIN-imported rows collide
// with manually-uploaded CSV rows for the same purchase (= idempotent dedup).
function transactionId(date, description, amount, source) {
  const str = `${date}|${description.trim().toLowerCase()}|${Math.round(amount * 100)}|${source}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(31, hash) + str.charCodeAt(i)
    hash |= 0
  }
  return `tx_${Math.abs(hash).toString(16)}_${source}`
}

function mapSource(orgName = '') {
  const lower = orgName.toLowerCase()
  if (lower.includes('chase')) return 'chase'
  if (lower.includes('american express') || lower.includes('amex')) return 'amex'
  return 'simplefin'
}

function isPayment(description, amount) {
  return amount < 0 && /payment|autopay|thank you/i.test(description)
}

async function categorizeViaApi(req, transactions, categories) {
  const host = process.env.VERCEL_URL || req.headers.host
  const proto = host?.includes('localhost') ? 'http' : 'https'
  const url = `${proto}://${host}/api/categorize`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transactions: transactions.map(t => ({ description: t.description, amount: t.amount })),
      categories,
    }),
  })
  if (!res.ok) throw new Error(`categorize endpoint returned ${res.status}`)
  const json = await res.json()
  return json.results ?? []
}

export default async function handler(req, res) {
  try {
    const { data: conn, error: connErr } = await supabase
      .from('simplefin_connection')
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    if (connErr) throw new Error(`load connection: ${connErr.message}`)
    if (!conn) return res.status(400).json({ error: 'No SimpleFIN connection configured' })

    // Overlap the previous sync by 2 days to catch late-posted transactions.
    const startSec = conn.last_synced_at
      ? Math.floor(new Date(conn.last_synced_at).getTime() / 1000) - 2 * 86400
      : Math.floor(Date.now() / 1000) - 30 * 86400
    const endSec = Math.floor(Date.now() / 1000)

    const url = new URL(conn.access_url.replace(/\/$/, '') + '/accounts')
    url.searchParams.set('start-date', String(startSec))
    url.searchParams.set('end-date', String(endSec))

    const sfRes = await fetch(url.toString())
    if (!sfRes.ok) {
      const body = await sfRes.text()
      throw new Error(`SimpleFIN /accounts ${sfRes.status}: ${body.slice(0, 200)}`)
    }
    const data = await sfRes.json()

    const txs = []
    for (const account of data.accounts ?? []) {
      const source = mapSource(account.org?.name)
      for (const t of account.transactions ?? []) {
        // SimpleFIN convention: positive = deposit, negative = withdrawal.
        // App convention: positive = expense, so flip the sign.
        const amount = -parseFloat(t.amount)
        if (!Number.isFinite(amount)) continue
        const date = new Date((t.posted ?? t.transacted_at) * 1000).toISOString().slice(0, 10)
        const description = (t.payee || t.description || '').trim()
        if (!description) continue
        const id = transactionId(date, description, amount, source)
        const _payment = isPayment(description, amount)
        txs.push({
          id,
          date,
          description,
          amount,
          source,
          category: _payment ? 'IGNORE' : null,
          categorization_source: _payment ? 'auto' : null,
        })
      }
    }

    // Drop any IDs that already exist
    let existingIds = new Set()
    if (txs.length > 0) {
      const ids = txs.map(t => t.id)
      const { data: existing, error: exErr } = await supabase
        .from('transactions')
        .select('id')
        .in('id', ids)
      if (exErr) throw new Error(`existing-id check: ${exErr.message}`)
      existingIds = new Set((existing ?? []).map(r => r.id))
    }
    const newTxs = txs.filter(t => !existingIds.has(t.id))

    // AI categorize the un-flagged remainder
    const needsCategorize = newTxs.filter(t => t.category === null)
    let aiCategorized = 0
    if (needsCategorize.length > 0) {
      try {
        const { data: cats } = await supabase.from('categories').select('name')
        const categoryList = (cats ?? [])
          .map(c => c.name)
          .filter(n => n !== 'UNCATEGORIZED')
        const results = await categorizeViaApi(req, needsCategorize, categoryList)
        needsCategorize.forEach((t, i) => {
          const r = results[i]
          if (r && r.category) {
            t.category = r.category
            t.categorization_source = 'ai'
          } else {
            t.category = 'UNCATEGORIZED'
          }
        })
        aiCategorized = needsCategorize.length
      } catch (err) {
        console.error('[simplefin-sync] categorize failed:', err.message)
        needsCategorize.forEach(t => { t.category = 'UNCATEGORIZED' })
      }
    }

    if (newTxs.length > 0) {
      for (let i = 0; i < newTxs.length; i += 50) {
        const { error } = await supabase
          .from('transactions')
          .upsert(newTxs.slice(i, i + 50))
        if (error) throw new Error(`upsert: ${error.message}`)
      }
    }

    await supabase
      .from('simplefin_connection')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', 1)

    res.status(200).json({
      ok: true,
      imported: newTxs.length,
      duplicates: txs.length - newTxs.length,
      ai_categorized: aiCategorized,
    })
  } catch (err) {
    console.error('[simplefin-sync]', err)
    res.status(500).json({ error: err.message })
  }
}
