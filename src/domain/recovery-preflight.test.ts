import { describe, expect, it } from 'vitest'
import { assessRecoveryPreflight } from './recovery-preflight'

const now = Date.parse('2026-09-16T19:30:00Z')
const clean = {
  captured_at: '2026-09-16T19:30:00Z', active_cron_jobs: 0,
  queued_http_requests: 0, foreign_servers: 0, outbound_extensions: [],
  vault_secrets: 0, storage_objects: 0,
}

describe('recovery clone safety screen', () => {
  it('never treats a passed hazard screen as a restore or launch approval', () => {
    const result = assessRecoveryPreflight(clean, now)
    expect(result.status).toBe('HAZARD_SCREEN_PASSED')
    expect(result.restoresPerformed).toBe(0)
    expect(result.releaseApproved).toBe(false)
  })
  it.each(['active_cron_jobs', 'queued_http_requests', 'foreign_servers', 'vault_secrets'] as const)(
    'blocks cloning with %s even if every other count is zero', (field) => {
      expect(assessRecoveryPreflight({ ...clean, [field]: 1 }, now).status).toBe('BLOCKED')
    },
  )
  it('blocks outbound extensions even when the request queue is currently empty', () => {
    expect(assessRecoveryPreflight({ ...clean, outbound_extensions: ['pg_net'] }, now).status).toBe('BLOCKED')
  })
  it('reports the separate Storage coverage gap', () => {
    expect(assessRecoveryPreflight({ ...clean, storage_objects: 24 }, now).storageObjectsRequiringSeparateBackup).toBe(24)
  })
  it.each([{}, null, { ...clean, vault_secrets: undefined }, { ...clean, active_cron_jobs: null },
    { ...clean, active_cron_jobs: -1 }, { ...clean, active_cron_jobs: '0' },
    { ...clean, storage_objects: 0.5 }, { ...clean, foreign_servers: Number.MAX_SAFE_INTEGER + 1 },
    { ...clean, unexpected_secret: 'must not be echoed' }])('fails closed for missing or malformed evidence', (input) => {
    expect(() => assessRecoveryPreflight(input, now)).toThrow()
  })
  it.each(['2026-09-16T19:14:59Z', '2026-09-16T19:31:01Z', 'not-a-date'])(
    'rejects stale, future or invalid capture time %s', (captured_at) => {
      expect(() => assessRecoveryPreflight({ ...clean, captured_at }, now)).toThrow()
    },
  )
})
