import { supabase } from './supabase'
import { DEFAULT_CATEGORIES, DEFAULT_BUDGET_TARGETS, DEFAULT_INCOME_SOURCES } from '../data/defaultData'
import { normalizeMerchant } from './utils'

// ── Row converters ────────────────────────────────────────────────────────────

function rowToTx(row) {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    amount: parseFloat(row.amount),
    category: row.category,
    source: row.source,
    categorizationSource: row.categorization_source,
  }
}

function txToRow(tx) {
  return {
    id: tx.id,
    date: tx.date,
    description: tx.description,
    amount: tx.amount,
    category: tx.category,
    source: tx.source,
    categorization_source: tx.categorizationSource,
  }
}

// ── Initial load ──────────────────────────────────────────────────────────────

export async function loadAllState() {
  const [txRes, budgetRes, catRes, srcRes, actualRes, overrideRes, budgetOverrideRes] = await Promise.all([
    supabase.from('transactions').select('*').order('date', { ascending: false }),
    supabase.from('budget_targets').select('*'),
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('income_sources').select('*').order('sort_order'),
    supabase.from('income_actuals').select('*'),
    supabase.from('merchant_overrides').select('*'),
    supabase.from('budget_overrides').select('*'),
  ])

  // Fail loudly on query errors so callers can handle them properly.
  // Previously, a null txRes.data would silently return transactions:[] and wipe state.
  if (txRes.error) throw new Error(`transactions: ${txRes.error.message}`)
  if (budgetRes.error) throw new Error(`budget_targets: ${budgetRes.error.message}`)
  if (catRes.error) throw new Error(`categories: ${catRes.error.message}`)
  if (srcRes.error) throw new Error(`income_sources: ${srcRes.error.message}`)
  if (actualRes.error) throw new Error(`income_actuals: ${actualRes.error.message}`)
  if (overrideRes.error) throw new Error(`merchant_overrides: ${overrideRes.error.message}`)
  if (budgetOverrideRes.error) throw new Error(`budget_overrides: ${budgetOverrideRes.error.message}`)

  // First-time setup: seed defaults when the database is empty
  if (!catRes.data.length) {
    await seedDefaults()
    return {
      transactions: [],
      budgetTargets: { ...DEFAULT_BUDGET_TARGETS },
      budgetOverrides: {},
      categories: [...DEFAULT_CATEGORIES],
      incomeSources: DEFAULT_INCOME_SOURCES.map(s => ({ ...s })),
      incomeActuals: {},
      merchantOverrides: {},
    }
  }

  const budgetTargets = {}
  for (const row of budgetRes.data ?? []) {
    budgetTargets[row.category] = { amount: parseFloat(row.amount), type: row.type }
  }

  const incomeActuals = {}
  for (const row of actualRes.data ?? []) {
    if (!incomeActuals[row.month]) incomeActuals[row.month] = {}
    incomeActuals[row.month][row.source_id] = parseFloat(row.amount)
  }

  const merchantOverrides = {}
  for (const row of overrideRes.data ?? []) {
    merchantOverrides[row.merchant_key] = row.category
  }

  const budgetOverrides = {}
  for (const row of budgetOverrideRes.data ?? []) {
    if (!budgetOverrides[row.month]) budgetOverrides[row.month] = {}
    budgetOverrides[row.month][row.category] = parseFloat(row.amount)
  }

  return {
    transactions: (txRes.data ?? []).map(rowToTx),
    budgetTargets,
    budgetOverrides,
    categories: (catRes.data ?? []).map(r => r.name),
    incomeSources: (srcRes.data ?? []).map(r => ({
      id: r.id,
      name: r.name,
      target: parseFloat(r.target),
    })),
    incomeActuals,
    merchantOverrides,
  }
}

async function seedDefaults() {
  await Promise.all([
    supabase.from('categories').insert(
      DEFAULT_CATEGORIES.map((name, i) => ({ name, sort_order: i }))
    ),
    supabase.from('budget_targets').insert(
      Object.entries(DEFAULT_BUDGET_TARGETS).map(([category, { amount, type }]) => ({
        category, amount, type,
      }))
    ),
    supabase.from('income_sources').insert(
      DEFAULT_INCOME_SOURCES.map((s, i) => ({ ...s, sort_order: i }))
    ),
  ])
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertChunked(table, rows, chunkSize = 50) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + chunkSize))
    if (error) throw new Error(`upsert ${table}: ${error.message}`)
  }
}

