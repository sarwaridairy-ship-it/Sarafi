import type { OfflineDraft, OfflineDraftStore } from './offline'

const databaseName = 'sarafi-offline'
const storeName = 'drafts'
const legacyStoreName = 'outbox'
const keyStoreName = 'keyring'

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 3)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'draftId' }); if (!request.result.objectStoreNames.contains(legacyStoreName)) request.result.createObjectStore(legacyStoreName, { keyPath: 'clientCommandId' }); if (!request.result.objectStoreNames.contains(keyStoreName)) request.result.createObjectStore(keyStoreName, { keyPath: 'id' }) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = action(database.transaction(storeName, mode).objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withNamedStore<T>(name: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = action(database.transaction(name, mode).objectStore(name))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getDurableKey(): Promise<CryptoKey> {
  const database = await openDatabase()
  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => { const request = database.transaction(keyStoreName, 'readonly').objectStore(keyStoreName).get('session-key'); request.onsuccess = () => resolve(request.result?.key as CryptoKey | undefined); request.onerror = () => reject(request.error) })
  if (existing) return existing
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await new Promise<void>((resolve, reject) => { const request = database.transaction(keyStoreName, 'readwrite').objectStore(keyStoreName).put({ id: 'session-key', key }); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
  return key
}

export async function saveOfflineDraft(draft: OfflineDraft): Promise<void> { await createEncryptedOfflineStore(await getDurableKey()).save(draft) }
export async function listOfflineDrafts(): Promise<OfflineDraft[]> {
  const key = await getDurableKey()
  const drafts = await createEncryptedOfflineStore(key).list()
  const legacy = await withNamedStore(legacyStoreName, 'readonly', (store) => store.getAll()) as Array<LegacyEncryptedCommand | EncryptedDraft>
  const legacyDrafts = await Promise.all(legacy.filter((record): record is LegacyEncryptedCommand => 'clientCommandId' in record).map(async (record) => {
    const draft = await decryptLegacyCommand(record, key)
    return { draftId: record.clientCommandId ?? draft.draftId, localSequence: draft.localSequence, createdAt: draft.createdAt, tenantId: draft.tenantId, userId: draft.userId, deviceId: draft.deviceId, cashboxId: draft.cashboxId, amount: draft.amount, currency: draft.currency, kind: draft.kind, status: 'legacy_review_required' as const, reviewNote: 'Previous offline transaction found. This transaction was never posted to the ledger.' }
  }))
  return [...drafts, ...legacyDrafts]
}
export async function removeOfflineDraft(draftId: string): Promise<void> { await withStore('readwrite', (store) => store.delete(draftId)) }

export const indexedDbOfflineStore: OfflineDraftStore = {
  save: saveOfflineDraft,
  list: listOfflineDrafts,
}

type EncryptedDraft = { draftId: string; tenantId: string; userId: string; deviceId: string; iv: string; data: string }
type LegacyEncryptedCommand = { clientCommandId: string; tenantId: string; userId: string; deviceId: string; iv: string; data: string }

const encode = (value: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(value)))
const decode = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0))

async function encryptDraft(draft: OfflineDraft, key: CryptoKey): Promise<EncryptedDraft> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(draft)))
  return { draftId: draft.draftId, tenantId: draft.tenantId, userId: draft.userId, deviceId: draft.deviceId, iv: encode(iv), data: encode(data) }
}

async function decryptDraft(record: EncryptedDraft, key: CryptoKey): Promise<OfflineDraft> {
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(record.iv) }, key, decode(record.data))
  const draft = JSON.parse(new TextDecoder().decode(data)) as OfflineDraft
  if (draft.draftId !== record.draftId || draft.tenantId !== record.tenantId || draft.userId !== record.userId || draft.deviceId !== record.deviceId) throw new Error('Offline draft envelope binding failed')
  return draft
}

async function decryptLegacyCommand(record: LegacyEncryptedCommand, key: CryptoKey): Promise<OfflineDraft> {
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(record.iv) }, key, decode(record.data))
  const command = JSON.parse(new TextDecoder().decode(data)) as { localSequence: number; createdAt: string; tenantId: string; userId: string; deviceId: string; cashboxId: string; amount: string; currency: string; kind: OfflineDraft['kind'] }
  if (command.tenantId !== record.tenantId || command.userId !== record.userId || command.deviceId !== record.deviceId) throw new Error('Legacy offline command envelope binding failed')
  return { ...command, draftId: record.clientCommandId, status: 'legacy_review_required' }
}

export function createEncryptedOfflineStore(key: CryptoKey): OfflineDraftStore {
  return {
    async save(draft) {
      const encrypted = await encryptDraft(draft, key)
      await withStore('readwrite', (store) => store.put(encrypted))
    },
    async list() {
      const records = await withStore('readonly', (store) => store.getAll()) as EncryptedDraft[]
      return Promise.all(records.map((record) => decryptDraft(record, key)))
    },
  }
}

export async function encryptOfflinePayload(payload: string, key: CryptoKey): Promise<{ iv: string; data: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(payload))
  const encode = (value: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(value)))
  return { iv: encode(iv), data: encode(encrypted) }
}

export async function createOfflineSessionKey(): Promise<CryptoKey> { return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']) }
