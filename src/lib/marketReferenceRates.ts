export type MarketReferenceRate = {
  currency: string
  buy: string
  sell: string
  quotedUnits: number
  updatedAt: string | null
  changePercent: string | null
}

export type MarketReferenceRateBoard = {
  market: 'Sarai Shahzada'
  fetchedAt: string
  rates: MarketReferenceRate[]
}

const plainText = (value: string) => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&#39;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/\s+/g, ' ')
  .trim()

const classValue = (row: string, className: string) => {
  const match = row.match(new RegExp(`<[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'))
  return match ? plainText(match[1]) : null
}

const rateValue = (row: string, className: string) => {
  const value = classValue(row, className)
  return value?.replaceAll(',', '').match(/\d+(?:\.\d+)?/)?.[0] ?? null
}

const normalizeQuotedRate = (value: string, quotedUnits: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return (parsed / quotedUnits).toFixed(9).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

export function parseMarketReferenceRates(html: string): MarketReferenceRate[] {
  const rates: MarketReferenceRate[] = []
  const seen = new Set<string>()
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const currency = row[1].match(/\/exchange-rates\/sarai-shahzada\/([A-Z]{3})-AFN/i)?.[1]?.toUpperCase()
    const buyQuoted = rateValue(row[1], 'buyRate')
    const sellQuoted = rateValue(row[1], 'sellRate')
    if (!currency || !buyQuoted || !sellQuoted || seen.has(currency)) continue
    const quotedUnits = /\b1\s*K\b/i.test(plainText(row[1])) ? 1000 : 1
    const buy = normalizeQuotedRate(buyQuoted, quotedUnits)
    const sell = normalizeQuotedRate(sellQuoted, quotedUnits)
    if (!buy || !sell) continue
    const rowText = plainText(row[1])
    const percent = rowText.match(/-?\d+(?:\.\d+)?\s*%/)?.[0]?.replace(/\s+/g, '') ?? null
    rates.push({
      currency,
      buy,
      sell,
      quotedUnits,
      updatedAt: classValue(row[1], 'time'),
      changePercent: percent,
    })
    seen.add(currency)
  }
  return rates
}

export async function getMarketReferenceRateBoard(): Promise<MarketReferenceRateBoard> {
  const response = await fetch('/api/market-rates', { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error('Market reference rates are temporarily unavailable')
  return response.json() as Promise<MarketReferenceRateBoard>
}
