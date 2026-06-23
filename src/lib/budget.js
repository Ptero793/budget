// Shared helpers for reading budget state. budgetOverrides[month][category]
// is now { amount, type, hidden } — these helpers handle the layered lookup
// (per-month override first, then global default) so callers don't repeat it.

export function getEffectiveBudget(budgetTargets, budgetOverrides, category, month) {
  const override = budgetOverrides[month]?.[category]
  if (override?.amount != null) return override.amount
  return budgetTargets[category]?.amount ?? 0
}

export function getEffectiveType(budgetTargets, budgetOverrides, category, month) {
  const override = budgetOverrides[month]?.[category]
  return override?.type ?? budgetTargets[category]?.type ?? 'variable'
}

export function isCategoryHidden(budgetOverrides, category, month) {
  return budgetOverrides[month]?.[category]?.hidden === true
}

export function hasAmountOverride(budgetOverrides, category, month) {
  return budgetOverrides[month]?.[category]?.amount != null
}
