import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Read-only: hits SimpleFIN with a configurable window and returns the raw
// transaction list per account. No DB writes. Use to check whether
// SimpleFIN actually has a transaction before debugging our sync logic.
export default async function handler(req, res) {
  try {
    const days = Math.min(Math.max(Number(req.body?.days ?? 7), 1), 90)

    const { data: conn } = await supabase
      .from('simplefin_connection')
      .select('access_url')
      .eq('id', 1)
      .maybeSingle()

    if (!conn) return res.status(400).json({ error: 'No SimpleFIN connection configured' })

    const startSec = Math.floor(Date.now() / 1000) - days * 86400
    const endSec = Math.floor(Date.now() / 1000)

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

    const accounts = (data.accounts ?? []).map(account => {
      const txs = (account.transactions ?? []).map(t => ({
        transacted_at: t.transacted_at ? new Date(t.transacted_at * 1000).toISOString().slice(0, 10) : null,
        posted: t.posted ? new Date(t.posted * 1000).toISOString().slice(0, 10) : null,
        pending: t.pending,
        amount: parseFloat(t.amount),
        payee: t.payee,
        description: t.description,
      }))
      txs.sort((a, b) => (a.transacted_at ?? a.posted ?? '').localeCompare(b.transacted_at ?? b.posted ?? ''))
      return {
        org: account.org?.name,
        name: account.name,
        balance: account.balance,
        balance_date: account.balance_date ? new Date(account.balance_date * 1000).toISOString() : null,
        transaction_count: txs.length,
        transactions: txs,
      }
    })

    res.status(200).json({
      window: {
        start_date: new Date(startSec * 1000).toISOString().slice(0, 10),
        end_date:   new Date(endSec * 1000).toISOString().slice(0, 10),
        days,
      },
      accounts,
    })
  } catch (err) {
    console.error('[simplefin-debug]', err)
    res.status(500).json({ error: err.message })
  }
}
