import Decimal from 'decimal.js'

export type SyncStatus = 'pending' | 'syncing' | 'posted' | 'synced' | 'conflict' | 'rejected' | 'requires_review'
export type OfflineCommand = { clientCommandId: string; localSequence: number; createdAt: string; tenantId: string; userId: string; deviceId: string; cashboxId: string; amount: string; currency: string; kind: 'BUY_FX' | 'SELL_FX'; status: SyncStatus; serverEntryId?: string; conflictReason?: string }
export type OfflinePolicy = { tenantId: string; userId: string; deviceId: string; cashboxId: string; maxAmountBase: string; allowKinds: readonly OfflineCommand['kind'][] }
export type OfflineCommandStore = { save(command: OfflineCommand): Promise<void>; list(): Promise<OfflineCommand[]> }

export class OfflineOutbox {
  private readonly commands: OfflineCommand[] = []
  private nextSequence = 1
  private readonly policy: OfflinePolicy
  private readonly store?: OfflineCommandStore
  private syncInFlight = false

  constructor(policy: OfflinePolicy, store?: OfflineCommandStore) { this.policy = policy; this.store = store }

  async hydrate(): Promise<void> {
    if (!this.store) return
    const stored = await this.store.list()
    this.commands.splice(0, this.commands.length, ...stored.sort((a, b) => a.localSequence - b.localSequence))
    this.nextSequence = Math.max(0, ...this.commands.map((command) => command.localSequence)) + 1
  }

  enqueue(input: Omit<OfflineCommand, 'clientCommandId' | 'localSequence' | 'createdAt' | 'status'>): OfflineCommand {
    if (input.tenantId !== this.policy.tenantId || input.userId !== this.policy.userId || input.deviceId !== this.policy.deviceId) throw new Error('Offline command identity binding is invalid')
    if (input.cashboxId !== this.policy.cashboxId) throw new Error('This device is not assigned to that cashbox')
    if (!this.policy.allowKinds.includes(input.kind)) throw new Error('This operation is not permitted offline')
    if (new Decimal(input.amount).gt(this.policy.maxAmountBase)) throw new Error('Offline amount limit exceeded')
    const command = { ...input, clientCommandId: crypto.randomUUID(), localSequence: this.nextSequence++, createdAt: new Date().toISOString(), status: 'pending' as const }
    this.commands.push(command)
    void this.store?.save(command)
    return command
  }

  pending(): OfflineCommand[] { return this.commands.filter((command) => command.status === 'pending').sort((a, b) => a.localSequence - b.localSequence) }
  all(): OfflineCommand[] { return [...this.commands] }

  async sync(post: (command: OfflineCommand) => Promise<{ serverEntryId: string }>): Promise<OfflineCommand[]> {
    if (this.syncInFlight) return this.all()
    this.syncInFlight = true
    try {
      for (const command of this.pending()) {
        command.status = 'syncing'
        await this.store?.save(command)
        try {
          const result = await post(command)
          command.status = 'posted'
          command.serverEntryId = result.serverEntryId
          await this.store?.save(command)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Server rejected command'
          command.status = /stale rate|revoked device|closed shift|insufficient inventory|already settled|duplicate/i.test(message) ? 'conflict' : 'rejected'
          command.conflictReason = message
          await this.store?.save(command)
        }
      }
    } finally {
      this.syncInFlight = false
    }
    return this.all()
  }
}

export function bindOfflineReconnect(outbox: OfflineOutbox, post: (command: OfflineCommand) => Promise<{ serverEntryId: string }>): () => void {
  const syncWhenOnline = () => { void outbox.sync(post) }
  window.addEventListener('online', syncWhenOnline)
  return () => window.removeEventListener('online', syncWhenOnline)
}
