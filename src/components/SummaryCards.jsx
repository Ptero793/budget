import { useApp, filterByMonth, computeActuals } from '../context/AppContext'
import { formatCurrency } from '../lib/utils'

export default function SummaryCards() {
  const { state } = useApp()
  const { transactions, budgetTargets, incomeSources, incomeActuals, selectedMonth } = state

  const monthTxs = filterByMonth(transactions, selectedMonth)
  const actuals = computeActuals(monthTxs)

  const totalBudget = Object.entries(budgetTargets)
    .filter(([cat]) => cat !== 'IGNORE' && cat !== 'UNCATEGORIZED')
    .reduce((sum, [, v]) => sum + v.amount, 0)

  const totalSpent = Object.values(actuals).reduce((sum, v) => sum + v, 0)

  const monthIncome = selectedMonth === 'all'
    ? Object.values(incomeActuals).reduce((sum, month) => {
        return sum + Object.values(month).reduce((s, v) => s + v, 0)
      }, 0)
    : Object.values(incomeActuals[selectedMonth] || {}).reduce((s, v) => s + v, 0)

  const uncategorized = monthTxs.filter(
    t => !t.category || t.category === 'UNCATEGORIZED'
  ).length

  const cards = [
    {
      label: 'Total Budget',
      value: formatCurrency(totalBudget),
      sub: 'monthly target',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Total Spent',
      value: formatCurrency(totalSpent),
      sub: totalBudget ? `${Math.round((totalSpent / totalBudget) * 100)}% of budget` : '—',
      color: totalSpent > totalBudget ? 'text-red-600' : 'text-green-600',
      bg: totalSpent > totalBudget ? 'bg-red-50' : 'bg-green-50',
    },
    {
      label: 'Income',
      value: formatCurrency(monthIncome),
      sub: monthIncome > 0 ? `net ${formatCurrency(monthIncome - totalSpent)}` : 'not entered',
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'Uncategorized',
      value: String(uncategorized),
      sub: uncategorized > 0 ? 'need review' : 'all clear',
      color: uncategorized > 0 ? 'text-amber-600' : 'text-green-600',
      bg: uncategorized > 0 ? 'bg-amber-50' : 'bg-green-50',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(card => (
        <div key={card.label} className={`${card.bg} rounded-xl p-4`}>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</p>
          <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          <p className="text-xs text-gray-500 mt-0.5">{card.sub}</p>
        </div>
      ))}
    </div>
  )
}
