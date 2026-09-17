import { readFileSync } from 'node:fs'
import { compareStorageManifests } from '../../src/domain/storage-recovery.ts'

const [sourcePath, restoredPath, ...extra] = process.argv.slice(2)
if (!sourcePath || !restoredPath || extra.length) {
  console.error('Usage: node scripts/security/compare-storage-manifests.mjs <backup-time-manifest.json> <isolated-target-manifest.json>')
  process.exitCode = 1
} else {
  try {
    const result = compareStorageManifests(JSON.parse(readFileSync(sourcePath, 'utf8')), JSON.parse(readFileSync(restoredPath, 'utf8')))
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.status === 'STORAGE_BYTES_MATCH' ? 0 : 2
  } catch {
    console.error('Invalid Storage evidence or same-project comparison. No recovery or release approval was performed.')
    process.exitCode = 1
  }
}
