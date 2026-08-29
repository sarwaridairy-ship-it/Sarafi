import { useState } from "react";
import {
  csvTemplate,
  previewCsvImport,
  type ImportKind,
  type ImportPreview,
} from "./domain/imports";
import { commitImport } from "./lib/financialApi";
import { translate, type Language } from "./lib/i18n";
import { ux } from "./lib/uxCopy";

export function ImportWorkspace({
  language,
  organizationId,
  onBack,
  onToast,
}: {
  language: Language;
  organizationId: string | null;
  onBack: () => void;
  onToast: (message: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const [kind, setKind] = useState<ImportKind>("counterparties");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [importKey, setImportKey] = useState(() => crypto.randomUUID());
  const loadCsv = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPreview(previewCsvImport(kind, await file.text()));
      setImportKey(crypto.randomUUID());
      setMessage(u("previewComplete"));
    } catch (error) {
      setPreview(null);
      void error;
      setMessage(u("csvReadFailed"));
    }
  };
  const downloadTemplate = () => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csvTemplate(kind)], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `sarafi-${kind}-template.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const commit = async () => {
    if (!organizationId || !preview?.canCommit) return;
    const result = await commitImport({
      organization_id: organizationId,
      import_key: importKey,
      kind,
      rows: preview.rows.map((row) => row.values),
    });
    onToast(
      result.error
        ? u("couldNotSave")
        : `${String(result.data?.row_count ?? 0)} ${u("importSaved")}`,
    );
  };
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">{u("switchingShop")}</p>
          <h1>{u("importCenter")}</h1>
          <p>{u("importIntro")}</p>
        </div>
        <button className="text-button" onClick={onBack}>
          {u("backHome")} →
        </button>
      </div>
      <div className="rate-strip">
        <label>
          {u("importType")}
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as ImportKind);
              setPreview(null);
              setMessage("");
            }}
          >
            <option value="counterparties">{u("counterparties")}</option>
            <option value="opening_balances">{u("openingBalances")}</option>
            <option value="debts">{t("debts")}</option>
          </select>
        </label>
        <button className="export-button" onClick={downloadTemplate}>
          {u("downloadTemplate")}
        </button>
        <label>
          {u("chooseCsv")}
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void loadCsv(event.target.files?.[0])}
          />
        </label>
      </div>
      {message && (
        <p className="empty-live" role="status">
          {message}
        </p>
      )}
      {preview && (
        <>
          <div className="metric-grid">
            <article className="metric-card">
              <span>{u("rowsChecked")}</span>
              <strong>{preview.rows.length}</strong>
            </article>
            <article className="metric-card">
              <span>{u("issues")}</span>
              <strong>{preview.issues.length}</strong>
            </article>
            <article className="metric-card">
              <span>{u("readyToImport")}</span>
              <strong>{preview.canCommit ? u("yes") : u("no")}</strong>
            </article>
            {Object.entries(preview.totals).map(([field, total]) => (
              <article className="metric-card" key={field}>
                <span>
                  {u("total")} {field.replace("_", " ")}
                </span>
                <strong>{total}</strong>
              </article>
            ))}
          </div>
          {preview.issues.length > 0 && (
            <div className="balance-list">
              {preview.issues.map((issue, index) => (
                <div
                  className="balance-row"
                  key={`${issue.rowNumber}-${issue.field}-${index}`}
                >
                  <span className="currency-badge usd">!</span>
                  <span className="balance-name">
                    <b>
                      {u("row")} {issue.rowNumber} · {issue.field}
                    </b>
                    <small>{issue.message}</small>
                  </span>
                  <strong>{u("fixRequired")}</strong>
                </div>
              ))}
            </div>
          )}
          {preview.canCommit && (
            <div className="notice">
              <span className="sync-dot online" />
              <span>{u("importReady")}</span>
              <button onClick={() => void commit()} disabled={!organizationId}>
                {u("confirmImport")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
