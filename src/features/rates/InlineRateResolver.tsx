import { useEffect, useState } from "react";
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
    title: "Accounting rate",
    loading: "Checking the approved shop rate…",
    current: "Current approved rate",
    stale: "This rate has expired. Refresh it here before saving.",
    missing: "No approved rate exists. Add it here before saving.",
    unavailable: "The rate could not be checked. Try again before saving.",
    restricted: "A manager must publish the rate before this transaction can be saved. Your draft stays on this page.",
    buy: "Shop buy rate",
    sell: "Shop sell rate",
    effective: "Effective",
    expiry: "Expires",
    required: "Resolve the rate to continue",
  },
  "fa-AF": {
    title: "نرخ حسابداری",
    loading: "بررسی نرخ تأییدشده صرافی…",
    current: "نرخ تأییدشده فعلی",
    stale: "اعتبار این نرخ تمام شده است. پیش از ثبت، همین‌جا آن را تازه کنید.",
    missing: "نرخ تأییدشده موجود نیست. پیش از ثبت، همین‌جا آن را وارد کنید.",
    unavailable: "نرخ بررسی نشد. پیش از ثبت دوباره کوشش کنید.",
    restricted: "پیش از ثبت این معامله، مدیر باید نرخ را نشر کند. پیش‌نویس شما در همین صفحه می‌ماند.",
    buy: "نرخ خرید صرافی",
    sell: "نرخ فروش صرافی",
    effective: "زمان اجرا",
    expiry: "پایان اعتبار",
    required: "برای ادامه نرخ را حل کنید",
  },
  "ps-AF": {
    title: "حسابي نرخ",
    loading: "د صرافۍ تایید شوی نرخ کتل کېږي…",
    current: "اوسنی تایید شوی نرخ",
    stale: "د دې نرخ موده پای ته رسېدلې. له ثبت مخکې یې همدلته تازه کړئ.",
    missing: "تایید شوی نرخ نشته. له ثبت مخکې یې همدلته ولیکئ.",
    unavailable: "نرخ ونه کتل شو. له ثبت مخکې بیا هڅه وکړئ.",
    restricted: "د دې معاملې له ثبت مخکې مدیر باید نرخ خپور کړي. ستاسو مسوده په همدې پاڼه کې پاتې کېږي.",
    buy: "د صرافۍ د پېر نرخ",
    sell: "د صرافۍ د پلور نرخ",
    effective: "د پلي کېدو وخت",
    expiry: "د پای وخت",
    required: "د دوام لپاره نرخ حل کړئ",
  },
} as const;

export function InlineRateResolver({
  organizationId,
  branchId,
  currency,
  language,
  canPublish,
  value,
  onChange,
  onReadyChange,
}: {
  organizationId: string | null;
  branchId: string | null;
  currency: string;
  language: Language;
  canPublish: boolean;
  value?: InlineRatePublication;
  onChange: (value: InlineRatePublication | undefined) => void;
  onReadyChange: (ready: boolean) => void;
}) {
  const text = copy[language];
  const normalizedCurrency = currency.toUpperCase();
  const key = `${organizationId ?? ""}:${branchId ?? ""}:${normalizedCurrency}:AFN`;
  const [loaded, setLoaded] = useState<LoadedRateContext | null>(null);
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
  const publicationValid = Boolean(
    value
      && Number(value.buy_rate) > 0
      && Number(value.sell_rate) > 0
      && value.source_currency === normalizedCurrency
      && value.target_currency === "AFN",
  );

  useEffect(() => {
    if (normalizedCurrency === "AFN") return;
    onReadyChange(!loading && !error && (!needsResolution || (canPublish && publicationValid)));
  }, [canPublish, error, loading, needsResolution, normalizedCurrency, onReadyChange, organizationId, publicationValid]);

  if (normalizedCurrency === "AFN") return null;

  const updateRate = (field: "buy_rate" | "sell_rate", next: string) => {
    onChange({
      branch_id: branchId ?? undefined,
      source_currency: normalizedCurrency,
      target_currency: "AFN",
      buy_rate: field === "buy_rate" ? next : value?.buy_rate ?? context?.buy_rate ?? "",
      sell_rate: field === "sell_rate" ? next : value?.sell_rate ?? context?.sell_rate ?? "",
    });
  };

  return (
    <section className={`rate-governance inline-rate-resolver ${needsResolution ? "needs-attention" : ""}`} aria-label={text.title}>
      <div className="applied-rate-row">
        <span><strong>{text.title}</strong><small dir="ltr">{normalizedCurrency} → AFN</small></span>
        {!loading && !needsResolution ? <b className="positive">✓ {text.current}</b> : null}
      </div>
      {loading ? <p role="status">{text.loading}</p> : null}
      {!loading && error ? <p role="alert">{text.unavailable}</p> : null}
      {!loading && !error && context ? (
        <div className="inline-rate-context">
          <span><small>{text.buy}</small><b dir="ltr">{context.buy_rate ?? "—"}</b></span>
          <span><small>{text.sell}</small><b dir="ltr">{context.sell_rate ?? "—"}</b></span>
          {context.effective_from ? <span><small>{text.effective}</small><b>{new Date(context.effective_from).toLocaleString(language)}</b></span> : null}
          {context.expires_at ? <span><small>{text.expiry}</small><b>{new Date(context.expires_at).toLocaleString(language)}</b></span> : null}
        </div>
      ) : null}
      {!loading && needsResolution ? <p role="alert">{context?.stale ? text.stale : context?.missing ? text.missing : text.unavailable}</p> : null}
      {!loading && needsResolution && !canPublish ? <p className="calm-empty">{text.restricted}</p> : null}
      {!loading && needsResolution && canPublish ? (
        <fieldset>
          <legend>{text.required}</legend>
          <div className="form-grid">
            <label>{text.buy}<input required min="0.000001" step="any" inputMode="decimal" value={value?.buy_rate ?? ""} onChange={(event) => updateRate("buy_rate", event.target.value)} placeholder={context?.buy_rate ?? "0.00"} /></label>
            <label>{text.sell}<input required min="0.000001" step="any" inputMode="decimal" value={value?.sell_rate ?? ""} onChange={(event) => updateRate("sell_rate", event.target.value)} placeholder={context?.sell_rate ?? "0.00"} /></label>
          </div>
        </fieldset>
      ) : null}
    </section>
  );
}
