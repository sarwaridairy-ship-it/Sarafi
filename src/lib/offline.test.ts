import { describe, expect, it } from 'vitest'
import { OfflineOutbox } from './offline'

describe('offline command safety', () => {
  it('assigns unique ordered commands and syncs each only once', async () => {
    const policy = { tenantId: 'tenant-1', userId: 'user-1', deviceId: 'device-1', cashboxId: 'cash-1', maxAmountBase: '1000', allowKinds: ['BUY_FX'] as const }
    const outbox = new OfflineOutbox(policy)
    const first = outbox.enqueue({ ...policy, amount: '100', currency: 'USD', kind: 'BUY_FX' })
    const second = outbox.enqueue({ ...policy, amount: '200', currency: 'USD', kind: 'BUY_FX' })
    expect(first.localSequence).toBe(1)
    expect(second.localSequence).toBe(2)
    const posted: string[] = []
    await outbox.sync(async (command) => { posted.push(command.clientCommandId); return { serverEntryId: `je-${command.localSequence}` } })
    expect(posted).toEqual([first.clientCommandId, second.clientCommandId])
    expect(outbox.pending()).toHaveLength(0)
    expect(outbox.all()[0].status).toBe('posted')
  })

  it('preserves conflicts instead of rewriting or marking them posted', async () => {
    const policy = { tenantId: 'tenant-1', userId: 'user-1', deviceId: 'device-1', cashboxId: 'cash-1', maxAmountBase: '1000', allowKinds: ['SELL_FX'] as const }
    const outbox = new OfflineOutbox(policy)
    const command = outbox.enqueue({ ...policy, amount: '100', currency: 'USD', kind: 'SELL_FX' })
    await outbox.sync(async () => { throw new Error('Authoritative balance changed') })
    expect(outbox.all()[0]).toMatchObject({ clientCommandId: command.clientCommandId, status: 'rejected', conflictReason: 'Authoritative balance changed' })
  })

  it('prevents shared-cashbox misuse and high-risk offline operations', () => {
    const policy = { tenantId: 'tenant-1', userId: 'user-1', deviceId: 'device-1', cashboxId: 'cash-1', maxAmountBase: '1000', allowKinds: ['BUY_FX'] as const }
    const outbox = new OfflineOutbox(policy)
    expect(() => outbox.enqueue({ ...policy, cashboxId: 'cash-2', amount: '1', currency: 'USD', kind: 'BUY_FX' })).toThrow('assigned')
    expect(() => outbox.enqueue({ ...policy, amount: '1', currency: 'USD', kind: 'SELL_FX' })).toThrow('permitted')
    expect(() => outbox.enqueue({ ...policy, amount: '1001', currency: 'USD', kind: 'BUY_FX' })).toThrow('limit')
  })

  it('hydrates pending and previously resolved commands from durable storage', async () => {
    const stored = new Map<string, ReturnType<OfflineOutbox['all']>[number]>()
    const store = { save: async (command: ReturnType<OfflineOutbox['all']>[number]) => { stored.set(command.clientCommandId, { ...command }) }, list: async () => [...stored.values()] }
    const policy = { tenantId: 'tenant-1', userId: 'user-1', deviceId: 'device-1', cashboxId: 'cash-1', maxAmountBase: '1000', allowKinds: ['BUY_FX'] as const }
    const first = new OfflineOutbox(policy, store)
    const command = first.enqueue({ ...policy, amount: '100', currency: 'USD', kind: 'BUY_FX' })
    await first.sync(async () => ({ serverEntryId: 'je-1' }))
    const second = new OfflineOutbox(policy, store)
    await second.hydrate()
    expect(second.all()).toMatchObject([{ clientCommandId: command.clientCommandId, status: 'posted', serverEntryId: 'je-1' }])
    expect(second.enqueue({ ...policy, amount: '100', currency: 'USD', kind: 'BUY_FX' }).localSequence).toBe(2)
  })

  it('does not double-post when reconnect handlers race', async () => {
    const policy = { tenantId: 'tenant-1', userId: 'user-1', deviceId: 'device-1', cashboxId: 'cash-1', maxAmountBase: '1000', allowKinds: ['BUY_FX'] as const }
    const outbox = new OfflineOutbox(policy)
    const command = outbox.enqueue({ ...policy, amount: '100', currency: 'USD', kind: 'BUY_FX' })
    let attempts = 0
    const post = async () => { attempts += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return { serverEntryId: 'je-1' } }
    await Promise.all([outbox.sync(post), outbox.sync(post)])
    expect(attempts).toBe(1)
    expect(outbox.all()).toMatchObject([{ clientCommandId: command.clientCommandId, status: 'posted', serverEntryId: 'je-1' }])
  })
})
