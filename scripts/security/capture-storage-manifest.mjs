import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { captureStorageManifest } from '../../src/domain/storage-recovery.ts'
import { readEnvFile } from './mfa-fixture.mjs'

const [envPath, expectedRef, outputPath, ...extra] = process.argv.slice(2)
if (!envPath || !outputPath || !/^[a-z0-9]{20}$/.test(expectedRef ?? '') || extra.length) {
  console.error('Usage: node scripts/security/capture-storage-manifest.mjs <private-env-file> <expected-project-ref> <new-manifest.json>')
  process.exitCode = 1
} else {
  try {
    const env = { ...readEnvFile(envPath), ...process.env }
    const url = new URL(env.SUPABASE_URL)
    if (url.href !== `https://${expectedRef}.supabase.co/` || !env.SUPABASE_SECRET_KEY) throw new Error('Project or server credential mismatch')
    const client = createClient(url.href, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }) },
    })
    const manifest = await captureStorageManifest(client, expectedRef)
    writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    console.log(JSON.stringify({ status: 'SOURCE_BYTES_READABLE', projectRef: expectedRef,
      privateBuckets: manifest.buckets.length, objects: manifest.objects.length,
      totalBytes: manifest.objects.reduce((sum, object) => sum + object.size, 0),
      objectContentsSaved: false, backupCreated: false, restoreVerified: false, releaseApproved: false }, null, 2))
  } catch {
    // SDK/parser errors can contain object names, signed URLs, or credentials.
    console.error('Storage capture failed closed. No backup, restore or release approval was performed. Check the private configuration, project, object stability and output path.')
    process.exitCode = 1
  }
}
