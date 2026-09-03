import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Language } from "./lib/i18n";
import {
  createOrganizationBranch,
  createOrganizationCashbox,
  decideComplianceAlert,
  decideSupportAccess,
  getComplianceWorkspace,
  getOrganizationControlPlane,
  getOrganizationDataExport,
  listCounterparties,
  listNotificationPreferences,
  getWorkspaceSettings,
  revokeSupportAccess,
  saveComplianceCase,
  saveExpenseCategory,
  saveKycProfile,
  setOrganizationBranchState,
  setOrganizationCashboxState,
  setOrganizationFeatureState,
  setNotificationPreference,
  updateOrganizationProfile,
  updateWorkspaceSettings,
  type ComplianceWorkspaceRecord,
  type CounterpartyRecord,
  type KycProfileRecord,
  type NotificationPreferenceRecord,
  type OrganizationControlPlane,
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
  | "close"
  | "receive"
  | "pay"
  | "debt"
  | "transfer"
  | "expense"
  | "capital"
  | "bank"
  | "hawala"
  | "report"
  | "rates"
  | "cashbox"
  | "search";

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
  receive: <><path d="M12 3v13"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></>,
  pay: <><path d="M12 21V8"/><path d="m7 13 5-5 5 5"/><path d="M5 3h14"/></>,
  debt: <><circle cx="8" cy="8" r="3"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0"/><path d="M15 8h7"/><path d="M18.5 4.5v7"/></>,
  transfer: <><path d="M4 7h15"/><path d="m15 3 4 4-4 4"/><path d="M20 17H5"/><path d="m9 13-4 4 4 4"/></>,
  expense: <><path d="M4 7h16v12H4z"/><path d="M4 11h16"/><path d="M8 15h3"/><path d="m15 5 2-2 2 2"/></>,
  capital: <><path d="M4 20h16"/><path d="M6 17V9"/><path d="M10 17V5"/><path d="M14 17v-7"/><path d="M18 17V3"/></>,
  bank: <><path d="m3 9 9-6 9 6"/><path d="M5 10h14"/><path d="M6 10v8"/><path d="M10 10v8"/><path d="M14 10v8"/><path d="M18 10v8"/><path d="M3 21h18"/></>,
  hawala: <><circle cx="8" cy="12" r="5"/><circle cx="16" cy="12" r="5"/><path d="M8 9h8"/><path d="M8 15h8"/></>,
  report: <><path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5"/><path d="M9 12h6"/><path d="M9 16h6"/></>,
  rates: <><path d="M4 18 9 13l3 3 8-9"/><path d="M15 7h5v5"/></>,
  cashbox: <><path d="M3 7h18v13H3z"/><path d="M3 11h18"/><circle cx="12" cy="15.5" r="2"/><path d="M7 4h10v3"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
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
    editSettings: "Owner controls",
    saveSettings: "Save settings",
    savingSettings: "Saving…",
    settingsSaved: "Settings saved and added to the security history.",
    settingsFailed: "Settings were not saved. If you changed the cash rule, confirm two-step security first.",
    ownerSettingsOnly: "Only the owner can change these controls.",
    allowNegativeCash: "Allow a cashbox to go below zero",
    mfaSettingsNote: "Changing the negative-cash rule requires two-step security.",
    cashRule: "Cash control",
    noNegativeCash: "Negative cash is blocked",
    negativeCashAllowed: "Negative cash is allowed",
    enabledServices: "Enabled services",
    noExtraServices: "No optional services are enabled.",
    enabled: "Enabled",
    extraService: "Additional service",
    hawalaService: "Hawala transfers",
    complianceService: "Compliance controls",
    paymentService: "Online payments",
    importService: "Data import",
    screeningService: "Name screening",
    notificationChoices: "Your notifications",
    notificationIntro: "Choose which important work alerts appear inside SARAFI for your account.",
    approvalNotification: "Actions waiting for approval",
    complianceNotification: "Compliance alerts",
    cashboxNotification: "Cashbox count differences",
    notificationSaved: "Notification choice saved.",
    notificationFailed: "The notification choice was not saved. Please try again.",
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
    recentAlerts: "Recent alerts",
    recentCases: "Recent cases",
    noQueueItems: "No items in this queue.",
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
    editSettings: "کنترول‌های مالک",
    saveSettings: "ذخیره تنظیمات",
    savingSettings: "در حال ذخیره…",
    settingsSaved: "تنظیمات ذخیره و در تاریخچه امنیت ثبت شد.",
    settingsFailed: "تنظیمات ذخیره نشد. اگر اصل صندوق را تغییر دادید، نخست امنیت دومرحله‌ای را تأیید کنید.",
    ownerSettingsOnly: "تنها مالک می‌تواند این کنترول‌ها را تغییر دهد.",
    allowNegativeCash: "اجازه‌دادن صندوق منفی",
    mfaSettingsNote: "تغییر اصل صندوق منفی به امنیت دومرحله‌ای نیاز دارد.",
    cashRule: "کنترول صندوق",
    noNegativeCash: "ثبت صندوق منفی بسته است",
    negativeCashAllowed: "ثبت صندوق منفی اجازه دارد",
    enabledServices: "خدمات فعال",
    noExtraServices: "خدمت اختیاری فعال نشده است.",
    enabled: "فعال",
    extraService: "خدمت اضافی",
    hawalaService: "حواله‌ها",
    complianceService: "کنترول رعایت اصول",
    paymentService: "پرداخت آنلاین",
    importService: "آوردن معلومات",
    screeningService: "بررسی نام",
    notificationChoices: "خبرهای شما",
    notificationIntro: "انتخاب کنید کدام کارهای مهم در داخل صرافی برای شما خبر داده شود.",
    approvalNotification: "کارهای منتظر تأیید",
    complianceNotification: "هشدارهای رعایت اصول",
    cashboxNotification: "تفاوت شمارش صندوق",
    notificationSaved: "انتخاب خبر ذخیره شد.",
    notificationFailed: "انتخاب خبر ذخیره نشد. دوباره کوشش کنید.",
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
    recentAlerts: "هشدارهای اخیر",
    recentCases: "دوسیه‌های اخیر",
    noQueueItems: "در این صف موردی نیست.",
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
    editSettings: "د مالک کنټرولونه",
    saveSettings: "امستنې ساتل",
    savingSettings: "ساتل کېږي…",
    settingsSaved: "امستنې وساتل شوې او په امنیتي تاریخ کې ثبت شوې.",
    settingsFailed: "امستنې ونه ساتل شوې. که د صندوق اصل مو بدل کړی وي، لومړی دوه پړاوه امنیت تایید کړئ.",
    ownerSettingsOnly: "یوازې مالک دا کنټرولونه بدلولی شي.",
    allowNegativeCash: "منفي صندوق ته اجازه ورکول",
    mfaSettingsNote: "د منفي صندوق د اصل بدلون دوه پړاوه امنیت غواړي.",
    cashRule: "د صندوق کنټرول",
    noNegativeCash: "منفي صندوق بند دی",
    negativeCashAllowed: "منفي صندوق اجازه لري",
    enabledServices: "فعال خدمتونه",
    noExtraServices: "کوم اختیاري خدمت فعال نه دی.",
    enabled: "فعال",
    extraService: "اضافي خدمت",
    hawalaService: "حوالې",
    complianceService: "د اصولو څارنه",
    paymentService: "انلاین تادیات",
    importService: "د معلوماتو راوړل",
    screeningService: "د نوم کتنه",
    notificationChoices: "ستاسو خبرتیاوې",
    notificationIntro: "وټاکئ چې د صرافۍ کوم مهم کارونه دلته درته خبر شي.",
    approvalNotification: "تأیید ته منتظر کارونه",
    complianceNotification: "د اصولو خبرتیاوې",
    cashboxNotification: "د صندوق د شمېر توپیر",
    notificationSaved: "د خبرتیا انتخاب وساتل شو.",
    notificationFailed: "د خبرتیا انتخاب ونه ساتل شو. بیا هڅه وکړئ.",
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
    recentAlerts: "وروستۍ خبرتیاوې",
    recentCases: "وروستۍ دوسیې",
    noQueueItems: "په دې کتار کې څه نشته.",
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
const preferenceTypes = ["approval_required", "compliance_alert", "cashbox_variance"] as const;
const preferenceLabel = (language: Language, type: typeof preferenceTypes[number]) => p(language, ({
  approval_required: "approvalNotification",
  compliance_alert: "complianceNotification",
  cashbox_variance: "cashboxNotification",
})[type] as ProfessionalCopyKey);
const serviceLabel = (language: Language, code: string) => {
  if (code.startsWith("sanctions_provider:")) return p(language, "screeningService");
  const labels: Record<string, ProfessionalCopyKey> = {
    hawala: "hawalaService",
    compliance: "complianceService",
    online_payments: "paymentService",
    payments: "paymentService",
    imports: "importService",
  };
  return p(language, labels[code] ?? "extraService");
};
const complianceTypeCopy: Record<Language, Record<string, string>> = {
  en: { large_transaction: "Large transaction", kyc_required: "Customer identity required", edd_required: "Extra customer review", screening_required: "Name screening required", document_missing: "Document missing", suspicious_pattern: "Unusual activity", risk_geography: "Location risk" },
  "fa-AF": { large_transaction: "معامله بزرگ", kyc_required: "هویت مشتری لازم است", edd_required: "بررسی بیشتر مشتری", screening_required: "بررسی نام لازم است", document_missing: "سند کم است", suspicious_pattern: "فعالیت غیرعادی", risk_geography: "خطر مربوط به محل" },
  "ps-AF": { large_transaction: "لویه معامله", kyc_required: "د پېرودونکي هویت اړین دی", edd_required: "د پېرودونکي زیاته کتنه", screening_required: "د نوم کتنه اړینه ده", document_missing: "سند نشته", suspicious_pattern: "نااشنا فعالیت", risk_geography: "د ځای خطر" },
};
const complianceActionCopy: Record<Language, Record<string, string>> = {
  en: { customerReview: "Customer identity review", chooseCustomer: "Choose customer", legalName: "Legal name", fatherName: "Father name", birthDate: "Date of birth", nationality: "Nationality", documentType: "Identity document", tazkira: "Tazkira", passport: "Passport", other: "Other", expiry: "Document expiry", address: "Address", phone: "Phone", occupation: "Occupation or business", purpose: "Purpose of funds", source: "Source of funds", risk: "Risk level", low: "Low", medium: "Medium", high: "High", reviewStatus: "Review status", pending: "Pending", approved: "Approved", review_required: "Needs review", saveKyc: "Save identity review", saved: "Saved", failed: "Could not save", reviewAlert: "Review alert", startReview: "Start review", clearAlert: "Clear", markReported: "Mark reported", decisionReason: "Review reason", caseNotes: "Case notes", submissionReference: "Submission reference", saveCase: "Save case", ready: "Ready", submitted: "Submitted", closed: "Closed", providerBoundary: "Name screening remains blocked until an approved provider is connected." },
  "fa-AF": { customerReview: "بررسی هویت مشتری", chooseCustomer: "انتخاب مشتری", legalName: "نام رسمی", fatherName: "نام پدر", birthDate: "تاریخ تولد", nationality: "تابعیت", documentType: "سند هویت", tazkira: "تذکره", passport: "پاسپورت", other: "دیگر", expiry: "تاریخ ختم سند", address: "آدرس", phone: "شماره تماس", occupation: "کار یا تجارت", purpose: "هدف پول", source: "منبع پول", risk: "درجه خطر", low: "کم", medium: "متوسط", high: "زیاد", reviewStatus: "حالت بررسی", pending: "منتظر", approved: "تأیید", review_required: "بررسی لازم", saveKyc: "ذخیره بررسی هویت", saved: "ذخیره شد", failed: "ذخیره نشد", reviewAlert: "بررسی هشدار", startReview: "آغاز بررسی", clearAlert: "پاک کردن", markReported: "ثبت گزارش‌شده", decisionReason: "دلیل بررسی", caseNotes: "یادداشت قضیه", submissionReference: "شماره سپردن گزارش", saveCase: "ذخیره قضیه", ready: "آماده", submitted: "سپرده شد", closed: "بسته", providerBoundary: "بررسی نام تا زمان وصل شدن منبع تأییدشده بسته می‌ماند." },
  "ps-AF": { customerReview: "د پېرودونکي د هویت کتنه", chooseCustomer: "پېرودونکی وټاکئ", legalName: "رسمي نوم", fatherName: "د پلار نوم", birthDate: "د زېږون نېټه", nationality: "تابعیت", documentType: "د هویت سند", tazkira: "تذکره", passport: "پاسپورټ", other: "بل", expiry: "د سند پای", address: "پته", phone: "د اړیکې شمېره", occupation: "کار یا سوداګري", purpose: "د پیسو موخه", source: "د پیسو سرچینه", risk: "د خطر کچه", low: "ټیټه", medium: "منځنۍ", high: "لوړه", reviewStatus: "د کتنې حالت", pending: "منتظر", approved: "تایید", review_required: "کتنه غواړي", saveKyc: "د هویت کتنه ساتل", saved: "وساتل شو", failed: "ونه ساتل شو", reviewAlert: "خبرتیا کتل", startReview: "کتنه پیلول", clearAlert: "پاکول", markReported: "راپور شوی ثبتول", decisionReason: "د کتنې لامل", caseNotes: "د قضیې یادښت", submissionReference: "د سپارلو شمېره", saveCase: "قضیه ساتل", ready: "چمتو", submitted: "سپارل شوی", closed: "تړل شوی", providerBoundary: "د نوم کتنه تر تایید شوې سرچینې پورې تړلې پاتې کېږي." },
};

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

const controlCopy: Record<Language, Record<string, string>> = {
  en: {
    businessProfile: "Business profile", displayName: "Shop name", legalName: "Legal name", licenseNumber: "License number", licenseExpiry: "License expiry", saveProfile: "Save business profile",
    branchesCashboxes: "Branches and cashboxes", addBranch: "Add branch", branchName: "Branch name", addCashbox: "Add cashbox", cashboxName: "Cashbox name", active: "Active", inactive: "Inactive", deactivate: "Deactivate", activate: "Activate", reasonPrompt: "Write the reason for this change",
    workingRules: "Daily working rules", dateStyle: "Date shown", gregorian: "Gregorian", solarHijri: "Afghan Solar Hijri", bothDates: "Show both", digitStyle: "Number style", westernDigits: "Western digits", localDigits: "Local digits", approvalLimit: "Approval threshold in AFN", offlineLimit: "Offline limit (deferred; kept at zero)", hideCashierProfit: "Hide owner profit from cashiers",
    categories: "Expense categories", addCategory: "Add category", categoryName: "Category name", services: "Optional services", dataExport: "Business data export", exportHelp: "Download the organization’s authorized ledger and operating records as JSON.", downloadData: "Download business data", securityHistory: "Security history", supportRequests: "Support access requests", approveSupport: "Approve temporarily", rejectSupport: "Reject", revokeSupport: "Revoke now", noSupport: "No support request is waiting.", ownerApproval: "Owner approval and verification code are required.",
    saved: "Saved successfully.", failed: "This action could not be completed.", mfaNeeded: "Enter your authenticator code in Team & Devices, then try again.", pending: "Pending", approved: "Approved", rejected: "Rejected", revoked: "Revoked", hours: "hours", scope: "Access", noSecurityEvents: "No security event has been recorded.",
  },
  "fa-AF": {
    businessProfile: "معلومات صرافی", displayName: "نام صرافی", legalName: "نام رسمی", licenseNumber: "شماره جواز", licenseExpiry: "تاریخ ختم جواز", saveProfile: "ذخیره معلومات صرافی",
    branchesCashboxes: "شعبه‌ها و صندوق‌ها", addBranch: "افزودن شعبه", branchName: "نام شعبه", addCashbox: "افزودن صندوق", cashboxName: "نام صندوق", active: "فعال", inactive: "غیرفعال", deactivate: "غیرفعال کردن", activate: "فعال کردن", reasonPrompt: "دلیل این تغییر را بنویسید",
    workingRules: "قواعد کار روزانه", dateStyle: "نمایش تاریخ", gregorian: "میلادی", solarHijri: "هجری شمسی افغانستان", bothDates: "هر دو تاریخ", digitStyle: "شکل اعداد", westernDigits: "اعداد انگلیسی", localDigits: "اعداد محلی", approvalLimit: "حد تأیید به افغانی", offlineLimit: "حد کار آفلاین (فعلاً صفر)", hideCashierProfit: "مفاد مالک از صندوق‌دار پنهان باشد",
    categories: "بخش‌های مصرف", addCategory: "افزودن بخش", categoryName: "نام بخش مصرف", services: "خدمات اختیاری", dataExport: "دانلود معلومات صرافی", exportHelp: "دفتر معاملات و معلومات کاری صرافی را با اجازه مالک به شکل JSON دانلود کنید.", downloadData: "دانلود معلومات", securityHistory: "تاریخچه امنیت", supportRequests: "درخواست دسترسی پشتیبانی", approveSupport: "تأیید موقت", rejectSupport: "رد کردن", revokeSupport: "قطع دسترسی", noSupport: "هیچ درخواست پشتیبانی منتظر نیست.", ownerApproval: "تأیید مالک و کود امنیتی لازم است.",
    saved: "با موفقیت ذخیره شد.", failed: "این کار انجام نشد.", mfaNeeded: "در بخش کارمندان و دستگاه‌ها کود امنیتی را تأیید کنید و دوباره کوشش کنید.", pending: "منتظر", approved: "تأیید", rejected: "رد", revoked: "قطع شده", hours: "ساعت", scope: "دسترسی", noSecurityEvents: "هنوز رویداد امنیتی ثبت نشده است.",
  },
  "ps-AF": {
    businessProfile: "د صرافۍ معلومات", displayName: "د صرافۍ نوم", legalName: "رسمي نوم", licenseNumber: "د جواز شمېره", licenseExpiry: "د جواز پای", saveProfile: "د صرافۍ معلومات ساتل",
    branchesCashboxes: "څانګې او صندوقونه", addBranch: "څانګه زیاتول", branchName: "د څانګې نوم", addCashbox: "صندوق زیاتول", cashboxName: "د صندوق نوم", active: "فعال", inactive: "غیرفعال", deactivate: "غیرفعالول", activate: "فعالول", reasonPrompt: "د دې بدلون لامل ولیکئ",
    workingRules: "د ورځني کار اصول", dateStyle: "د نېټې ښودل", gregorian: "میلادي", solarHijri: "افغان لمریز هجري", bothDates: "دواړه نېټې", digitStyle: "د شمېرو بڼه", westernDigits: "انګلیسي شمېرې", localDigits: "سیمه‌ییزې شمېرې", approvalLimit: "د تایید حد په افغانۍ", offlineLimit: "د افلاین کار حد (اوس صفر)", hideCashierProfit: "د مالک ګټه له صندوق‌دار پټه وي",
    categories: "د لګښت برخې", addCategory: "برخه زیاتول", categoryName: "د لګښت د برخې نوم", services: "اختیاري خدمتونه", dataExport: "د صرافۍ معلومات ښکته کول", exportHelp: "د مالک په اجازه د صرافۍ دفتر او کاري معلومات د JSON په بڼه ښکته کړئ.", downloadData: "معلومات ښکته کول", securityHistory: "امنیتي تاریخ", supportRequests: "د مرستې د لاسرسي غوښتنې", approveSupport: "لنډمهاله تایید", rejectSupport: "ردول", revokeSupport: "لاس‌رسی بندول", noSupport: "د مرستې منتظره غوښتنه نشته.", ownerApproval: "د مالک تایید او امنیتي کوډ اړین دي.",
    saved: "په بریالیتوب وساتل شو.", failed: "دا کار ترسره نه شو.", mfaNeeded: "د کارکوونکو او وسیلو په برخه کې امنیتي کوډ تایید او بیا هڅه وکړئ.", pending: "منتظر", approved: "تایید", rejected: "رد", revoked: "بند شوی", hours: "ساعتونه", scope: "لاس‌رسی", noSecurityEvents: "تر اوسه امنیتي پېښه نه ده ثبت شوې.",
  },
};

export function SettingsView({ language, organizationId, organizationName, branchName, roleLabel, canManage, onDashboard }: { language: Language; organizationId: string | null; organizationName: string; branchName: string; roleLabel: string; canManage: boolean; onDashboard: () => void }) {
  const c = controlCopy[language];
  const [settings, setSettings] = useState<WorkspaceSettingsRecord | null>(null);
  const [controls, setControls] = useState<OrganizationControlPlane | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "preview">(organizationId === "inspection" ? "preview" : "loading");
  const [draftLanguage, setDraftLanguage] = useState(language);
  const [timezone, setTimezone] = useState("Asia/Kabul");
  const [receiptPrefix, setReceiptPrefix] = useState("SAR");
  const [negativeCashAllowed, setNegativeCashAllowed] = useState(false);
  const [dateDisplay, setDateDisplay] = useState("both");
  const [digitDisplay, setDigitDisplay] = useState("western");
  const [approvalThreshold, setApprovalThreshold] = useState("0");
  const [offlineLimit, setOfflineLimit] = useState("0");
  const [cashierProfitHidden, setCashierProfitHidden] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<"saved" | "failed" | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferenceRecord[]>([]);
  const [preferenceBusy, setPreferenceBusy] = useState<string | null>(null);
  const [preferenceMessage, setPreferenceMessage] = useState<"saved" | "failed" | null>(null);
  const [displayName, setDisplayName] = useState(organizationName);
  const [legalName, setLegalName] = useState(organizationName);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [newCashboxName, setNewCashboxName] = useState("");
  const [newCashboxBranch, setNewCashboxBranch] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [controlBusy, setControlBusy] = useState("");
  const [controlMessage, setControlMessage] = useState("");
  const reloadControls = async () => {
    if (!organizationId || organizationId === "inspection") return;
    const result = await getOrganizationControlPlane(organizationId);
    if (result.data) setControls(result.data);
    if (result.error) setControlMessage(c.failed);
  };
  useEffect(() => {
    if (!organizationId || organizationId === "inspection") return;
    let active = true;
    const controlRequest = canManage ? getOrganizationControlPlane(organizationId) : Promise.resolve({ data: null, error: null });
    void Promise.all([getWorkspaceSettings(organizationId), listNotificationPreferences(organizationId), controlRequest]).then(([result, preferenceResult, controlResult]) => {
      if (!active) return;
      setSettings(result.data);
      setPreferences(preferenceResult.data ?? []);
      setControls(controlResult.data);
      if (result.data) {
        setDraftLanguage(result.data.default_language as Language);
        setTimezone(result.data.timezone);
        setReceiptPrefix(result.data.receipt_prefix);
        setNegativeCashAllowed(result.data.negative_cash_allowed);
        setDateDisplay(result.data.date_display ?? "both");
        setDigitDisplay(result.data.digit_display ?? "western");
        setApprovalThreshold(result.data.approval_threshold_base ?? "0");
        setOfflineLimit(result.data.offline_limit_base ?? "0");
        setCashierProfitHidden(result.data.cashier_profit_hidden ?? true);
      }
      if (controlResult.data) {
        setDisplayName(controlResult.data.organization.display_name);
        setLegalName(controlResult.data.organization.legal_name);
        setLicenseNumber(controlResult.data.organization.license_number ?? "");
        setLicenseExpiry(controlResult.data.organization.license_expires_on ?? "");
        setNewCashboxBranch(controlResult.data.branches.find((item) => item.active)?.id ?? "");
      }
      setState(result.error || (canManage && controlResult.error) || !result.data ? "error" : "ready");
    });
    return () => { active = false; };
  }, [canManage, organizationId]);
  const changePreference = async (notificationType: typeof preferenceTypes[number], inApp: boolean) => {
    if (!organizationId) return;
    if (organizationId === "inspection") {
      setPreferences((current) => [...current.filter((item) => item.notification_type !== notificationType), { id: notificationType, notification_type: notificationType, in_app: inApp, push: false, threshold_base: null }]);
      setPreferenceMessage("saved");
      return;
    }
    setPreferenceBusy(notificationType);
    setPreferenceMessage(null);
    const result = await setNotificationPreference({ organizationId, notificationType, inApp });
    setPreferenceBusy(null);
    if (!result.data || result.error) {
      setPreferenceMessage("failed");
      return;
    }
    setPreferences((current) => [...current.filter((item) => item.notification_type !== notificationType), result.data!]);
    setPreferenceMessage("saved");
  };
  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !canManage) return;
    if (organizationId === "inspection") {
      setSettings({ default_language: draftLanguage, base_currency_code: "AFN", timezone, receipt_prefix: receiptPrefix.toUpperCase(), negative_cash_allowed: negativeCashAllowed, features: [] });
      setSaveMessage("saved");
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    const result = await updateWorkspaceSettings({ organizationId, language: draftLanguage, timezone, receiptPrefix, negativeCashAllowed, dateDisplay, digitDisplay, approvalThresholdBase: approvalThreshold, offlineLimitBase: offlineLimit, cashierProfitHidden });
    setSaving(false);
    if (result.error || !result.data) {
      setSaveMessage("failed");
      return;
    }
    setSettings({ ...result.data, features: settings?.features ?? [] });
    setSaveMessage("saved");
  };
  const finishControlAction = async (result: { error: string | null }, success = c.saved) => {
    setControlBusy("");
    if (result.error) {
      setControlMessage(result.error.includes("AAL2") ? c.mfaNeeded : c.failed);
      return false;
    }
    setControlMessage(success);
    await reloadControls();
    return true;
  };
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !canManage) return;
    setControlBusy("profile");
    await finishControlAction(await updateOrganizationProfile({ organizationId, displayName, legalName, licenseNumber, licenseExpiresOn: licenseExpiry }));
  };
  const addBranch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !canManage) return;
    setControlBusy("branch");
    if (await finishControlAction(await createOrganizationBranch({ organizationId, name: newBranchName, timezone }))) setNewBranchName("");
  };
  const addCashbox = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !canManage || !newCashboxBranch) return;
    setControlBusy("cashbox");
    if (await finishControlAction(await createOrganizationCashbox({ organizationId, branchId: newCashboxBranch, name: newCashboxName }))) setNewCashboxName("");
  };
  const changeBranchState = async (branchIdValue: string, active: boolean) => {
    const reason = window.prompt(c.reasonPrompt)?.trim();
    if (!reason) return;
    setControlBusy(branchIdValue);
    await finishControlAction(await setOrganizationBranchState(branchIdValue, active, reason));
  };
  const changeCashboxState = async (cashboxIdValue: string, active: boolean) => {
    const reason = window.prompt(c.reasonPrompt)?.trim();
    if (!reason) return;
    setControlBusy(cashboxIdValue);
    await finishControlAction(await setOrganizationCashboxState(cashboxIdValue, active, reason));
  };
  const addCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !canManage) return;
    setControlBusy("category");
    if (await finishControlAction(await saveExpenseCategory(organizationId, newCategory))) setNewCategory("");
  };
  const changeFeature = async (feature: string, enabled: boolean) => {
    if (!organizationId || !canManage) return;
    setControlBusy(feature);
    await finishControlAction(await setOrganizationFeatureState(organizationId, feature, enabled));
  };
  const downloadOrganizationData = async () => {
    if (!organizationId || !canManage) return;
    setControlBusy("export");
    const result = await getOrganizationDataExport(organizationId);
    setControlBusy("");
    if (!result.data || result.error) { setControlMessage(c.failed); return; }
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sarafi-${organizationId}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setControlMessage(c.saved);
  };
  const decideSupport = async (requestId: string, decision: "approved" | "rejected") => {
    const reason = window.prompt(c.reasonPrompt)?.trim();
    if (!reason) return;
    setControlBusy(requestId);
    await finishControlAction(await decideSupportAccess(requestId, decision, reason));
  };
  const revokeSupport = async (requestId: string) => {
    const reason = window.prompt(c.reasonPrompt)?.trim();
    if (!reason) return;
    setControlBusy(requestId);
    await finishControlAction(await revokeSupportAccess(requestId, reason));
  };
  const languageLabel = language === "en" ? "English" : language === "fa-AF" ? "دری" : "پښتو";
  const timezoneOptions = [
    { value: "Asia/Kabul", label: language === "en" ? "Kabul" : "کابل" },
    { value: "Asia/Tehran", label: language === "en" ? "Tehran" : language === "fa-AF" ? "تهران" : "تهران" },
    { value: "Asia/Dubai", label: language === "en" ? "Dubai" : language === "fa-AF" ? "دبی" : "دوبۍ" },
    { value: "Asia/Karachi", label: language === "en" ? "Karachi" : language === "fa-AF" ? "کراچی" : "کراچۍ" },
    { value: "Europe/Istanbul", label: language === "en" ? "Istanbul" : language === "fa-AF" ? "استانبول" : "استانبول" },
    { value: "UTC", label: language === "en" ? "Universal time" : language === "fa-AF" ? "زمان جهانی" : "نړیوال وخت" },
  ];
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
            <DetailRow label={p(language, "timezone")} value={settings ? (timezoneOptions.find((option) => option.value === settings.timezone)?.label ?? settings.timezone) : "—"} />
            <DetailRow label={p(language, "language")} value={languageLabel} />
            <DetailRow label={p(language, "receiptPrefix")} value={settings?.receipt_prefix ?? "—"} />
          </div>
          {canManage ? <form className="settings-editor" onSubmit={saveSettings}>
            <h3>{p(language, "editSettings")}</h3>
            <label>{p(language, "language")}<select value={draftLanguage} onChange={(event) => setDraftLanguage(event.target.value as Language)}><option value="fa-AF">دری</option><option value="ps-AF">پښتو</option><option value="en">English</option></select></label>
            <label>{p(language, "timezone")}<select value={timezone} onChange={(event) => setTimezone(event.target.value)}>{timezoneOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
            <label>{p(language, "receiptPrefix")}<input required minLength={2} maxLength={10} pattern="[A-Za-z0-9-]{2,10}" dir="ltr" value={receiptPrefix} onChange={(event) => setReceiptPrefix(event.target.value)} /></label>
            <label>{c.dateStyle}<select value={dateDisplay} onChange={(event) => setDateDisplay(event.target.value)}><option value="gregorian">{c.gregorian}</option><option value="solar_hijri">{c.solarHijri}</option><option value="both">{c.bothDates}</option></select></label>
            <label>{c.digitStyle}<select value={digitDisplay} onChange={(event) => setDigitDisplay(event.target.value)}><option value="western">{c.westernDigits}</option><option value="localized">{c.localDigits}</option></select></label>
            <label>{c.approvalLimit}<input required min="0" step="0.01" inputMode="decimal" dir="ltr" value={approvalThreshold} onChange={(event) => setApprovalThreshold(event.target.value)} /></label>
            <label>{c.offlineLimit}<input required min="0" step="0.01" inputMode="decimal" dir="ltr" value={offlineLimit} onChange={(event) => setOfflineLimit(event.target.value)} /></label>
            <label className="settings-checkbox"><input type="checkbox" checked={negativeCashAllowed} onChange={(event) => setNegativeCashAllowed(event.target.checked)} />{p(language, "allowNegativeCash")}</label>
            <label className="settings-checkbox"><input type="checkbox" checked={cashierProfitHidden} onChange={(event) => setCashierProfitHidden(event.target.checked)} />{c.hideCashierProfit}</label>
            <small>{p(language, "mfaSettingsNote")}</small>
            {saveMessage && <div className={`settings-save-message ${saveMessage}`} role="status">{p(language, saveMessage === "saved" ? "settingsSaved" : "settingsFailed")}</div>}
            <button className="primary-action" disabled={saving}>{saving ? p(language, "savingSettings") : p(language, "saveSettings")}</button>
          </form> : <p className="muted-copy">{p(language, "ownerSettingsOnly")}</p>}
        </article>
        <article className="settings-card">
          <div className="settings-card-title"><AppIcon name="wallet" /><div><h2>{p(language, "cashRule")}</h2><p>{cashRule}</p></div></div>
          <div className={`security-callout ${settings ? "good" : ""}`}><AppIcon name="shield" /><span>{cashRule}</span></div>
          <h3>{p(language, "enabledServices")}</h3>
          <div className="feature-list">
            {settings?.features.filter((feature) => feature.enabled).length ? settings.features.filter((feature) => feature.enabled).map((feature) => <span className="feature-chip" key={feature.feature_code}><AppIcon name="check" size={15} />{serviceLabel(language, feature.feature_code)} · {p(language, "enabled")}</span>) : <p className="muted-copy">{settings ? p(language, "noExtraServices") : "—"}</p>}
          </div>
        </article>
        <article className="settings-card settings-card-wide">
          <div className="settings-card-title"><AppIcon name="check" /><div><h2>{p(language, "notificationChoices")}</h2><p>{p(language, "notificationIntro")}</p></div></div>
          <div className="notification-preferences">
            {preferenceTypes.map((type) => {
              const saved = preferences.find((item) => item.notification_type === type);
              return <label key={type}><span>{preferenceLabel(language, type)}</span><input type="checkbox" checked={saved?.in_app ?? true} disabled={preferenceBusy === type} onChange={(event) => void changePreference(type, event.target.checked)} /></label>;
            })}
          </div>
          {preferenceMessage && <div className={`settings-save-message ${preferenceMessage}`} role="status">{p(language, preferenceMessage === "saved" ? "notificationSaved" : "notificationFailed")}</div>}
        </article>
        <article className="settings-card settings-card-wide">
          <div className="settings-card-title"><AppIcon name="shield" /><div><h2>{p(language, "accessSecurity")}</h2><p>{p(language, "ledgerProtection")}</p></div></div>
          <div className="security-grid">
            <DetailRow label={p(language, "currentRole")} value={roleLabel} status="good" />
            <div className="security-callout"><AppIcon name="check" /><span>{p(language, "signedInPosting")}</span></div>
            <div className="security-callout"><AppIcon name="shield" /><span>{p(language, "ledgerProtection")}</span></div>
          </div>
        </article>
        {canManage && controls && <>
          <article className="settings-card settings-card-wide">
            <div className="settings-card-title"><AppIcon name="home" /><div><h2>{c.businessProfile}</h2><p>{c.ownerApproval}</p></div></div>
            <form className="inline-management-form" onSubmit={saveProfile}>
              <label>{c.displayName}<input required minLength={2} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
              <label>{c.legalName}<input required minLength={2} value={legalName} onChange={(event) => setLegalName(event.target.value)} /></label>
              <label>{c.licenseNumber}<input value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} /></label>
              <label>{c.licenseExpiry}<input type="date" value={licenseExpiry} onChange={(event) => setLicenseExpiry(event.target.value)} /></label>
              <button className="primary-action" disabled={controlBusy === "profile"}>{c.saveProfile}</button>
            </form>
          </article>
          <article className="settings-card settings-card-wide">
            <div className="settings-card-title"><AppIcon name="cashbox" /><div><h2>{c.branchesCashboxes}</h2><p>{c.ownerApproval}</p></div></div>
            <div className="control-lists">
              <div className="balance-list">{controls.branches.map((branch) => <div className="balance-row" key={branch.id}><span className="currency-badge usd">B</span><span className="balance-name"><b>{branch.name}</b><small>{branch.timezone}</small></span><strong>{branch.active ? c.active : c.inactive}</strong><button className="text-button" disabled={controlBusy === branch.id} onClick={() => void changeBranchState(branch.id, !branch.active)}>{branch.active ? c.deactivate : c.activate}</button></div>)}</div>
              <form className="inline-management-form" onSubmit={addBranch}><label>{c.branchName}<input required minLength={2} value={newBranchName} onChange={(event) => setNewBranchName(event.target.value)} /></label><button className="primary-action" disabled={controlBusy === "branch"}>{c.addBranch}</button></form>
              <div className="balance-list">{controls.cashboxes.map((cashbox) => <div className="balance-row" key={cashbox.id}><span className="currency-badge usd">C</span><span className="balance-name"><b>{cashbox.name}</b><small>{controls.branches.find((branch) => branch.id === cashbox.branch_id)?.name ?? "—"}</small></span><strong>{cashbox.active ? c.active : c.inactive}</strong><button className="text-button" disabled={controlBusy === cashbox.id} onClick={() => void changeCashboxState(cashbox.id, !cashbox.active)}>{cashbox.active ? c.deactivate : c.activate}</button></div>)}</div>
              <form className="inline-management-form" onSubmit={addCashbox}><label>{c.branchName}<select required value={newCashboxBranch} onChange={(event) => setNewCashboxBranch(event.target.value)}>{controls.branches.filter((branch) => branch.active).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>{c.cashboxName}<input required minLength={2} value={newCashboxName} onChange={(event) => setNewCashboxName(event.target.value)} /></label><button className="primary-action" disabled={controlBusy === "cashbox"}>{c.addCashbox}</button></form>
            </div>
          </article>
          <article className="settings-card">
            <div className="settings-card-title"><AppIcon name="expense" /><div><h2>{c.categories}</h2></div></div>
            <div className="feature-list">{controls.categories.filter((item) => item.active).map((item) => <span className="feature-chip" key={item.id}>{item.name}</span>)}</div>
            <form className="settings-editor" onSubmit={addCategory}><label>{c.categoryName}<input required minLength={2} value={newCategory} onChange={(event) => setNewCategory(event.target.value)} /></label><button className="primary-action" disabled={controlBusy === "category"}>{c.addCategory}</button></form>
          </article>
          <article className="settings-card">
            <div className="settings-card-title"><AppIcon name="more" /><div><h2>{c.services}</h2></div></div>
            <div className="notification-preferences">{["hawala", "advanced_compliance", "advanced_analytics", "imports"].map((feature) => <label key={feature}><span>{serviceLabel(language, feature)}</span><input type="checkbox" disabled={controlBusy === feature} checked={controls.features.find((item) => item.code === feature)?.enabled ?? false} onChange={(event) => void changeFeature(feature, event.target.checked)} /></label>)}</div>
          </article>
          <article className="settings-card">
            <div className="settings-card-title"><AppIcon name="report" /><div><h2>{c.dataExport}</h2><p>{c.exportHelp}</p></div></div>
            <button className="primary-action" disabled={controlBusy === "export"} onClick={() => void downloadOrganizationData()}>{c.downloadData}</button>
          </article>
          <article className="settings-card">
            <div className="settings-card-title"><AppIcon name="shield" /><div><h2>{c.supportRequests}</h2><p>{c.ownerApproval}</p></div></div>
            <div className="compliance-record-list">{controls.support_requests.length ? controls.support_requests.map((request) => <div key={request.id}><span><b>{request.reason}</b><small>{c.scope}: {request.requested_scope.join(", ")} · {request.requested_hours} {c.hours}</small><small>{new Date(request.requested_at).toLocaleString(language)}</small></span><strong>{c[request.status] ?? request.status}</strong>{request.status === "pending" && <><button className="text-button" disabled={controlBusy === request.id} onClick={() => void decideSupport(request.id, "approved")}>{c.approveSupport}</button><button className="text-button danger" disabled={controlBusy === request.id} onClick={() => void decideSupport(request.id, "rejected")}>{c.rejectSupport}</button></>}{request.status === "approved" && !request.expires_at ? null : request.status === "approved" ? <button className="text-button danger" disabled={controlBusy === request.id} onClick={() => void revokeSupport(request.id)}>{c.revokeSupport}</button> : null}</div>) : <p className="muted-copy">{c.noSupport}</p>}</div>
          </article>
          <article className="settings-card settings-card-wide">
            <div className="settings-card-title"><AppIcon name="shield" /><div><h2>{c.securityHistory}</h2></div></div>
            <div className="compliance-record-list">{controls.security_events.length ? controls.security_events.slice(0, 20).map((event) => <div key={event.id}><span><b>{event.event_type.replaceAll("_", " ")}</b><small>{new Date(event.created_at).toLocaleString(language)}</small></span><strong>✓</strong></div>) : <p className="muted-copy">{c.noSecurityEvents}</p>}</div>
          </article>
        </>}
        {controlMessage && <div className="settings-save-message saved" role="status">{controlMessage}</div>}
      </div>
    </section>
  );
}

