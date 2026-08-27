import type { OfflineCommand, OfflineCommandStore } from './offline'

const databaseName = 'sarafi-offline'
const storeName = 'outbox'
const keyStoreName = 'keyring'

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'clientCommandId' }); if (!request.result.objectStoreNames.contains(keyStoreName)) request.result.createObjectStore(keyStoreName, { keyPath: 'id' }) }
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

async function getDurableKey(): Promise<CryptoKey> {
  const database = await openDatabase()
  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => { const request = database.transaction(keyStoreName, 'readonly').objectStore(keyStoreName).get('session-key'); request.onsuccess = () => resolve(request.result?.key as CryptoKey | undefined); request.onerror = () => reject(request.error) })
  if (existing) return existing
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await new Promise<void>((resolve, reject) => { const request = database.transaction(keyStoreName, 'readwrite').objectStore(keyStoreName).put({ id: 'session-key', key }); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
  return key
}

export async function saveOfflineCommand(command: OfflineCommand): Promise<void> { await createEncryptedOfflineStore(await getDurableKey()).save(command) }
export async function listOfflineCommands(): Promise<OfflineCommand[]> { return createEncryptedOfflineStore(await getDurableKey()).list() }
export async function removeOfflineCommand(clientCommandId: string): Promise<void> { await withStore('readwrite', (store) => store.delete(clientCommandId)) }

export const indexedDbOfflineStore: OfflineCommandStore = {
  save: saveOfflineCommand,
  list: listOfflineCommands,
}

type EncryptedCommand = { clientCommandId: string; tenantId: string; userId: string; deviceId: string; iv: string; data: string }

const encode = (value: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(value)))
const decode = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0))

async function encryptCommand(command: OfflineCommand, key: CryptoKey): Promise<EncryptedCommand> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(command)))
  return { clientCommandId: command.clientCommandId, tenantId: command.tenantId, userId: command.userId, deviceId: command.deviceId, iv: encode(iv), data: encode(data) }
}

async function decryptCommand(record: EncryptedCommand, key: CryptoKey): Promise<OfflineCommand> {
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(record.iv) }, key, decode(record.data))
  const command = JSON.parse(new TextDecoder().decode(data)) as OfflineCommand
  if (command.clientCommandId !== record.clientCommandId || command.tenantId !== record.tenantId || command.userId !== record.userId || command.deviceId !== record.deviceId) throw new Error('Offline command envelope binding failed')
  return command
}

export function createEncryptedOfflineStore(key: CryptoKey): OfflineCommandStore {
  return {
    async save(command) {
      const encrypted = await encryptCommand(command, key)
      await withStore('readwrite', (store) => store.put(encrypted))
    },
    async list() {
      const records = await withStore('readonly', (store) => store.getAll()) as EncryptedCommand[]
      return Promise.all(records.map((record) => decryptCommand(record, key)))
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
