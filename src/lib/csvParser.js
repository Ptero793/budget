import Papa from 'papaparse'
import { transactionId } from './utils'

// Convert MM/DD/YYYY or M/D/YYYY to YYYY-MM-DD
function parseDate(raw) {
  if (!raw) return ''
  const parts = raw.trim().split('/')
  if (parts.length === 3) {
    const [m, d, y] = parts
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return raw.trim()
}

function detectProvider(headers) {
  const h = headers.map(s => s.trim().toLowerCase())
  if (h.includes('transaction date') && h.includes('post date')) return 'chase'
  if (h.includes('date') && h.includes('description') && h.includes('amount') && h.length <= 5) return 'amex'
  return null
}

function parseChase(rows) {
  return rows
    .filter(row => row['Transaction Date'] && row['Description'])
    .map(row => {
      const rawAmount = parseFloat(row['Amount'] || 0)
      // Chase: negative = expense, positive = payment/credit
      const amount = -rawAmount
      const type = (row['Type'] || '').trim()
      const description = row['Description'].trim()
      const date = parseDate(row['Transaction Date'])

      const isPayment = type === 'Payment' || type === 'Adjustment'

      return {
        id: transactionId(date, description, amount, 'chase'),
        date,
        description,
        amount,
        source: 'chase',
        category: isPayment ? 'IGNORE' : null,
        categorizationSource: isPayment ? 'auto' : null,
      }
    })
}

function parseAmex(rows) {
  return rows
    .filter(row => row['Date'] && row['Description'])
    .map(row => {
      const amount = parseFloat(row['Amount'] || 0)
      const description = row['Description'].trim()
      const date = parseDate(row['Date'])

      // AmEx: negative amount = payment/credit; positive = charge
      const isPayment = amount < 0 && /payment|autopay|thank you/i.test(description)

      return {
        id: transactionId(date, description, amount, 'amex'),
        date,
        description,
        amount,
        source: 'amex',
        category: isPayment ? 'IGNORE' : null,
        categorizationSource: isPayment ? 'auto' : null,
      }
    })
}

export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data.length) {
          reject(new Error('CSV file is empty'))
          return
        }

        const headers = Object.keys(results.data[0])
        const provider = detectProvider(headers)

        if (!provider) {
          reject(new Error('Unrecognized CSV format. Only Chase and American Express CSVs are supported.'))
          return
        }

        const transactions = provider === 'chase'
          ? parseChase(results.data)
          : parseAmex(results.data)

        resolve({ transactions, provider })
      },
      error: (err) => reject(new Error(`CSV parse error: ${err.message}`)),
    })
  })
}
