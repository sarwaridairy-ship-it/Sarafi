import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Language } from "./lib/i18n";
import {
  getComplianceWorkspace,
  getWorkspaceSettings,
  type ComplianceWorkspaceRecord,
  type WorkspaceSettingsRecord,
} from "./lib/financialApi";

export type AppIconName =
  | "home"
  | "trade"
  | "wallet"
  | "people"
  | "transactions"
  | "more"
  | "eye"
  | "eyeOff"
  | "shield"
  | "settings"
  | "check"
  | "print"
  | "close";

const iconPaths: Record<AppIconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,
  trade: <><path d="M4 7h14"/><path d="m14 3 4 4-4 4"/><path d="M20 17H6"/><path d="m10 13-4 4 4 4"/></>,
  wallet: <><path d="M4 6.5h14a2 2 0 0 1 2 2V19H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12"/><path d="M15 11h5v5h-5a2.5 2.5 0 0 1 0-5Z"/></>,
  people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  transactions: <><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><circle cx="3.5" cy="6" r=".8"/><circle cx="3.5" cy="12" r=".8"/><circle cx="3.5" cy="18" r=".8"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  eyeOff: <><path d="m3 3 18 18"/><path d="M10.6 6.2A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-2 2.7"/><path d="M6.6 6.6C3.6 8.3 2 12 2 12s3.5 6 10 6a10 10 0 0 0 4.1-.8"/></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  print: <><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></>,
  close: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
};

export function AppIcon({ name, size = 20 }: { name: AppIconName; size?: number }) {
  return (
    <svg aria-hidden="true" className="app-icon" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">{iconPaths[name]}</g>
    </svg>
  );
}

