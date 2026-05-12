import { useState } from 'react'
import { useApp, filterByMonth } from '../../context/AppContext'
import CSVUploader from './CSVUploader'
import TransactionTable from './TransactionTable'
import { transactionId } from '../../lib/utils'

export default function TransactionsView() {
  const { state, dispatch } = useApp()
  const { transactions, selectedMonth, categories } = state
  const [filterCat, setFilterCat] = useState('all')
  const [showUploader, setShowUploader] = useState(true)
  const [showManual, setShowManual] = useState(false)
  const [manual, setManual] = useState({ date: '', description: '', amount: '', category: '' })

  const monthTxs = filterByMonth(transactions, selectedMonth)
  const filtered = filterCat === 'all' ? monthTxs : monthTxs.filter(t => t.category === filterCat)

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
          <div className="p-4">
            <CSVUploader />
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">
            Transactions
            <span className="ml-2 text-sm font-normal text-gray-400">({monthTxs.length})</span>
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
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

        <TransactionTable transactions={filtered} />
      </div>
    </div>
  )
}
