import { useState } from 'react'
import { AppProvider } from './context/AppContext'
import MonthSelector from './components/MonthSelector'
import SummaryCards from './components/SummaryCards'
import TransactionsView from './components/Transactions/TransactionsView'
import BudgetView from './components/Budget/BudgetView'
import IncomeView from './components/Income/IncomeView'
import InsightsView from './components/Insights/InsightsView'

const TABS = [
  { id: 'transactions', label: 'Transactions' },
  { id: 'budget',       label: 'Budget' },
  { id: 'income',       label: 'Income' },
  { id: 'insights',     label: 'Insights' },
]

function AppShell() {
  const [activeTab, setActiveTab] = useState('transactions')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">💰</span>
            <h1 className="text-lg font-bold text-gray-900 whitespace-nowrap">Budget Tracker</h1>
          </div>
          <MonthSelector />
        </div>
        <nav className="max-w-6xl mx-auto px-4">
          <div className="flex gap-0.5 overflow-x-auto scrollbar-none">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-5">
        <SummaryCards />
        {activeTab === 'transactions' && <TransactionsView />}
        {activeTab === 'budget'       && <BudgetView />}
        {activeTab === 'income'       && <IncomeView />}
        {activeTab === 'insights'     && <InsightsView />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}