const professionalCopy = {
  en: {
    settingsTitle: "Shop settings",
    settingsIntro: "Your operating context, money rules, and enabled services in one place.",
    organization: "Organization",
    branch: "Active branch",
    operatingContext: "Operating context",
    baseCurrency: "Base currency",
    timezone: "Business timezone",
    language: "Display language",
    receiptPrefix: "Receipt prefix",
    cashRule: "Cash control",
    noNegativeCash: "Negative cash is blocked",
    negativeCashAllowed: "Negative cash is allowed",
    enabledServices: "Enabled services",
    noExtraServices: "No optional services are enabled.",
    enabled: "Enabled",
    accessSecurity: "Access & security",
    currentRole: "Your current role",
    signedInPosting: "Financial posting requires a signed-in, authorized team member.",
    ledgerProtection: "Every posted action is tied to the organization ledger and audit history.",
    loading: "Loading verified settings…",
    unavailable: "Settings could not be loaded. No values were guessed.",
    preview: "Preview mode",
    previewNote: "Sign in to see the verified settings for your own shop.",
    complianceTitle: "Compliance control",
    complianceIntro: "Review the shop’s rule version, legal status, screening boundary, alerts, and cases.",
    legalReview: "Legal review",
    awaitingLegal: "Awaiting qualified Afghan legal/compliance sign-off",
    reviewed: "Reviewed",
    rules: "Current rule set",
    ruleVersion: "Version",
    effectiveFrom: "Effective from",
    sourceReference: "Source reference",
    noRuleSet: "No compliance rule set has been activated.",
    screening: "Name screening",
    providerConnected: "Approved provider connected",
    noProvider: "No approved screening provider is configured",
    failClosed: "Screening-dependent actions remain blocked until an approved provider is configured.",
    alertQueue: "Alert queue",
    caseQueue: "Case & report queue",
    open: "Open",
    reviewing: "In review",
    closed: "Closed",
    draft: "Draft",
    ready: "Ready",
    submitted: "Submitted",
    complianceUnavailable: "Compliance data is unavailable for this role. Nothing is shown as approved without evidence.",
    compliancePreview: "Sign in with an owner or compliance role to view the live control plane.",
    externalDecision: "Legal thresholds and reporting rules are versioned records—not hard-coded claims.",
    backHome: "Back to Home",
    transactionSaved: "Transaction recorded",
    recordedOnce: "The ledger accepted this transaction once and created its receipt.",
    receipt: "Receipt",
    transactionReference: "Ledger reference",
    shopGives: "Shop gives",
    shopReceives: "Shop receives",
    customerRate: "Customer rate",
    print58: "Print 58 mm",
    print80: "Print 80 mm",
    done: "Done",
    receiptPending: "Receipt number is being prepared",
  },
  "fa-AF": {
    settingsTitle: "تنظیمات صرافی",
    settingsIntro: "مشخصات کاری، اصول پول و خدمات فعال صرافی را در یک‌جا ببینید.",
    organization: "صرافی",
    branch: "شعبه فعال",
    operatingContext: "مشخصات کاری",
    baseCurrency: "اسعار اصلی",
    timezone: "زمان رسمی کار",
    language: "زبان نمایش",
    receiptPrefix: "پیشوند رسید",
    cashRule: "کنترول صندوق",
    noNegativeCash: "ثبت صندوق منفی بسته است",
    negativeCashAllowed: "ثبت صندوق منفی اجازه دارد",
    enabledServices: "خدمات فعال",
    noExtraServices: "خدمت اختیاری فعال نشده است.",
    enabled: "فعال",
    accessSecurity: "دسترسی و امنیت",
    currentRole: "صلاحیت فعلی شما",
    signedInPosting: "ثبت مالی تنها برای کارمند واردشده و باصلاحیت ممکن است.",
    ledgerProtection: "هر عملیات ثبت‌شده به دفتر کل صرافی و تاریخچه بررسی وصل است.",
    loading: "تنظیمات تأییدشده بارگذاری می‌شود…",
    unavailable: "تنظیمات بارگذاری نشد. هیچ مقدار حدسی نشان داده نشده است.",
    preview: "نمایش آزمایشی",
    previewNote: "برای دیدن تنظیمات واقعی صرافی خود وارد شوید.",
    complianceTitle: "کنترول رعایت اصول",
    complianceIntro: "نسخه اصول، وضعیت حقوقی، بررسی نام‌ها، هشدارها و دوسیه‌ها را ببینید.",
    legalReview: "بررسی حقوقی",
    awaitingLegal: "در انتظار تأیید متخصص حقوقی و رعایت اصول افغانستان",
    reviewed: "بررسی‌شده",
    rules: "مجموعه اصول فعلی",
    ruleVersion: "نسخه",
    effectiveFrom: "قابل اجرا از",
    sourceReference: "مرجع منبع",
    noRuleSet: "هیچ مجموعه اصولی فعال نشده است.",
    screening: "بررسی نام",
    providerConnected: "خدمت تأییدشده وصل است",
    noProvider: "خدمت تأییدشده بررسی نام تنظیم نشده است",
    failClosed: "عملیات وابسته به بررسی نام تا وصل‌شدن خدمت تأییدشده بسته می‌ماند.",
    alertQueue: "صف هشدارها",
    caseQueue: "صف دوسیه و گزارش",
    open: "باز",
    reviewing: "زیر بررسی",
    closed: "بسته",
    draft: "پیش‌نویس",
    ready: "آماده",
    submitted: "فرستاده‌شده",
    complianceUnavailable: "معلومات رعایت اصول برای این صلاحیت در دسترس نیست. بدون سند چیزی تأییدشده نشان داده نمی‌شود.",
    compliancePreview: "با صلاحیت مالک یا مسئول رعایت اصول وارد شوید تا معلومات زنده را ببینید.",
    externalDecision: "حدود حقوقی و اصول گزارش‌دهی نسخه‌بندی می‌شوند و ادعای ثابت برنامه نیستند.",
    backHome: "بازگشت به خانه",
    transactionSaved: "معامله ثبت شد",
    recordedOnce: "دفتر کل این معامله را یک‌بار پذیرفت و رسید آن را ساخت.",
    receipt: "رسید",
    transactionReference: "شماره دفتر کل",
    shopGives: "صرافی می‌پردازد",
    shopReceives: "صرافی دریافت می‌کند",
    customerRate: "نرخ مشتری",
    print58: "چاپ ۵۸ میلی‌متر",
    print80: "چاپ ۸۰ میلی‌متر",
    done: "تمام",
    receiptPending: "شماره رسید در حال آماده‌شدن است",
  },
  "ps-AF": {
    settingsTitle: "د صرافۍ امستنې",
    settingsIntro: "د صرافۍ کاري معلومات، د پیسو اصول او فعال خدمتونه په یوه ځای کې وګورئ.",
    organization: "صرافي",
    branch: "فعاله څانګه",
    operatingContext: "کاري معلومات",
    baseCurrency: "اصلي اسعار",
    timezone: "د کار وخت",
    language: "د ښودلو ژبه",
    receiptPrefix: "د رسید سرلیک",
    cashRule: "د صندوق کنټرول",
    noNegativeCash: "منفي صندوق بند دی",
    negativeCashAllowed: "منفي صندوق اجازه لري",
    enabledServices: "فعال خدمتونه",
    noExtraServices: "کوم اختیاري خدمت فعال نه دی.",
    enabled: "فعال",
    accessSecurity: "لاسرسی او امنیت",
    currentRole: "ستاسو اوسنۍ دنده",
    signedInPosting: "مالي ثبت یوازې واک لرونکی او ننوتلی کارکوونکی کولای شي.",
    ledgerProtection: "هر ثبت شوی کار د صرافۍ له دفتر او د پلټنې له تاریخ سره تړلی دی.",
    loading: "تأیید شوې امستنې لوډېږي…",
    unavailable: "امستنې لوډ نه شوې. هېڅ اټکلي ارزښت نه دی ښودل شوی.",
    preview: "ازمایښتي لید",
    previewNote: "د خپلې صرافۍ د کره امستنو لپاره ننوځئ.",
    complianceTitle: "د اصولو څارنه",
    complianceIntro: "د اصولو نسخه، حقوقي حالت، د نومونو کتنه، خبرتیاوې او دوسیې وګورئ.",
    legalReview: "حقوقي کتنه",
    awaitingLegal: "د افغانستان د مسلکي حقوقي او اصولي سلاکار تأیید ته منتظر",
    reviewed: "کتل شوی",
    rules: "اوسنی اصولي ټولګی",
    ruleVersion: "نسخه",
    effectiveFrom: "د پلي کېدو نېټه",
    sourceReference: "د سرچینې حواله",
    noRuleSet: "تر اوسه کوم اصولي ټولګی فعال شوی نه دی.",
    screening: "د نوم کتنه",
    providerConnected: "تأیید شوی خدمت وصل دی",
    noProvider: "د نوم کتنې تأیید شوی خدمت نه دی ټاکل شوی",
    failClosed: "د نوم کتنې پورې تړلي کارونه تر تأیید شوي خدمت پورې بند پاتې کېږي.",
    alertQueue: "د خبرتیاوو کتار",
    caseQueue: "د دوسیو او راپورونو کتار",
    open: "پرانیستی",
    reviewing: "تر کتنې لاندې",
    closed: "تړلی",
    draft: "مسوده",
    ready: "چمتو",
    submitted: "سپارل شوی",
    complianceUnavailable: "د دې واک لپاره اصولي معلومات نشته. بې له سنده هېڅ شی تأیید شوی نه ښودل کېږي.",
    compliancePreview: "د ژوندۍ څارنې لپاره د مالک یا اصولي مسئول په واک ننوځئ.",
    externalDecision: "حقوقي حدونه او د راپور اصول نسخه‌لرونکي ریکارډونه دي؛ د پروګرام ثابتې ادعاوې نه دي.",
    backHome: "کور ته ستنېدل",
    transactionSaved: "معامله ثبت شوه",
    recordedOnce: "دفتر دا معامله یو ځل ومنله او رسید یې جوړ کړ.",
    receipt: "رسید",
    transactionReference: "د دفتر شمېره",
    shopGives: "صرافي ورکوي",
    shopReceives: "صرافي اخلي",
    customerRate: "د پېرودونکي نرخ",
    print58: "۵۸ ملي‌متر چاپ",
    print80: "۸۰ ملي‌متر چاپ",
    done: "بشپړ",
    receiptPending: "د رسید شمېره چمتو کېږي",
  },
} as const;

