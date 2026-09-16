import { readFileSync } from 'node:fs'
import { assessRecoveryPreflight } from '../../src/domain/recovery-preflight.ts'

const [inputPath, projectRef, ...extra] = process.argv.slice(2)
if (!inputPath || !/^[a-z0-9]{20}$/.test(projectRef ?? '') || extra.length) {
  console.error('Usage: node scripts/security/check-recovery-preflight.mjs <evidence.json> <source-project-ref>')
  process.exitCode = 1
} else {
  try {
    // Only the JSON object inside recovery_preflight, not the SQL tool envelope.
    const result = assessRecoveryPreflight(JSON.parse(readFileSync(inputPath, 'utf8')))
    console.log(JSON.stringify({ sourceProjectRef: projectRef, ...result }, null, 2))
    process.exitCode = result.status === 'BLOCKED' ? 2 : 0
  } catch {
    // Never echo arbitrary input or a parser error that could contain credentials.
    console.error('Invalid, incomplete, stale, or unreadable preflight evidence. Capture a fresh read-only source inventory. No restore was performed.')
    process.exitCode = 1
  }
}