export function ComplianceView({ language, organizationId, onDashboard }: { language: Language; organizationId: string | null; onDashboard: () => void }) {
  const c = complianceActionCopy[language];
  const [data, setData] = useState<ComplianceWorkspaceRecord | null>(null);
  const [people, setPeople] = useState<CounterpartyRecord[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "preview">(organizationId === "inspection" ? "preview" : "loading");
  const [selectedPerson, setSelectedPerson] = useState("");
  const [kyc, setKyc] = useState<Partial<KycProfileRecord>>({ risk_level: "medium", review_status: "pending" });
  const [selectedAlert, setSelectedAlert] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [caseStatus, setCaseStatus] = useState("draft");
  const [caseNotes, setCaseNotes] = useState("");
  const [submissionReference, setSubmissionReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const reload = async () => {
    if (!organizationId || organizationId === "inspection") return;
    const result = await getComplianceWorkspace(organizationId);
    if (result.data) setData(result.data);
    if (result.error) setMessage(c.failed);
  };
  useEffect(() => {
    if (!organizationId || organizationId === "inspection") return;
    let active = true;
    void Promise.all([getComplianceWorkspace(organizationId), listCounterparties(organizationId)]).then(([result, peopleResult]) => {
      if (!active) return;
      setData(result.data);
      setPeople(peopleResult.data ?? []);
      setState(result.error || peopleResult.error || !result.data ? "error" : "ready");
    });
    return () => { active = false; };
  }, [organizationId]);
  useEffect(() => {
    const profile = data?.kycProfiles.find((item) => item.counterparty_id === selectedPerson);
    const person = people.find((item) => item.id === selectedPerson);
    // oxlint-disable-next-line react/set-state-in-effect -- The form mirrors the selected external KYC record.
    setKyc(profile ?? { legal_name: person?.display_name ?? "", phone: person?.phone ?? "", risk_level: "medium", review_status: "pending" });
  }, [data, people, selectedPerson]);
  const saveKyc = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !selectedPerson) return;
    setBusy(true);
    const result = await saveKycProfile({ organization_id: organizationId, counterparty_id: selectedPerson, ...kyc });
    setBusy(false);
    setMessage(result.error ? c.failed : c.saved);
    if (!result.error) await reload();
  };
  const updateAlert = async (status: "under_review" | "cleared" | "reported") => {
    if (!selectedAlert || reviewReason.trim().length < 2) return;
    setBusy(true);
    const result = await decideComplianceAlert(selectedAlert, status, reviewReason);
    setBusy(false);
    setMessage(result.error ? c.failed : c.saved);
    if (!result.error) { setReviewReason(""); await reload(); }
  };
  const saveCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !selectedAlert) return;
    setBusy(true);
    const result = await saveComplianceCase({ organization_id: organizationId, alert_id: selectedAlert, report_status: caseStatus, notes: caseNotes, submitted_reference: submissionReference });
    setBusy(false);
    setMessage(result.error ? c.failed : c.saved);
    if (!result.error) await reload();
  };
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
      {hasVerifiedData && <div className="compliance-record-grid">
        <article className="settings-card"><h2>{p(language, "recentAlerts")}</h2><div className="compliance-record-list">{data!.alerts.length ? data!.alerts.map((alert) => <button className="compliance-select-row" key={alert.id} onClick={() => setSelectedAlert(alert.id)}><span><b>{complianceTypeCopy[language][alert.alert_type] ?? alert.alert_type}</b><small>{new Date(alert.created_at).toLocaleString(language)}</small></span><strong>{alert.status === "under_review" ? p(language, "reviewing") : alert.status === "open" ? p(language, "open") : p(language, "closed")}</strong></button>) : <p className="muted-copy">{p(language, "noQueueItems")}</p>}</div></article>
        <article className="settings-card"><h2>{p(language, "recentCases")}</h2><div className="compliance-record-list">{data!.cases.length ? data!.cases.map((item) => <div key={item.id}><span><b><bdi>{item.submitted_reference ?? item.id.slice(0, 8)}</bdi></b><small>{new Date(item.created_at).toLocaleString(language)}</small></span><strong>{item.report_status === "draft" ? p(language, "draft") : item.report_status === "ready" ? p(language, "ready") : item.report_status === "submitted" ? p(language, "submitted") : p(language, "closed")}</strong></div>) : <p className="muted-copy">{p(language, "noQueueItems")}</p>}</div></article>
      </div>}
      {hasVerifiedData && <div className="compliance-record-grid compliance-actions-grid">
        <article className="settings-card">
          <div className="settings-card-title"><AppIcon name="people" /><div><h2>{c.customerReview}</h2><p>{c.providerBoundary}</p></div></div>
          <form className="settings-editor" onSubmit={saveKyc}>
            <label>{c.chooseCustomer}<select required value={selectedPerson} onChange={(event) => setSelectedPerson(event.target.value)}><option value="">—</option>{people.map((person) => <option value={person.id} key={person.id}>{person.display_name}</option>)}</select></label>
            <label>{c.legalName}<input required minLength={2} value={kyc.legal_name ?? ""} onChange={(event) => setKyc((current) => ({ ...current, legal_name: event.target.value }))} /></label>
            <div className="form-grid"><label>{c.fatherName}<input value={kyc.father_name ?? ""} onChange={(event) => setKyc((current) => ({ ...current, father_name: event.target.value }))} /></label><label>{c.birthDate}<input type="date" value={kyc.date_of_birth ?? ""} onChange={(event) => setKyc((current) => ({ ...current, date_of_birth: event.target.value }))} /></label></div>
            <div className="form-grid"><label>{c.nationality}<input value={kyc.nationality ?? ""} onChange={(event) => setKyc((current) => ({ ...current, nationality: event.target.value }))} /></label><label>{c.phone}<input dir="ltr" value={kyc.phone ?? ""} onChange={(event) => setKyc((current) => ({ ...current, phone: event.target.value }))} /></label></div>
            <div className="form-grid"><label>{c.documentType}<select value={kyc.identity_document_type ?? ""} onChange={(event) => setKyc((current) => ({ ...current, identity_document_type: event.target.value }))}><option value="">—</option><option value="tazkira">{c.tazkira}</option><option value="passport">{c.passport}</option><option value="other">{c.other}</option></select></label><label>{c.expiry}<input type="date" value={kyc.identity_document_expiry ?? ""} onChange={(event) => setKyc((current) => ({ ...current, identity_document_expiry: event.target.value }))} /></label></div>
            <label>{c.address}<input value={kyc.address ?? ""} onChange={(event) => setKyc((current) => ({ ...current, address: event.target.value }))} /></label>
            <label>{c.occupation}<input value={kyc.occupation_or_business ?? ""} onChange={(event) => setKyc((current) => ({ ...current, occupation_or_business: event.target.value }))} /></label>
            <div className="form-grid"><label>{c.purpose}<input value={kyc.purpose_of_funds ?? ""} onChange={(event) => setKyc((current) => ({ ...current, purpose_of_funds: event.target.value }))} /></label><label>{c.source}<input value={kyc.source_of_funds ?? ""} onChange={(event) => setKyc((current) => ({ ...current, source_of_funds: event.target.value }))} /></label></div>
            <div className="form-grid"><label>{c.risk}<select value={kyc.risk_level ?? "medium"} onChange={(event) => setKyc((current) => ({ ...current, risk_level: event.target.value as KycProfileRecord["risk_level"] }))}><option value="low">{c.low}</option><option value="medium">{c.medium}</option><option value="high">{c.high}</option></select></label><label>{c.reviewStatus}<select value={kyc.review_status ?? "pending"} onChange={(event) => setKyc((current) => ({ ...current, review_status: event.target.value as KycProfileRecord["review_status"] }))}><option value="pending">{c.pending}</option><option value="approved">{c.approved}</option><option value="review_required">{c.review_required}</option></select></label></div>
            <button className="primary-action" disabled={busy || !selectedPerson}>{c.saveKyc}</button>
          </form>
        </article>
        <article className="settings-card">
          <div className="settings-card-title"><AppIcon name="shield" /><div><h2>{c.reviewAlert}</h2><p>{c.providerBoundary}</p></div></div>
          <label>{c.reviewAlert}<select value={selectedAlert} onChange={(event) => setSelectedAlert(event.target.value)}><option value="">—</option>{data!.alerts.map((alert) => <option value={alert.id} key={alert.id}>{complianceTypeCopy[language][alert.alert_type] ?? alert.alert_type}</option>)}</select></label>
          <label>{c.decisionReason}<textarea value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></label>
          <div className="team-form-actions"><button className="secondary-action" disabled={busy || !selectedAlert || reviewReason.trim().length < 2} onClick={() => void updateAlert("under_review")}>{c.startReview}</button><button className="secondary-action" disabled={busy || !selectedAlert || reviewReason.trim().length < 2} onClick={() => void updateAlert("cleared")}>{c.clearAlert}</button><button className="secondary-action" disabled={busy || !selectedAlert || reviewReason.trim().length < 2} onClick={() => void updateAlert("reported")}>{c.markReported}</button></div>
          <form className="settings-editor" onSubmit={saveCase}><h3>{c.saveCase}</h3><label>{c.reviewStatus}<select value={caseStatus} onChange={(event) => setCaseStatus(event.target.value)}><option value="draft">{p(language, "draft")}</option><option value="ready">{c.ready}</option><option value="submitted">{c.submitted}</option><option value="closed">{c.closed}</option></select></label><label>{c.caseNotes}<textarea value={caseNotes} onChange={(event) => setCaseNotes(event.target.value)} /></label>{caseStatus === "submitted" && <label>{c.submissionReference}<input required minLength={2} value={submissionReference} onChange={(event) => setSubmissionReference(event.target.value)} /></label>}<button className="primary-action" disabled={busy || !selectedAlert}>{c.saveCase}</button></form>
        </article>
      </div>}
      {message && <div className="settings-save-message saved" role="status">{message}</div>}
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
