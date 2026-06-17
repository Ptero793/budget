import { useState } from 'react'
import { useApp, filterByMonth, computeActuals } from '../../context/AppContext'
import { formatCurrency, formatMonth } from '../../lib/utils'

function getEffectiveBudget(budgetTargets, budgetOverrides, category, month) {
  return budgetOverrides[month]?.[category] ?? budgetTargets[category]?.amount ?? 0
}

// Months strictly before `fromMonth` that have any prior activity and no existing
// override for this category. We freeze these so changing the default forward
// doesn't retroactively change historical reports.
function frozenMonthsBefore(state, category, fromMonth) {
  const known = new Set([
    ...Object.keys(state.budgetOverrides),
    ...Object.keys(state.incomeActuals),
    ...state.transactions.map(t => t.date.slice(0, 7)),
  ])
  return [...known].filter(
    m => m < fromMonth && state.budgetOverrides[m]?.[category] === undefined
  )
}

function BudgetCell({ category, budgetTargets, budgetOverrides, selectedMonth, dispatch }) {
  const { state } = useApp()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const isSpecificMonth = selectedMonth && selectedMonth !== 'all'
  const hasOverride = isSpecificMonth && budgetOverrides[selectedMonth]?.[category] !== undefined
  const defaultAmount = budgetTargets[category]?.amount ?? 0
  const effectiveAmount = isSpecificMonth
    ? getEffectiveBudget(budgetTargets, budgetOverrides, category, selectedMonth)
    : defaultAmount

  const start = () => { setDraft(String(effectiveAmount)); setEditing(true) }
  const cancel = () => setEditing(false)

  const parsed = () => {
    const v = parseFloat(draft)
    return !isNaN(v) && v >= 0 ? v : null
  }

  const commitForMonth = () => {
    const v = parsed()
    if (v !== null) {
      dispatch({ type: 'SET_BUDGET_OVERRIDE', category, month: selectedMonth, amount: v })
    }
    setEditing(false)
  }

  const commitAsDefault = () => {
    const v = parsed()
    if (v !== null) {
      if (isSpecificMonth) {
        const frozenMonths = frozenMonthsBefore(state, category, selectedMonth)
        dispatch({
          type: 'UPDATE_BUDGET_DEFAULT_FROM_MONTH',
          category,
          amount: v,
          fromMonth: selectedMonth,
          frozenMonths,
          oldDefault: defaultAmount,
        })
      } else {
        dispatch({ type: 'SET_BUDGET_TARGET', category, amount: v })
      }
    }
    setEditing(false)
  }

  const clearOverride = (e) => {
    e.stopPropagation()
    dispatch({ type: 'REMOVE_BUDGET_OVERRIDE', category, month: selectedMonth })
  }

  if (editing) {
    const primary = isSpecificMonth ? commitForMonth : commitAsDefault
    return (
      <div className="flex flex-col items-end gap-1" onKeyDown={e => { if (e.key === 'Escape') cancel() }}>
        <input
          autoFocus
          type="number"
          min="0"
          step="1"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') primary() }}
          className="w-24 text-right text-sm border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
        />
        {isSpecificMonth ? (
          <div className="flex flex-col gap-0.5 text-[11px]">
            <button
              onClick={commitForMonth}
              className="px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Save for {formatMonth(selectedMonth)}
            </button>
            <button
              onClick={commitAsDefault}
              title="Sets the new default from this month forward. Past months are pinned to the current default so historical reports don't change."
              className="px-1.5 py-0.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Save as default
            </button>
            <button onClick={cancel} className="text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        ) : (
          <div className="flex gap-1 text-[11px]">
            <button
              onClick={commitAsDefault}
              className="px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Save
            </button>
            <button onClick={cancel} className="px-1.5 py-0.5 text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {hasOverride && (
        <button
          onClick={clearOverride}
          title={`Override: ${formatCurrency(effectiveAmount)} (default: ${formatCurrency(defaultAmount)}) — click × to reset`}
          className="text-xs text-amber-500 hover:text-red-500 leading-none"
        >
          ×
        </button>
      )}
      <button
        onClick={start}
        title={hasOverride
          ? `Month override. Default is ${formatCurrency(defaultAmount)}. Click to change.`
          : 'Click to edit'}
        className={`font-mono text-sm underline decoration-dashed underline-offset-2 ${
          hasOverride ? 'text-amber-600 hover:text-amber-800' : 'text-blue-600 hover:text-blue-800'
        }`}
      >
        {formatCurrency(effectiveAmount)}
      </button>
    </div>
  )
}

function SectionRows({ rows, actuals, budgetTargets, budgetOverrides, selectedMonth, dispatch }) {
  const totalBudget = rows.reduce((s, r) => s + r.effectiveAmount, 0)
  const totalActual = rows.reduce((s, r) => s + (actuals[r.category] || 0), 0)
  const totalVariance = totalBudget - totalActual

  return (
    <>
      {rows.map(row => {
        const actual = actuals[row.category] || 0
        const variance = row.effectiveAmount - actual
        const pct = row.effectiveAmount > 0 ? Math.round((actual / row.effectiveAmount) * 100) : null
        const isOver = variance < 0
        const isEmpty = row.effectiveAmount === 0 && actual === 0

        return (
          <tr key={row.category} className="hover:bg-gray-50 group transition-colors">
            <td className="py-2.5 px-4 text-gray-800 font-medium">{row.category}</td>
            <td className="py-2.5 px-4 text-right">
              <BudgetCell
                category={row.category}
                budgetTargets={budgetTargets}
                budgetOverrides={budgetOverrides}
                selectedMonth={selectedMonth}
                dispatch={dispatch}
              />
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
  const { transactions, budgetTargets, budgetOverrides, selectedMonth, categories } = state

  const monthTxs = filterByMonth(transactions, selectedMonth)
  const actuals = computeActuals(monthTxs)

  const isSpecificMonth = selectedMonth && selectedMonth !== 'all'

  const allCats = categories.filter(c => c !== 'IGNORE' && c !== 'UNCATEGORIZED')

  const toRow = (c) => ({
    category: c,
    effectiveAmount: isSpecificMonth
      ? getEffectiveBudget(budgetTargets, budgetOverrides, c, selectedMonth)
      : (budgetTargets[c]?.amount ?? 0),
  })

  const fixedRows = allCats
    .filter(c => budgetTargets[c]?.type === 'fixed')
    .map(toRow)
    .filter(r => r.effectiveAmount > 0 || actuals[r.category])

  const variableRows = allCats
    .filter(c => !budgetTargets[c] || budgetTargets[c].type === 'variable')
    .map(toRow)
    .filter(r => r.effectiveAmount > 0 || actuals[r.category])

  const totalBudget = [...fixedRows, ...variableRows].reduce((s, r) => s + r.effectiveAmount, 0)
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
        {isSpecificMonth && (
          <span className="ml-auto text-xs text-gray-400">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />
            Amber = month-specific override (× to reset to default)
          </span>
        )}
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
              <SectionRows
                rows={fixedRows}
                actuals={actuals}
                budgetTargets={budgetTargets}
                budgetOverrides={budgetOverrides}
                selectedMonth={selectedMonth}
                dispatch={dispatch}
              />
            </tbody>
          )}

          {variableRows.length > 0 && (
            <tbody>
              <tr className="bg-gray-50">
                <td colSpan={5} className="py-1.5 px-4 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200">
                  Variable Expenses
                </td>
              </tr>
              <SectionRows
                rows={variableRows}
                actuals={actuals}
                budgetTargets={budgetTargets}
                budgetOverrides={budgetOverrides}
                selectedMonth={selectedMonth}
                dispatch={dispatch}
              />
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
        Click any budget amount to edit
        {isSpecificMonth ? ' · Changes this month only · Edit in "All" view to change the default' : ' · Sets the default for all months'}
      </p>
    </div>
  )
}
