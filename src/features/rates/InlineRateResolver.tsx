import Decimal from "decimal.js";
import { useEffect, useMemo, useState } from "react";
import type { InlineRatePublication } from "../../domain/commands";
import { getTransactionRateContext, type OperationRateContext } from "../../lib/financialApi";
import type { Language } from "../../lib/i18n";

type LoadedRateContext = {
  key: string;
  value: OperationRateContext | null;
  error: string | null;
};

const copy = {
  en: {
    title: "Applied rate",
    loading: "Checking the approved shop rate…",
    current: "Auto",
    stale: "This rate has expired. Refresh it here before saving.",
    missing: "No approved rate exists. Add it here before saving.",
    unavailable: "The rate could not be checked. Try again before saving.",
    restricted: "A manager must publish the rate before this transaction can be saved. Your draft stays on this page.",
    approval: "This one-transaction rate will be sent to a manager for approval.",
    buy: "Shop buy rate",
    sell: "Shop sell rate",
    effective: "Effective",
    expiry: "Expires",
    required: "Change rate",
    foreign: "Currency",
    local: "Afghani",
    details: "Change",
    reason: "Reason for manual rate",
    reasonPlaceholder: "Short operational reason",
    reverse: "Reverse quote",
    updated: "Updated",
    transactionOnly: "This transaction only",
    publish: "Save as shop rate",
  },
  "fa-AF": {
    title: "نرخ تطبیق‌شده",
    loading: "نرخ صرافی را می‌بینیم…",
    current: "خودکار",
    stale: "این نرخ کهنه شده است. نرخ تازه را همین‌جا بنویسید.",
    missing: "هنوز نرخ نیست. نرخ خرید و فروش را همین‌جا بنویسید.",
    unavailable: "نرخ پیدا نشد. دوباره کوشش کنید.",
    restricted: "مدیر باید نرخ را ثبت کند. فورم شما در همین صفحه می‌ماند.",
    approval: "این نرخ فقط برای همین معامله به مدیر جهت تأیید فرستاده می‌شود.",
    buy: "نرخ خرید",
    sell: "نرخ فروش",
    effective: "از این وقت",
    expiry: "تا این وقت",
    required: "تغییر نرخ",
    foreign: "اسعار",
    local: "افغانی",
    details: "تغییر",
    reason: "دلیل نرخ دستی",
    reasonPlaceholder: "دلیل کوتاه کاری",
    reverse: "برعکس‌ساختن نرخ",
    updated: "تازه‌شده",
    transactionOnly: "فقط همین معامله",
    publish: "ثبت به‌حیث نرخ صرافی",
  },
  "ps-AF": {
    title: "کارېدلی نرخ",
    loading: "د صرافۍ تایید شوی نرخ کتل کېږي…",
    current: "اتومات",
    stale: "د دې نرخ موده پای ته رسېدلې. له ثبت مخکې یې همدلته تازه کړئ.",
    missing: "تایید شوی نرخ نشته. له ثبت مخکې یې همدلته ولیکئ.",
    unavailable: "نرخ ونه کتل شو. له ثبت مخکې بیا هڅه وکړئ.",
    restricted: "د دې معاملې له ثبت مخکې مدیر باید نرخ خپور کړي. ستاسو مسوده په همدې پاڼه کې پاتې کېږي.",
    approval: "د همدې معاملې نرخ به مدیر ته د تایید لپاره ولېږل شي.",
    buy: "د صرافۍ د پېر نرخ",
    sell: "د صرافۍ د پلور نرخ",
    effective: "د پلي کېدو وخت",
    expiry: "د پای وخت",
    required: "نرخ بدلول",
    foreign: "اسعار",
    local: "افغانۍ",
    details: "بدلول",
    reason: "د لاسي نرخ لامل",
    reasonPlaceholder: "لنډ کاري لامل",
    reverse: "نرخ سرچپه کول",
    updated: "تازه شوی",
    transactionOnly: "یوازې دا معامله",
    publish: "د صرافۍ نرخ په توګه ثبتول",
  },
} as const;

