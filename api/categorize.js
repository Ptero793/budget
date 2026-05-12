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
      max_tokens: 1024,
      system: `You are a personal finance assistant. Categorize credit card transactions into the provided categories. Return ONLY a JSON array of strings with one category per transaction in the same order. No explanation, just the array.`,
      messages: [
        {
          role: 'user',
          content: `Categories available: ${categoryList}

Transactions to categorize:
${transactionList}

Rules:
- Choose the single best-matching category from the list
- Use IGNORE for credit card payments, transfers, and balance payments
- Use UNCATEGORIZED only if truly impossible to determine

Return format: ["CATEGORY1", "CATEGORY2", ...]`,
        },
      ],
    })

    const text = message.content[0]?.text ?? ''
    const match = text.match(/\[[\s\S]*?\]/)
    if (!match) {
      throw new Error('Model did not return a valid JSON array')
    }

    const result = JSON.parse(match[0])
    if (!Array.isArray(result) || result.length !== transactions.length) {
      throw new Error('Response array length mismatch')
    }

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
