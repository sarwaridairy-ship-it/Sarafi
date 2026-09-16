import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const stages = process.argv.slice(2)
if (!stages.length || stages.some((stage) => !/^[a-z0-9-]+$/.test(stage))) {
  throw new Error('Provide the expected browser evidence stages')
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== commit) throw new Error('Evidence checkout differs from CI commit')
const results = stages.map((stage) => {
  const path = `evidence-results/${stage}.json`
  try {
    const raw = readFileSync(path)
    const report = JSON.parse(raw)
    const stats = report.stats
    return {
      stage, path, sha256: createHash('sha256').update(raw).digest('hex'),
      status: stats.unexpected === 0 && stats.expected > 0 ? 'passed' : 'failed',
      passed: stats.expected, failed: stats.unexpected, skipped: stats.skipped,
      flaky: stats.flaky, started_at: stats.startTime, duration_ms: stats.duration,
      html_report: `playwright-report/${stage}/index.html`,
      traces_and_screenshots: `test-results/${stage}/`,
    }
  } catch (error) {
    return { stage, path, status: 'missing', reason: error.message }
  }
})
const manifest = { commit, generated_at: new Date().toISOString(), run_id: process.env.GITHUB_RUN_ID ?? null, stages: results }
mkdirSync('release-evidence', { recursive: true })
writeFileSync('release-evidence/test-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify(manifest, null, 2))
if (results.some((result) => result.status !== 'passed')) process.exitCode = 1
