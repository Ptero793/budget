import { useState } from 'react'
import { useApp, filterByMonth } from '../../context/AppContext'
import CSVUploader from './CSVUploader'
import SimpleFINPanel from './SimpleFINPanel'
import TransactionTable from './TransactionTable'
import { transactionId } from '../../lib/utils'

function downloadCSV(transactions) {
  const headers = ['Date', 'Description', 'Amount', 'Category', 'Source', 'Categorization Source', 'Confidence', 'Cost USD']
  const rows = transactions.map(t => [
    t.date,
    `"${(t.description || '').replace(/"/g, '""')}"`,
    t.amount,
    t.category || 'UNCATEGORIZED',
    t.source,
    t.categorizationSource || '',
    t.categorizationConfidence != null ? t.categorizationConfidence.toFixed(2) : '',
    t.categorizationCostUsd != null ? t.categorizationCostUsd.toFixed(8) : '',
  ])
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function TransactionsView() {
  const { state, dispatch } = useApp()
  const { transactions, selectedMonth, categories } = state
  const [filterCat, setFilterCat] = useState('all')
  const [search, setSearch] = useState('')
  const [showUploader, setShowUploader] = useState(true)
  const [showManual, setShowManual] = useState(false)
  const [manual, setManual] = useState({ date: '', description: '', amount: '', category: '' })

  // ── Selection state ──────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkCategory, setBulkCategory] = useState('')

  const monthTxs = filterByMonth(transactions, selectedMonth)
  const searchQ = search.trim().toLowerCase()
  const filtered = monthTxs
    .filter(t => filterCat === 'all' || t.category === filterCat)
    .filter(t => !searchQ || (t.description || '').toLowerCase().includes(searchQ))

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(filtered.map(t => t.id)))
  const clearSelection = () => { setSelectedIds(new Set()); setBulkCategory('') }

  const allSelected = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id))
  const someSelected = selectedIds.size > 0

  const handleBulkDelete = () => {
    if (!window.confirm(`Delete ${selectedIds.size} transaction${selectedIds.size > 1 ? 's' : ''}?`)) return
    dispatch({ type: 'DELETE_TRANSACTIONS', ids: [...selectedIds] })
    clearSelection()
  }

  const handleBulkCategory = () => {
    if (!bulkCategory) return
    dispatch({
      type: 'UPDATE_TRANSACTIONS',
      ids: [...selectedIds],
      updates: { category: bulkCategory, categorizationSource: 'manual' },
    })
    clearSelection()
  }

  // ── Manual entry ─────────────────────────────────────────────────────────────
  const handleAddManual = (e) => {
    e.preventDefault()
    const amount = parseFloat(manual.amount)
    if (!manual.date || !manual.description || isNaN(amount)) return
    const tx = {
      id: transactionId(manual.date, manual.description, amount, 'manual'),
      date: manual.date,
      description: manual.description.trim(),
      amount,
      source: 'manual',
      category: manual.category || 'UNCATEGORIZED',
      categorizationSource: manual.category ? 'manual' : null,
    }
    dispatch({ type: 'ADD_TRANSACTIONS', transactions: [tx] })
    setManual({ date: '', description: '', amount: '', category: '' })
    setShowManual(false)
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Import Transactions</h2>
          <button
            onClick={() => setShowUploader(s => !s)}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            {showUploader ? 'Hide' : 'Show'}
          </button>
        </div>
        {showUploader && (
          <div className="p-4 space-y-3">
            <CSVUploader />
            <SimpleFINPanel />
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">
            Transactions
            <span className="ml-2 text-sm font-normal text-gray-400">({monthTxs.length})</span>
          </h2>
          <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search description…"
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-44"
            />
            <select
              value={filterCat}
              onChange={e => { setFilterCat(e.target.value); clearSelection() }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1 sm:flex-none min-w-0"
            >
              <option value="all">All categories</option>
              <option value="UNCATEGORIZED">⚠ Uncategorized</option>
              <option value="IGNORE">IGNORE</option>
              {categories
                .filter(c => c !== 'UNCATEGORIZED' && c !== 'IGNORE')
                .map(c => <option key={c} value={c}>{c}</option>)
              }
            </select>
            <button
              onClick={() => downloadCSV(monthTxs)}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-3 py-1.5 font-medium transition-colors"
              title="Download visible transactions as CSV"
            >
              ↓ Export
            </button>
            <button
              onClick={() => setShowManual(s => !s)}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-3 py-1.5 font-medium transition-colors"
            >
              + Manual entry
            </button>
          </div>
        </div>

        {showManual && (
          <form onSubmit={handleAddManual} className="flex flex-wrap gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
            <input
              type="date"
              value={manual.date}
              max={today}
              onChange={e => setManual(m => ({ ...m, date: e.target.value }))}
              required
              className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Description"
              value={manual.description}
              onChange={e => setManual(m => ({ ...m, description: e.target.value }))}
              required
              className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1 min-w-32"
            />
            <input
              type="number"
              placeholder="Amount"
              step="0.01"
              value={manual.amount}
              onChange={e => setManual(m => ({ ...m, amount: e.target.value }))}
              required
              className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 w-24"
            />
            <select
              value={manual.category}
              onChange={e => setManual(m => ({ ...m, category: e.target.value }))}
              className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Category…</option>
              {categories.filter(c => c !== 'UNCATEGORIZED').map(c =>
                <option key={c} value={c}>{c}</option>
              )}
            </select>
            <button type="submit" className="text-sm bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 font-medium">
              Add
            </button>
            <button type="button" onClick={() => setShowManual(false)} className="text-sm text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          </form>
        )}

        {someSelected && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-blue-50 border-b border-blue-100">
            <span className="text-sm font-medium text-blue-700">
              {selectedIds.size} selected
            </span>
            <button
              onClick={selectAll}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Select all {filtered.length}
            </button>
            <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-2">
              <select
                value={bulkCategory}
                onChange={e => setBulkCategory(e.target.value)}
                className="text-sm border border-blue-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white flex-1 sm:flex-none min-w-0"
              >
                <option value="">Set category…</option>
                <option value="IGNORE">IGNORE</option>
                {categories.filter(c => c !== 'UNCATEGORIZED' && c !== 'IGNORE').map(c =>
                  <option key={c} value={c}>{c}</option>
                )}
              </select>
              <button
                onClick={handleBulkCategory}
                disabled={!bulkCategory}
                className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply
              </button>
              <button
                onClick={handleBulkDelete}
                className="text-sm bg-red-600 text-white rounded-lg px-3 py-1.5 font-medium hover:bg-red-700"
              >
                Delete
              </button>
              <button
                onClick={clearSelection}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <TransactionTable
          transactions={filtered}
          selectedIds={selectedIds}
          allSelected={allSelected}
          onToggleSelect={toggleSelect}
          onSelectAll={allSelected ? clearSelection : selectAll}
        />
      </div>
    </div>
  )
}
