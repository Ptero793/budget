import { useState, useRef } from 'react'
import { parseCSV } from '../../lib/csvParser'
import { categorizeLocally, categorizeWithAI } from '../../lib/categorizer'
import { logCategorizationCost } from '../../lib/db'
import { useApp } from '../../context/AppContext'

export default function CSVUploader() {
  const { state, dispatch } = useApp()
  const [status, setStatus] = useState(null) // null | 'parsing' | 'ai' | 'done' | 'error'
  const [message, setMessage] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const processFile = async (file) => {
    setStatus('parsing')
    setMessage(`Parsing ${file.name}…`)

    try {
      const { transactions, provider } = await parseCSV(file)

      const { ready, needsAI } = categorizeLocally(transactions, state.merchantOverrides)

      let final = ready
      if (needsAI.length > 0) {
        setStatus('ai')
        setMessage(`Categorizing ${needsAI.length} transactions with AI…`)
        try {
          const { transactions: aiCategorized, usage } = await categorizeWithAI(needsAI, state.categories)
          final = [...ready, ...aiCategorized]
          logCategorizationCost(usage) // fire and forget
        } catch {
          // AI failed — mark remaining as UNCATEGORIZED and continue
          final = [
            ...ready,
            ...needsAI.map(t => ({ ...t, category: 'UNCATEGORIZED', categorizationSource: null, categorizationConfidence: null })),
          ]
        }
      }

      const existingIds = new Set(state.transactions.map(t => t.id))
      const added = final.filter(t => !existingIds.has(t.id))
      const dupes = final.length - added.length

      setStatus('ai')
      setMessage('Saving to database…')
      await dispatch({ type: 'ADD_TRANSACTIONS', transactions: final })

      setStatus('done')
      setMessage(
        `Imported ${added.length} transactions from ${provider === 'chase' ? 'Chase' : 'AmEx'}` +
        (dupes > 0 ? ` (${dupes} duplicate${dupes > 1 ? 's' : ''} skipped)` : '') +
        (needsAI.length > 0 ? ` · ${needsAI.length} categorized by AI` : '')
      )
      setTimeout(() => setStatus(null), 5000)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const isProcessing = status === 'parsing' || status === 'ai'

  return (
    <div className="space-y-3">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isProcessing && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
          dragging
            ? 'border-blue-400 bg-blue-50'
            : isProcessing
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
            : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.CSV,text/csv,application/csv"
          onChange={handleFileChange}
          className="hidden"
        />
        {isProcessing ? (
          <div className="flex items-center justify-center gap-2 text-blue-600">
            <span className="animate-spin text-xl">⏳</span>
            <span className="text-sm font-medium">{message}</span>
          </div>
        ) : (
          <>
            <p className="text-3xl mb-2">📤</p>
            <p className="text-sm font-medium text-gray-700">
              Drop a CSV here or <span className="text-blue-600">click to upload</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">Chase Sapphire · American Express</p>
          </>
        )}
      </div>

      {status === 'done' && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
          <span>✓</span>
          <span>{message}</span>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
          <span>⚠</span>
          <span>{message}</span>
          <button onClick={() => setStatus(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
    </div>
  )
}
