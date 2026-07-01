import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

function timeAgo(iso) {
  if (!iso) return 'never'
  const diffSec = (Date.now() - new Date(iso).getTime()) / 1000
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

export default function SimpleFINPanel() {
  const [connection, setConnection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState('')
  const [status, setStatus] = useState(null)
  const [message, setMessage] = useState('')
  const [debugData, setDebugData] = useState(null)

  const loadConnection = async () => {
    const { data } = await supabase.from('simplefin_connection').select('*').eq('id', 1).maybeSingle()
    setConnection(data)
    setLoading(false)
  }

  useEffect(() => { loadConnection() }, [])

  const connect = async () => {
    if (!token.trim()) return
    setStatus('connecting')
    setMessage('Claiming setup token…')
    try {
      const res = await fetch('/api/simplefin-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup_token: token.trim() }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to connect')
      setToken('')
      setStatus('done')
      setMessage('Connected. Click "Sync now" to import.')
      await loadConnection()
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  const syncNow = async () => {
    setStatus('syncing')
    setMessage('Pulling from SimpleFIN…')
    try {
      const res = await fetch('/api/simplefin-sync', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Sync failed')
      setStatus('done')
      setMessage(
        `Imported ${body.imported} transactions` +
        (body.duplicates > 0 ? ` (${body.duplicates} dupes skipped)` : '') +
        (body.ai_categorized > 0 ? ` · ${body.ai_categorized} AI-categorized` : '')
      )
      await loadConnection()
      // Supabase real-time subscription in AppContext will pick up new rows.
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  const inspectSimpleFIN = async () => {
    setStatus('inspecting')
    setMessage('Pulling raw data from SimpleFIN…')
    setDebugData(null)
    try {
      const res = await fetch('/api/simplefin-debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 14 }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Inspect failed')
      setDebugData(body)
      setStatus('done')
      setMessage(`Pulled ${body.accounts.reduce((s, a) => s + a.transaction_count, 0)} transactions from the last ${body.window.days} days`)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  const disconnect = async () => {
    if (!confirm('Disconnect SimpleFIN? You can reconnect later with a new setup token.')) return
    await supabase.from('simplefin_connection').delete().eq('id', 1)
    setConnection(null)
  }

  if (loading) return null

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-800 text-sm">Auto-sync via SimpleFIN</h3>
        {connection && (
          <button onClick={disconnect} className="text-xs text-gray-400 hover:text-red-500">
            Disconnect
          </button>
        )}
      </div>

      {!connection ? (
        <>
          <p className="text-xs text-gray-500 mb-2">
            Paste the setup token from{' '}
            <a href="https://beta-bridge.simplefin.org/" target="_blank" rel="noreferrer" className="text-blue-600 underline">
              beta-bridge.simplefin.org
            </a>{' '}
            to link your bank accounts.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Setup token (base64 string)"
              className="flex-1 min-w-0 text-xs border border-gray-300 rounded px-2 py-1.5 font-mono"
              disabled={status === 'connecting'}
            />
            <button
              onClick={connect}
              disabled={!token.trim() || status === 'connecting'}
              className="px-3 py-2 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300"
            >
              Connect
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-gray-600">
            Last synced: <strong className="text-gray-800">{timeAgo(connection.last_synced_at)}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={inspectSimpleFIN}
              disabled={status === 'inspecting' || status === 'syncing'}
              className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title="Show the raw 14-day transaction list from SimpleFIN without saving"
            >
              {status === 'inspecting' ? 'Loading…' : 'Inspect'}
            </button>
            <button
              onClick={syncNow}
              disabled={status === 'syncing'}
              className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300"
            >
              {status === 'syncing' ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        </div>
      )}

      {debugData && (
        <div className="mt-3 border border-gray-200 rounded bg-white max-h-80 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50 sticky top-0">
            <span className="text-xs font-medium text-gray-700">
              Raw SimpleFIN data · {debugData.window.start_date} → {debugData.window.end_date}
            </span>
            <button
              onClick={() => setDebugData(null)}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              ✕
            </button>
          </div>
          {debugData.accounts.map((acct, ai) => (
            <div key={ai} className="px-3 py-2 border-b border-gray-100 last:border-b-0">
              <p className="text-xs font-semibold text-gray-800">
                {acct.org} · {acct.name}
                <span className="ml-2 font-normal text-gray-500">({acct.transaction_count} txs)</span>
              </p>
              {acct.transactions.length > 0 && (
                <div className="mt-1.5 overflow-x-auto">
                <table className="w-full text-[11px] min-w-[420px]">
                  <thead className="text-gray-400">
                    <tr>
                      <th className="text-left font-normal pr-2">transacted_at</th>
                      <th className="text-left font-normal pr-2">posted</th>
                      <th className="text-left font-normal pr-2">pending</th>
                      <th className="text-right font-normal pr-2">amount</th>
                      <th className="text-left font-normal">payee / description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acct.transactions.map((t, i) => (
                      <tr key={i} className="text-gray-700">
                        <td className="pr-2 font-mono">{t.transacted_at || '—'}</td>
                        <td className="pr-2 font-mono">{t.posted || '—'}</td>
                        <td className="pr-2">{t.pending ? 'yes' : ''}</td>
                        <td className="pr-2 text-right font-mono">{t.amount.toFixed(2)}</td>
                        <td className="truncate max-w-xs">{t.payee || t.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {message && (status === 'done' || status === 'error' || status === 'syncing' || status === 'connecting' || status === 'inspecting') && (
        <div
          className={`mt-2 text-xs rounded px-2 py-1.5 ${
            status === 'error' ? 'bg-red-50 text-red-700' :
            status === 'done' ? 'bg-green-50 text-green-700' :
            'bg-blue-50 text-blue-700'
          }`}
        >
          {message}
        </div>
      )}
    </div>
  )
}
