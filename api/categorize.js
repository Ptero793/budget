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
      system: `You are a personal finance assistant. For each credit card transaction, you MUST pick exactly one category from the provided list. Never invent a category, never say you don't know, never leave one blank.

Return ONLY a JSON array with one object per transaction, in the same order as the input. No explanation, no markdown — raw JSON only.

Response format:
[{"category": "CATEGORY_NAME", "confidence": 0.95}, ...]

confidence is a float from 0.0 to 1.0 expressing how certain you are. Use this to flag uncertainty — never use it as an excuse to skip the categorization. If you have very low confidence (< 0.3), still pick the best-matching category from the list.`,
      messages: [
        {
          role: 'user',
          content: `Available categories (you must pick from this list, nothing else): ${categoryList}

Transactions:
${transactionList}

Hints:
- TST* and similar prefixes → DRINKS & EATING OUT (Toast restaurant POS)
- AMZN, AMAZON → SHOPPING
- Airlines, hotels, Airbnb, travel agencies → TRAVEL
- Grocery stores, markets, bakeries, food delivery → GROCERIES
- Pharmacies (CVS, Walgreens), doctors, copays → MEDICAL
- Gyms, fitness studios, Peloton → WORKOUT
- Salons, spas, barbers → PERSONAL CARE
- Streaming services, software subscriptions → SUBSCRIPTIONS
- Credit card payments, transfers, refunds → IGNORE

Respond with exactly ${transactions.length} objects: [{"category": "...", "confidence": 0.0}, ...]`,
        },
      ],
    })

    const text = message.content[0]?.text ?? ''
    console.log('[categorize] raw response:', text.slice(0, 500))

    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error(`No JSON array found in response: ${text.slice(0, 200)}`)

    const result = JSON.parse(match[0])
    if (!Array.isArray(result)) throw new Error('Response is not an array')

    // Validate categories against the allowed list — if the model invents one, fall back.
    const validCategories = new Set(categories)
    for (const item of result) {
      if (!validCategories.has(item?.category)) {
        item.category = 'UNCATEGORIZED'
        item.confidence = 0
      }
    }

    while (result.length < transactions.length) result.push({ category: 'UNCATEGORIZED', confidence: 0 })
    result.length = transactions.length

    const { input_tokens, output_tokens } = message.usage
    const cost_usd = input_tokens * COST_PER_INPUT_TOKEN + output_tokens * COST_PER_OUTPUT_TOKEN
    const cost_per_transaction = cost_usd / transactions.length

    // Attach per-transaction cost (batch cost ÷ batch size) so the client can store it on each tx
    for (const item of result) item.cost_usd = cost_per_transaction

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
