import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const migration = process.argv[2]
if (!/^supabase\/migrations\/\d+_[a-z0-9_]+\.sql$/.test(migration ?? '')) throw new Error('Provide a repository migration path')
mkdirSync('tmp/launch-audit', { recursive: true })
writeFileSync('tmp/launch-audit/migration-trial.sql', `begin;\nset local lock_timeout = '5s';\n${readFileSync(migration, 'utf8')}\nrollback;\n`)
console.log('Prepared rollback-only migration syntax and dependency check')
