import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { transactions, categories } = req.body ?? {}

  if (!Array.isArray(transactions) || !transactions.length) {
    return res.status(400).json({ error: 'transactions array is required' })
  }

  if (!Array.isArray(categories) || !categories.length) {
    return res.status(400).json({ error: 'categories array is required' })
  }

  try {
    const transactionList = transactions
      .map((t, i) => `${i + 1}. "${t.description}" — $${Math.abs(t.amount).toFixed(2)}`)
      .join('\n')

    const categoryList = categories.join(', ')

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: `You are a personal finance assistant. Categorize credit card transactions into the provided categories. Return ONLY a JSON array of strings — one category per transaction, same order, same count. No explanation, no markdown, just the raw JSON array.`,
      messages: [
        {
          role: 'user',
          content: `Categories: ${categoryList}

Transactions:
${transactionList}

Rules:
- Pick the single best category from the list above
- TST* and similar prefixes indicate restaurant/cafe purchases → DRINKS & EATING OUT
- AMZN, AMAZON → SHOPPING
- Airlines, hotels, Airbnb → TRAVEL
- Grocery stores, markets, bakeries → GROCERIES
- IGNORE for credit card payments, transfers, refunds
- Use UNCATEGORIZED only as a last resort — make your best guess

Respond with exactly ${transactions.length} items: ["CAT1", "CAT2", ...]`,
        },
      ],
    })

    const text = message.content[0]?.text ?? ''
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) {
      throw new Error('Model did not return a valid JSON array')
    }

    const result = JSON.parse(match[0])
    if (!Array.isArray(result)) {
      throw new Error('Response is not an array')
    }

    // Pad or trim to match transaction count rather than failing the whole batch
    while (result.length < transactions.length) result.push('UNCATEGORIZED')
    result.length = transactions.length

    res.status(200).json({ categories: result })
  } catch (err) {
    console.error('[categorize]', err.message)
    // Return UNCATEGORIZED for all on failure so the import still completes
    res.status(200).json({
      categories: transactions.map(() => 'UNCATEGORIZED'),
      warning: err.message,
    })
  }
}
