const KEY = 'budget-tracker-state'

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable — fail silently
  }
}

export function clearState() {
  localStorage.removeItem(KEY)
}
