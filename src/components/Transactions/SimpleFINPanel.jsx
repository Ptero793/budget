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
          <div className="flex gap-2">
            <input
              type="text"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Setup token (base64 string)"
              className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 font-mono"
              disabled={status === 'connecting'}
            />
            <button
              onClick={connect}
              disabled={!token.trim() || status === 'connecting'}
              className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300"
            >
              Connect
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-600">
            Last synced: <strong className="text-gray-800">{timeAgo(connection.last_synced_at)}</strong>
          </span>
          <button
            onClick={syncNow}
            disabled={status === 'syncing'}
            className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300"
          >
            {status === 'syncing' ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      )}

      {message && (status === 'done' || status === 'error' || status === 'syncing' || status === 'connecting') && (
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
