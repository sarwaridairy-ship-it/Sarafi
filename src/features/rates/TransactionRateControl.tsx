import Decimal from "decimal.js";
import type { Language } from "../../lib/i18n";

const labels = {
  en: {
    rate: "Rate",
    automatic: "Automatic",
    on: "ON",
    off: "OFF",
    unavailable: "Automatic rate unavailable",
    enter: "Enter rate here",
    updated: "Updated",
    daily: "Daily rate",
    reverse: "Reverse quote",
  },
  "fa-AF": {
    rate: "نرخ",
    automatic: "خودکار",
    on: "فعال",
    off: "خاموش",
    unavailable: "نرخ خودکار موجود نیست",
    enter: "نرخ را اینجا بنویسید",
    updated: "تازه‌شده",
    daily: "نرخ روزانه",
    reverse: "برعکس‌ساختن نرخ",
  },
  "ps-AF": {
    rate: "نرخ",
    automatic: "اتومات",
    on: "فعال",
    off: "بند",
    unavailable: "اتومات نرخ نشته",
    enter: "نرخ دلته ولیکئ",
    updated: "تازه شوی",
    daily: "ورځنی نرخ",
    reverse: "نرخ سرچپه کول",
  },
} as const;

function reciprocal(value: string | undefined): string {
  if (!value) return "";
  try {
    const parsed = new Decimal(value);
    return parsed.isPositive()
      ? new Decimal(1).div(parsed).toSignificantDigits(12).toString()
      : "";
  } catch {
    return "";
  }
}

export function TransactionRateControl({
  language,
  automatic,
  unavailable = false,
  canEdit = true,
  canonicalRate,
  sourceCurrency,
  targetCurrency,
  reversed,
  updatedAt,
  disabled = false,
  approvalMessage,
  onAutomaticChange,
  onCanonicalRateChange,
  onReverse,
}: {
  language: Language;
  automatic: boolean;
  unavailable?: boolean;
  canEdit?: boolean;
  canonicalRate?: string;
  sourceCurrency: string;
  targetCurrency: string;
  reversed: boolean;
  updatedAt?: string;
  disabled?: boolean;
  approvalMessage?: string;
  onAutomaticChange: (automatic: boolean) => void;
  onCanonicalRateChange: (rate: string) => void;
  onReverse: () => void;
}) {
  const text = labels[language];
  const visibleRate = reversed ? reciprocal(canonicalRate) : canonicalRate ?? "";
  const leftCurrency = reversed ? targetCurrency : sourceCurrency;
  const rightCurrency = reversed ? sourceCurrency : targetCurrency;
  const editable = canEdit && (!automatic || unavailable);
  const updateVisibleRate = (next: string) => {
    if (!reversed) {
      onCanonicalRateChange(next);
      return;
    }
    onCanonicalRateChange(next ? reciprocal(next) : "");
  };
  const updatedLabel = updatedAt
    ? `${text.updated} ${new Date(updatedAt).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })} - ${text.daily}`
    : text.daily;

  return (
    <section className={`transaction-rate-control${unavailable ? " unavailable" : ""}`} aria-label={text.rate}>
      <header>
        <strong>{text.rate}</strong>
        <button
          type="button"
          className="automatic-rate-switch"
          role="switch"
          aria-checked={automatic}
          disabled={disabled}
          onClick={() => onAutomaticChange(!automatic)}
        >
          <span>{text.automatic}</span>
          <b>{automatic ? text.on : text.off}</b>
        </button>
      </header>
      {unavailable && automatic ? <p className="transaction-rate-warning" role="alert">{text.unavailable}</p> : null}
      <div className="transaction-rate-line" dir="ltr">
        <span>1 {leftCurrency}</span>
        <span aria-hidden="true">=</span>
        {editable ? (
          <input
            required
            min="0.000001"
            step="any"
            inputMode="decimal"
            value={visibleRate}
            onChange={(event) => updateVisibleRate(event.target.value)}
            placeholder={text.enter}
            aria-label={text.enter}
            disabled={disabled}
          />
        ) : <output>{visibleRate || "—"}</output>}
        <span>{rightCurrency}</span>
        <button type="button" className="compact-rate-swap" onClick={onReverse} aria-label={text.reverse} disabled={disabled}>⇄</button>
      </div>
      <small className="transaction-rate-meta">{unavailable ? text.unavailable : updatedLabel}</small>
      {approvalMessage ? <p className="transaction-rate-approval" role="status">{approvalMessage}</p> : null}
    </section>
  );
}
