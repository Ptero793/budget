import { useApp } from '../context/AppContext'
import { formatMonth, getCurrentMonth } from '../lib/utils'

function addMonths(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function MonthSelector() {
  const { state, dispatch } = useApp()
  const { selectedMonth } = state

  const setMonth = (month) => dispatch({ type: 'SET_SELECTED_MONTH', month })

  return (
    <div className="flex items-center gap-2">
      {selectedMonth !== 'all' && (
        <button
          onClick={() => setMonth(addMonths(selectedMonth, -1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 text-lg leading-none"
          aria-label="Previous month"
        >
          ‹
        </button>
      )}

      <select
        value={selectedMonth}
        onChange={e => setMonth(e.target.value)}
        className="text-sm font-medium text-gray-700 bg-transparent border border-gray-200 rounded px-2 py-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="all">All months</option>
        {generateMonthOptions()}
      </select>

      {selectedMonth !== 'all' && (
        <button
          onClick={() => setMonth(addMonths(selectedMonth, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 text-lg leading-none"
          aria-label="Next month"
        >
          ›
        </button>
      )}
    </div>
  )
}

function generateMonthOptions() {
  const options = []
  const now = new Date()
  // Show 12 months back and 3 forward
  for (let i = -12; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    options.push(
      <option key={val} value={val}>
        {formatMonth(val)}
      </option>
    )
  }
  return options
}
