import { describe, expect, it } from 'vitest'
import { parseSarafiAfRates } from './sarafiAfRates'

describe('parseSarafiAfRates', () => {
  it('reads Sarai Shahzada rows and normalizes 1K quotations', () => {
    const html = `<table><tr><td><a href="/exchange-rates/sarai-shahzada/USD-AFN">USD</a></td><td><b class="buyRate">64.25</b></td><td><b class="sellRate">64.30</b></td></tr><tr><td><a href="/exchange-rates/sarai-shahzada/IRR-AFN">IRR</a> 1K</td><td><b class="buyRate">0.93</b></td><td><b class="sellRate">0.95</b></td></tr></table>`
    expect(parseSarafiAfRates(html)).toEqual([
      { currency: 'USD', buy: '64.25', sell: '64.3', quotedUnits: 1 },
      { currency: 'IRR', buy: '0.00093', sell: '0.00095', quotedUnits: 1000 },
    ])
  })
})
