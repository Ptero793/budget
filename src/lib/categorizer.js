import { KEYWORD_RULES } from '../data/keywordRules'
import { normalizeMerchant } from './utils'

// Sort rules by keyword length descending so longer (more specific) rules match first
const SORTED_RULES = [...KEYWORD_RULES].sort((a, b) => b.keyword.length - a.keyword.length)

function applyKeywordRules(description) {
  const lower = description.toLowerCase()
  for (const rule of SORTED_RULES) {
    if (lower.includes(rule.keyword.toLowerCase())) {
      return rule.category
    }
  }
  return null
}

// Categorize an array of transactions using merchant overrides and keyword rules.
// Returns { ready: Transaction[], needsAI: Transaction[] }
export function categorizeLocally(transactions, merchantOverrides) {
  const ready = []
  const needsAI = []

  for (const tx of transactions) {
    // Already categorized (e.g., payments auto-set to IGNORE)
    if (tx.category) {
      ready.push(tx)
      continue
    }

    // 1. Merchant override
    const merchantKey = normalizeMerchant(tx.description)
    if (merchantOverrides[merchantKey]) {
      ready.push({
        ...tx,
        category: merchantOverrides[merchantKey],
        categorizationSource: 'override',
      })
      continue
    }

    // 2. Keyword rules
    const ruleCategory = applyKeywordRules(tx.description)
    if (ruleCategory) {
      ready.push({
        ...tx,
        category: ruleCategory,
        categorizationSource: 'rule',
      })
      continue
    }

    // 3. Needs AI
    needsAI.push(tx)
  }

  return { ready, needsAI }
}

// Call the /api/categorize serverless function and return transactions with AI categories applied.
export async function categorizeWithAI(transactions, categories) {
  if (!transactions.length) return []

  const usableCategories = categories.filter(c => c !== 'UNCATEGORIZED' && c !== 'IGNORE')

  const response = await fetch('/api/categorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transactions: transactions.map(t => ({
        description: t.description,
        amount: t.amount,
      })),
      categories: usableCategories,
    }),
  })

  if (!response.ok) {
    throw new Error('AI categorization request failed')
  }

  const { categories: aiCategories } = await response.json()

  return transactions.map((tx, i) => ({
    ...tx,
    category: aiCategories[i] || 'UNCATEGORIZED',
    categorizationSource: 'ai',
  }))
}
