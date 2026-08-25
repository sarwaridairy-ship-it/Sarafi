import type { OfflineCommand, OfflineCommandStore } from './offline'

const databaseName = 'sarafi-offline'
const storeName = 'outbox'

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'clientCommandId' })
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

export async function saveOfflineCommand(command: OfflineCommand): Promise<void> { await withStore('readwrite', (store) => store.put(command)) }
export async function listOfflineCommands(): Promise<OfflineCommand[]> { return (await withStore('readonly', (store) => store.getAll())) as OfflineCommand[] }
export async function removeOfflineCommand(clientCommandId: string): Promise<void> { await withStore('readwrite', (store) => store.delete(clientCommandId)) }

export const indexedDbOfflineStore: OfflineCommandStore = {
  save: saveOfflineCommand,
  list: listOfflineCommands,
}

export async function encryptOfflinePayload(payload: string, key: CryptoKey): Promise<{ iv: string; data: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(payload))
  const encode = (value: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(value)))
  return { iv: encode(iv), data: encode(encrypted) }
}

export async function createOfflineSessionKey(): Promise<CryptoKey> { return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']) }
