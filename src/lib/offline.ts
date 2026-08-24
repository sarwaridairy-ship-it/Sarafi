import Decimal from 'decimal.js'

export type SyncStatus = 'pending' | 'synced' | 'conflict'
export type OfflineCommand = { clientCommandId: string; localSequence: number; createdAt: string; cashboxId: string; amount: string; currency: string; kind: 'BUY_FX' | 'SELL_FX'; status: SyncStatus; serverEntryId?: string; conflictReason?: string }
export type OfflinePolicy = { cashboxId: string; maxAmountBase: string; allowKinds: OfflineCommand['kind'][] }

export class OfflineOutbox {
  private readonly commands: OfflineCommand[] = []
  private nextSequence = 1
  private readonly policy: OfflinePolicy

  constructor(policy: OfflinePolicy) { this.policy = policy }

  enqueue(input: Omit<OfflineCommand, 'clientCommandId' | 'localSequence' | 'createdAt' | 'status'>): OfflineCommand {
    if (input.cashboxId !== this.policy.cashboxId) throw new Error('This device is not assigned to that cashbox')
    if (!this.policy.allowKinds.includes(input.kind)) throw new Error('This operation is not permitted offline')
    if (new Decimal(input.amount).gt(this.policy.maxAmountBase)) throw new Error('Offline amount limit exceeded')
    const command = { ...input, clientCommandId: crypto.randomUUID(), localSequence: this.nextSequence++, createdAt: new Date().toISOString(), status: 'pending' as const }
    this.commands.push(command)
    return command
  }

  pending(): OfflineCommand[] { return this.commands.filter((command) => command.status === 'pending').sort((a, b) => a.localSequence - b.localSequence) }
  all(): OfflineCommand[] { return [...this.commands] }

  async sync(post: (command: OfflineCommand) => Promise<{ serverEntryId: string }>): Promise<OfflineCommand[]> {
    for (const command of this.pending()) {
      try {
        const result = await post(command)
        command.status = 'synced'
        command.serverEntryId = result.serverEntryId
      } catch (error) {
        command.status = 'conflict'
        command.conflictReason = error instanceof Error ? error.message : 'Server rejected command'
      }
    }
    return this.all()
  }
}
