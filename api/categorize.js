import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-6'
// Pricing as of 2025: $3/MTok input, $15/MTok output
const COST_PER_INPUT_TOKEN  = 3.0  / 1_000_000
const COST_PER_OUTPUT_TOKEN = 15.0 / 1_000_000

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
      model: MODEL,
      max_tokens: 4096,
      system: `You are a personal finance assistant. Categorize each credit card transaction into the best-matching category from the provided list.

Return ONLY a JSON array with one object per transaction, in the same order as the input. No explanation, no markdown — raw JSON only.

Response format:
[{"category": "CATEGORY_NAME", "confidence": 0.95}, ...]

confidence is a float from 0.0 to 1.0 representing your certainty. Use values close to 1.0 when the merchant is unambiguous, and lower values when you are guessing.`,
      messages: [
        {
          role: 'user',
          content: `Categories: ${categoryList}

Transactions:
${transactionList}

Rules:
- Pick the single best category from the list above
- TST* and similar prefixes indicate restaurant or cafe purchases → DRINKS & EATING OUT
- AMZN, AMAZON → SHOPPING
- Airlines, hotels, Airbnb, travel agencies → TRAVEL
- Grocery stores, markets, bakeries, food delivery → GROCERIES
- IGNORE for credit card payments, transfers, refunds
- Use UNCATEGORIZED only as a last resort — always make your best guess and reflect low certainty in the confidence score instead

Respond with exactly ${transactions.length} objects: [{"category": "...", "confidence": 0.0}, ...]`,
        },
      ],
    })

    const text = message.content[0]?.text ?? ''
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('Model did not return a valid JSON array')

    const result = JSON.parse(match[0])
    if (!Array.isArray(result)) throw new Error('Response is not an array')

    while (result.length < transactions.length) result.push({ category: 'UNCATEGORIZED', confidence: 0 })
    result.length = transactions.length

    const { input_tokens, output_tokens } = message.usage
    const cost_usd = input_tokens * COST_PER_INPUT_TOKEN + output_tokens * COST_PER_OUTPUT_TOKEN

    res.status(200).json({
      results: result,
      usage: { model: MODEL, input_tokens, output_tokens, cost_usd, transaction_count: transactions.length },
    })
  } catch (err) {
    console.error('[categorize]', err.message)
    res.status(200).json({
      results: transactions.map(() => ({ category: 'UNCATEGORIZED', confidence: 0 })),
      usage: null,
      warning: err.message,
    })
  }
}
