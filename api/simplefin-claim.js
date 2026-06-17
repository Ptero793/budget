import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { setup_token } = req.body ?? {}
  if (!setup_token || typeof setup_token !== 'string') {
    return res.status(400).json({ error: 'setup_token is required' })
  }

  try {
    // SimpleFIN setup tokens are base64-encoded one-time-use URLs.
    const claimUrl = Buffer.from(setup_token.trim(), 'base64').toString('utf-8').trim()
    if (!/^https?:\/\//.test(claimUrl)) {
      throw new Error('Setup token did not decode to a valid URL')
    }

    const claimRes = await fetch(claimUrl, { method: 'POST' })
    if (!claimRes.ok) {
      const body = await claimRes.text()
      throw new Error(`Claim failed (${claimRes.status}): ${body.slice(0, 200)}`)
    }

    const access_url = (await claimRes.text()).trim()
    if (!/^https?:\/\//.test(access_url)) {
      throw new Error('Claim response was not a valid access URL')
    }

    const { error } = await supabase
      .from('simplefin_connection')
      .upsert({ id: 1, access_url, last_synced_at: null })
    if (error) throw new Error(`DB error: ${error.message}`)

    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[simplefin-claim]', err)
    res.status(500).json({ error: err.message })
  }
}
