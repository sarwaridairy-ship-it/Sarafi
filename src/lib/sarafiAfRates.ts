export type SarafiAfRate = {
  currency: string
  buy: string
  sell: string
  quotedUnits: number
}

export type SarafiAfRateBoard = {
  market: 'Sarai Shahzada'
  source: 'https://sarafi.af/en/exchange-rates'
  fetchedAt: string
  rates: SarafiAfRate[]
}

const plainText = (value: string) => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/\s+/g, ' ')
  .trim()

const rateValue = (row: string, className: string) => {
  const match = row.match(new RegExp(`<[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'))
  if (!match) return null
  const normalized = plainText(match[1]).replaceAll(',', '').match(/\d+(?:\.\d+)?/)
  return normalized?.[0] ?? null
}

const normalizeQuotedRate = (value: string, quotedUnits: number) => {
  const normalized = value.replace(/^0+(?=\d)/, '') || '0'
  if (quotedUnits === 1) return normalized.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
  const [whole, fraction = ''] = normalized.split('.')
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '') || '0'
  const decimalPlaces = fraction.length + 3
  const padded = digits.padStart(decimalPlaces + 1, '0')
  const integerPart = padded.slice(0, -decimalPlaces)
  const fractionalPart = padded.slice(-decimalPlaces).replace(/0+$/, '')
  return fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart
}

export function parseSarafiAfRates(html: string): SarafiAfRate[] {
  const rates: SarafiAfRate[] = []
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const currency = row[1].match(/\/exchange-rates\/sarai-shahzada\/([A-Z]{3})-AFN/i)?.[1]?.toUpperCase()
    const buyQuoted = rateValue(row[1], 'buyRate')
    const sellQuoted = rateValue(row[1], 'sellRate')
    if (!currency || !buyQuoted || !sellQuoted) continue
    const quotedUnits = /\b1\s*K\b/i.test(plainText(row[1])) ? 1000 : 1
    rates.push({
      currency,
      buy: normalizeQuotedRate(buyQuoted, quotedUnits),
      sell: normalizeQuotedRate(sellQuoted, quotedUnits),
      quotedUnits,
    })
  }
  return rates
}

export async function getSarafiAfRateBoard(): Promise<SarafiAfRateBoard> {
  const response = await fetch('/api/sarafi-rates', { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error('SARAFI.AF rates are temporarily unavailable')
  return response.json() as Promise<SarafiAfRateBoard>
}
