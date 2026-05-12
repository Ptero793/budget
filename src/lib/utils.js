export function formatCurrency(amount) {
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  })
  return amount < 0 ? `(${formatted})` : formatted
}

export function formatMonth(monthStr) {
  if (!monthStr || monthStr === 'all') return 'All'
  const [year, month] = monthStr.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1, 1)
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function getMonthsInYear(year) {
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return `${year}-${m}`
  })
}

// Extract a stable merchant key from a raw transaction description.
// Used for merchant override lookups and "apply to all" feature.
export function normalizeMerchant(description) {
  const cleaned = description
    .toUpperCase()
    .replace(/\*\S*/g, '')      // remove *ABCD123 suffixes
    .replace(/#\d+\s*/g, '')    // remove #123
    .replace(/\s+/g, ' ')
    .trim()

  const words = cleaned.split(' ').filter(w => w.length > 1)
  return words.slice(0, 2).join(' ')
}

// Deterministic transaction ID for dedup — based on content, not crypto UUID.
export function transactionId(date, description, amount, source) {
  const str = `${date}|${description.trim().toLowerCase()}|${Math.round(amount * 100)}|${source}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(31, hash) + str.charCodeAt(i)
    hash |= 0
  }
  return `tx_${Math.abs(hash).toString(16)}_${source}`
}
