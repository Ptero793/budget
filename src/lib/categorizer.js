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
// Splits large requests into batches so the model's response never exceeds max_tokens.
const AI_BATCH_SIZE = 40

async function categorizeBatch(batch, usableCategories) {
  const response = await fetch('/api/categorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transactions: batch.map(t => ({ description: t.description, amount: t.amount })),
      categories: usableCategories,
    }),
  })
  if (!response.ok) throw new Error('AI categorization request failed')
  return response.json()
}

export async function categorizeWithAI(transactions, categories) {
  if (!transactions.length) return { transactions: [], usage: null }

  // Keep IGNORE in the list since we need the model to use it for payments/refunds.
  // Exclude UNCATEGORIZED so the model can't fall back to it.
  const usableCategories = categories.filter(c => c !== 'UNCATEGORIZED')

  const batches = []
  for (let i = 0; i < transactions.length; i += AI_BATCH_SIZE) {
    batches.push(transactions.slice(i, i + AI_BATCH_SIZE))
  }

  const responses = await Promise.all(batches.map(b => categorizeBatch(b, usableCategories)))
  const allResults = responses.flatMap(r => r.results ?? [])

  let totalUsage = null
  for (const r of responses) {
    if (!r.usage) continue
    if (!totalUsage) {
      totalUsage = { model: r.usage.model, input_tokens: 0, output_tokens: 0, cost_usd: 0, transaction_count: 0 }
    }
    totalUsage.input_tokens     += r.usage.input_tokens
    totalUsage.output_tokens    += r.usage.output_tokens
    totalUsage.cost_usd         += r.usage.cost_usd
    totalUsage.transaction_count += r.usage.transaction_count
  }

  const categorized = transactions.map((tx, i) => ({
    ...tx,
    category: allResults[i]?.category || 'UNCATEGORIZED',
    categorizationConfidence: allResults[i]?.confidence ?? null,
    categorizationCostUsd: allResults[i]?.cost_usd ?? null,
    categorizationSource: 'ai',
  }))

  return { transactions: categorized, usage: totalUsage }
}
