import { z } from 'zod'

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const evidenceSchema = z.object({
  captured_at: z.iso.datetime({ offset: true }),
  active_cron_jobs: count,
  queued_http_requests: count,
  foreign_servers: count,
  outbound_extensions: z.array(z.string().min(1)),
  vault_secrets: count,
  storage_objects: count,
}).strict()

/** A read-only hazard screen, never permission to restore or a recovery certificate. */
export function assessRecoveryPreflight(input: unknown, now = Date.now()) {
  const evidence = evidenceSchema.parse(input)
  const age = now - Date.parse(evidence.captured_at)
  if (!Number.isFinite(now) || age < -60_000 || age > 15 * 60_000) {
    throw new Error('Recovery preflight must be captured within the last 15 minutes')
  }
  const blockers: string[] = []
  if (evidence.active_cron_jobs > 0) blockers.push('Active scheduled jobs restart in a physical clone; do not clone this source.')
  if (evidence.queued_http_requests > 0) blockers.push('Queued HTTP requests may execute from a clone.')
  if (evidence.foreign_servers > 0) blockers.push('Foreign servers can retain access to external databases.')
  if (evidence.outbound_extensions.length > 0) blockers.push('Outbound-capable extensions require an isolated, reviewed logical-restore procedure.')
  if (evidence.vault_secrets > 0) blockers.push('A physical clone copies the encryption key and usable Vault secrets; review credential isolation first.')
  return {
    status: blockers.length ? 'BLOCKED' : 'HAZARD_SCREEN_PASSED',
    blockers,
    storageObjectsRequiringSeparateBackup: evidence.storage_objects,
    restoresPerformed: 0,
    releaseApproved: false,
    next: 'Confirm an approved private target, cost limit, complete Storage backup, external-action isolation, and backup-time reconciliation before a restore drill. This screen is not a restore test.',
  } as const
}
