import { describe, expect, it } from 'vitest'
import { parseMarketReferenceRates } from './marketReferenceRates'

describe('parseMarketReferenceRates', () => {
  it('reads compact Sarai Shahzada rows with time, change, and thousand-unit quotations', () => {
    const html = `<table><tr><td><a href="/exchange-rates/sarai-shahzada/USD-AFN">USD - US Dollar</a></td><td><b class="buyRate">64.20</b></td><td><b class="sellRate">64.25</b></td><td class="time">04:04 PM</td><td><b class="even">0.00%</b></td></tr><tr><td><a href="/exchange-rates/sarai-shahzada/PKR-AFN">PKR - Pakistani Rupee</a> 1K</td><td><b class="buyRate">226</b></td><td><b class="sellRate">227</b></td><td class="time">11:51 AM</td><td><b class="green">0.22%</b></td></tr></table>`
    expect(parseMarketReferenceRates(html)).toEqual([
      { currency: 'USD', buy: '64.2', sell: '64.25', quotedUnits: 1, updatedAt: '04:04 PM', changePercent: '0.00%' },
      { currency: 'PKR', buy: '0.226', sell: '0.227', quotedUnits: 1000, updatedAt: '11:51 AM', changePercent: '0.22%' },
    ])
  })

  it('ignores duplicate and malformed rows', () => {
    const html = `<tr><td><a href="/exchange-rates/sarai-shahzada/USD-AFN">USD</a></td><td><b class="buyRate">64</b></td><td><b class="sellRate">65</b></td></tr><tr><td><a href="/exchange-rates/sarai-shahzada/USD-AFN">USD</a></td><td><b class="buyRate">1</b></td><td><b class="sellRate">2</b></td></tr><tr><td>bad</td></tr>`
    expect(parseMarketReferenceRates(html)).toHaveLength(1)
  })

  it('reads the complete Khorasan Market board quoted in afghanis', () => {
    const html = `<h5 class="marketTitle">Khorasan Market <b>AFN</b> Rates</h5><table><tr><td><a href="/exchange-rates/khorasan-market/USD-AFN">USD - US Dollar</a></td><td><b class="buyRate">65.35</b></td><td><b class="sellRate">65.40</b></td><td class="time">10:33 AM</td><td><b class="up">0.10%</b></td></tr><tr><td><a href="/exchange-rates/khorasan-market/IRR-AFN">IRR - Iranian Rial</a> 1K</td><td><b class="buyRate">0.35</b></td><td><b class="sellRate">0.36</b></td><td class="time">10:30 AM</td><td><b class="down">-0.15%</b></td></tr></table><h5 class="marketTitle">Khorasan Market <b>IRR</b> Rates</h5><table><tr><td><a href="/exchange-rates/khorasan-market/USD-IRR">USD - US Dollar</a></td><td><b class="buyRate">232500</b></td><td><b class="sellRate">233000</b></td></tr></table>`
    expect(parseMarketReferenceRates(html, 'khorasan-market', 'AFN')).toEqual([
      { currency: 'USD', buy: '65.35', sell: '65.4', quotedUnits: 1, updatedAt: '10:33 AM', changePercent: '0.10%' },
      { currency: 'IRR', buy: '0.00035', sell: '0.00036', quotedUnits: 1000, updatedAt: '10:30 AM', changePercent: '-0.15%' },
    ])
  })
})
