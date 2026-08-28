import { useState } from 'react'
import { csvTemplate, previewCsvImport, type ImportKind, type ImportPreview } from './domain/imports'
import { commitImport } from './lib/financialApi'

export function ImportWorkspace({ organizationId, onBack, onToast }: { organizationId: string | null; onBack: () => void; onToast: (message: string) => void }) {
  const [kind, setKind] = useState<ImportKind>('counterparties')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [message, setMessage] = useState('')
  const [importKey, setImportKey] = useState(() => crypto.randomUUID())
  const loadCsv = async (file: File | undefined) => {
    if (!file) return
    try {
      setPreview(previewCsvImport(kind, await file.text()))
      setImportKey(crypto.randomUUID())
      setMessage('Dry run complete. No records were changed.')
    } catch (error) {
      setPreview(null)
      setMessage(error instanceof Error ? error.message : 'Unable to read this CSV file')
    }
  }
  const downloadTemplate = () => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csvTemplate(kind)], { type: 'text/csv;charset=utf-8' }))
    link.download = `sarafi-${kind}-template.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }
  const commit = async () => {
    if (!organizationId || !preview?.canCommit) return
    const result = await commitImport({ organization_id: organizationId, import_key: importKey, kind, rows: preview.rows.map((row) => row.values) })
    onToast(result.error ? `Import not committed: ${result.error}` : `Import committed: ${String(result.data?.row_count ?? 0)} rows`)
  }
  return <section className="panel"><div className="panel-header"><div><p className="kicker">SWITCHING WORKSPACE</p><h1>Import center</h1><p>Validate a migration before anything reaches the authoritative ledger.</p></div><button className="text-button" onClick={onBack}>Back to dashboard →</button></div><div className="rate-strip"><label>Import type<select value={kind} onChange={(event) => { setKind(event.target.value as ImportKind); setPreview(null); setMessage('') }}><option value="counterparties">Counterparties</option><option value="opening_balances">Opening balances</option><option value="debts">Debts</option></select></label><button className="export-button" onClick={downloadTemplate}>Download CSV template</button><label>Choose CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void loadCsv(event.target.files?.[0])} /></label></div>{message && <p className="empty-live" role="status">{message}</p>}{preview && <><div className="metric-grid"><article className="metric-card"><span>Rows inspected</span><strong>{preview.rows.length}</strong></article><article className="metric-card"><span>Issues</span><strong>{preview.issues.length}</strong></article><article className="metric-card"><span>Ready to commit</span><strong>{preview.canCommit ? 'Yes' : 'No'}</strong></article>{Object.entries(preview.totals).map(([field, total]) => <article className="metric-card" key={field}><span>Total {field.replace('_', ' ')}</span><strong>{total}</strong></article>)}</div>{preview.issues.length > 0 && <div className="balance-list">{preview.issues.map((issue, index) => <div className="balance-row" key={`${issue.rowNumber}-${issue.field}-${index}`}><span className="currency-badge usd">!</span><span className="balance-name"><b>Row {issue.rowNumber} · {issue.field}</b><small>{issue.message}</small></span><strong>Fix required</strong></div>)}</div>}{preview.canCommit && <div className="notice"><span className="sync-dot online" /><span>Validated preview is ready. Confirming sends this exact batch through the authorized server import command.</span><button onClick={() => void commit()} disabled={!organizationId}>Confirm and commit</button></div>}</>}</section>
}
