import { useEffect, useState } from "react";
import type { InlineRatePublication } from "../../domain/commands";
import { getTransactionRateContext, type OperationRateContext } from "../../lib/financialApi";
import type { Language } from "../../lib/i18n";
import { TransactionRateControl } from "./TransactionRateControl";

type LoadedRateContext = {
  key: string;
  value: OperationRateContext | null;
  error: string | null;
};

const copy = {
  en: {
    loading: "Checking the approved daily rate…",
    restricted: "A manager must approve this rate. Your complete draft stays on this page.",
    approval: "This rate will be sent to a manager for approval. Your complete draft will stay here.",
  },
  "fa-AF": {
    loading: "نرخ روزانه تأییدشده بررسی می‌شود…",
    restricted: "مدیر باید این نرخ را تأیید کند. تمام معلومات فورم در همین صفحه می‌ماند.",
    approval: "این نرخ برای تأیید به مدیر فرستاده می‌شود. تمام معلومات فورم محفوظ می‌ماند.",
  },
  "ps-AF": {
    loading: "تایید شوی ورځنی نرخ کتل کېږي…",
    restricted: "مدیر باید دا نرخ تایید کړي. ستاسو ټوله مسوده په همدې پاڼه کې پاتې کېږي.",
    approval: "دا نرخ به مدیر ته د تایید لپاره ولېږل شي. ستاسو ټوله مسوده به همدلته پاتې وي.",
  },
} as const;

const transactionManualRateReason = "Manual transaction rate";

export type InlineRateResolverProps = {
  organizationId: string | null;
  branchId: string | null;
  currency: string;
  language: Language;
  canPublish: boolean;
  canRequestApproval?: boolean;
  simplifiedTransaction?: boolean;
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
  const key = `${organizationId ?? ""}:${branchId ?? ""}:${normalizedCurrency}:AFN:${rateSide}`;
  const [loaded, setLoaded] = useState<LoadedRateContext | null>(null);
  const [rateUi, setRateUi] = useState({ key, reversed: true, automatic: true });
  const reversed = rateUi.key === key ? rateUi.reversed : true;
  const automatic = rateUi.key === key ? rateUi.automatic : true;
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
  const unavailable = Boolean(error || !context || context.missing || context.stale);
  const relevantField = rateSide === "sell" ? "sell_rate" : "buy_rate";
  const contextRate = context?.[relevantField];
  const fallbackRate = value?.[relevantField];
  const canonicalRate = automatic && !unavailable ? contextRate : fallbackRate ?? contextRate;
  const canResolve = canPublish || canRequestApproval;
  const publicationValid = Boolean(
    value
      && Number(value[relevantField]) > 0
      && value.source_currency === normalizedCurrency
      && value.target_currency === "AFN",
  );

  useEffect(() => {
    if (normalizedCurrency === "AFN") return;
    onReadyChange(!loading && (!unavailable || (canResolve && publicationValid)));
  }, [canResolve, loading, normalizedCurrency, onReadyChange, publicationValid, unavailable]);

  if (normalizedCurrency === "AFN") return null;

  const updateRate = (next: string) => {
    const fallback = next || contextRate || "";
    onChange({
      branch_id: branchId ?? undefined,
      source_currency: normalizedCurrency,
      target_currency: "AFN",
      buy_rate: relevantField === "buy_rate" ? next : value?.buy_rate ?? context?.buy_rate ?? fallback,
      sell_rate: relevantField === "sell_rate" ? next : value?.sell_rate ?? context?.sell_rate ?? fallback,
      reason: transactionManualRateReason,
      publication_scope: "transaction",
    });
  };
  const changeAutomatic = (nextAutomatic: boolean) => {
    if (unavailable && nextAutomatic) return;
    setRateUi((current) => ({ key, automatic: nextAutomatic, reversed: current.key === key ? current.reversed : true }));
    if (nextAutomatic) onChange(undefined);
    else updateRate(contextRate ?? "");
  };

  if (loading) return <div className="transaction-rate-loading" role="status">{text.loading}</div>;

  return (
    <TransactionRateControl
      language={language}
      automatic={automatic}
      unavailable={unavailable}
      canEdit={canResolve}
      canonicalRate={canonicalRate}
      sourceCurrency={normalizedCurrency}
      targetCurrency="AFN"
      reversed={reversed}
      updatedAt={context?.effective_from}
      approvalMessage={unavailable ? (canRequestApproval && !canPublish ? text.approval : !canResolve ? text.restricted : undefined) : undefined}
      onAutomaticChange={changeAutomatic}
      onCanonicalRateChange={updateRate}
      onReverse={() => setRateUi((current) => ({ key, automatic: current.key === key ? current.automatic : true, reversed: !(current.key === key ? current.reversed : true) }))}
    />
  );
}