type ProfessionalCopyKey = keyof typeof professionalCopy.en;
const p = (language: Language, key: ProfessionalCopyKey) => professionalCopy[language][key];

function WorkspaceHeader({ icon, kicker, title, intro, backLabel, onBack }: { icon: AppIconName; kicker: string; title: string; intro: string; backLabel: string; onBack: () => void }) {
  return (
    <div className="workspace-heading">
      <div className="workspace-heading-copy">
        <span className="workspace-heading-icon"><AppIcon name={icon} size={22} /></span>
        <div><p className="kicker">{kicker}</p><h1>{title}</h1><p>{intro}</p></div>
      </div>
      <button className="text-button" onClick={onBack}>{backLabel} <span aria-hidden="true">→</span></button>
    </div>
  );
}

function DetailRow({ label, value, status }: { label: string; value: ReactNode; status?: "good" | "warning" | "neutral" }) {
  return <div className="detail-row"><span>{label}</span><strong className={status ? `detail-status ${status}` : undefined}>{value}</strong></div>;
}

export function SettingsView({ language, organizationId, organizationName, branchName, roleLabel, onDashboard }: { language: Language; organizationId: string | null; organizationName: string; branchName: string; roleLabel: string; onDashboard: () => void }) {
  const [settings, setSettings] = useState<WorkspaceSettingsRecord | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "preview">(organizationId === "inspection" ? "preview" : "loading");
  useEffect(() => {
    if (!organizationId || organizationId === "inspection") return;
    let active = true;
    void getWorkspaceSettings(organizationId).then((result) => {
      if (!active) return;
      setSettings(result.data);
      setState(result.error || !result.data ? "error" : "ready");
    });
    return () => { active = false; };
  }, [organizationId]);
  const languageLabel = language === "en" ? "English" : language === "fa-AF" ? "دری" : "پښتو";
  const cashRule = settings ? (settings.negative_cash_allowed ? p(language, "negativeCashAllowed") : p(language, "noNegativeCash")) : "—";
  return (
    <section className="professional-workspace">
      <WorkspaceHeader icon="settings" kicker={p(language, "operatingContext")} title={p(language, "settingsTitle")} intro={p(language, "settingsIntro")} backLabel={p(language, "backHome")} onBack={onDashboard} />
      {state === "loading" ? <div className="professional-state" role="status">{p(language, "loading")}</div> : null}
      {state === "error" ? <div className="professional-state error" role="alert">{p(language, "unavailable")}</div> : null}
      {state === "preview" ? <div className="professional-state"><b>{p(language, "preview")}</b><span>{p(language, "previewNote")}</span></div> : null}
      <div className="settings-grid">
        <article className="settings-card">
          <div className="settings-card-title"><AppIcon name="home" /><div><h2>{p(language, "operatingContext")}</h2><p>{organizationName}</p></div></div>
          <div className="detail-list">
            <DetailRow label={p(language, "organization")} value={organizationName || "—"} />
            <DetailRow label={p(language, "branch")} value={branchName || "—"} />
            <DetailRow label={p(language, "baseCurrency")} value={settings?.base_currency_code ?? "—"} />
            <DetailRow label={p(language, "timezone")} value={settings?.timezone ?? "—"} />
            <DetailRow label={p(language, "language")} value={languageLabel} />
            <DetailRow label={p(language, "receiptPrefix")} value={settings?.receipt_prefix ?? "—"} />
          </div>
        </article>
        <article className="settings-card">
          <div className="settings-card-title"><AppIcon name="wallet" /><div><h2>{p(language, "cashRule")}</h2><p>{cashRule}</p></div></div>
          <div className={`security-callout ${settings ? "good" : ""}`}><AppIcon name="shield" /><span>{cashRule}</span></div>
          <h3>{p(language, "enabledServices")}</h3>
          <div className="feature-list">
            {settings?.features.filter((feature) => feature.enabled).length ? settings.features.filter((feature) => feature.enabled).map((feature) => <span className="feature-chip" key={feature.feature_code}><AppIcon name="check" size={15} />{feature.feature_code.replaceAll("_", " ")} · {p(language, "enabled")}</span>) : <p className="muted-copy">{settings ? p(language, "noExtraServices") : "—"}</p>}
          </div>
        </article>
        <article className="settings-card settings-card-wide">
          <div className="settings-card-title"><AppIcon name="shield" /><div><h2>{p(language, "accessSecurity")}</h2><p>{p(language, "ledgerProtection")}</p></div></div>
          <div className="security-grid">
            <DetailRow label={p(language, "currentRole")} value={roleLabel} status="good" />
            <div className="security-callout"><AppIcon name="check" /><span>{p(language, "signedInPosting")}</span></div>
            <div className="security-callout"><AppIcon name="shield" /><span>{p(language, "ledgerProtection")}</span></div>
          </div>
        </article>
      </div>
    </section>
  );
}

