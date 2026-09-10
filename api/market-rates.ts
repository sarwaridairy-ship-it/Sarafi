import { parseMarketReferenceRates, type MarketReferenceRateResponse } from '../src/lib/marketReferenceRates.js'

type ApiResponse = {
  status: (statusCode: number) => ApiResponse
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
}

const UPSTREAM_MARKETS = [
  {
    market: 'Sarai Shahzada' as const,
    marketCode: 'sarai-shahzada' as const,
    quoteCurrency: 'AFN' as const,
    url: 'https://sarafi.af/en/exchange-rates',
  },
  {
    market: 'Khorasan Market' as const,
    marketCode: 'khorasan-market' as const,
    quoteCurrency: 'IRR' as const,
    url: 'https://sarafi.af/en/exchange-rates/khorasan-market',
  },
] as const

export default async function handler(_request: unknown, response: ApiResponse) {
  try {
    const fetchedAt = new Date().toISOString()
    const markets = await Promise.all(UPSTREAM_MARKETS.map(async (definition) => {
      const upstream = await fetch(definition.url, {
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'SARAFI-Exchange-OS/1.0 (+https://sarafi-swart.vercel.app)',
        },
      })
      if (!upstream.ok) throw new Error(`${definition.market} returned ${upstream.status}`)
      const rates = parseMarketReferenceRates(
        await upstream.text(),
        definition.marketCode,
        definition.quoteCurrency,
      )
      if (!rates.length) throw new Error(`No ${definition.market} rates were found`)
      return {
        market: definition.market,
        marketCode: definition.marketCode,
        quoteCurrency: definition.quoteCurrency,
        fetchedAt,
        rates,
      }
    }))
    const board: MarketReferenceRateResponse = {
      fetchedAt,
      markets,
    }
    response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900')
    response.status(200).json(board)
  } catch (error) {
    response.setHeader('Cache-Control', 'no-store')
    response.status(503).json({ error: error instanceof Error ? error.message : 'Market rates unavailable' })
  }
}
