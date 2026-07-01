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
      const seen = new Set()
      const newTxs = action.transactions.filter(t => {
        if (existingIds.has(t.id) || seen.has(t.id)) return false
        seen.add(t.id)
        return true
      })
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

    case 'DELETE_TRANSACTIONS': {
      const ids = new Set(action.ids)
      return { ...state, transactions: state.transactions.filter(t => !ids.has(t.id)) }
    }

    case 'UPDATE_TRANSACTIONS': {
      const ids = new Set(action.ids)
      return {
        ...state,
        transactions: state.transactions.map(t =>
          ids.has(t.id) ? { ...t, ...action.updates } : t
        ),
      }
    }

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
      const existing = state.budgetOverrides[action.month]?.[action.category] ?? { amount: null, type: null, hidden: false }
      const monthOverrides = {
        ...state.budgetOverrides[action.month],
        [action.category]: { ...existing, amount: action.amount },
      }
      return {
        ...state,
        budgetOverrides: { ...state.budgetOverrides, [action.month]: monthOverrides },
      }
    }

    // Update default budget for a category effective `fromMonth` forward.
    // Past months with prior activity get frozen at the old default via overrides
    // so historical reports don't shift. Override for fromMonth (if any) is removed
    // so the new default applies cleanly to the current view.
    case 'UPDATE_BUDGET_DEFAULT_FROM_MONTH': {
      const { category, amount, fromMonth, frozenMonths, oldDefault } = action
      const type = state.budgetTargets[category]?.type ?? 'variable'

      const newOverrides = { ...state.budgetOverrides }
      for (const m of frozenMonths) {
        const existing = newOverrides[m]?.[category] ?? { amount: null, type: null, hidden: false }
        newOverrides[m] = { ...newOverrides[m], [category]: { ...existing, amount: oldDefault } }
      }
      // Clear the AMOUNT override for fromMonth (preserve type/hidden if present)
      if (newOverrides[fromMonth]?.[category]?.amount != null) {
        const ex = newOverrides[fromMonth][category]
        const cleared = { ...ex, amount: null }
        const monthCopy = { ...newOverrides[fromMonth] }
        if (cleared.type == null && !cleared.hidden) {
          delete monthCopy[category]
        } else {
          monthCopy[category] = cleared
        }
        newOverrides[fromMonth] = monthCopy
      }

      return {
        ...state,
        budgetTargets: { ...state.budgetTargets, [category]: { amount, type } },
        budgetOverrides: newOverrides,
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

    // Hide a category from a specific month's budget without touching defaults.
    case 'HIDE_CATEGORY_FOR_MONTH': {
      const existing = state.budgetOverrides[action.month]?.[action.category] ?? { amount: null, type: null, hidden: false }
      return {
        ...state,
        budgetOverrides: {
          ...state.budgetOverrides,
          [action.month]: { ...state.budgetOverrides[action.month], [action.category]: { ...existing, hidden: true } },
        },
      }
    }

    // Override category type for a specific month (no default change).
    case 'SET_CATEGORY_TYPE_FOR_MONTH': {
      const existing = state.budgetOverrides[action.month]?.[action.category] ?? { amount: null, type: null, hidden: false }
      return {
        ...state,
        budgetOverrides: {
          ...state.budgetOverrides,
          [action.month]: { ...state.budgetOverrides[action.month], [action.category]: { ...existing, type: action.categoryType } },
        },
      }
    }

    // Remove a category from the default budget. Optionally freeze past months
    // by writing hidden=true overrides so they keep displaying as before.
    case 'REMOVE_CATEGORY_FROM_BUDGET_DEFAULT': {
      const { category, freezeFromOldDefault, oldDefault, oldType, frozenMonths = [] } = action
      const newTargets = { ...state.budgetTargets }
      delete newTargets[category]

      const newOverrides = { ...state.budgetOverrides }
      if (freezeFromOldDefault) {
        for (const m of frozenMonths) {
          const existing = newOverrides[m]?.[category] ?? { amount: null, type: null, hidden: false }
          newOverrides[m] = {
            ...newOverrides[m],
            [category]: { ...existing, amount: oldDefault, type: oldType },
          }
        }
      }
      return { ...state, budgetTargets: newTargets, budgetOverrides: newOverrides }
    }

    // Add/ensure a category exists in the default budget with a given type.
    case 'ADD_CATEGORY_TO_BUDGET_DEFAULT': {
      const { category, categoryType } = action
      const without = state.categories.filter(c => c !== 'UNCATEGORIZED' && c !== 'IGNORE')
      const newCategories = state.categories.includes(category)
        ? state.categories
        : [...without, category, 'UNCATEGORIZED', 'IGNORE']
      const existingTarget = state.budgetTargets[category] ?? { amount: 0 }
      return {
        ...state,
        categories: newCategories,
        budgetTargets: { ...state.budgetTargets, [category]: { amount: existingTarget.amount, type: categoryType } },
      }
    }

    // Change the default type of a category. Optionally freeze past months by
    // writing per-month type overrides at the old type.
    case 'CHANGE_CATEGORY_TYPE_DEFAULT': {
      const { category, newType, oldType, frozenMonths = [] } = action
      const existingTarget = state.budgetTargets[category] ?? { amount: 0 }
      const newOverrides = { ...state.budgetOverrides }
      for (const m of frozenMonths) {
        const existing = newOverrides[m]?.[category] ?? { amount: null, type: null, hidden: false }
        newOverrides[m] = {
          ...newOverrides[m],
          [category]: { ...existing, type: oldType },
        }
      }
      return {
        ...state,
        budgetTargets: { ...state.budgetTargets, [category]: { ...existingTarget, type: newType } },
        budgetOverrides: newOverrides,
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

    case 'RENAME_INCOME_SOURCE':
      return {
        ...state,
        incomeSources: state.incomeSources.map(s =>
          s.id === action.id ? { ...s, name: action.name } : s
        ),
      }

    case 'REORDER_INCOME_SOURCES': {
      const byId = new Map(state.incomeSources.map(s => [s.id, s]))
      const reordered = action.ids.map(id => byId.get(id)).filter(Boolean)
      return { ...state, incomeSources: reordered }
    }

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