// ── Action → DB sync ──────────────────────────────────────────────────────────
// Called after each reducer dispatch with the action and the resulting new state.

export async function syncAction(action, newState) {
  switch (action.type) {

    case 'ADD_TRANSACTIONS':
      await upsertChunked('transactions', action.transactions.map(txToRow))
      break

    case 'UPDATE_TRANSACTION': {
      const tx = newState.transactions.find(t => t.id === action.id)
      if (tx) {
        const { error } = await supabase.from('transactions').upsert(txToRow(tx))
        if (error) throw new Error(`update transaction: ${error.message}`)
      }
      break
    }

    case 'DELETE_TRANSACTION':
      await supabase.from('transactions').delete().eq('id', action.id)
      break

    case 'SET_MERCHANT_OVERRIDE': {
      const { merchantKey, category, applyToExisting } = action
      await supabase.from('merchant_overrides').upsert({ merchant_key: merchantKey, category })
      if (applyToExisting) {
        const affected = newState.transactions.filter(
          t => normalizeMerchant(t.description) === merchantKey
        )
        if (affected.length) {
          await upsertChunked('transactions', affected.map(txToRow))
        }
      }
      break
    }

    case 'SET_BUDGET_TARGET':
      await supabase.from('budget_targets').upsert({
        category: action.category,
        amount: action.amount,
        type: newState.budgetTargets[action.category]?.type ?? 'variable',
      })
      break

    case 'SET_BUDGET_OVERRIDE':
      await supabase.from('budget_overrides').upsert({
        category: action.category,
        month: action.month,
        amount: action.amount,
      })
      break

    case 'REMOVE_BUDGET_OVERRIDE':
      await supabase.from('budget_overrides')
        .delete()
        .eq('category', action.category)
        .eq('month', action.month)
      break

    case 'ADD_CATEGORY': {
      const name = action.category.toUpperCase().trim()
      await Promise.all([
        supabase.from('categories').upsert({
          name,
          sort_order: newState.categories.indexOf(name),
        }),
        supabase.from('budget_targets').upsert({ category: name, amount: 0, type: 'variable' }),
      ])
      break
    }

    case 'SET_INCOME_TARGET':
      await supabase.from('income_sources').update({ target: action.target }).eq('id', action.id)
      break

    case 'ADD_INCOME_SOURCE':
      await supabase.from('income_sources').insert({
        id: action.id,
        name: action.name,
        target: 0,
        sort_order: newState.incomeSources.length - 1,
      })
      break

    case 'REMOVE_INCOME_SOURCE':
      await supabase.from('income_sources').delete().eq('id', action.id)
      break

    case 'SET_INCOME_ACTUAL':
      await supabase.from('income_actuals').upsert({
        source_id: action.sourceId,
        month: action.month,
        amount: action.amount,
      })
      break

    case 'CLEAR_ALL_DATA':
      await Promise.all([
        supabase.from('transactions').delete().neq('id', ''),
        supabase.from('merchant_overrides').delete().neq('merchant_key', ''),
        supabase.from('income_actuals').delete().neq('source_id', ''),
      ])
      break
  }
}

// ── Real-time subscriptions ───────────────────────────────────────────────────
// Returns an unsubscribe function. Call it on component unmount.

export function subscribeToChanges(onUpdate) {
  const channel = supabase
    .channel('household-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => onUpdate('transactions'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_targets' }, () => onUpdate('budget_targets'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => onUpdate('categories'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'income_sources' }, () => onUpdate('income_sources'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'income_actuals' }, () => onUpdate('income_actuals'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_overrides' }, () => onUpdate('merchant_overrides'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_overrides' }, () => onUpdate('budget_overrides'))
    .subscribe()

  return () => supabase.removeChannel(channel)
}
