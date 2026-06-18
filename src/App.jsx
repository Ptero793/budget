import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { AppProvider, useApp } from './context/AppContext'
import LoginView from './components/Auth/LoginView'
import MonthSelector from './components/MonthSelector'
import SummaryCards from './components/SummaryCards'
import TransactionsView from './components/Transactions/TransactionsView'
import BudgetView from './components/Budget/BudgetView'
import IncomeView from './components/Income/IncomeView'
import InsightsView from './components/Insights/InsightsView'

const TABS = [
  { id: 'budget',       label: 'Budget' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'income',       label: 'Income' },
  { id: 'insights',     label: 'Insights' },
]

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <span className="text-4xl animate-pulse">💰</span>
        <p className="mt-3 text-sm text-gray-500">Loading your budget…</p>
      </div>
    </div>
  )
}

function AppShell({ onSignOut }) {
  const [activeTab, setActiveTab] = useState('budget')
  const { isLoading, dbError } = useApp()

  if (isLoading) return <LoadingScreen />

  if (dbError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-red-200 p-6 max-w-md text-center">
          <p className="text-2xl mb-3">⚠️</p>
          <h2 className="font-semibold text-gray-800 mb-1">Database connection failed</h2>
          <p className="text-sm text-gray-500 mb-4">{dbError}</p>
          <p className="text-xs text-gray-400">Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set correctly.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">💰</span>
            <h1 className="text-lg font-bold text-gray-900 whitespace-nowrap">Budget Tracker</h1>
          </div>
          <div className="flex items-center gap-3">
            <MonthSelector />
            <button
              onClick={onSignOut}
              className="text-xs text-gray-400 hover:text-gray-600 hidden sm:block"
            >
              Sign out
            </button>
          </div>
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
  const [session, setSession] = useState(undefined) // undefined = loading, null = signed out

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  // Still checking auth
  if (session === undefined) return <LoadingScreen />

  // Not signed in
  if (!session) return <LoginView />

  return (
    <AppProvider>
      <AppShell onSignOut={handleSignOut} />
    </AppProvider>
  )
}
