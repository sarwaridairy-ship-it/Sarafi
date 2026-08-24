import { describe, expect, it } from 'vitest'
import { OfflineOutbox } from './offline'

describe('offline command safety', () => {
  it('assigns unique ordered commands and syncs each only once', async () => {
    const outbox = new OfflineOutbox({ cashboxId: 'cash-1', maxAmountBase: '1000', allowKinds: ['BUY_FX'] })
    const first = outbox.enqueue({ cashboxId: 'cash-1', amount: '100', currency: 'USD', kind: 'BUY_FX' })
    const second = outbox.enqueue({ cashboxId: 'cash-1', amount: '200', currency: 'USD', kind: 'BUY_FX' })
    expect(first.localSequence).toBe(1)
    expect(second.localSequence).toBe(2)
    const posted: string[] = []
    await outbox.sync(async (command) => { posted.push(command.clientCommandId); return { serverEntryId: `je-${command.localSequence}` } })
    expect(posted).toEqual([first.clientCommandId, second.clientCommandId])
    expect(outbox.pending()).toHaveLength(0)
  })

  it('preserves conflicts instead of rewriting or marking them posted', async () => {
    const outbox = new OfflineOutbox({ cashboxId: 'cash-1', maxAmountBase: '1000', allowKinds: ['SELL_FX'] })
    const command = outbox.enqueue({ cashboxId: 'cash-1', amount: '100', currency: 'USD', kind: 'SELL_FX' })
    await outbox.sync(async () => { throw new Error('Authoritative balance changed') })
    expect(outbox.all()[0]).toMatchObject({ clientCommandId: command.clientCommandId, status: 'conflict', conflictReason: 'Authoritative balance changed' })
  })

  it('prevents shared-cashbox misuse and high-risk offline operations', () => {
    const outbox = new OfflineOutbox({ cashboxId: 'cash-1', maxAmountBase: '1000', allowKinds: ['BUY_FX'] })
    expect(() => outbox.enqueue({ cashboxId: 'cash-2', amount: '1', currency: 'USD', kind: 'BUY_FX' })).toThrow('assigned')
    expect(() => outbox.enqueue({ cashboxId: 'cash-1', amount: '1', currency: 'USD', kind: 'SELL_FX' })).toThrow('permitted')
    expect(() => outbox.enqueue({ cashboxId: 'cash-1', amount: '1001', currency: 'USD', kind: 'BUY_FX' })).toThrow('limit')
  })
})
