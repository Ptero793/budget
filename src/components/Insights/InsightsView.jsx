import { useApp, filterByMonth, computeActuals } from '../../context/AppContext'
import { formatCurrency, formatMonth } from '../../lib/utils'
import { getEffectiveBudget, isCategoryHidden } from '../../lib/budget'

function topTransactionInCategory(transactions, category) {
  const txs = transactions
    .filter(t => t.category === category && t.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  return txs[0] || null
}

export default function InsightsView() {
  const { state } = useApp()
  const { transactions, budgetTargets, budgetOverrides, incomeActuals, selectedMonth } = state

  const month = selectedMonth === 'all'
    ? new Date().toISOString().slice(0, 7)
    : selectedMonth

  const monthTxs = filterByMonth(transactions, month)
  const actuals = computeActuals(monthTxs)

  // Build the universe of categories: anything with a budget OR any actual spend.
  // Skip categories that the user has hidden from this month's budget.
  const allCategories = new Set(
    [
      ...Object.keys(budgetTargets).filter(c => c !== 'IGNORE' && c !== 'UNCATEGORIZED'),
      ...Object.keys(actuals).filter(c => c !== 'IGNORE' && c !== 'UNCATEGORIZED'),
    ].filter(c => !isCategoryHidden(budgetOverrides, c, month))
  )

  const totalBudget = [...allCategories].reduce(
    (sum, cat) => sum + getEffectiveBudget(budgetTargets, budgetOverrides, cat, month),
    0
  )
  const totalActual = Object.entries(actuals)
    .filter(([cat]) => cat !== 'IGNORE' && cat !== 'UNCATEGORIZED')
    .reduce((s, [, v]) => s + v, 0)
  const netVariance = totalBudget - totalActual
  const isOverBudget = netVariance < 0

  const totalIncome = Object.values(incomeActuals[month] || {}).reduce((s, v) => s + v, 0)
  const netSavings = totalIncome - totalActual

  // Per-category variance — using effective budget (with month overrides)
  const drivers = [...allCategories].map(category => {
    const budget = getEffectiveBudget(budgetTargets, budgetOverrides, category, month)
    const actual = actuals[category] || 0
    const variance = budget - actual // negative = over budget
    const topTx = topTransactionInCategory(monthTxs, category)
    return { category, budget, actual, variance, topTx }
  })

  // Over: most negative variance first (biggest overspend at the top)
  const overDrivers = drivers
    .filter(d => d.variance < 0)
    .sort((a, b) => a.variance - b.variance)
    .slice(0, 5)

  // Under: most positive variance first, but only categories where we actually spent something
  const underDrivers = drivers
    .filter(d => d.variance > 0 && d.actual > 0)
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 3)

  if (!monthTxs.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
        <p className="text-4xl mb-3">📊</p>
        <p className="font-medium">No data for this month</p>
        <p className="text-sm mt-1">Upload transactions to see insights</p>
      </div>
    )
  }

  const uncategorizedCount = monthTxs.filter(t => !t.category || t.category === 'UNCATEGORIZED').length

  return (
    <div className="space-y-4">
      {/* Month summary card */}
      <div className={`rounded-xl p-6 ${isOverBudget ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
        <p className="text-sm font-medium text-gray-500">{formatMonth(month)}</p>
        <h2 className={`text-3xl font-bold mt-1 ${isOverBudget ? 'text-red-700' : 'text-green-700'}`}>
          {isOverBudget ? 'Over budget' : 'Under budget'} by {formatCurrency(Math.abs(netVariance))}
        </h2>
        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-sm">
          <div>
            <span className="text-gray-500">Budget</span>
            <span className="ml-2 font-semibold text-gray-800">{formatCurrency(totalBudget)}</span>
          </div>
          <div>
            <span className="text-gray-500">Spent</span>
            <span className="ml-2 font-semibold text-gray-800">{formatCurrency(totalActual)}</span>
          </div>
          {totalIncome > 0 && (
            <div>
              <span className="text-gray-500">Income</span>
              <span className="ml-2 font-semibold text-gray-800">{formatCurrency(totalIncome)}</span>
            </div>
          )}
          {totalIncome > 0 && (
            <div>
              <span className="text-gray-500">Net savings</span>
              <span className={`ml-2 font-semibold ${netSavings >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency(netSavings)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Over-budget drivers */}
      {overDrivers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-red-50">
            <h3 className="font-semibold text-red-800">🔺 Top overspend drivers</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {overDrivers.map(d => <DriverRow key={d.category} driver={d} type="over" />)}
          </div>
        </div>
      )}

      {/* Under-budget categories */}
      {underDrivers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-green-50">
            <h3 className="font-semibold text-green-800">🔻 Top underspend categories</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {underDrivers.map(d => <DriverRow key={d.category} driver={d} type="under" />)}
          </div>
        </div>
      )}

      {/* Uncategorized warning */}
      {uncategorizedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <strong>Note:</strong> {uncategorizedCount} transactions are uncategorized and excluded from these insights. Review them in the Transactions tab.
        </div>
      )}
    </div>
  )
}

function DriverRow({ driver, type }) {
  const { category, budget, actual, variance, topTx } = driver
  const isOver = type === 'over'
  const noBudget = budget === 0

  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{category}</span>
            <span className={`text-sm font-bold ${isOver ? 'text-red-600' : 'text-green-600'}`}>
              {isOver ? '▲' : '▼'} {formatCurrency(Math.abs(variance))} {isOver ? 'over' : 'under'}
            </span>
            {noBudget && isOver && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                no budget set
              </span>
            )}
          </div>
          <div className="flex gap-4 mt-1 text-xs text-gray-500">
            <span>Budget: <strong className="text-gray-700">{formatCurrency(budget)}</strong></span>
            <span>Actual: <strong className="text-gray-700">{formatCurrency(actual)}</strong></span>
          </div>
          {topTx && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
              <span className="text-gray-400">Top item:</span>
              <span className="font-medium text-gray-700 truncate max-w-xs">{topTx.description}</span>
              <span className="font-semibold text-gray-800 shrink-0">{formatCurrency(topTx.amount)}</span>
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden mt-1">
            {budget > 0 && (
              <div
                className={`h-full rounded-full ${isOver ? 'bg-red-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min((actual / budget) * 100, 100)}%` }}
              />
            )}
          </div>
          <span className="text-xs text-gray-400 mt-0.5 block">
            {budget > 0 ? `${Math.round((actual / budget) * 100)}% used` : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
