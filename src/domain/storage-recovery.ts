import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const manifestSchema = z.object({
  format: z.literal('sarafi-storage-checksums-v1'),
  projectRef: z.string().regex(/^[a-z0-9]{20}$/),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  stableMetadataAcrossCapture: z.literal(true),
  buckets: z.array(z.object({ id: z.string().min(1), public: z.literal(false) }).strict()),
  objects: z.array(z.object({ bucket: z.string().min(1), keyHash: hash, size: count, sha256: hash }).strict()),
}).strict()

type Manifest = z.infer<typeof manifestSchema>
type StorageClient = Pick<SupabaseClient, 'storage'>
type ListedObject = { bucket: string; name: string; id: string; updatedAt: string; size: number; etag: string | null }

const sha256 = async (bytes: Uint8Array) => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
  (byte) => byte.toString(16).padStart(2, '0'),
).join('')

export function validateStorageManifest(input: unknown): Manifest {
  const manifest = manifestSchema.parse(input)
  if (Date.parse(manifest.completedAt) < Date.parse(manifest.startedAt)) throw new Error('Invalid capture interval')
  const buckets = new Set(manifest.buckets.map((bucket) => bucket.id))
  if (!buckets.size || buckets.size !== manifest.buckets.length) throw new Error('Missing or duplicate bucket')
  const keys = new Set<string>()
  for (const object of manifest.objects) {
    const key = `${object.bucket}:${object.keyHash}`
    if (!buckets.has(object.bucket) || keys.has(key)) throw new Error('Invalid or duplicate object')
    keys.add(key)
  }
  return manifest
}

/** Checks readability only. It does not save object bytes, create a backup, or prove a restore. */
export async function captureStorageManifest(client: StorageClient, projectRef: string) {
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error('Invalid project reference')
  const startedAt = new Date().toISOString()
  const maxEntries = 10_000
  const maxBytes = 25 * 1024 * 1024
  const inventory = async () => {
    const buckets: { id: string; public: boolean }[] = []
    for (let offset = 0; ; offset += 100) {
      const result = await client.storage.listBuckets({ limit: 100, offset, sortColumn: 'id', sortOrder: 'asc' })
      if (result.error || !Array.isArray(result.data)) throw new Error('Bucket inventory unavailable')
      buckets.push(...result.data.map(({ id, public: isPublic }) => ({ id, public: isPublic })))
      if (buckets.length > 1000) throw new Error('Bucket inventory exceeds review limit')
      if (result.data.length < 100) break
    }
    if (!buckets.length || new Set(buckets.map((bucket) => bucket.id)).size !== buckets.length) throw new Error('Missing or duplicate bucket')
    buckets.sort((a, b) => a.id.localeCompare(b.id))
    if (buckets.some((bucket) => bucket.public !== false)) throw new Error('Recovery requires private buckets')
    const objects: ListedObject[] = []
    let entries = 0
    let bytes = 0
    for (const bucket of buckets) {
      const prefixes = ['']
      const visited = new Set<string>()
      for (let index = 0; index < prefixes.length; index++) {
        const prefix = prefixes[index]
        if (visited.has(prefix)) throw new Error('Duplicate folder in inventory')
        visited.add(prefix)
        for (let offset = 0; ; offset += 100) {
          const page = await client.storage.from(bucket.id).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
          if (page.error || !Array.isArray(page.data)) throw new Error('Object inventory unavailable')
          entries += page.data.length
          if (entries > maxEntries) throw new Error('Inventory exceeds review limit')
          for (const item of page.data) {
            if (!item.name || item.name.includes('/')) throw new Error('Invalid inventory entry')
            const name = prefix ? `${prefix}/${item.name}` : item.name
            if (item.id === null && item.metadata === null) {
              prefixes.push(name)
            } else {
              const size = item.metadata?.size
              if (!item.id || !item.updated_at || typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) throw new Error('Incomplete object metadata')
              bytes += size
              if (bytes > maxBytes) throw new Error('Object bytes exceed review limit')
              objects.push({ bucket: bucket.id, name, id: item.id, updatedAt: item.updated_at, size, etag: item.metadata?.eTag ?? null })
            }
          }
          if (page.data.length < 100) break
        }
      }
    }
    objects.sort((a, b) => `${a.bucket}/${a.name}`.localeCompare(`${b.bucket}/${b.name}`))
    if (new Set(objects.map((object) => `${object.bucket}/${object.name}`)).size !== objects.length) throw new Error('Duplicate object in inventory')
    return { buckets, objects }
  }
  const before = await inventory()
  const objects: Manifest['objects'] = []
  for (const object of before.objects) {
    // Server-side only. No signed URL, filename, credential or content is persisted.
    const download = await client.storage.from(object.bucket).download(object.name, {}, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
    if (download.error || !download.data || download.data.size !== object.size) throw new Error('Object unreadable or size changed')
    objects.push({ bucket: object.bucket, keyHash: await sha256(new TextEncoder().encode(object.name)),
      size: object.size, sha256: await sha256(new Uint8Array(await download.data.arrayBuffer())) })
  }
  const after = await inventory()
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Storage changed during capture; retry a stable inventory')
  return validateStorageManifest({ format: 'sarafi-storage-checksums-v1', projectRef, startedAt,
    completedAt: new Date().toISOString(), stableMetadataAcrossCapture: true, buckets: before.buckets, objects })
}

/** A byte comparison is just one recovery gate; it is never a launch certificate. */
export function compareStorageManifests(sourceInput: unknown, restoredInput: unknown) {
  const source = validateStorageManifest(sourceInput)
  const restored = validateStorageManifest(restoredInput)
  if (source.projectRef === restored.projectRef) throw new Error('Restore verification requires a different isolated project')
  const index = (manifest: Manifest) => new Map(manifest.objects.map((object) => [`${object.bucket}:${object.keyHash}`, object]))
  const sourceObjects = index(source)
  const restoredObjects = index(restored)
  let missing = 0
  let changed = 0
  for (const [key, object] of sourceObjects) {
    const match = restoredObjects.get(key)
    if (!match) missing++
    else if (match.sha256 !== object.sha256 || match.size !== object.size) changed++
  }
  const extra = [...restoredObjects.keys()].filter((key) => !sourceObjects.has(key)).length
  const bucketMismatch = JSON.stringify(source.buckets.map((bucket) => bucket.id).sort()) !== JSON.stringify(restored.buckets.map((bucket) => bucket.id).sort())
  return { status: missing || extra || changed || bucketMismatch ? 'MISMATCH' : 'STORAGE_BYTES_MATCH',
    sourceObjects: sourceObjects.size, restoredObjects: restoredObjects.size, missing, extra, changed, bucketMismatch,
    releaseApproved: false, databaseRecoveryVerified: false } as const
}
