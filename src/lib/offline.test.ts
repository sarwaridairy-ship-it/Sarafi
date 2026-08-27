import { describe, expect, it } from 'vitest'
import { OfflineDraftBook, bindOfflineReconnect } from './offline'

describe('offline draft safety', () => {
  it('assigns unique ordered drafts without posting', async () => {
    const policy = { tenantId: 'tenant-1', userId: 'user-1', deviceId: 'device-1', cashboxId: 'cash-1', maxAmountBase: '1000', allowKinds: ['BUY_FX'] as const }
    const outbox = new OfflineDraftBook(policy)
    const first = outbox.saveDraft({ ...policy, amount: '100', currency: 'USD', kind: 'BUY_FX' })
    const second = outbox.saveDraft({ ...policy, amount: '200', currency: 'USD', kind: 'BUY_FX' })
    expect(first.localSequence).toBe(1)
    expect(second.localSequence).toBe(2)
    expect(outbox.all()).toHaveLength(2)
    expect(outbox.all()[0].status).toBe('draft_offline')
  })

  it('preserves conflicts instead of rewriting or marking them posted', async () => {
    const policy = { tenantId: 'tenant-1', userId: 'user-1', deviceId: 'device-1', cashboxId: 'cash-1', maxAmountBase: '1000', allowKinds: ['SELL_FX'] as const }
    const outbox = new OfflineDraftBook(policy)
    const draft = outbox.saveDraft({ ...policy, amount: '100', currency: 'USD', kind: 'SELL_FX' })
    expect(outbox.all()[0]).toMatchObject({ draftId: draft.draftId, status: 'draft_offline' })
  })

  it('prevents shared-cashbox misuse and high-risk offline operations', () => {
    const policy = { tenantId: 'tenant-1', userId: 'user-1', deviceId: 'device-1', cashboxId: 'cash-1', maxAmountBase: '1000', allowKinds: ['BUY_FX'] as const }
    const draftBook = new OfflineDraftBook(policy)
    expect(() => draftBook.saveDraft({ ...policy, cashboxId: 'cash-2', amount: '1', currency: 'USD', kind: 'BUY_FX' })).toThrow('assigned')
    expect(() => draftBook.saveDraft({ ...policy, amount: '1', currency: 'USD', kind: 'SELL_FX' })).toThrow('permitted')
    expect(() => draftBook.saveDraft({ ...policy, amount: '1', currency: 'USD', kind: 'BUY_FX' })).not.toThrow()
  })

  it('hydrates pending and previously resolved commands from durable storage', async () => {
    const stored = new Map<string, ReturnType<OfflineDraftBook['all']>[number]>()
    const store = { save: async (draft: ReturnType<OfflineDraftBook['all']>[number]) => { stored.set(draft.draftId, { ...draft }) }, list: async () => [...stored.values()] }
    const policy = { tenantId: 'tenant-1', userId: 'user-1', deviceId: 'device-1', cashboxId: 'cash-1', maxAmountBase: '1000', allowKinds: ['BUY_FX'] as const }
    const first = new OfflineDraftBook(policy, store)
    const draft = first.saveDraft({ ...policy, amount: '100', currency: 'USD', kind: 'BUY_FX' })
    const second = new OfflineDraftBook(policy, store)
    await second.hydrate()
    expect(second.all()).toMatchObject([{ draftId: draft.draftId, status: 'draft_offline' }])
    expect(second.saveDraft({ ...policy, amount: '100', currency: 'USD', kind: 'BUY_FX' }).localSequence).toBe(2)
  })

  it('does not double-post when reconnect handlers race', async () => {
    const policy = { tenantId: 'tenant-1', userId: 'user-1', deviceId: 'device-1', cashboxId: 'cash-1', maxAmountBase: '1000', allowKinds: ['BUY_FX'] as const }
    const outbox = new OfflineDraftBook(policy)
    const draft = outbox.saveDraft({ ...policy, amount: '100', currency: 'USD', kind: 'BUY_FX' })
    expect(draft.status).toBe('draft_offline')
    expect(outbox.all()).toHaveLength(1)
  })

  it('reconnect notification does not submit drafts', () => {
    const previousWindow = globalThis.window
    const listeners = new Map<string, () => void>()
    globalThis.window = { addEventListener: (name: string, listener: EventListenerOrEventListenerObject) => listeners.set(name, listener as () => void), removeEventListener: () => undefined } as unknown as Window & typeof globalThis
    let reconnects = 0
    const cleanup = bindOfflineReconnect(() => { reconnects += 1 })
    listeners.get('online')?.()
    cleanup()
    globalThis.window = previousWindow
    expect(reconnects).toBe(1)
  })
})
