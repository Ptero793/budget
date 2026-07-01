import { useState, useRef, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { normalizeMerchant } from '../../lib/utils'

const SOURCE_LABELS = {
  rule: { text: 'rule', color: 'bg-gray-100 text-gray-500' },
  ai: { text: 'AI', color: 'bg-blue-100 text-blue-600' },
  manual: { text: 'manual', color: 'bg-purple-100 text-purple-600' },
  override: { text: 'saved', color: 'bg-green-100 text-green-600' },
  auto: { text: 'auto', color: 'bg-gray-100 text-gray-400' },
}

export default function CategoryDropdown({ transaction }) {
  const { state, dispatch } = useApp()
  const { categories } = state
  const [adding, setAdding] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [showMerchantPrompt, setShowMerchantPrompt] = useState(false)
  const [pendingCategory, setPendingCategory] = useState(null)
  const newCatRef = useRef(null)

  useEffect(() => {
    if (adding && newCatRef.current) newCatRef.current.focus()
  }, [adding])

  const handleChange = (category) => {
    dispatch({
      type: 'UPDATE_TRANSACTION',
      id: transaction.id,
      updates: { category, categorizationSource: 'manual' },
    })
    setPendingCategory(category)
    setShowMerchantPrompt(true)
  }

  const handleMerchantOverride = (applyToExisting) => {
    const merchantKey = normalizeMerchant(transaction.description)
    dispatch({
      type: 'SET_MERCHANT_OVERRIDE',
      merchantKey,
      category: pendingCategory,
      applyToExisting,
    })
    setShowMerchantPrompt(false)
    setPendingCategory(null)
  }

  const handleAddCategory = (e) => {
    e.preventDefault()
    const name = newCat.trim()
    if (!name) return
    dispatch({ type: 'ADD_CATEGORY', category: name })
    handleChange(name.toUpperCase())
    setAdding(false)
    setNewCat('')
  }

  const displayCategories = categories.filter(c => c !== 'UNCATEGORIZED' && c !== 'IGNORE')
  const src = SOURCE_LABELS[transaction.categorizationSource]

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <select
          value={transaction.category || 'UNCATEGORIZED'}
          onChange={e => handleChange(e.target.value)}
          className={`text-xs rounded px-2 py-1 border focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[180px] ${
            !transaction.category || transaction.category === 'UNCATEGORIZED'
              ? 'border-amber-300 bg-amber-50 text-amber-700'
              : 'border-gray-200 bg-white text-gray-700'
          }`}
        >
          <option value="UNCATEGORIZED">— Uncategorized —</option>
          <option value="IGNORE">IGNORE</option>
          <optgroup label="Categories">
            {displayCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </optgroup>
        </select>

        <button
          onClick={() => setAdding(true)}
          title="Add new category"
          className="text-gray-400 hover:text-blue-600 text-sm font-bold leading-none"
        >
          +
        </button>

        {src && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${src.color}`}>
            {src.text}
          </span>
        )}
      </div>

      {adding && (
        <form onSubmit={handleAddCategory} className="mt-1 flex gap-1">
          <input
            ref={newCatRef}
            value={newCat}
            onChange={e => setNewCat(e.target.value)}
            placeholder="New category name"
            className="text-xs border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 w-36"
          />
          <button type="submit" className="text-xs text-blue-600 font-medium">Add</button>
          <button type="button" onClick={() => { setAdding(false); setNewCat('') }} className="text-xs text-gray-400">✕</button>
        </form>
      )}

      {showMerchantPrompt && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-64 max-w-[calc(100vw-2rem)] text-xs">
          <p className="font-medium text-gray-700 mb-1">Save for this merchant?</p>
          <p className="text-gray-500 mb-2">
            Apply <strong>{pendingCategory}</strong> to all transactions from{' '}
            <strong>{normalizeMerchant(transaction.description)}</strong>?
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => handleMerchantOverride(true)}
              className="flex-1 bg-blue-600 text-white rounded px-2 py-2 font-medium hover:bg-blue-700"
            >
              Yes, save rule
            </button>
            <button
              onClick={() => handleMerchantOverride(false)}
              className="flex-1 bg-gray-100 text-gray-600 rounded px-2 py-2 hover:bg-gray-200"
            >
              Just this one
            </button>
            <button
              onClick={() => { setShowMerchantPrompt(false); setPendingCategory(null) }}
              className="text-gray-400 hover:text-gray-600 py-2 px-1 self-end sm:self-auto"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
