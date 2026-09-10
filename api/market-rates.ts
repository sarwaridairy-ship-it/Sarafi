import { parseMarketReferenceRates, type MarketReferenceRateBoard } from '../src/lib/marketReferenceRates.js'

type ApiResponse = {
  status: (statusCode: number) => ApiResponse
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
}

const UPSTREAM_RATE_PAGE = 'https://sarafi.af/en/exchange-rates'

export default async function handler(_request: unknown, response: ApiResponse) {
  try {
    const upstream = await fetch(UPSTREAM_RATE_PAGE, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'SARAFI-Exchange-OS/1.0 (+https://sarafi-swart.vercel.app)',
      },
    })
    if (!upstream.ok) throw new Error(`Market page returned ${upstream.status}`)
    const rates = parseMarketReferenceRates(await upstream.text())
    if (!rates.length) throw new Error('No Sarai Shahzada rates were found')
    const board: MarketReferenceRateBoard = {
      market: 'Sarai Shahzada',
      fetchedAt: new Date().toISOString(),
      rates,
    }
    response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900')
    response.status(200).json(board)
  } catch (error) {
    response.setHeader('Cache-Control', 'no-store')
    response.status(503).json({ error: error instanceof Error ? error.message : 'Market rates unavailable' })
  }
}