export type InlineRateResolverProps = {
  organizationId: string | null;
  branchId: string | null;
  currency: string;
  language: Language;
  canPublish: boolean;
  canRequestApproval?: boolean;
  rateSide?: "buy" | "sell" | "valuation";
  value?: InlineRatePublication;
  onChange: (value: InlineRatePublication | undefined) => void;
  onReadyChange: (ready: boolean) => void;
};

export function InlineRateResolver({
  organizationId,
  branchId,
  currency,
  language,
  canPublish,
  canRequestApproval = false,
  rateSide = "valuation",
  value,
  onChange,
  onReadyChange,
}: InlineRateResolverProps) {
  const text = copy[language];
  const normalizedCurrency = currency.toUpperCase();
  const key = `${organizationId ?? ""}:${branchId ?? ""}:${normalizedCurrency}:AFN`;
  const [loaded, setLoaded] = useState<LoadedRateContext | null>(null);
  const [reversed, setReversed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [inspectionNow] = useState(() => Date.now());
  const inspectionParams = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const inspectionScenario = inspectionParams?.get("rateScenario") ?? inspectionParams?.get("rate") ?? "current";
  const inspectionBuyRate = normalizedCurrency === "EUR" ? "75.10" : "70.25";
  const inspectionSellRate = normalizedCurrency === "EUR" ? "75.20" : "70.35";
  const inspectionContext: OperationRateContext = {
    from_currency: normalizedCurrency,
    to_currency: "AFN",
    buy_rate: inspectionScenario === "missing" ? undefined : inspectionBuyRate,
    sell_rate: inspectionScenario === "missing" ? undefined : inspectionSellRate,
    effective_from: new Date(inspectionScenario === "stale" ? inspectionNow - 48 * 60 * 60 * 1000 : inspectionNow).toISOString(),
    expires_at: new Date(inspectionScenario === "stale" ? inspectionNow - 24 * 60 * 60 * 1000 : inspectionNow + 24 * 60 * 60 * 1000).toISOString(),
    stale: inspectionScenario === "stale",
    missing: inspectionScenario === "missing",
    source: "inspection",
  };

  useEffect(() => {
    if (normalizedCurrency === "AFN") {
      onReadyChange(true);
      return;
    }
    if (organizationId === "inspection") return;
    if (!organizationId || !branchId) {
      onReadyChange(false);
      return;
    }
    let active = true;
    onReadyChange(false);
    void getTransactionRateContext(organizationId, branchId, normalizedCurrency, "AFN").then((result) => {
      if (!active) return;
      setLoaded({ key, value: result.data, error: result.error });
    });
    return () => { active = false; };
  }, [branchId, key, normalizedCurrency, onReadyChange, organizationId]);

  const context = organizationId === "inspection"
    ? inspectionContext
    : loaded?.key === key ? loaded.value : null;
  const error = loaded?.key === key ? loaded.error : null;
  const loading = normalizedCurrency !== "AFN" && organizationId !== "inspection" && loaded?.key !== key;
  const needsResolution = Boolean(error || !context || context.missing || context.stale);
  const relevantField = rateSide === "sell" ? "sell_rate" : "buy_rate";
  const contextRate = context?.[relevantField];
  const manualRate = value?.[relevantField];
  const displayedRate = needsResolution ? manualRate ?? contextRate : contextRate;
  const quote = useMemo(() => {
    if (!displayedRate) return "—";
    try {
      const rate = new Decimal(displayedRate);
      if (!rate.isPositive()) return "—";
      return reversed
        ? `1 AFN = ${new Decimal(1).div(rate).toSignificantDigits(10).toString()} ${normalizedCurrency}`
        : `1 ${normalizedCurrency} = ${rate.toString()} AFN`;
    } catch {
      return "—";
    }
  }, [displayedRate, normalizedCurrency, reversed]);
  const publicationValid = Boolean(
    value
      && Number(value[relevantField]) > 0
      && (value.reason?.trim().length ?? 0) >= 3
      && value.source_currency === normalizedCurrency
      && value.target_currency === "AFN",
  );
  const canResolve = canPublish || canRequestApproval;

  useEffect(() => {
    if (normalizedCurrency === "AFN") return;
    onReadyChange(!loading && !error && (!needsResolution || (canResolve && publicationValid)));
  }, [canResolve, error, loading, needsResolution, normalizedCurrency, onReadyChange, organizationId, publicationValid]);

  if (normalizedCurrency === "AFN") return null;

  const updateRate = (next: string) => {
    const fallback = next || contextRate || "";
    onChange({
      branch_id: branchId ?? undefined,
      source_currency: normalizedCurrency,
      target_currency: "AFN",
      buy_rate: relevantField === "buy_rate" ? next : value?.buy_rate ?? context?.buy_rate ?? fallback,
      sell_rate: relevantField === "sell_rate" ? next : value?.sell_rate ?? context?.sell_rate ?? fallback,
      reason: value?.reason,
      publication_scope: value?.publication_scope ?? "transaction",
    });
  };

  const updatePublication = (changes: Partial<InlineRatePublication>) => {
    const fallback = manualRate || contextRate || "";
    onChange({
      branch_id: branchId ?? undefined,
      source_currency: normalizedCurrency,
      target_currency: "AFN",
      buy_rate: value?.buy_rate ?? context?.buy_rate ?? fallback,
      sell_rate: value?.sell_rate ?? context?.sell_rate ?? fallback,
      reason: value?.reason,
      publication_scope: value?.publication_scope ?? "transaction",
      ...changes,
    });
  };

  return (
    <section className={`inline-rate-resolver compact-rate ${needsResolution ? "needs-attention" : ""}`} aria-label={text.title}>
      <div className="compact-rate-row" dir="ltr">
        <span className={`compact-rate-mode ${needsResolution ? "manual" : ""}`}><i aria-hidden="true" />{needsResolution ? text.required : text.current}</span>
        <strong className="compact-rate-quote">{loading ? text.loading : quote}</strong>
        <button className="compact-rate-swap" type="button" onClick={() => setReversed((current) => !current)} aria-label={text.reverse}>⇄</button>
        <span className="compact-rate-time" dir={language === "en" ? "ltr" : "rtl"}>{context?.effective_from ? `${text.updated} ${new Date(context.effective_from).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })}` : context?.source ?? ""}</span>
        <button className="compact-rate-change" type="button" onClick={() => setEditing((current) => !current)} aria-expanded={editing}>{text.details}</button>
      </div>
      {loading ? <p role="status">{text.loading}</p> : null}
      {!loading && error ? <p role="alert">{text.unavailable}</p> : null}
      {!loading && needsResolution ? <p role="alert">{context?.stale ? text.stale : context?.missing ? text.missing : text.unavailable}</p> : null}
      {!loading && needsResolution && !canResolve ? <p className="calm-empty">{text.restricted}</p> : null}
      {!loading && editing && !needsResolution && context ? <div className="compact-rate-details"><span><small>{text.effective}</small><b>{context.effective_from ? new Date(context.effective_from).toLocaleString(language) : "—"}</b></span><span><small>{text.expiry}</small><b>{context.expires_at ? new Date(context.expires_at).toLocaleString(language) : "—"}</b></span></div> : null}
      {!loading && needsResolution && canResolve ? (
        <fieldset>
          <legend>{text.required}</legend>
          <div className="compact-rate-editor">
            <label>{rateSide === "sell" ? text.sell : text.buy}<input required min="0.000001" step="any" inputMode="decimal" value={manualRate ?? ""} onChange={(event) => updateRate(event.target.value)} placeholder={contextRate ?? "0.00"} /></label>
            <label>{text.reason}<input required minLength={3} maxLength={240} value={value?.reason ?? ""} onChange={(event) => updatePublication({ reason: event.target.value })} placeholder={text.reasonPlaceholder} /></label>
            <div className="compact-rate-scope" role="group" aria-label={text.required}><button type="button" className={(value?.publication_scope ?? "transaction") === "transaction" ? "active" : ""} onClick={() => updatePublication({ publication_scope: "transaction" })}>{text.transactionOnly}</button>{canPublish ? <button type="button" className={value?.publication_scope === "rate_board" ? "active" : ""} onClick={() => updatePublication({ publication_scope: "rate_board" })}>{text.publish}</button> : null}</div>
            {!canPublish && canRequestApproval ? <p className="compact-rate-approval">{text.approval}</p> : null}
          </div>
        </fieldset>
      ) : null}
    </section>
  );
}
