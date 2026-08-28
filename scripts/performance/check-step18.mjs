import { readdirSync, readFileSync } from 'node:fs'

const assets = readdirSync('dist/assets')
const initial = assets.filter((name) => /^index-[^/]+\.js$/.test(name))
const initialBytes = initial.reduce((total, name) => total + readFileSync(`dist/assets/${name}`).byteLength, 0)
const report = { initial_assets: initial, initial_bytes: initialBytes, initial_kilobytes: Number((initialBytes / 1024).toFixed(1)), budget_kilobytes: 500, passed: initialBytes <= 500 * 1024, lazy_export_chunk_present: assets.some((name) => name.startsWith('exports-')) }
const serviceWorker = readFileSync('public/sw.js', 'utf8')
report.service_worker_network_only_for_navigation = serviceWorker.includes("if (isNavigation || isFinancialOrAuth)") && serviceWorker.includes('event.respondWith(fetch(event.request))')
report.service_worker_does_not_cache_financial_requests = serviceWorker.includes("requestUrl.pathname.startsWith('/rest/')") && serviceWorker.includes("requestUrl.pathname.startsWith('/auth/')")
console.log(JSON.stringify(report, null, 2))
if (!report.passed || !report.lazy_export_chunk_present || !report.service_worker_network_only_for_navigation || !report.service_worker_does_not_cache_financial_requests) process.exitCode = 1