export function ComplianceView({ language, organizationId, onDashboard }: { language: Language; organizationId: string | null; onDashboard: () => void }) {
  const [data, setData] = useState<ComplianceWorkspaceRecord | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "preview">(organizationId === "inspection" ? "preview" : "loading");
  useEffect(() => {
    if (!organizationId || organizationId === "inspection") return;
    let active = true;
    void getComplianceWorkspace(organizationId).then((result) => {
      if (!active) return;
      setData(result.data);
      setState(result.error || !result.data ? "error" : "ready");
    });
    return () => { active = false; };
  }, [organizationId]);
  const hasVerifiedData = state === "ready" && Boolean(data);
  const legalApproved = data?.profile?.legal_signoff_status === "approved";
  return (
    <section className="professional-workspace">
      <WorkspaceHeader icon="shield" kicker={p(language, "legalReview")} title={p(language, "complianceTitle")} intro={p(language, "complianceIntro")} backLabel={p(language, "backHome")} onBack={onDashboard} />
      {state === "loading" ? <div className="professional-state" role="status">{p(language, "loading")}</div> : null}
      {state === "error" ? <div className="professional-state error" role="alert">{p(language, "complianceUnavailable")}</div> : null}
      {state === "preview" ? <div className="professional-state"><b>{p(language, "preview")}</b><span>{p(language, "compliancePreview")}</span></div> : null}
      <div className="compliance-summary">
        <article className={`compliance-hero ${legalApproved ? "approved" : "pending"}`}>
          <span className="compliance-hero-icon"><AppIcon name="shield" size={26} /></span>
          <div><p>{p(language, "legalReview")}</p><h2>{hasVerifiedData ? (legalApproved ? p(language, "reviewed") : p(language, "awaitingLegal")) : "—"}</h2><small>{p(language, "externalDecision")}</small></div>
        </article>
        <article className="settings-card">
          <div className="settings-card-title"><AppIcon name="transactions" /><div><h2>{p(language, "rules")}</h2><p>{hasVerifiedData ? (data?.ruleSet?.status ?? p(language, "noRuleSet")) : "—"}</p></div></div>
          <div className="detail-list">
            <DetailRow label={p(language, "ruleVersion")} value={data?.ruleSet?.version ?? "—"} />
            <DetailRow label={p(language, "effectiveFrom")} value={data?.ruleSet?.effective_from ? new Date(data.ruleSet.effective_from).toLocaleDateString(language) : "—"} />
            <DetailRow label={p(language, "sourceReference")} value={data?.ruleSet?.source_reference ?? "—"} />
          </div>
        </article>
        <article className="settings-card">
          <div className="settings-card-title"><AppIcon name="people" /><div><h2>{p(language, "screening")}</h2><p>{hasVerifiedData ? (data?.screeningProvider ? p(language, "providerConnected") : p(language, "noProvider")) : "—"}</p></div></div>
          <div className={`security-callout ${hasVerifiedData ? (data?.screeningProvider ? "good" : "warning") : ""}`}><AppIcon name={data?.screeningProvider ? "check" : "shield"} /><span>{hasVerifiedData ? (data?.screeningProvider ?? p(language, "failClosed")) : "—"}</span></div>
        </article>
      </div>
      <div className="queue-grid">
        <article className="queue-card"><div><p>{p(language, "alertQueue")}</p><strong>{hasVerifiedData ? (data!.alertCounts.open + data!.alertCounts.reviewing) : "—"}</strong></div><dl><div><dt>{p(language, "open")}</dt><dd>{hasVerifiedData ? data!.alertCounts.open : "—"}</dd></div><div><dt>{p(language, "reviewing")}</dt><dd>{hasVerifiedData ? data!.alertCounts.reviewing : "—"}</dd></div><div><dt>{p(language, "closed")}</dt><dd>{hasVerifiedData ? data!.alertCounts.closed : "—"}</dd></div></dl></article>
        <article className="queue-card"><div><p>{p(language, "caseQueue")}</p><strong>{hasVerifiedData ? (data!.caseCounts.draft + data!.caseCounts.ready) : "—"}</strong></div><dl><div><dt>{p(language, "draft")}</dt><dd>{hasVerifiedData ? data!.caseCounts.draft : "—"}</dd></div><div><dt>{p(language, "ready")}</dt><dd>{hasVerifiedData ? data!.caseCounts.ready : "—"}</dd></div><div><dt>{p(language, "submitted")}</dt><dd>{hasVerifiedData ? data!.caseCounts.submitted : "—"}</dd></div></dl></article>
      </div>
    </section>
  );
}

