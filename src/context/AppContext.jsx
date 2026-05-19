import { createContext, useContext, useReducer, useEffect, useRef, useState, useCallback } from 'react'
import { DEFAULT_CATEGORIES, DEFAULT_BUDGET_TARGETS, DEFAULT_INCOME_SOURCES } from '../data/defaultData'
import { getCurrentMonth, normalizeMerchant } from '../lib/utils'
import { loadAllState, syncAction, subscribeToChanges } from '../lib/db'

const AppContext = createContext(null)

const BASE_STATE = {
  transactions:      [],
  budgetTargets:     DEFAULT_BUDGET_TARGETS,
  budgetOverrides:   {},
  incomeSources:     DEFAULT_INCOME_SOURCES,
  incomeActuals:     {},
  categories:        DEFAULT_CATEGORIES,
  merchantOverrides: {},
  selectedMonth:     getCurrentMonth(),
}

function reducer(state, action) {
  switch (action.type) {

    case 'LOAD_STATE':
      return { ...state, ...action.payload }

    case 'ADD_TRANSACTIONS': {
      const existingIds = new Set(state.transactions.map(t => t.id))
      const newTxs = action.transactions.filter(t => !existingIds.has(t.id))
      return { ...state, transactions: [...state.transactions, ...newTxs] }
    }

    case 'UPDATE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.map(t =>
          t.id === action.id ? { ...t, ...action.updates } : t
        ),
      }

    case 'DELETE_TRANSACTION':
      return { ...state, transactions: state.transactions.filter(t => t.id !== action.id) }

    case 'SET_MERCHANT_OVERRIDE': {
      const { merchantKey, category, applyToExisting } = action
      const newOverrides = { ...state.merchantOverrides, [merchantKey]: category }
      const transactions = applyToExisting
        ? state.transactions.map(t =>
            normalizeMerchant(t.description) === merchantKey
              ? { ...t, category, categorizationSource: 'override' }
              : t
          )
        : state.transactions
      return { ...state, merchantOverrides: newOverrides, transactions }
    }

    case 'SET_BUDGET_TARGET': {
      const existing = state.budgetTargets[action.category] ?? { type: 'variable' }
      return {
        ...state,
        budgetTargets: {
          ...state.budgetTargets,
          [action.category]: {
            amount: action.amount,
            type: action.categoryType ?? existing.type,
          },
        },
      }
    }

    case 'SET_BUDGET_OVERRIDE': {
      const monthOverrides = { ...state.budgetOverrides[action.month], [action.category]: action.amount }
      return {
        ...state,
        budgetOverrides: { ...state.budgetOverrides, [action.month]: monthOverrides },
      }
    }

    case 'REMOVE_BUDGET_OVERRIDE': {
      const monthOverrides = { ...state.budgetOverrides[action.month] }
      delete monthOverrides[action.category]
      return {
        ...state,
        budgetOverrides: { ...state.budgetOverrides, [action.month]: monthOverrides },
      }
    }

    case 'ADD_CATEGORY': {
      const name = action.category.toUpperCase().trim()
      if (state.categories.includes(name)) return state
      const without = state.categories.filter(c => c !== 'UNCATEGORIZED' && c !== 'IGNORE')
      return {
        ...state,
        categories: [...without, name, 'UNCATEGORIZED', 'IGNORE'],
        budgetTargets: { ...state.budgetTargets, [name]: { amount: 0, type: 'variable' } },
      }
    }

    case 'SET_INCOME_TARGET':
      return {
        ...state,
        incomeSources: state.incomeSources.map(s =>
          s.id === action.id ? { ...s, target: action.target } : s
        ),
      }

    // ID must be provided in the action (not generated here) so optimistic
    // state and the DB sync use the same value.
    case 'ADD_INCOME_SOURCE':
      return {
        ...state,
        incomeSources: [...state.incomeSources, { id: action.id, name: action.name, target: 0 }],
      }

    case 'REMOVE_INCOME_SOURCE':
      return { ...state, incomeSources: state.incomeSources.filter(s => s.id !== action.id) }

    case 'SET_INCOME_ACTUAL':
      return {
        ...state,
        incomeActuals: {
          ...state.incomeActuals,
          [action.month]: {
            ...state.incomeActuals[action.month],
            [action.sourceId]: action.amount,
          },
        },
      }

    case 'SET_SELECTED_MONTH':
      return { ...state, selectedMonth: action.month }

    case 'CLEAR_ALL_DATA':
      return { ...BASE_STATE, selectedMonth: state.selectedMonth }

    default:
      return state
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AppProvider({ children }) {
  const [state, rawDispatch] = useReducer(reducer, { ...BASE_STATE })
  const [isLoading, setIsLoading] = useState(true)
  const [dbError, setDbError] = useState(null)
  const stateRef = useRef(state)
  stateRef.current = state

  // Initial data load from Supabase
  useEffect(() => {
    loadAllState()
      .then(loaded => {
        rawDispatch({ type: 'LOAD_STATE', payload: loaded })
        setIsLoading(false)
      })
      .catch(err => {
        console.error('[AppContext] load failed:', err)
        setDbError(err.message)
        setIsLoading(false)
      })
  }, [])

  // isSyncing prevents our own real-time events from overwriting optimistic state
  const isSyncing = useRef(false)
  const pendingReload = useRef(false)

  // Real-time: reload when ANOTHER device makes a change
  useEffect(() => {
    if (isLoading) return
    const unsubscribe = subscribeToChanges(() => {
      if (isSyncing.current) {
        // We triggered this event ourselves — defer the reload until sync finishes
        pendingReload.current = true
        return
      }
      loadAllState()
        .then(loaded => rawDispatch({ type: 'LOAD_STATE', payload: loaded }))
        .catch(err => console.error('[AppContext] realtime reload failed:', err))
    })
    return unsubscribe
  }, [isLoading])

  // Wrapped dispatch: optimistic local update + async Supabase write
  const dispatch = useCallback(async (action) => {
    if (action.type === 'SET_SELECTED_MONTH' || action.type === 'LOAD_STATE') {
      rawDispatch(action)
      return
    }
    // Pre-compute next state so syncAction can reference it for bulk operations
    const nextState = reducer(stateRef.current, action)
    isSyncing.current = true
    rawDispatch(action)
    try {
      await syncAction(action, nextState)
    } finally {
      isSyncing.current = false
      // If a real-time event arrived while we were syncing, do the reload now
      if (pendingReload.current) {
        pendingReload.current = false
        loadAllState()
          .then(loaded => rawDispatch({ type: 'LOAD_STATE', payload: loaded }))
          .catch(err => console.error('[AppContext] deferred reload failed:', err))
      }
    }
  }, [])

  return (
    <AppContext.Provider value={{ state, dispatch, isLoading, dbError }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

// ── Pure selectors ────────────────────────────────────────────────────────────

export function filterByMonth(transactions, month) {
  if (!month || month === 'all') return transactions
  return transactions.filter(t => t.date.startsWith(month))
}

export function computeActuals(transactions) {
  const actuals = {}
  for (const tx of transactions) {
    if (!tx.category || tx.category === 'IGNORE') continue
    actuals[tx.category] = (actuals[tx.category] ?? 0) + tx.amount
  }
  return actuals
}
