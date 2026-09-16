import { describe, expect, it } from 'vitest'
import { captureStorageManifest, compareStorageManifests, validateStorageManifest } from './storage-recovery'

const source = {
  format: 'sarafi-storage-checksums-v1', projectRef: 'aaaaaaaaaaaaaaaaaaaa',
  startedAt: '2026-09-16T22:00:00.000Z', completedAt: '2026-09-16T22:01:00.000Z',
  stableMetadataAcrossCapture: true, buckets: [{ id: 'private', public: false }],
  objects: [{ bucket: 'private', keyHash: 'a'.repeat(64), size: 3, sha256: 'b'.repeat(64) }],
}
const restored = { ...source, projectRef: 'bbbbbbbbbbbbbbbbbbbb' }

describe('Storage recovery evidence', () => {
  it('matches bytes across isolated projects without approving the release', () => {
    expect(compareStorageManifests(source, restored)).toMatchObject({ status: 'STORAGE_BYTES_MATCH', releaseApproved: false, databaseRecoveryVerified: false })
  })
  it('rejects a no-op source-to-source comparison', () => {
    expect(() => compareStorageManifests(source, source)).toThrow()
  })
  it('detects missing and extra files', () => {
    expect(compareStorageManifests(source, { ...restored, objects: [] }).missing).toBe(1)
    expect(compareStorageManifests({ ...source, objects: [] }, restored).extra).toBe(1)
  })
  it.each([{ sha256: 'c'.repeat(64) }, { size: 4 }])('detects changed content or size', (change) => {
    expect(compareStorageManifests(source, { ...restored, objects: [{ ...source.objects[0], ...change }] }).changed).toBe(1)
  })
  it('detects missing empty buckets', () => {
    expect(compareStorageManifests({ ...source, buckets: [...source.buckets, { id: 'empty', public: false }] }, restored).bucketMismatch).toBe(true)
  })
  it.each([null, {}, { ...source, stableMetadataAcrossCapture: false },
    { ...source, buckets: [{ id: 'private', public: true }] }, { ...source, buckets: [] },
    { ...source, buckets: [...source.buckets, ...source.buckets] },
    { ...source, objects: [...source.objects, ...source.objects] },
    { ...source, objects: [{ ...source.objects[0], bucket: 'unlisted' }] },
    { ...source, objects: [{ ...source.objects[0], size: -1 }] },
    { ...source, objects: [{ ...source.objects[0], sha256: 'invalid' }] },
    { ...source, completedAt: '2026-09-16T21:00:00.000Z' },
    { ...source, rawSecret: 'must not be accepted' },
  ])('rejects incomplete or unsafe manifests', (input) => {
    expect(() => validateStorageManifest(input)).toThrow()
  })

  const client = (options: { failDownload?: boolean; changeSize?: boolean; changeInventory?: boolean; publicBucket?: boolean; missingSize?: boolean } = {}) => {
    let inventoryCalls = 0
    return { storage: {
      listBuckets: async () => { inventoryCalls++; return { data: [{ id: 'private', public: !!options.publicBucket }], error: null } },
      from: () => ({
        list: async (prefix: string) => ({ error: null, data: prefix ? [
          { name: 'sensitive-name.pdf', id: 'object-id', updated_at: '2026-09-16T22:00:00Z',
            metadata: { size: options.missingSize ? undefined : (options.changeInventory && inventoryCalls > 1 ? 4 : 3) } },
        ] : [{ name: 'folder', id: null, metadata: null }] }),
        download: async () => ({ error: options.failDownload ? new Error('private detail') : null,
          data: new Blob([options.changeSize ? 'abcd' : 'abc']) }),
      }),
    } } as unknown as Parameters<typeof captureStorageManifest>[0]
  }
  it('hashes private content and names without storing them', async () => {
    const manifest = await captureStorageManifest(client(), source.projectRef)
    expect(manifest.objects).toHaveLength(1)
    expect(manifest.objects[0].sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(JSON.stringify(manifest)).not.toContain('sensitive-name')
    expect(JSON.stringify(manifest)).not.toContain('folder/')
  })
  it.each([{ failDownload: true }, { changeSize: true }, { changeInventory: true }, { publicBucket: true }, { missingSize: true }])(
    'fails closed on incomplete or changing source evidence', async (options) => {
      await expect(captureStorageManifest(client(options), source.projectRef)).rejects.toThrow()
    },
  )
  it('visits every bucket and object page instead of truncating at 100', async () => {
    const buckets = Array.from({ length: 101 }, (_, index) => ({ id: `bucket-${index}`, public: false }))
    const files = Array.from({ length: 101 }, (_, index) => ({ name: `file-${index}`, id: `id-${index}`,
      updated_at: '2026-09-16T22:00:00Z', metadata: { size: 3 } }))
    const paged = { storage: {
      listBuckets: async ({ offset, limit }: { offset: number; limit: number }) => ({ data: buckets.slice(offset, offset + limit), error: null }),
      from: (bucket: string) => ({
        list: async (_prefix: string, { offset, limit }: { offset: number; limit: number }) => ({ data: bucket === 'bucket-0' ? files.slice(offset, offset + limit) : [], error: null }),
        download: async () => ({ data: new Blob(['abc']), error: null }),
      }),
    } } as unknown as Parameters<typeof captureStorageManifest>[0]
    const manifest = await captureStorageManifest(paged, source.projectRef)
    expect(manifest.buckets).toHaveLength(101)
    expect(manifest.objects).toHaveLength(101)
  })
})