export type CompletedTrade = { receiptNumber: string | null; journalEntryId: string; givenAmount: string; givenCurrency: string; receivedAmount: string; receivedCurrency: string; rate: string; occurredAt: string };

export function ReceiptSuccessDialog({ language, businessName, trade, onPrint, onDone }: { language: Language; businessName: string; trade: CompletedTrade; onPrint: (width: "58mm" | "80mm") => void; onDone: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const selector = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDone();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(selector));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onDone]);
  return (
    <div className="modal-backdrop receipt-backdrop">
      <section aria-labelledby="receipt-success-title" aria-modal="true" className="receipt-success" ref={dialogRef} role="dialog">
        <div className="receipt-success-mark"><AppIcon name="check" size={28} /></div>
        <p className="kicker">{p(language, "receipt")}</p>
        <h2 id="receipt-success-title">{p(language, "transactionSaved")}</h2>
        <p className="receipt-success-copy">{p(language, "recordedOnce")}</p>
        <div className="receipt-paper">
          <div className="receipt-brand"><b>{businessName}</b><span>{trade.receiptNumber ?? p(language, "receiptPending")}</span></div>
          <DetailRow label={p(language, "transactionReference")} value={trade.journalEntryId} />
          <DetailRow label={p(language, "shopGives")} value={`${trade.givenAmount} ${trade.givenCurrency}`} />
          <DetailRow label={p(language, "shopReceives")} value={`${trade.receivedAmount} ${trade.receivedCurrency}`} />
          <DetailRow label={p(language, "customerRate")} value={trade.rate} />
          <time>{new Date(trade.occurredAt).toLocaleString(language, { hour12: false })}</time>
        </div>
        <div className="receipt-actions">
          <button className="export-button" onClick={() => onPrint("58mm")}><AppIcon name="print" size={17} />{p(language, "print58")}</button>
          <button className="export-button" onClick={() => onPrint("80mm")}><AppIcon name="print" size={17} />{p(language, "print80")}</button>
          <button autoFocus className="primary-action" onClick={onDone}>{p(language, "done")}</button>
        </div>
      </section>
    </div>
  );
}
