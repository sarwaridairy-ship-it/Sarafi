import { describe, expect, it } from 'vitest'
import { midpointRate, positiveRate, rateOutsideTolerance } from './rateMath'

describe('operation-rate decimal calculations', () => {
  it('keeps exact midpoints without binary floating-point artifacts', () => {
    expect(midpointRate('0.1', '0.2')).toBe('0.15')
    expect(midpointRate('70.25', '70.35')).toBe('70.3')
    expect(midpointRate('9007199254740992.01', '9007199254740992.03')).toBe('9007199254740992.02')
  })
  it('uses a strict tolerance boundary even for tiny rates', () => {
    expect(rateOutsideTolerance('1.005', '1', '50')).toBe(false)
    expect(rateOutsideTolerance('1.005000000001', '1', '50')).toBe(true)
    expect(rateOutsideTolerance('0.0000000001005', '0.0000000001', '50')).toBe(false)
    expect(rateOutsideTolerance('0.0000000001005001', '0.0000000001', '50')).toBe(true)
  })
  it('rejects zero, non-finite and malformed manual rates', () => {
    for (const value of ['', 'NaN', 'Infinity', '-1', '0', '0.000', undefined]) expect(positiveRate(value)).toBe(false)
    expect(positiveRate('0.00000001')).toBe(true)
  })
})
