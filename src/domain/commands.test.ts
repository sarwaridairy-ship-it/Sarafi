import { describe, expect, it } from 'vitest'
import { parseFxTradeCommand } from './commands'

const validCommand = { organization_id: '11111111-1111-4111-8111-111111111111', branch_id: '22222222-2222-4222-8222-222222222222', cashbox_id: '33333333-3333-4333-8333-333333333333', client_command_id: 'cmd-1', side: 'SELL_FX', sold_currency: 'USD', sold_amount: '10000', bought_currency: 'AFN', bought_amount: '700000', base_currency: 'AFN', sold_base_value: '690000', bought_base_value: '700000' }

describe('financial command validation', () => {
  it('accepts a valid FX command and normalizes currency codes', () => {
    expect(parseFxTradeCommand(validCommand).sold_currency).toBe('USD')
  })
  it('rejects malformed identifiers and zero-value trades', () => {
    expect(() => parseFxTradeCommand({ ...validCommand, organization_id: 'not-a-uuid' })).toThrow()
    expect(() => parseFxTradeCommand({ ...validCommand, sold_amount: '0' })).toThrow('greater than zero')
  })
})
