import { parseSarafiAfRates, type SarafiAfRateBoard } from '../src/lib/sarafiAfRates.js'

type ApiResponse = {
  status: (statusCode: number) => ApiResponse
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
}

const SOURCE = 'https://sarafi.af/en/exchange-rates' as const

export default async function handler(_request: unknown, response: ApiResponse) {
  try {
    const upstream = await fetch(SOURCE, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'SARAFI-Exchange-OS/1.0 (+https://sarafi-swart.vercel.app)',
      },
    })
    if (!upstream.ok) throw new Error(`Upstream returned ${upstream.status}`)
    const rates = parseSarafiAfRates(await upstream.text())
    if (!rates.length) throw new Error('No Sarai Shahzada rates were found')
    const board: SarafiAfRateBoard = {
      market: 'Sarai Shahzada',
      source: SOURCE,
      fetchedAt: new Date().toISOString(),
      rates,
    }
    response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900')
    response.status(200).json(board)
  } catch (error) {
    response.setHeader('Cache-Control', 'no-store')
    response.status(503).json({
      error: error instanceof Error ? error.message : 'Rate source unavailable',
      source: SOURCE,
    })
  }
}
