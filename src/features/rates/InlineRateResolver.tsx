import { useEffect, useState } from "react";
import type { InlineRatePublication } from "../../domain/commands";
import { getOperationRateRequest, getTransactionRateContext, requestOperationRateApproval, type OperationRateContext } from "../../lib/financialApi";
import { midpointRate, positiveRate, rateOutsideTolerance } from "../../domain/rateMath";
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
    approval: "Ask a manager to update the daily rate. Your draft stays here.",
    approvalSent: "Waiting for the daily rate. This form updates automatically.",
    approvalClosed: "This rate request was closed. You can request a new daily rate.",
    exceptionReason: "Reason for this exceptional rate",
  },
  "fa-AF": {
    loading: "نرخ روزانه تأییدشده بررسی می‌شود…",
    restricted: "مدیر باید این نرخ را تأیید کند. تمام معلومات فورم در همین صفحه می‌ماند.",
    approval: "از مدیر بخواهید نرخ روزانه را تازه کند. معلومات فورم شما محفوظ می‌ماند.",
    approvalSent: "منتظر نرخ روزانه هستیم. نرخ در همین فورم خودکار تازه می‌شود.",
    approvalClosed: "درخواست نرخ بسته شد. می‌توانید دوباره درخواست کنید.",
    exceptionReason: "دلیل این نرخ استثنایی",
  },
  "ps-AF": {
    loading: "تایید شوی ورځنی نرخ کتل کېږي…",
    restricted: "مدیر باید دا نرخ تایید کړي. ستاسو ټوله مسوده په همدې پاڼه کې پاتې کېږي.",
    approval: "له مدیر څخه د ورځني نرخ د تازه کولو غوښتنه وکړئ. ستاسو معلومات دلته ساتل کېږي.",
    approvalSent: "د ورځني نرخ په تمه یو. نرخ په همدې فورمه کې پخپله تازه کېږي.",
    approvalClosed: "د نرخ غوښتنه وتړل شوه. بیا غوښتنه کولی شئ.",
    exceptionReason: "د دې استثنايي نرخ دلیل",
  },
} as const;

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
  const [approvalRequest, setApprovalRequest] = useState<{ key: string; id?: string; message: string; pending: boolean } | null>(null);
  const currentRequest = approvalRequest?.key === key ? approvalRequest : null;
  const reversed = rateUi.key === key ? rateUi.reversed : true;
  const requestedAutomatic = rateUi.key === key ? rateUi.automatic : true;
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
    applied_rate: inspectionScenario === "missing" ? undefined : midpointRate(inspectionBuyRate, inspectionSellRate),
    quote_direction: "AFN_FIRST",
    operation_rate_source: "APPROVED_DAILY",
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

  useEffect(() => {
    if (!currentRequest?.id || !currentRequest.pending || !organizationId || !branchId || organizationId === "inspection") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const [rate, request] = await Promise.all([
        getTransactionRateContext(organizationId, branchId, normalizedCurrency, "AFN"),
        getOperationRateRequest(currentRequest.id!),
      ]);
      if (!active) return;
      if (rate.data && !rate.error && !rate.data.missing && !rate.data.stale) {
        setLoaded({ key, value: rate.data, error: null });
        setRateUi((current) => ({ ...current, key, automatic: true }));
        setApprovalRequest(null);
        return;
      }
      if (request.data && (request.data.status === "rejected" || Date.parse(request.data.expires_at) <= Date.now())) {
        setApprovalRequest({ key, message: text.approvalClosed, pending: false });
        return;
      }
      timer = setTimeout(() => void refresh(), 5000);
    };
    timer = setTimeout(() => void refresh(), 1500);
    return () => { active = false; clearTimeout(timer); };
  }, [branchId, currentRequest?.id, currentRequest?.pending, key, normalizedCurrency, organizationId, text.approvalClosed]);

  const context = organizationId === "inspection"
    ? inspectionContext
    : loaded?.key === key ? loaded.value : null;
  const error = loaded?.key === key ? loaded.error : null;
  const loading = normalizedCurrency !== "AFN" && organizationId !== "inspection" && loaded?.key !== key;
  const unavailable = Boolean(error || !context || context.missing || context.stale);
  const automatic = unavailable ? false : requestedAutomatic;
  const relevantField = rateSide === "sell" ? "sell_rate" : rateSide === "buy" ? "buy_rate" : "applied_rate";
  const contextRate = context?.[relevantField] ?? (context?.buy_rate && context?.sell_rate
    ? midpointRate(context.buy_rate, context.sell_rate)
    : context?.buy_rate);
  const fallbackRate = value?.rate ?? value?.[rateSide === "sell" ? "sell_rate" : "buy_rate"];
  const canonicalRate = automatic && !unavailable ? contextRate : fallbackRate ?? contextRate;
  const canResolve = canPublish;
  const enteredRate = value?.rate ?? value?.[rateSide === "sell" ? "sell_rate" : "buy_rate"];
  const outsideTolerance = value?.rate_mode === "manual"
    && rateOutsideTolerance(enteredRate, contextRate, context?.tolerance_bps ?? 50);
  const publicationValid = Boolean(
    value
      && positiveRate(enteredRate)
      && value.source_currency === normalizedCurrency
      && value.target_currency === "AFN"
      && (!outsideTolerance || Boolean(value.reason?.trim())),
  );

  useEffect(() => {
    if (normalizedCurrency === "AFN" || !automatic || loading || unavailable || !contextRate || !context) return;
    const quoteDirection = reversed ? "AFN_FIRST" : "FOREIGN_FIRST";
    if (
      value?.rate_mode === "automatic"
      && value.context_id === context.context_id
      && value.rate === contextRate
      && value.quote_direction === quoteDirection
      && value.rate_side === rateSide
    ) return;
    onChange({
      branch_id: branchId ?? undefined,
      source_currency: normalizedCurrency,
      target_currency: "AFN",
      buy_rate: context.buy_rate ?? contextRate,
      sell_rate: context.sell_rate ?? contextRate,
      rate: contextRate,
      quote_direction: quoteDirection,
      source: "APPROVED_DAILY",
      effective_at: context.effective_from,
      expires_at: context.expires_at,
      approval_required: false,
      context_id: context.context_id,
      rate_mode: "automatic",
      rate_side: rateSide,
      publication_scope: "transaction",
    });
  }, [automatic, branchId, context, contextRate, loading, normalizedCurrency, onChange, rateSide, reversed, unavailable, value?.context_id, value?.quote_direction, value?.rate, value?.rate_mode, value?.rate_side]);

  useEffect(() => {
    if (normalizedCurrency === "AFN") return;
    onReadyChange(!loading && (automatic ? !unavailable && positiveRate(contextRate) : canResolve && publicationValid));
  }, [automatic, canResolve, contextRate, loading, normalizedCurrency, onReadyChange, publicationValid, unavailable]);

  if (normalizedCurrency === "AFN") return null;

  const updateRate = (next: string) => {
    const fallback = next || contextRate || "";
    const nextOutsideTolerance = rateOutsideTolerance(next, contextRate, context?.tolerance_bps ?? 50);
    onChange({
      branch_id: branchId ?? undefined,
      source_currency: normalizedCurrency,
      target_currency: "AFN",
      buy_rate: next || fallback,
      sell_rate: next || fallback,
      rate: next,
      quote_direction: reversed ? "AFN_FIRST" : "FOREIGN_FIRST",
      source: "TRANSACTION_MANUAL",
      effective_at: new Date().toISOString(),
      expires_at: null,
      approval_required: nextOutsideTolerance,
      context_id: context?.context_id,
      rate_mode: "manual",
      rate_side: rateSide,
      publication_scope: "transaction",
      reason: nextOutsideTolerance ? value?.reason : undefined,
    });
  };
  const changeAutomatic = (nextAutomatic: boolean) => {
    if (unavailable && nextAutomatic) return;
    setRateUi((current) => ({ key, automatic: nextAutomatic, reversed: current.key === key ? current.reversed : true }));
    if (nextAutomatic) onChange(undefined);
    else updateRate(contextRate ?? "");
  };
  const requestApproval = async () => {
    if (!canRequestApproval || !organizationId || !branchId || currentRequest?.pending) return;
    setApprovalRequest({ key, message: text.approvalSent, pending: true });
    if (organizationId === "inspection") {
      return;
    }
    const result = await requestOperationRateApproval({
      organization_id: organizationId,
      branch_id: branchId,
      source_currency: normalizedCurrency,
      target_currency: "AFN",
      context_id: context?.context_id,
      reason: context?.missing ? "approved daily rate missing" : "approved daily rate stale",
    });
    setApprovalRequest({ key, id: result.data?.id, message: result.error ?? text.approvalSent, pending: !result.error && Boolean(result.data?.id) });
  };

  if (loading) return <div className="transaction-rate-loading" role="status">{text.loading}</div>;

  return (
    <>
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
        approvalMessage={currentRequest?.message ?? (unavailable ? (canRequestApproval && !canPublish ? text.approval : !canResolve ? text.restricted : undefined) : undefined)}
        onAutomaticChange={changeAutomatic}
        onCanonicalRateChange={updateRate}
        onReverse={() => setRateUi((current) => ({ key, automatic: current.key === key ? current.automatic : true, reversed: !(current.key === key ? current.reversed : true) }))}
        onRequestApproval={unavailable && canRequestApproval && !canPublish && !currentRequest?.pending ? () => void requestApproval() : undefined}
      />
      {outsideTolerance && canResolve ? (
        <label className="rate-exception-reason">
          {text.exceptionReason}
          <input
            required
            maxLength={500}
            value={value?.reason ?? ""}
            onChange={(event) => value && onChange({ ...value, reason: event.target.value })}
          />
        </label>
      ) : null}
    </>
  );
}
