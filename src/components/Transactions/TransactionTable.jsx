import { useState, useRef, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import CategoryDropdown from './CategoryDropdown'
import { formatCurrency } from '../../lib/utils'

const SOURCE_BADGES = {
  chase: { label: 'Chase', color: 'bg-blue-100 text-blue-700' },
  amex:  { label: 'AmEx',  color: 'bg-sky-100 text-sky-700' },
  manual: { label: 'Manual', color: 'bg-gray-100 text-gray-600' },
}

function IndeterminateCheckbox({ checked, indeterminate, onChange, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className={`w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer focus:ring-blue-500 ${className}`}
    />
  )
}

export default function TransactionTable({ transactions, selectedIds, allSelected, onToggleSelect, onSelectAll }) {
  const { dispatch } = useApp()
  const [sortField, setSortField] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'amount' ? 'desc' : 'asc')
    }
  }

  const sorted = [...transactions].sort((a, b) => {
    let va = a[sortField], vb = b[sortField]
    if (sortField === 'amount') { va = Number(va); vb = Number(vb) }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-blue-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const Th = ({ field, label, className = '' }) => (
    <th
      className={`py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none ${className}`}
      onClick={() => handleSort(field)}
    >
      {label}<SortIcon field={field} />
    </th>
  )

  const someSelected = selectedIds.size > 0
  const indeterminate = someSelected && !allSelected

  if (!sorted.length) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">📂</p>
        <p className="font-medium">No transactions yet</p>
        <p className="text-sm mt-1">Upload a Chase or AmEx CSV to get started</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="py-3 pl-4 pr-2 w-8">
              <IndeterminateCheckbox
                checked={allSelected}
                indeterminate={indeterminate}
                onChange={onSelectAll}
              />
            </th>
            <Th field="date" label="Date" className="w-28" />
            <Th field="description" label="Description" />
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
            <Th field="amount" label="Amount" className="text-right w-28" />
            <th className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Source</th>
            <th className="py-3 px-4 w-12"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map(tx => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              selected={selectedIds.has(tx.id)}
              onToggle={() => onToggleSelect(tx.id)}
              onDelete={() => dispatch({ type: 'DELETE_TRANSACTION', id: tx.id })}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TransactionRow({ tx, selected, onToggle, onDelete }) {
  const isUncategorized = !tx.category || tx.category === 'UNCATEGORIZED'
  const isCredit = tx.amount < 0

  return (
    <tr className={`group transition-colors ${
      selected
        ? 'bg-blue-50'
        : isUncategorized
        ? 'bg-amber-50 hover:bg-amber-100'
        : 'hover:bg-gray-50'
    }`}>
      <td className="py-2.5 pl-4 pr-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer focus:ring-blue-500"
        />
      </td>
      <td className="py-2.5 px-4 text-gray-500 whitespace-nowrap text-xs">
        {tx.date}
      </td>
      <td className="py-2.5 px-4 text-gray-800 max-w-xs">
        <span className="truncate block" title={tx.description}>{tx.description}</span>
      </td>
      <td className="py-2.5 px-4">
        <CategoryDropdown transaction={tx} />
      </td>
      <td className={`py-2.5 px-4 text-right font-mono font-medium whitespace-nowrap ${isCredit ? 'text-green-600' : 'text-gray-900'}`}>
        {formatCurrency(tx.amount)}
      </td>
      <td className="py-2.5 px-4 text-center">
        {SOURCE_BADGES[tx.source] && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${SOURCE_BADGES[tx.source].color}`}>
            {SOURCE_BADGES[tx.source].label}
          </span>
        )}
      </td>
      <td className="py-2.5 px-4">
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-xs"
          title="Delete transaction"
        >
          ✕
        </button>
      </td>
    </tr>
  )
}
