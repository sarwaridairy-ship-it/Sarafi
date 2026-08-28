import Decimal from 'decimal.js'

export type OfflineDraftStatus = 'draft_offline' | 'legacy_review_required'
export type OfflineDraft = { draftId: string; localSequence: number; createdAt: string; tenantId: string; userId: string; deviceId: string; cashboxId: string; amount: string; currency: string; kind: 'BUY_FX' | 'SELL_FX'; status: OfflineDraftStatus; reviewNote?: string }
export type OfflinePolicy = { tenantId: string; userId: string; deviceId: string; cashboxId: string; maxAmountBase: string; allowKinds: readonly OfflineDraft['kind'][] }
export type OfflineDraftStore = { save(draft: OfflineDraft): Promise<void>; list(): Promise<OfflineDraft[]> }

export class OfflineDraftBook {
  private readonly drafts: OfflineDraft[] = []
  private nextSequence = 1
  private readonly policy: OfflinePolicy
  private readonly store?: OfflineDraftStore

  constructor(policy: OfflinePolicy, store?: OfflineDraftStore) { this.policy = policy; this.store = store }

  async hydrate(): Promise<void> {
    if (!this.store) return
    const stored = await this.store.list()
    this.drafts.splice(0, this.drafts.length, ...stored.sort((a, b) => a.localSequence - b.localSequence))
    this.nextSequence = Math.max(0, ...this.drafts.map((draft) => draft.localSequence)) + 1
  }

  saveDraft(input: Omit<OfflineDraft, 'draftId' | 'localSequence' | 'createdAt' | 'status'>): OfflineDraft {
    if (input.tenantId !== this.policy.tenantId || input.userId !== this.policy.userId || input.deviceId !== this.policy.deviceId) throw new Error('Offline command identity binding is invalid')
    if (input.cashboxId !== this.policy.cashboxId) throw new Error('This device is not assigned to that cashbox')
    if (!this.policy.allowKinds.includes(input.kind)) throw new Error('This operation is not permitted offline')
    const amount = new Decimal(input.amount)
    const limit = new Decimal(this.policy.maxAmountBase)
    if (!amount.isFinite() || amount.lte(0) || !limit.isFinite() || amount.gt(limit)) throw new Error('Offline draft exceeds the permitted amount')
    const draft = { ...input, draftId: crypto.randomUUID(), localSequence: this.nextSequence++, createdAt: new Date().toISOString(), status: 'draft_offline' as const }
    this.drafts.push(draft)
    void this.store?.save(draft)
    return draft
  }

  async persistDraft(draft: OfflineDraft): Promise<void> { await this.store?.save(draft) }

  all(): OfflineDraft[] { return [...this.drafts] }
}

export function bindOfflineReconnect(onReconnect: () => void): () => void {
  const notifyReconnect = () => onReconnect()
  window.addEventListener('online', notifyReconnect)
  return () => window.removeEventListener('online', notifyReconnect)
}
