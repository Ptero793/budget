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

    // 1 day overlap with the last successful sync, which is enough to catch
    // any late-arriving transactions. First-ever sync falls back to a 1-day
    // window — the historical backfill is a one-time SQL setup, not in code.
    const startSec = conn.last_synced_at
      ? Math.floor(new Date(conn.last_synced_at).getTime() / 1000) - 86400
      : Math.floor(Date.now() / 1000) - 86400
    const endSec = Math.floor(Date.now() / 1000)

    // SimpleFIN access URLs embed creds (https://user:pass@host/...).
    // Node's fetch (undici) refuses URLs with credentials, so extract them
    // into a Basic auth header and request the cleaned URL.
    const parsed = new URL(conn.access_url.replace(/\/$/, '') + '/accounts')
    const basicAuth = Buffer.from(`${parsed.username}:${parsed.password}`).toString('base64')
    parsed.username = ''
    parsed.password = ''
    parsed.searchParams.set('start-date', String(startSec))
    parsed.searchParams.set('end-date', String(endSec))

    const sfRes = await fetch(parsed.toString(), {
      headers: { Authorization: `Basic ${basicAuth}` },
    })
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
        // Prefer transacted_at (the merchant's transaction date — matches
        // Chase CSV "Transaction Date") over posted (which lags 1-2 days
        // and causes date drift vs. CSV uploads).
        const dateSec = t.transacted_at ?? t.posted
        if (!dateSec) continue
        const date = new Date(dateSec * 1000).toISOString().slice(0, 10)
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

    // Drop any IDs that already exist (exact-hash match)
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

    // Fuzzy dedup: since we now pull transacted_at (the merchant's date,
    // same as CSV "Transaction Date"), the same purchase from CSV and from
    // SimpleFIN should share the same date. Match on source + amount + date
    // — no description, since description text differs between providers.
    // Risk: two distinct same-amount purchases at different merchants on
    // the same day from the same card get falsely merged. With the backfill
    // window pinned to the connection date, that risk only exists for
    // ~1 day per sync.
    let fuzzyKeys = new Set()
    const candidateRows = txs.filter(t => !existingIds.has(t.id))
    if (candidateRows.length > 0) {
      const dates = [...new Set(candidateRows.map(t => t.date))]
      const { data: existingForDates, error: fzErr } = await supabase
        .from('transactions')
        .select('date, amount, source')
        .in('date', dates)
      if (fzErr) throw new Error(`fuzzy-dedup check: ${fzErr.message}`)
      for (const r of existingForDates ?? []) {
        fuzzyKeys.add(`${r.source}|${r.date}|${Math.round(parseFloat(r.amount) * 100)}`)
      }
    }

    const newTxs = candidateRows.filter(t => {
      const key = `${t.source}|${t.date}|${Math.round(t.amount * 100)}`
      return !fuzzyKeys.has(key)
    })

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
      exact_dupes: existingIds.size,
      fuzzy_dupes: candidateRows.length - newTxs.length,
      ai_categorized: aiCategorized,
    })
  } catch (err) {
    console.error('[simplefin-sync]', err)
    res.status(500).json({ error: err.message })
  }
}
