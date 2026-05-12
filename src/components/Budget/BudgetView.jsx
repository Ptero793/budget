import { useState } from 'react'
import { useApp, filterByMonth, computeActuals } from '../../context/AppContext'
import { formatCurrency } from '../../lib/utils'

function EditableAmount({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const start = () => { setDraft(String(value)); setEditing(true) }
  const commit = () => {
    const v = parseFloat(draft)
    if (!isNaN(v) && v >= 0) onSave(v)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min="0"
        step="1"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="w-24 text-right text-sm border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
      />
    )
  }

  return (
    <button
      onClick={start}
      title="Click to edit"
      className="text-blue-600 hover:text-blue-800 font-mono text-sm underline decoration-dashed underline-offset-2"
    >
      {formatCurrency(value)}
    </button>
  )
}

function SectionRows({ rows, actuals, onEditBudget }) {
  const totalBudget = rows.reduce((s, r) => s + r.amount, 0)
  const totalActual = rows.reduce((s, r) => s + (actuals[r.category] || 0), 0)
  const totalVariance = totalBudget - totalActual

  return (
    <>
      {rows.map(row => {
        const actual = actuals[row.category] || 0
        const variance = row.amount - actual
        const pct = row.amount > 0 ? Math.round((actual / row.amount) * 100) : null
        const isOver = variance < 0
        const isEmpty = row.amount === 0 && actual === 0

        return (
          <tr key={row.category} className="hover:bg-gray-50 group transition-colors">
            <td className="py-2.5 px-4 text-gray-800 font-medium">{row.category}</td>
            <td className="py-2.5 px-4 text-right">
              <EditableAmount value={row.amount} onSave={v => onEditBudget(row.category, v)} />
            </td>
            <td className={`py-2.5 px-4 text-right font-mono text-sm ${actual !== 0 ? 'text-gray-900' : 'text-gray-300'}`}>
              {formatCurrency(actual)}
            </td>
            <td className={`py-2.5 px-4 text-right font-mono text-sm font-medium ${
              isEmpty ? 'text-gray-300' : isOver ? 'text-red-600' : 'text-green-600'
            }`}>
              {isEmpty ? '—' : `${variance >= 0 ? '+' : ''}${formatCurrency(variance)}`}
            </td>
            <td className="py-2.5 px-4 text-right">
              {pct !== null && actual > 0 && (
                <div className="flex items-center gap-1.5 justify-end">
                  <div className="w-14 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-400' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                </div>
              )}
            </td>
          </tr>
        )
      })}
      <tr className="bg-gray-50 font-semibold border-t border-gray-300">
        <td className="py-2 px-4 text-xs text-gray-500 uppercase tracking-wide">Subtotal</td>
        <td className="py-2 px-4 text-right font-mono text-sm text-gray-700">{formatCurrency(totalBudget)}</td>
        <td className="py-2 px-4 text-right font-mono text-sm text-gray-700">{formatCurrency(totalActual)}</td>
        <td className={`py-2 px-4 text-right font-mono text-sm ${totalVariance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
          {totalVariance >= 0 ? '+' : ''}{formatCurrency(totalVariance)}
        </td>
        <td className="py-2 px-4 text-right text-xs text-gray-400">
          {totalBudget > 0 ? `${Math.round((totalActual / totalBudget) * 100)}%` : ''}
        </td>
      </tr>
    </>
  )
}

export default function BudgetView() {
  const { state, dispatch } = useApp()
  const { transactions, budgetTargets, selectedMonth, categories } = state

  const monthTxs = filterByMonth(transactions, selectedMonth)
  const actuals = computeActuals(monthTxs)

  const editBudget = (category, amount) => dispatch({ type: 'SET_BUDGET_TARGET', category, amount })

  const allCats = categories.filter(c => c !== 'IGNORE' && c !== 'UNCATEGORIZED')

  const fixedRows = allCats
    .filter(c => budgetTargets[c]?.type === 'fixed')
    .map(c => ({ category: c, amount: budgetTargets[c]?.amount ?? 0 }))
    .filter(r => r.amount > 0 || actuals[r.category])

  const variableRows = allCats
    .filter(c => !budgetTargets[c] || budgetTargets[c].type === 'variable')
    .map(c => ({ category: c, amount: budgetTargets[c]?.amount ?? 0 }))
    .filter(r => r.amount > 0 || actuals[r.category])

  const totalBudget = [...fixedRows, ...variableRows].reduce((s, r) => s + r.amount, 0)
  const totalActual = Object.values(actuals).reduce((s, v) => s + v, 0)
  const totalVariance = totalBudget - totalActual

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
        <h2 className="font-semibold text-gray-800">Budget vs. Actual</h2>
        <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${totalVariance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {totalVariance >= 0
            ? `Under by ${formatCurrency(Math.abs(totalVariance))}`
            : `Over by ${formatCurrency(Math.abs(totalVariance))}`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Budget</th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Actual</th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Variance</th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">% Used</th>
            </tr>
          </thead>

          {fixedRows.length > 0 && (
            <tbody>
              <tr className="bg-gray-50">
                <td colSpan={5} className="py-1.5 px-4 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200">
                  Fixed Expenses
                </td>
              </tr>
              <SectionRows rows={fixedRows} actuals={actuals} onEditBudget={editBudget} />
            </tbody>
          )}

          {variableRows.length > 0 && (
            <tbody>
              <tr className="bg-gray-50">
                <td colSpan={5} className="py-1.5 px-4 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200">
                  Variable Expenses
                </td>
              </tr>
              <SectionRows rows={variableRows} actuals={actuals} onEditBudget={editBudget} />
            </tbody>
          )}

          <tfoot className="border-t-2 border-gray-300 bg-gray-50">
            <tr className="font-bold text-sm">
              <td className="py-3 px-4 text-gray-800">TOTAL</td>
              <td className="py-3 px-4 text-right font-mono text-gray-800">{formatCurrency(totalBudget)}</td>
              <td className="py-3 px-4 text-right font-mono text-gray-800">{formatCurrency(totalActual)}</td>
              <td className={`py-3 px-4 text-right font-mono ${totalVariance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {totalVariance >= 0 ? '+' : ''}{formatCurrency(totalVariance)}
              </td>
              <td className="py-3 px-4 text-right text-sm font-normal text-gray-500">
                {totalBudget > 0 ? `${Math.round((totalActual / totalBudget) * 100)}%` : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
        Click any <span className="text-blue-600 underline decoration-dashed">blue amount</span> to edit the budget target
      </p>
    </div>
  )
}
