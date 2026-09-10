import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useMatch, useMatches, useNavigate, useParams } from "react-router-dom";
import type { WorkspaceOutletContext, WorkspaceRouteHandle } from "./app/router";
import Decimal from "decimal.js";
import "./App.css";
import "./professional.css";
import "./styles/calm-premium.css";
import { validateClientEnvironment } from "./lib/env";
import { readPublicSupabaseConfig } from "./lib/supabase";
import { deriveTradeAmounts } from "./domain/tradePricing";
import type { InlineRatePublication } from "./domain/commands";
import { buildCsvReport } from "./domain/reporting";
import { isRtl, translate, type Language } from "./lib/i18n";
import { ux } from "./lib/uxCopy";
import {
  getTransactionRateContext,
  getMyResumableApprovalDraft,
  getTransactionDetail,
  createFinancialReportSnapshot,
  getReconciliationWorkspace,
  listCurrencyCatalog,
  listMoneyAccounts,
  getReceiptForJournalEntry,
  getOwnerDashboard,
  getWorkspaceSettings,
  getTeamControlPlane,
  getMembershipCapabilityMatrix,
  getMyWorkspaceContext,
  acceptTeamInvitation,
  acceptTeamConnectionCode,
  requestBusinessAccess,
  listWorkerJoinRequests,
  createOrganizationJoinCode,
  reviewWorkerJoinRequest,
  cancelTeamInvitation,
  createTeamInvitation,
  createCounterparty,
  decideApproval,
  getPrivateCounterpartyDocuments,
  getPrivateDocumentUrl,
  listCashboxBalances,
  listCounterparties,
  getCounterpartyDetail,
  listCounterpartyStatement,
  listDebts,
  getDebtDetail,
  listHawalaTransfers,
  listHawalaPartners,
  findHawalaPayout,
  getHawalaPartnerStatement,
  searchJournalEntries,
  listRateHistory,
  listReportExports,
  postFxTrade,
  requestFxTradeApproval,
  resumeApprovedFxTrade,
  recordCashboxClose,
  approveCashboxClose,
  rejectCashboxClose,
  recordDebt,
  recordHawalaSend,
  recordHawalaIncoming,
  payHawalaBeneficiary,
  requestHawalaPayoutApproval,
  resumeApprovedHawalaPayout,
  settleHawalaPartner,
  recordOpeningBalance,
  recordOperation,
  recordReportExport,
  registerBrowserDevice,
  revokeTeamDevice,
  requestReversal,
  settleDebt,
  updateTeamMembership,
  updateTeamAssignment,
  trustTeamDevice,
  uploadPrivateCounterpartyDocument,
  type DashboardSnapshot,
  type CounterpartyRecord,
  type DebtRecord,
  type HawalaTransferRecord,
  type HawalaPartnerRecord,
  type HawalaPayoutMatch,
  type HawalaPartnerStatement,
  type JournalRecord,
  type CurrencyCatalogRecord,
  type MoneyAccountRecord,
  type TeamMemberRecord,
  type TeamInvitationRecord,
  type TeamScopeRecord,
  type WorkerJoinRequestRecord,
  type MembershipCapabilityMatrixRecord,
  type CreatedTeamInvitation,
  type DeviceRecord,
  type LinkedDeviceRecord,
  type WorkspaceContextRecord,
  type ApprovalRecord,
  type ResumableApprovalDraft,
  type PrivateDocumentRecord,
  type NotificationRecord,
  type NamedReportRow,
  type ReconciliationCloseRecord,
  type ReportExportRecord,
  type FinancialReportSnapshot,
  listNotifications,
  markNotificationState,
} from "./lib/financialApi";
import { getSupabaseClient } from "./lib/supabase";
import { businessDateInTimeZone } from "./lib/businessTime";
import { createBusiness } from "./lib/onboarding";
import {
  sendPasswordReset,
  enrollTotp,
  getMfaReadiness,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  subscribeToOrganizationActivity,
  verifyTotp,
  type DetailedAuthResult,
  type MfaReadiness,
  type TotpEnrollment,
} from "./lib/auth";
import {
  BrowserDocumentCaptureProvider,
  type DocumentType,
  validateDocumentFile,
} from "./lib/integrations";
import { OfflineDraftBook } from "./lib/offline";
import { indexedDbOfflineStore } from "./lib/offlineStore";
import { AppIcon, type AppIconName } from "./AppIcon";
import type { CompletedTrade } from "./ProfessionalWorkspace";
import { getPublicPlatformStatus, type PublicPlatformStatus } from "./lib/platformApi";
import {
  canOpenSection,
  hasAnyCapability,
  hasCapability,
  inspectionCapabilities,
  navigationSections,
  type Capability,
  type WorkspaceRole,
} from "./app/capabilities";
import { capabilityForFinancialRoute, financialRoute, financialRouteSuffix, workspaceRoot, workspaceSectionPath } from "./app/routes";
import type { InlineRateResolverProps } from "./features/rates/InlineRateResolver";
import { ReferenceScanner } from "./features/hawala/ReferenceScanner";

const loadExports = () => import("./lib/exports");
const ImportWorkspace = lazy(() => import("./ImportWorkspace").then((module) => ({ default: module.ImportWorkspace })));
const OpeningExperience = lazy(() => import("./OpeningExperience").then((module) => ({ default: module.OpeningExperience })));
const TransactionCenter = lazy(() => import("./features/transactions/TransactionCenter").then((module) => ({ default: module.TransactionCenter })));
const ManageSarafi = lazy(() => import("./features/manage/ManageSarafi").then((module) => ({ default: module.ManageSarafi })));
const RoleHome = lazy(() => import("./features/home/RoleHome").then((module) => ({ default: module.RoleHome })));
const LazyInlineRateResolver = lazy(() => import("./features/rates/InlineRateResolver").then((module) => ({ default: module.InlineRateResolver })));
const SettingsView = lazy(() => import("./ProfessionalWorkspace").then((module) => ({ default: module.SettingsView })));
const ComplianceView = lazy(() => import("./ProfessionalWorkspace").then((module) => ({ default: module.ComplianceView })));
const ReceiptSuccessDialog = lazy(() => import("./ProfessionalWorkspace").then((module) => ({ default: module.ReceiptSuccessDialog })));
const BillingView = lazy(() => import("./PlatformWorkspace").then((module) => ({ default: module.BillingView })));
const PlatformAdminConsole = lazy(() => import("./PlatformWorkspace").then((module) => ({ default: module.PlatformAdminConsole })));

const openingSessionKey = "sarafi-opening-seen";

function InlineRateResolver(props: InlineRateResolverProps) {
  const loading = props.language === "en"
    ? "Checking the approved shop rate…"
    : props.language === "fa-AF"
      ? "بررسی نرخ تأییدشده صرافی…"
      : "د صرافۍ تایید شوی نرخ کتل کېږي…";
  return (
    <Suspense fallback={<section className="rate-context-card" role="status">{loading}</section>}>
      <LazyInlineRateResolver {...props} />
    </Suspense>
  );
}

const helpGuides = {
  en: [
    ["Start the shop", "The owner creates the shop, names the main branch and cashbox, chooses currencies, then records the money already on hand."],
    ["Opening money", "Use Opening money once for cash the shop had before SARAFI. Choose its real location and enter each currency in its native amount; it is not income or profit."],
    ["Buy, sell, or exchange", "Choose what the shop is doing, the two currencies, customer, amount, rate, and cashbox. Review both money directions before saving."],
    ["Debts and payments", "Create a debt under the correct person and choose who owes whom. Each payment reduces the remaining amount and stays in that person’s statement."],
    ["Transfers, income, and expenses", "Always choose the real source and destination account. Transfers move money inside the shop; income and expenses explain why money changed."],
    ["Close a cashbox", "Count each currency, compare it with SARAFI, and explain any difference. A manager or owner reviews differences."],
    ["Correct a transaction", "Open Transactions, choose the original record, and request a reversal with a clear reason. SARAFI keeps both records for audit."],
    ["Add an employee", "The owner creates an invitation, chooses the job, branch, and cashbox. The employee opens that link and signs in with their own account."],
    ["Revoke a device", "Open Team & Devices, select the device, enter a reason, and confirm two-step security. Revoked devices cannot post money."],
    ["Reports and payments", "Choose the report and filters, then export PDF or CSV. Only the owner can manage the SARAFI plan and submit a payment reference."],
  ],
  "fa-AF": [
    ["آغاز کار صرافی", "مالک صرافی را می‌سازد، نام شعبه و صندوق اصلی را می‌نویسد، اسعار را انتخاب و سپس پول موجود آغاز کار را ثبت می‌کند."],
    ["پول آغاز کار", "این بخش را تنها برای پولی استفاده کنید که پیش از سرافی در صرافی موجود بود. جای واقعی پول و مبلغ همان اسعار را بنویسید؛ این پول عاید یا مفاد نیست."],
    ["خرید، فروش یا تبادله", "نوع معامله، دو اسعار، مشتری، مبلغ، نرخ و صندوق را انتخاب کنید. پیش از ثبت، پول ورودی و خروجی را یک‌بار بررسی کنید."],
    ["طلب، قرض و پول آن", "قرض را زیر نام شخص درست ثبت کنید و روشن بسازید مردم به ما قرضدار اند یا ما به مردم. هر پولی که می‌گیریم یا می‌دهیم، مبلغ باقی را کم می‌کند."],
    ["انتقال، عاید و مصرف", "همیشه حساب واقعی آغاز و پایان را انتخاب کنید. انتقال، پول را داخل صرافی جابه‌جا می‌کند؛ عاید و مصرف دلیل تغییر پول را ثبت می‌کند."],
    ["بستن صندوق", "هر اسعار را بشمارید، با مبلغ سرافی مقایسه و دلیل هر تفاوت را بنویسید. مدیر یا مالک تفاوت را بررسی می‌کند."],
    ["اصلاح معامله", "در معاملات، ثبت اصلی را باز و با دلیل روشن درخواست برگشت بدهید. سرافی هر دو ثبت را برای بررسی نگه می‌دارد."],
    ["افزودن کارمند", "مالک دعوت‌نامه می‌سازد و وظیفه، شعبه و صندوق را تعیین می‌کند. کارمند لینک را باز و با حساب خودش وارد می‌شود."],
    ["لغو دستگاه", "در کارمندان و دستگاه‌ها، دستگاه را انتخاب، دلیل را نوشته و امنیت دومرحله‌ای را تأیید کنید. دستگاه لغوشده عملیات پولی ثبت نمی‌کند."],
    ["گزارش و پرداخت", "نوع گزارش و فلترها را انتخاب و PDF یا CSV بگیرید. تنها مالک بسته سرافی را اداره و شماره پرداخت را می‌فرستد."],
  ],
  "ps-AF": [
    ["د صرافۍ کار پیلول", "مالک صرافي جوړوي، د اصلي څانګې او صندوق نوم لیکي، اسعار ټاکي او بیا له پخوا موجودې پیسې ثبتوي."],
    ["پیل پیسې", "دا برخه یوازې د هغو پیسو لپاره وکاروئ چې تر سرافي مخکې موجودې وې. اصلي ځای او د هماغو اسعارو مبلغ ولیکئ؛ دا عاید یا ګټه نه ده."],
    ["پېرود، پلور یا تبادله", "د معاملې ډول، دواړه اسعار، پېرودونکی، مبلغ، نرخ او صندوق وټاکئ. تر ثبت مخکې د پیسو دواړه لوري وګورئ."],
    ["پورونه او ورکړې", "پور د سم کس په نوم ثبت او روښانه کړئ چې څوک پوروړی دی. هره ورکړه پاتې مبلغ کموي او د کس په حساب کې پاتې کېږي."],
    ["لېږد، عاید او لګښت", "تل د پیسو رښتینې سرچینه او منزل وټاکئ. لېږد پیسې د صرافۍ دننه خوځوي؛ عاید او لګښت د بدلون دلیل ثبتوي."],
    ["صندوق تړل", "هر اسعار وشمېرئ، د سرافي له مبلغ سره یې پرتله او د هر توپیر دلیل ولیکئ. مدیر یا مالک توپیر ګوري."],
    ["معامله سمول", "معاملو ته لاړ شئ، اصلي ثبت پرانیزئ او په روښانه دلیل د بېرته راګرځولو غوښتنه وکړئ. سرافي دواړه ثبتونه ساتي."],
    ["کارکوونکی زیاتول", "مالک بلنه جوړوي او دنده، څانګه او صندوق ټاکي. کارکوونکی لینک پرانیزي او په خپل حساب ننوځي."],
    ["وسیله لغوه کول", "په کارکوونکو او وسایلو کې وسیله وټاکئ، دلیل ولیکئ او دوه پړاوه امنیت تایید کړئ. لغوه وسیله مالي ثبت نشي کولای."],
    ["راپور او تادیه", "راپور او فلټرونه وټاکئ، بیا PDF یا CSV واخلئ. یوازې مالک د سرافي بسته اداره کوي او د تادیې شمېره لېږي."],
  ],
} satisfies Record<Language, Array<[string, string]>>;

const notificationUi = {
  en: { title: "Notifications", empty: "You are up to date.", open: "Open notifications", dismiss: "Dismiss", approval_required: "A team action is waiting for your review.", compliance_alert: "A compliance alert needs review.", cashbox_variance: "A cashbox count has a difference." },
  "fa-AF": { title: "خبرها", empty: "خبر تازه‌ای ندارید.", open: "بازکردن خبرها", dismiss: "پاک‌کردن", approval_required: "یک عملیات کارمند منتظر بررسی شما است.", compliance_alert: "یک هشدار رعایت اصول باید بررسی شود.", cashbox_variance: "در شمارش صندوق تفاوت پیدا شده است." },
  "ps-AF": { title: "خبرتیاوې", empty: "نوې خبرتیا نشته.", open: "خبرتیاوې پرانیستل", dismiss: "لرې کول", approval_required: "د کارکوونکي یو کار ستاسو کتنې ته منتظر دی.", compliance_alert: "یوه اصولي خبرتیا کتنې ته اړتیا لري.", cashbox_variance: "د صندوق په شمېرنه کې توپیر شته." },
} satisfies Record<Language, Record<string, string>>;

const searchUi = {
  en: { open: "Search the whole shop", placeholder: "Find a person, account, or transaction", empty: "No matching record was found.", people: "Person", account: "Money account", transaction: "Transaction" },
  "fa-AF": { open: "جستجو در تمام صرافی", placeholder: "پیداکردن شخص، حساب یا معامله", empty: "ثبت مطابق پیدا نشد.", people: "شخص", account: "حساب پول", transaction: "معامله" },
  "ps-AF": { open: "په ټوله صرافۍ کې لټون", placeholder: "کس، حساب یا معامله پیدا کړئ", empty: "برابر ثبت ونه موندل شو.", people: "کس", account: "د پیسو حساب", transaction: "معامله" },
} satisfies Record<Language, Record<string, string>>;

const reportHistoryUi = {
  en: { title: "Recent exports", empty: "No report has been exported yet.", created: "Created" },
  "fa-AF": { title: "گزارش‌های صادرشده اخیر", empty: "هنوز گزارشی صادر نشده است.", created: "ساخته‌شده" },
  "ps-AF": { title: "وروستي صادر شوي راپورونه", empty: "تر اوسه کوم راپور نه دی صادر شوی.", created: "جوړ شوی" },
} satisfies Record<Language, Record<string, string>>;

function formatFinancialAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  try {
    const rounded = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (!rounded.isFinite()) return String(value);
    const fixed = rounded.isZero() ? "0.00" : rounded.toFixed(2);
    const negative = fixed.startsWith("-");
    const unsigned = negative ? fixed.slice(1) : fixed;
    const [whole, fraction] = unsigned.split(".");
    return `${negative ? "-" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
  } catch {
    return String(value);
  }
}

function shouldShowOpening(inspectionMode: boolean): boolean {
  if (window.location.pathname === "/platform-admin") return false;
  const params = new URLSearchParams(window.location.search);
  const replayRequested = params.get("opening") === "replay";
  const handoffRequested = ["skip", "handoff"].includes(
    params.get("opening") ?? "",
  );
  if (
    inspectionMode ||
    (import.meta.env.MODE === "e2e" && !replayRequested) ||
    handoffRequested ||
    params.has("invite") ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  )
    return false;
  if (replayRequested) return true;
  try {
    return window.sessionStorage.getItem(openingSessionKey) !== "1";
  } catch {
    return true;
  }
}

function rememberOpening(): void {
  try {
    window.sessionStorage.setItem(openingSessionKey, "1");
  } catch {
    // The handoff still works when storage is unavailable.
  }
}

function localizedAuthError(
  language: Language,
  result: Pick<DetailedAuthResult, "errorCode" | "status">,
): string {
  const code = result.errorCode ?? "";
  if (result.status === 429 || code.includes("rate_limit"))
    return ux(language, "authTooManyAttempts");
  if (code === "invalid_credentials" || code === "invalid_grant")
    return ux(language, "authInvalidCredentials");
  if (code === "email_not_confirmed")
    return ux(language, "authEmailNotConfirmed");
  if (code === "request_timeout")
    return ux(language, "authRequestTimedOut");
  if (code === "network_error")
    return ux(language, "authServiceUnreachable");
  if (code === "supabase_not_configured")
    return ux(language, "authConfigurationError");
  return ux(language, "requestFailed");
}

function localizedInvitationError(language: Language, error: string): string {
  const message = error.toLowerCase();
  if (message.includes("expired")) return ux(language, "invitationExpired");
  if (message.includes("email address") || message.includes("invited email"))
    return ux(language, "invitationWrongAccount");
  return ux(language, "invitationInvalid");
}

function localizedFinancialError(language: Language, error: string | null, fallback: string): string {
  if (!error) return fallback;
  const code = error.toUpperCase();
  const message = (en: string, dari: string, pashto: string) => language === "en" ? en : language === "fa-AF" ? dari : pashto;
  if (code.includes("RATE_MISSING") || code.includes("RATE_STALE") || code.includes("RATE_RESOLUTION"))
    return message("Resolve the accounting rate in this task before saving.", "پیش از ثبت، نرخ حسابداری را در همین کار حل کنید.", "له ثبت مخکې حسابي نرخ په همدې کار کې حل کړئ.");
  if (code.includes("RATE_APPROVAL_REQUIRED") || code.includes("APPROVAL_REQUIRED"))
    return message("Manager approval is required. Your draft has been kept.", "تأیید مدیر لازم است. پیش‌نویس شما محفوظ مانده است.", "د مدیر تایید اړین دی. ستاسو مسوده خوندي ده.");
  if (code.includes("CAPABILITY_REQUIRED") || code.includes("WORKSPACE_ACCESS_REQUIRED"))
    return message("Your assigned access does not allow this action.", "دسترسی تعیین‌شده شما این کار را اجازه نمی‌دهد.", "ستاسو ټاکل شوی لاسرسی د دې کار اجازه نه ورکوي.");
  if (code.includes("DEVICE") || code.includes("AAL2") || code.includes("MFA"))
    return message("Use a trusted device and complete two-step security before continuing.", "پیش از ادامه از دستگاه قابل اعتماد استفاده کرده و امنیت دومرحله‌ای را تکمیل کنید.", "له دوام مخکې باوري وسیله وکاروئ او دوه پړاوه امنیت بشپړ کړئ.");
  if (code.includes("MONEY_ACCOUNT") || code.includes("BRANCH_UNAVAILABLE"))
    return message("Choose an active money account in your assigned branch.", "یک حساب پول فعال در شعبه تعیین‌شده انتخاب کنید.", "په خپلې ټاکل شوې څانګه کې یو فعال پولي حساب وټاکئ.");
  if (code.includes("BALANCE") || code.includes("INVENTORY") || code.includes("NEGATIVE_CASH"))
    return message("The selected account does not have enough available money.", "حساب انتخاب‌شده پول کافی در دسترس ندارد.", "ټاکل شوی حساب کافي موجودې پیسې نه لري.");
  if (code.includes("REFERENCE_AMBIGUOUS") || code.includes("REVIEW_REQUIRED"))
    return message("This record needs compliance review before it can continue.", "این رکورد پیش از ادامه به بررسی مطابقت نیاز دارد.", "دا ریکارډ له دوام مخکې د مطابقت کتنې ته اړتیا لري.");
  if (code.includes("KYC") || code.includes("IDENTITY_REQUIRED"))
    return message("Complete the required identity check before continuing.", "پیش از ادامه بررسی لازم هویت را تکمیل کنید.", "له دوام مخکې اړینه پېژندپاڼې کتنه بشپړه کړئ.");
  if (code.includes("IDEMPOTENCY_CONFLICT"))
    return message("This draft identifier was already used for another transaction. Reopen the task and try again.", "شناسه این پیش‌نویس قبلاً برای معامله دیگری استفاده شده است. کار را دوباره باز کرده و کوشش کنید.", "د دې مسودې پېژند مخکې د بلې معاملې لپاره کارول شوی. کار بیا پرانیزئ او هڅه وکړئ.");
  return fallback;
}

type Trade = {
  id: string | number;
  customer: string;
  direction: string;
  amount: string;
  rate: string;
  time: string;
  status: string;
};
type OperationKind =
  | "RECEIVE_MONEY"
  | "PAY_MONEY"
  | "TRANSFER_CASH"
  | "RECORD_EXPENSE"
  | "RECORD_INCOME"
  | "OWNER_INVESTMENT"
  | "OWNER_WITHDRAWAL"
  | "BANK_DEPOSIT"
  | "BANK_WITHDRAWAL";
type MarketRateRow = {
  currency: string;
  buy: string;
  sell: string;
  quotedUnits: number;
};
const inspectionCurrencies: CurrencyCatalogRecord[] = [
  ["AFN", "Afghan Afghani", "افغانی", "افغانۍ", "؋"],
  ["USD", "United States Dollar", "دالر امریکایی", "امریکايي ډالر", "$"],
  ["EUR", "Euro", "یورو", "یورو", "€"],
  ["AED", "UAE Dirham", "درهم امارات", "اماراتي درهم", "د.إ"],
  ["PKR", "Pakistani Rupee", "روپیه پاکستانی", "پاکستانۍ روپۍ", "₨"],
  ["GBP", "British Pound", "پوند انگلیس", "بریتانوي پونډ", "£"],
  ["SAR", "Saudi Riyal", "ریال سعودی", "سعودي ریال", "﷼"],
  ["CNY", "Chinese Yuan", "یوان چین", "چینايي یوان", "¥"],
  ["INR", "Indian Rupee", "روپیه هندی", "هندي روپۍ", "₹"],
].map(([code, name_en, name_dari, name_pashto, symbol]) => ({
  code,
  name_en,
  name_dari,
  name_pashto,
  symbol,
  minor_unit: 2,
  enabled: true,
}));

function currencyName(language: Language, currency: CurrencyCatalogRecord) {
  return language === "fa-AF"
    ? currency.name_dari
    : language === "ps-AF"
      ? currency.name_pashto
      : currency.name_en;
}

function inspectionMoneyAccounts(language: Language): MoneyAccountRecord[] {
  return [
    {
      id: "inspection-cashbox",
      name: ux(language, "previewCashboxName"),
      account_type: "cashbox",
      branch_id: "inspection-branch",
      cashbox_id: "inspection-cashbox-id",
      reference_label: null,
      active: true,
      balances: [
        { currency: "AFN", amount: "1250000" },
        { currency: "USD", amount: "18000" },
      ],
    },
    {
      id: "inspection-safe",
      name: ux(language, "previewSafeName"),
      account_type: "safe",
      branch_id: "inspection-branch",
      cashbox_id: null,
      reference_label: null,
      active: true,
      balances: [{ currency: "AFN", amount: "450000" }],
    },
    {
      id: "inspection-bank",
      name: ux(language, "previewBankName"),
      account_type: "bank",
      branch_id: null,
      cashbox_id: null,
      reference_label: ux(language, "previewBankReference"),
      active: true,
      balances: [{ currency: "AFN", amount: "300000" }],
    },
  ];
}

function inspectionDashboard(language: Language): DashboardSnapshot {
  return {
    transaction_count: 7,
    buy_count: 3,
    sell_count: 3,
    exchange_count: 1,
    volume_base: "1255000",
    realized_profit: "18450",
    commission_income: "2500",
    expenses: "4200",
    net_result: "16750",
    net_position_base: "3265250",
    reconciliation_differences: "0",
    pending_approvals: 1,
    fresh_at: new Date().toISOString(),
    positions: [
      { currency: "AFN", quantity: "2000000", carrying_base_value: "2000000" },
      { currency: "USD", quantity: "18000", carrying_base_value: "1264500" },
      { currency: "EUR", quantity: "750", carrying_base_value: "52500" },
    ],
    locations: [
      { location_id: "inspection-cashbox-id", location_type: "cashbox", location_name: ux(language, "previewCashboxName"), currency: "AFN", quantity: "1250000" },
      { location_id: "inspection-cashbox-id", location_type: "cashbox", location_name: ux(language, "previewCashboxName"), currency: "USD", quantity: "18000" },
      { location_id: "inspection-safe", location_type: "account", location_name: ux(language, "previewSafeName"), currency: "AFN", quantity: "450000" },
      { location_id: "inspection-bank", location_type: "bank", location_name: ux(language, "previewBankName"), currency: "AFN", quantity: "300000" },
      { location_id: "inspection-bank", location_type: "bank", location_name: ux(language, "previewBankName"), currency: "EUR", quantity: "750" },
    ],
    receivables: [{ currency: "AFN", amount: "18000" }],
    payables: [{ currency: "USD", amount: "250" }],
    activity: [],
  };
}

function App() {
  validateClientEnvironment();
  const location = useLocation();
  const matches = useMatches();
  const navigate = useNavigate();
  const platformAdminRoute = location.pathname === "/platform-admin";
  const inspectionMode =
    !new URLSearchParams(location.search).has("public") &&
    (import.meta.env.MODE === "e2e" ||
      (import.meta.env.DEV &&
        import.meta.env.VITE_AUTH_GATE_DISABLED === "true"));
  const inspectionRateScenario = inspectionMode
    ? new URLSearchParams(location.search).get("rate")
    : null;
  const emptyWorkspaceInspection = inspectionMode && new URLSearchParams(location.search).get("workspace") === "empty";
  const platformInspectionPreview = platformAdminRoute && inspectionMode && new URLSearchParams(location.search).get("preview") === "1";
  const supabaseConfigured = Boolean(readPublicSupabaseConfig());
  const [showOpening, setShowOpening] = useState(() =>
    shouldShowOpening(inspectionMode),
  );
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!["skip", "handoff"].includes(url.searchParams.get("opening") ?? ""))
      return;
    rememberOpening();
    url.searchParams.delete("opening");
    navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true });
  }, [navigate]);
  const completeOpening = useCallback(() => {
    rememberOpening();
    const url = new URL(window.location.href);
    url.searchParams.delete("opening");
    url.searchParams.delete("openingSpeed");
    navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true });
    setShowOpening(false);
  }, [navigate]);
  const matchedSection = [...matches].reverse().find((match) =>
    typeof (match.handle as WorkspaceRouteHandle | undefined)?.section === "string"
  )?.handle as WorkspaceRouteHandle | undefined;
  const activeSection = matchedSection?.section === "Compliance Reviews" && new URLSearchParams(location.search).get("view") === "cases"
    ? "Compliance Cases"
    : matchedSection?.section ?? "Dashboard";
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>(() =>
    inspectionMode
      ? [{ id: "inspection-notice", notification_type: "approval_required", subject_id: "preview", message: "", status: "unread", created_at: new Date().toISOString() }]
      : [],
  );
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingCurrency, setOpeningCurrency] = useState("AFN");
  const [openingRatePublication, setOpeningRatePublication] = useState<InlineRatePublication>();
  const [openingRateReady, setOpeningRateReady] = useState(true);
  const [operationKind, setOperationKind] = useState<OperationKind | null>(
    null,
  );
  const [operationAmount, setOperationAmount] = useState("");
  const [operationCurrency, setOperationCurrency] = useState("AFN");
  const [operationRatePublication, setOperationRatePublication] = useState<InlineRatePublication>();
  const [operationRateReady, setOperationRateReady] = useState(true);
  const [operationSourceAccount, setOperationSourceAccount] = useState("");
  const [operationDestinationAccount, setOperationDestinationAccount] =
    useState("");
  const [operationCategory, setOperationCategory] = useState("Other");
  const [operationMemo, setOperationMemo] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [language, setLanguage] = useState<Language>(() => {
    const requested = new URLSearchParams(window.location.search).get("lang");
    if (requested === "en" || requested === "fa-AF" || requested === "ps-AF") return requested;
    const saved = window.localStorage.getItem("sarafi-language");
    return saved === "fa-AF" || saved === "ps-AF" ? saved : "en";
  });
  const [online, setOnline] = useState(
    inspectionMode ? true : navigator.onLine,
  );
  const [clientUpdateAvailable, setClientUpdateAvailable] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [, setDashboardError] = useState("");
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const [amount, setAmount] = useState("");
  const [tradeSide, setTradeSide] = useState<
    "BUY_FX" | "SELL_FX" | "EXCHANGE_FX"
  >("BUY_FX");
  const [tradeCurrency, setTradeCurrency] = useState("USD");
  const [tradeReceiveCurrency, setTradeReceiveCurrency] = useState("EUR");
  const [tradeExchangeRate, setTradeExchangeRate] = useState("");
  const [tradeReceiveBuyRate, setTradeReceiveBuyRate] = useState(
    inspectionMode && inspectionRateScenario !== "missing" ? "75.10" : "",
  );
  const [exchangeSourceRatePublication, setExchangeSourceRatePublication] =
    useState<InlineRatePublication>();
  const [exchangeTargetRatePublication, setExchangeTargetRatePublication] =
    useState<InlineRatePublication>();
  const [exchangeSourceRateReady, setExchangeSourceRateReady] = useState(
    inspectionRateScenario === "current",
  );
  const [exchangeTargetRateReady, setExchangeTargetRateReady] = useState(
    inspectionRateScenario === "current",
  );
  const [tradeFee, setTradeFee] = useState("");
  const [tradeNote, setTradeNote] = useState("");
  const [tradeCounterparty, setTradeCounterparty] = useState("");
  const [tradeCounterparties, setTradeCounterparties] = useState<CounterpartyRecord[]>([]);
  const [counterpartyRefresh, setCounterpartyRefresh] = useState(0);
  const [tradeBusy, setTradeBusy] = useState(false);
  const [fxApprovalDraft, setFxApprovalDraft] = useState<ResumableApprovalDraft | null>(null);
  const [fxApprovalBusy, setFxApprovalBusy] = useState(false);
  const [tradeCommandId, setTradeCommandId] = useState(() => crypto.randomUUID());
  const [tradeReviewing, setTradeReviewing] = useState(false);
  const [completedTrade, setCompletedTrade] = useState<CompletedTrade | null>(
    null,
  );
  const [rate, setRateState] = useState(
    inspectionMode && inspectionRateScenario !== "missing" ? "70.25" : "",
  );
  const [sellRate, setSellRate] = useState(
    inspectionMode && inspectionRateScenario !== "missing" ? "70.35" : "",
  );
  const [rateContext, setRateContext] = useState<{
    stale: boolean;
    missing: boolean;
    effectiveFrom?: string;
    tolerance: string;
    toleranceBps: string;
  }>(() => ({
    stale: inspectionRateScenario === "stale" || inspectionRateScenario === "missing",
    missing: inspectionRateScenario === "missing",
    effectiveFrom:
      inspectionRateScenario === "stale"
        ? new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
        : inspectionRateScenario === "missing"
          ? undefined
          : new Date().toISOString(),
    tolerance: "0.10",
    toleranceBps: "50",
  }));
  const [tradeReceiveRateContext, setTradeReceiveRateContext] = useState<{
    stale: boolean;
    missing: boolean;
    effectiveFrom?: string;
    toleranceBps: string;
  }>(() => ({
    stale: inspectionRateScenario === "stale",
    missing: inspectionRateScenario === "missing",
    effectiveFrom:
      inspectionRateScenario === "missing"
        ? undefined
        : new Date().toISOString(),
    toleranceBps: "50",
  }));
  const [rateOverrideEnabled, setRateOverrideEnabled] = useState(false);
  const [rateOverride, setRateOverride] = useState("");
  const [publishRate, setPublishRate] = useState(false);
  const [allowStaleRate, setAllowStaleRate] = useState(false);
  const [dashboardDate, setDashboardDate] = useState(() =>
    businessDateInTimeZone(new Date(), "Asia/Kabul"),
  );
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!inspectionMode || inspectionRateScenario !== "stale") return;
    const timer = window.setTimeout(() => setToast(language === "en" ? "The approved rate is older than one day; review it before posting." : language === "fa-AF" ? "نرخ تأییدشده بیشتر از یک روز قدیمی است؛ پیش از ثبت آن را بررسی کنید." : "تایید شوی نرخ له یوې ورځې زوړ دی؛ له ثبت مخکې یې وګورئ."), 0);
    return () => window.clearTimeout(timer);
  }, [inspectionMode, inspectionRateScenario, language]);
  const [platformStatus, setPlatformStatus] = useState<PublicPlatformStatus | null>(null);
  useEffect(() => {
    if (!supabaseConfigured || inspectionMode) return;
    void getPublicPlatformStatus().then((result) => {
      if (result.data) setPlatformStatus(result.data);
    });
  }, [inspectionMode, supabaseConfigured]);
  const [organizationId, setOrganizationId] = useState<string | null>(
    inspectionMode && !emptyWorkspaceInspection ? "inspection" : null,
  );
  const [organizationName, setOrganizationName] = useState(
    inspectionMode && !emptyWorkspaceInspection ? "Kabul Central Exchange" : "",
  );
  const [branchId, setBranchId] = useState<string | null>(
    inspectionMode && !emptyWorkspaceInspection ? "inspection-branch" : null,
  );
  const [branchName, setBranchName] = useState(
    inspectionMode && !emptyWorkspaceInspection ? "Main branch" : "",
  );
  const [cashboxId, setCashboxId] = useState<string | null>(
    inspectionMode && !emptyWorkspaceInspection ? "inspection-cashbox-id" : null,
  );
  const [workspaceContexts, setWorkspaceContexts] = useState<WorkspaceContextRecord[]>([]);
  const [activeMembershipId, setActiveMembershipId] = useState("");
  const [linkedDevice, setLinkedDevice] = useState<LinkedDeviceRecord | null>(
    inspectionMode
      ? { id: "inspection-device", friendly_name: "Inspection browser", status: "trusted", last_seen_at: new Date().toISOString(), revoked_at: null }
      : null,
  );
  const [loadedCurrencyCatalog, setCurrencyCatalog] = useState<
    CurrencyCatalogRecord[]
  >([]);
  const [loadedMoneyAccounts, setMoneyAccounts] = useState<MoneyAccountRecord[]>([]);
  const [enabledFeatureCodes, setEnabledFeatureCodes] = useState<string[]>(
    inspectionMode ? ["hawala"] : [],
  );
  const currencyCatalog = inspectionMode
    ? inspectionCurrencies
    : loadedCurrencyCatalog;
  const moneyAccounts = useMemo(
    () => inspectionMode
      ? inspectionMoneyAccounts(language)
      : organizationId
        ? loadedMoneyAccounts
        : [],
    [inspectionMode, language, loadedMoneyAccounts, organizationId],
  );
  const [moneyContextRefresh, setMoneyContextRefresh] = useState(0);
  const [workspaceActivityRefresh, setWorkspaceActivityRefresh] = useState(0);
  const [organizationLoading, setOrganizationLoading] =
    useState(!inspectionMode);
  const [businessName, setBusinessName] = useState("");
  const [onboardingCurrencies, setOnboardingCurrencies] = useState([
    "AFN",
    "USD",
  ]);
  const [onboardingCashboxName, setOnboardingCashboxName] =
    useState(() => ux(language, "previewCashboxName"));
  const [onboardingBranchName, setOnboardingBranchName] = useState(() =>
    ux(language, "mainBranchPlaceholder"),
  );
  const [user, setUser] = useState<import("@supabase/supabase-js").User | null>(
    null,
  );
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole>(
    inspectionMode &&
      [
        "owner",
        "business_admin",
        "manager",
        "accountant",
        "cashier",
        "compliance_officer",
        "viewer",
      ].includes(new URLSearchParams(window.location.search).get("role") ?? "")
      ? (new URLSearchParams(window.location.search).get(
          "role",
        ) as WorkspaceRole)
      : inspectionMode
        ? "owner"
        : "viewer",
  );
  const [inviteToken, setInviteToken] = useState(() => {
    const token = new URLSearchParams(window.location.search).get("invite") ?? "";
    return /^[a-f0-9]{64}$/i.test(token) ? token : "";
  });
  const [invitationFailure, setInvitationFailure] = useState("");
  const [workspaceEntryMode, setWorkspaceEntryMode] = useState<"join" | "business">("join");
  const [connectionCode, setConnectionCode] = useState("");
  const [connectionKind, setConnectionKind] = useState<"invitation" | "request">("invitation");
  const [connectionName, setConnectionName] = useState("");
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState("");
  const [authMode, setAuthMode] = useState<"signIn" | "signUp" | "reset">(
    "signIn",
  );
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authFullName, setAuthFullName] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authMessageKind, setAuthMessageKind] = useState<
    "error" | "success" | null
  >(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [browserDeviceId] = useState(() => {
    const key = "sarafi-browser-device-id";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(key, created);
    return created;
  });
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const controlLabel = language === "en" ? "Control" : language === "fa-AF" ? "کنترول" : "کنټرول";
  const sectionLabel = (section: string) =>
    ({
      Dashboard: t("dashboard"),
      Trade: t("trade"),
      Transactions: t("transactions"),
      "Cash & Accounts": t("cashAccounts"),
      People: t("people"),
      Debts: t("debts"),
      Rates: t("rates"),
      Reports: t("reports"),
      Reconciliation: t("reconciliation"),
      "Team & Devices": t("teamDevices"),
      Control: controlLabel,
      "Business Settings": t("settings"),
      Import: u("importData"),
      Hawala: t("hawala"),
      Compliance: u("compliance"),
      "Compliance Reviews": language === "en" ? "Reviews" : language === "fa-AF" ? "بررسی‌ها" : "څېړنې",
      "Compliance Cases": language === "en" ? "Cases" : language === "fa-AF" ? "قضایا" : "قضیې",
      "Cashbox Close": language === "en" ? "Close cashbox" : language === "fa-AF" ? "بستن صندوق" : "صندوق تړل",
      Billing: u("planPayment"),
    })[section] ?? section;
  const refreshNotifications = useCallback(async () => {
    if (!organizationId || organizationId === "inspection") return;
    const result = await listNotifications(organizationId);
    if (result.data) setNotifications(result.data);
  }, [organizationId]);

  useEffect(() => {
    document.documentElement.dir = isRtl(language) ? "rtl" : "ltr";
    document.documentElement.lang = language;
    document.getElementById("sarafi-manifest")?.setAttribute(
      "href",
      language === "en" ? "/manifest.webmanifest" : `/manifest.${language}.webmanifest`,
    );
    window.localStorage.setItem("sarafi-language", language);
  }, [language]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    const showClientUpdate = () => setClientUpdateAvailable(true);
    window.addEventListener("sarafi:update-available", showClientUpdate);
    return () => window.removeEventListener("sarafi:update-available", showClientUpdate);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activeSection]);

  useEffect(() => {
    if (!organizationId || organizationId === "inspection") return;
    // oxlint-disable-next-line react/set-state-in-effect -- Notifications are external organization records loaded for this workspace.
    void refreshNotifications();
    const interval = window.setInterval(() => void refreshNotifications(), 60_000);
    return () => window.clearInterval(interval);
  }, [organizationId, refreshNotifications]);

  useEffect(() => {
    if (!organizationId || organizationId === "inspection") return;
    return subscribeToOrganizationActivity(organizationId, (table, payload) => {
      setDashboardRefresh((value) => value + 1);
      setMoneyContextRefresh((value) => value + 1);
      setWorkspaceActivityRefresh((value) => value + 1);
      if (table === "organization_memberships" || table === "security_audit_events") {
        void getMyWorkspaceContext().then((result) => {
          if (result.data) setWorkspaceContexts(result.data);
        });
      }
      if (table === "devices") {
        const updatedDevice = payload.new;
        setLinkedDevice((current) => {
          if (!current || updatedDevice?.id !== current.id) return current;
          const status = updatedDevice.status;
          if (status !== "trusted" && status !== "untrusted" && status !== "revoked") return current;
          return {
            ...current,
            status,
            friendly_name: typeof updatedDevice.friendly_name === "string" ? updatedDevice.friendly_name : current.friendly_name,
            last_seen_at: typeof updatedDevice.last_seen_at === "string" ? updatedDevice.last_seen_at : current.last_seen_at,
            revoked_at: typeof updatedDevice.revoked_at === "string" || updatedDevice.revoked_at === null
              ? updatedDevice.revoked_at
              : current.revoked_at,
          };
        });
      }
      void refreshNotifications();
    }) ?? undefined;
  }, [organizationId, refreshNotifications]);

  useEffect(() => {
    if (inspectionMode) return;
    const client = getSupabaseClient();
    if (!client) return;
    void client.auth
      .getSession()
      .then(({ data }) => setUser(data.session?.user ?? null));
    const listener = client.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user ?? null),
    );
    return () => listener.data.subscription.unsubscribe();
  }, [inspectionMode]);

  useEffect(() => {
    if (inspectionMode || platformAdminRoute || !user) return;
    let active = true;
    const loadMembership = async () => {
      setOrganizationLoading(true);
      if (inviteToken) {
        const accepted = await acceptTeamInvitation(inviteToken);
        if (!active) return;
        if (accepted.error) {
          setInvitationFailure(localizedInvitationError(language, accepted.error));
        } else {
          setInvitationFailure("");
          setInviteToken("");
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.delete("invite");
          window.history.replaceState({}, "", nextUrl);
          setToast(ux(language, "invitationAccepted"));
        }
      }
      const membership = await getMyWorkspaceContext();
      if (!active) return;
      const contexts = membership.data ?? [];
      setWorkspaceContexts(contexts);
      const savedMembership = window.localStorage.getItem("sarafi-active-membership");
      const data = contexts.find((item) => item.membership_id === savedMembership) ?? contexts[0];
      setActiveMembershipId(data?.membership_id ?? "");
      setOrganizationId(data?.organization_id ?? null);
      if (
        data?.role_code &&
        [
          "owner",
          "business_admin",
          "manager",
          "accountant",
          "cashier",
          "compliance_officer",
          "viewer",
        ].includes(data.role_code)
      )
        setWorkspaceRole(data.role_code as WorkspaceRole);
      if (!data?.organization_id) {
        if (membership.error) setToast(ux(language, "couldNotLoad"));
        setOrganizationLoading(false);
        return;
      }
      setOrganizationName(data.organization_name);
      const firstBranch = data.branches[0] ?? null;
      const firstCashbox = data.cashboxes.find((item) => item.branch_id === firstBranch?.id) ?? data.cashboxes[0] ?? null;
      setBranchId(firstBranch?.id ?? null);
      setBranchName(firstBranch?.name ?? "");
      setCashboxId(firstCashbox?.id ?? null);
      setOrganizationLoading(false);
    };
    void loadMembership();
    return () => {
      active = false;
    };
  }, [inspectionMode, inviteToken, language, platformAdminRoute, user]);

  useEffect(() => {
    if (!organizationId) return;
    if (inspectionMode) {
      // oxlint-disable-next-line react/set-state-in-effect -- Inspection mode mirrors Kabul's configured business date.
      setDashboardDate(businessDateInTimeZone(new Date(), "Asia/Kabul"));
      setDashboard(inspectionDashboard(language));
      return;
    }
    void getWorkspaceSettings(organizationId).then((result) => {
      if (!result.data) return;
      setEnabledFeatureCodes(
        result.data.features.filter((feature) => feature.enabled).map((feature) => feature.feature_code),
      );
      if (result.data.timezone)
        setDashboardDate(businessDateInTimeZone(new Date(), result.data.timezone));
    });
  }, [inspectionMode, language, organizationId]);

  useEffect(() => {
    if (inspectionMode) return;
    void listCurrencyCatalog(organizationId).then((result) => {
      if (result.data) {
        setCurrencyCatalog(result.data);
        const codes = result.data.filter((item) => item.enabled).map((item) => item.code);
        const foreignCodes = codes.filter((code) => code !== "AFN");
        setOperationCurrency((current) => codes.includes(current) ? current : codes[0] ?? "AFN");
        setOpeningCurrency((current) => codes.includes(current) ? current : codes[0] ?? "AFN");
        setTradeCurrency((current) => foreignCodes.includes(current) ? current : foreignCodes[0] ?? "USD");
        setTradeReceiveCurrency((current) => foreignCodes.includes(current) ? current : foreignCodes[1] ?? foreignCodes[0] ?? "USD");
      }
      if (result.error && organizationId) setToast(ux(language, "couldNotLoad"));
    });
    if (!organizationId) return;
    void listMoneyAccounts(organizationId).then((result) => {
      if (result.data) setMoneyAccounts(result.data);
      if (result.error) setToast(ux(language, "couldNotLoad"));
    });
  }, [inspectionMode, language, moneyContextRefresh, organizationId]);

  useEffect(() => {
    if (inspectionMode || platformAdminRoute || !organizationId || !user) return;
    let active = true;
    const linkBrowser = async () => {
      const seed = new TextEncoder().encode(`${organizationId}:${user.id}:${browserDeviceId}`);
      const digest = await crypto.subtle.digest("SHA-256", seed);
      const fingerprintHash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const friendlyName = language === "fa-AF"
        ? "مرورگر فعلی صرافی"
        : language === "ps-AF"
          ? "د صرافۍ اوسنی ویب"
          : "This SARAFI browser";
      const result = await registerBrowserDevice({
        organizationId,
        branchId,
        friendlyName,
        fingerprintHash,
      });
      if (!active) return;
      setLinkedDevice(result.data);
      if (result.error) setToast(ux(language, "deviceLinkFailed"));
    };
    void linkBrowser();
    return () => { active = false; };
  }, [branchId, browserDeviceId, inspectionMode, language, organizationId, platformAdminRoute, user]);

  // oxlint-disable-next-line react/set-state-in-effect -- The e2e inspection customer mirrors the selected interface language.
  useEffect(() => {
    if (!organizationId) return;
    if (organizationId === "inspection") {
      // oxlint-disable-next-line react/set-state-in-effect -- Keep the inspection-only customer label synchronized with the chosen language.
      setTradeCounterparties((current) => {
        const preview = {
          id: "inspection-customer",
          display_name: ux(language, "previewCustomer"),
          counterparty_type: "customer",
          risk_status: "standard",
        };
        const otherCustomers = current.filter((item) => item.id !== preview.id);
        return [preview, ...otherCustomers];
      });
      return;
    }
    void listCounterparties(organizationId).then((result) => {
      if (result.data) setTradeCounterparties(result.data);
    });
  }, [counterpartyRefresh, language, organizationId]);

  const enabledCurrencies = currencyCatalog.filter((item) => item.enabled);
  const enabledCurrencyCodes = enabledCurrencies.length
    ? enabledCurrencies.map((item) => item.code)
    : ["AFN", "USD", "EUR"];
  const tradeCurrencies = enabledCurrencyCodes.filter(
    (currency) => currency !== "AFN",
  );
  const branchMoneyAccounts = useMemo(
    () => moneyAccounts.filter(
      (account) => !account.branch_id || !branchId || account.branch_id === branchId,
    ),
    [branchId, moneyAccounts],
  );
  useEffect(() => {
    if (inspectionMode) return;
    if (!organizationId) return;
    void getOwnerDashboard(organizationId, dashboardDate).then((result) => {
      if (result.error) {
        setDashboardError(ux(language, "couldNotLoad"));
        setToast(ux(language, "couldNotLoad"));
        return;
      }
      setDashboardError("");
      setDashboard(result.data);
      setTrades(
        (result.data?.activity ?? []).map((item) => ({
          id: item.id,
          customer: item.reference,
          direction: item.type,
          amount: "Recorded",
          rate: "-",
          time: new Date(item.occurred_at).toLocaleTimeString(),
          status: item.status,
        })),
      );
    });
  }, [
    dashboardDate,
    dashboardRefresh,
    inspectionMode,
    language,
    organizationId,
  ]);

  useEffect(() => {
    if (inspectionMode || !organizationId) return;
    if (!branchId) return;
    const requests = [
      getTransactionRateContext(organizationId, branchId, tradeCurrency, "AFN"),
      tradeSide === "EXCHANGE_FX"
        ? getTransactionRateContext(organizationId, branchId, tradeReceiveCurrency, "AFN")
        : Promise.resolve(null),
    ] as const;
    void Promise.all(requests).then(([sourceResult, targetResult]) => {
        if (sourceResult.error || targetResult?.error) {
          setToast(ux(language, "couldNotLoad"));
          return;
        }
        const current = sourceResult.data;
        if (current) {
          setRateState(current.buy_rate ?? "");
          setSellRate(current.sell_rate ?? "");
          setRateContext({
            stale: Boolean(current.stale),
            missing: !current.buy_rate || !current.sell_rate,
            effectiveFrom: current.effective_from,
            tolerance: current.spread_tolerance ?? "0",
            toleranceBps: current.tolerance_bps ?? "50",
          });
          setRateOverrideEnabled(false);
          setRateOverride("");
          setPublishRate(false);
          setAllowStaleRate(false);
          if (current.stale) setToast(language === "en" ? "The approved rate is older than one day; review it before posting." : language === "fa-AF" ? "نرخ تأییدشده بیشتر از یک روز قدیمی است؛ پیش از ثبت آن را بررسی کنید." : "تایید شوی نرخ له یوې ورځې زوړ دی؛ له ثبت مخکې یې وګورئ.");
        } else {
          setRateState("");
          setSellRate("");
          setRateContext({ stale: true, missing: true, tolerance: "0", toleranceBps: "50" });
        }
        if (targetResult) {
          const target = targetResult.data;
          setTradeReceiveBuyRate(target?.buy_rate ?? "");
          setTradeReceiveRateContext({
            stale: Boolean(target?.stale),
            missing: !target?.buy_rate || !target?.sell_rate,
            effectiveFrom: target?.effective_from,
            toleranceBps: target?.tolerance_bps ?? "50",
          });
        }
        setExchangeSourceRatePublication(undefined);
        setExchangeTargetRatePublication(undefined);
      });
  }, [branchId, inspectionMode, language, organizationId, tradeCurrency, tradeReceiveCurrency, tradeSide]);

  const submitAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authMode === "signUp" && (authFullName.trim().length < 2 || authPassword !== authConfirmPassword)) {
      setAuthMessageKind("error");
      setAuthMessage(authFullName.trim().length < 2 ? u("fullNameRequired") : u("passwordsDoNotMatch"));
      return;
    }
    setAuthBusy(true);
    setAuthMessage("");
    setAuthMessageKind(null);
    const result =
      authMode === "signIn"
        ? await signInWithPassword(authEmail, authPassword)
        : authMode === "signUp"
          ? await signUpWithPassword(authEmail, authPassword, authFullName)
          : { user: null, sessionActive: false, ...(await sendPasswordReset(authEmail, window.location.origin)) };
    setAuthBusy(false);
    if (result.user && result.sessionActive) setUser(result.user);
    setAuthMessageKind(result.error ? "error" : "success");
    setAuthMessage(
      result.error
        ? localizedAuthError(language, result)
        : authMode === "reset"
          ? t("passwordResetRequested")
          : authMode === "signUp"
            ? t("verificationEmail")
            : t("signedIn"),
    );
  };

  const submitOnboarding = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOrganizationLoading(true);
    const result = await createBusiness({
      display_name: businessName,
      language,
      base_currency_code: "AFN",
      currencies: onboardingCurrencies,
      branch_name: onboardingBranchName,
      cashbox_name: onboardingCashboxName,
    });
    setOrganizationLoading(false);
    if (result.error) {
      setToast(u("couldNotSave"));
      return;
    }
    const contexts = await getMyWorkspaceContext();
    const createdContext = contexts.data?.find((item) => item.organization_id === result.organizationId);
    if (contexts.data) setWorkspaceContexts(contexts.data);
    if (createdContext) chooseWorkspace(createdContext);
    else setOrganizationId(result.organizationId);
  };

  const submitConnectionCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (connectionBusy) return;
    const normalized = connectionCode.replaceAll(/[^A-Za-z0-9]/g, "").toUpperCase();
    const expectedLength = connectionKind === "invitation" ? 10 : 12;
    if (normalized.length !== expectedLength || (connectionKind === "request" && connectionName.trim().length < 2)) {
      setConnectionMessage(connectionKind === "invitation"
        ? (language === "en" ? "Enter the complete 10-character code." : language === "fa-AF" ? "رمز ده‌حرفی کامل را وارد کنید." : "بشپړ لس توري کوډ ولیکئ.")
        : (language === "en" ? "Enter your name and the complete 12-character workplace code." : language === "fa-AF" ? "نام و رمز دوازده‌حرفی محل کار را کامل وارد کنید." : "خپل نوم او د کاري ځای بشپړ دولس توري کوډ ولیکئ."));
      return;
    }
    if (inspectionMode) {
      if (connectionKind === "request") {
        setConnectionMessage(language === "en" ? "Request sent. You will enter after the owner approves your access." : language === "fa-AF" ? "درخواست فرستاده شد. پس از تأیید مالک وارد می‌شوید." : "غوښتنه ولېږل شوه. د مالک له تایید وروسته به ننوځئ.");
        return;
      }
      setOrganizationId("inspection");
      setOrganizationName("Kabul Central Exchange");
      setBranchId("inspection-branch");
      setBranchName("Main branch");
      setCashboxId("inspection-cashbox-id");
      setWorkspaceRole("cashier");
      setToast(ux(language, "invitationAccepted"));
      return;
    }
    setConnectionBusy(true);
    setConnectionMessage("");
    if (connectionKind === "request") {
      const request = await requestBusinessAccess(normalized, connectionName);
      setConnectionBusy(false);
      if (request.error || !request.data) {
        setConnectionMessage(localizedInvitationError(language, request.error ?? "Request failed"));
        return;
      }
      setConnectionCode("");
      setConnectionMessage(language === "en" ? "Request sent. You will enter after the owner approves your access." : language === "fa-AF" ? "درخواست فرستاده شد. پس از تأیید مالک وارد می‌شوید." : "غوښتنه ولېږل شوه. د مالک له تایید وروسته به ننوځئ.");
      return;
    }
    const result = await acceptTeamConnectionCode(normalized);
    setConnectionBusy(false);
    if (result.error || !result.data) {
      setConnectionMessage(localizedInvitationError(language, result.error ?? "Connection failed"));
      return;
    }
    const contexts = await getMyWorkspaceContext();
    const connected = contexts.data?.find((item) => item.membership_id === result.data?.membership_id);
    if (contexts.data) setWorkspaceContexts(contexts.data);
    if (connected) chooseWorkspace(connected);
    else setOrganizationId(result.data.organization_id);
    setToast(ux(language, "invitationAccepted"));
  };

  const addTrade = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (tradeBusy) return;
    if (tradeSide === "EXCHANGE_FX" && (
      !exchangeSourceRateReady
      || !exchangeTargetRateReady
      || !effectiveTradeRate
      || !new Decimal(effectiveTradeRate).isFinite()
      || new Decimal(effectiveTradeRate).lte(0)
      || !exchangeSourceValuationRate
      || !exchangeTargetValuationRate
    )) {
      setToast(u("pairRateUnavailable"));
      return;
    }
    const shopRate = tradeSide === "BUY_FX" ? rate : sellRate;
    const appliedRate = rateOverrideEnabled ? rateOverride : shopRate;
    if (tradeSide !== "EXCHANGE_FX" && (!appliedRate || !new Decimal(appliedRate).isFinite() || new Decimal(appliedRate).lte(0))) {
      setToast(u("pairRateUnavailable"));
      return;
    }
    if (tradeSide !== "EXCHANGE_FX" && rateContext.stale && !rateOverrideEnabled && !allowStaleRate) {
      setToast(language === "en" ? "Choose how to handle the old shop rate before continuing." : language === "fa-AF" ? "پیش از ادامه، روش استفاده از نرخ قدیمی را انتخاب کنید." : "له دوام مخکې د زاړه نرخ د کارولو لاره وټاکئ.");
      return;
    }
    if (
      !amount ||
      !new Decimal(amount).isFinite() ||
      new Decimal(amount).lte(0)
    ) {
      setToast(u("amountGreaterZero"));
      return;
    }
    if (!tradeReviewing) {
      setTradeReviewing(true);
      return;
    }
    if (!online) {
      setToast(u("connectionRequired"));
      return;
    }
    if (!organizationId || !branchId || !cashboxId) {
      setToast(u("businessSetupRequired"));
      return;
    }
    setTradeBusy(true);
    let sessionCheck: Awaited<ReturnType<typeof postFxTrade>>;
    try {
      const soldCurrency = tradeSide === "BUY_FX" ? "AFN" : tradeCurrency;
      const boughtCurrency = tradeSide === "BUY_FX" ? tradeCurrency : tradeSide === "EXCHANGE_FX" ? tradeReceiveCurrency : "AFN";
      const pricing = tradeSide === "EXCHANGE_FX"
        ? {
            rate: effectiveTradeRate,
            soldAmount: new Decimal(amount).toFixed(12),
            boughtAmount: new Decimal(amount).times(effectiveTradeRate).toFixed(12),
            soldBaseValue: new Decimal(amount).times(exchangeSourceValuationRate).toFixed(12),
            boughtBaseValue: new Decimal(amount).times(effectiveTradeRate).times(exchangeTargetValuationRate).toFixed(12),
          }
        : deriveTradeAmounts(tradeSide, amount, appliedRate, appliedRate);
      const { rate: effectiveRate, soldAmount, boughtAmount, soldBaseValue, boughtBaseValue } = pricing;
      const rateDecisionReason = rateOverrideEnabled
        ? "Customer rate confirmed in transaction review"
        : allowStaleRate || rateContext.stale || tradeReceiveRateContext.stale
          ? "Existing shop rate confirmed in transaction review"
          : undefined;
      const exchangeRatePublications = [exchangeSourceRatePublication, exchangeTargetRatePublication]
        .filter((item): item is InlineRatePublication => Boolean(item));
      const command = {
        organization_id: organizationId,
        branch_id: branchId,
        cashbox_id: cashboxId,
        client_command_id: tradeCommandId,
        side: tradeSide,
        sold_currency: soldCurrency,
        sold_amount: soldAmount,
        bought_currency: boughtCurrency,
        bought_amount: boughtAmount,
        base_currency: "AFN",
        sold_base_value: soldBaseValue,
        bought_base_value: boughtBaseValue,
        customer_rate: effectiveRate,
        rate_source: rateOverrideEnabled ? "transaction_override" as const : (rateContext.stale || (tradeSide === "EXCHANGE_FX" && tradeReceiveRateContext.stale)) ? "approved_stale_shop_rate" as const : "shop_rate" as const,
        override_reason: rateDecisionReason,
        approval_reason: rateDecisionReason,
        allow_stale_rate: allowStaleRate || undefined,
        device_id: linkedDevice?.id || undefined,
        fee_amount: tradeFee || undefined,
        fee_currency: "AFN",
        counterparty_id: tradeCounterparty || undefined,
        memo: tradeNote || undefined,
        publish_rate: publishRate && rateOverrideEnabled && tradeSide !== "EXCHANGE_FX"
          ? {
              branch_id: branchId,
              source_currency: tradeCurrency,
              target_currency: "AFN",
              buy_rate: tradeSide === "BUY_FX" ? appliedRate : rate || appliedRate,
              sell_rate: tradeSide === "SELL_FX" ? appliedRate : sellRate || appliedRate,
            }
          : undefined,
        publish_rates: tradeSide === "EXCHANGE_FX" && exchangeRatePublications.length
          ? exchangeRatePublications
          : undefined,
      };

      const outsideTolerance = tradeSide !== "EXCHANGE_FX" && Boolean(shopRate)
        && new Decimal(appliedRate).sub(shopRate || appliedRate).abs().div(shopRate || appliedRate).times(10000).gt(rateContext.toleranceBps || "50");
      const exchangeOutsideTolerance = tradeSide === "EXCHANGE_FX" && rateOverrideEnabled && Boolean(impliedExchangeRate)
        && new Decimal(effectiveTradeRate).sub(impliedExchangeRate).abs().div(impliedExchangeRate).times(10000).gt(
          Decimal.max(rateContext.toleranceBps || "50", tradeReceiveRateContext.toleranceBps || "50"),
        );
      const cashierNeedsApproval = workspaceRole === "cashier" && (
        tradeSide === "EXCHANGE_FX"
          ? exchangeOutsideTolerance
          : rateContext.missing || rateContext.stale || outsideTolerance
      );
      if (cashierNeedsApproval) {
        if (organizationId === "inspection") {
          setTradeBusy(false);
          setToast("Approval requested. Your transaction draft is still here.");
          return;
        }
        const approval = await requestFxTradeApproval(command);
        setTradeBusy(false);
        if (approval.error) {
          setToast(localizedFinancialError(language, approval.error, u("couldNotSave")));
          return;
        }
        if (approval.data?.status === "approved") {
          const resumed = await resumeApprovedFxTrade(approval.data.id);
          if (resumed.error) {
            setToast(localizedFinancialError(language, resumed.error, u("couldNotSave")));
            return;
          }
          sessionCheck = resumed;
        } else {
          if (approval.data?.id) {
            const approvalParams = new URLSearchParams(location.search);
            approvalParams.set("approval", approval.data.id);
            navigate(`${location.pathname}?${approvalParams.toString()}`, { replace: true });
          }
          setToast(language === "en" ? "Approval requested. Your transaction draft is still here." : language === "fa-AF" ? "درخواست تأیید فرستاده شد. پیش‌نویس معامله شما محفوظ است." : "د تایید غوښتنه ولېږل شوه. ستاسو د معاملې مسوده خوندي ده.");
          return;
        }
      } else {
        sessionCheck = await postFxTrade(command);
      }
    } catch (error) {
      void error;
      setToast(u("couldNotSave"));
      setTradeBusy(false);
      return;
    }
    if (sessionCheck.error) {
      setToast(localizedFinancialError(language, sessionCheck.error, u("couldNotSave")));
      setTradeBusy(false);
      return;
    }
    const journalEntryId = String(sessionCheck.data?.id ?? "");
    const receiptResult = journalEntryId
      ? await getReceiptForJournalEntry(organizationId, journalEntryId)
      : { data: null, error: "Missing journal entry reference" };
    setCompletedTrade({
      receiptNumber: receiptResult.data?.receipt_number ?? null,
      journalEntryId,
      givenAmount: tradeGivenAmount ?? amount,
      givenCurrency: tradeGivenCurrency,
      receivedAmount: tradeReceivedAmount ?? "—",
      receivedCurrency: tradeReceivedCurrency,
      rate: effectiveTradeRate,
      occurredAt: new Date().toISOString(),
    });
    setDashboardRefresh((value) => value + 1);
    setAmount("");
    setTradeFee("");
    setTradeExchangeRate("");
    setTradeNote("");
    setTradeCounterparty("");
    setTradeCommandId(crypto.randomUUID());
    setRateOverrideEnabled(false);
    setRateOverride("");
    setPublishRate(false);
    setAllowStaleRate(false);
    setExchangeSourceRatePublication(undefined);
    setExchangeTargetRatePublication(undefined);
    setTradeReviewing(false);
    setTradeBusy(false);
  };

  const resumeFxApprovalDraft = async () => {
    if (!fxApprovalDraft || fxApprovalDraft.status !== "approved" || fxApprovalBusy) return;
    setFxApprovalBusy(true);
    const result = await resumeApprovedFxTrade(fxApprovalDraft.id);
    setFxApprovalBusy(false);
    if (result.error) {
      setToast(localizedFinancialError(language, result.error, u("couldNotSave")));
      return;
    }
    const journalEntryId = String(result.data?.id ?? "");
    const receiptResult = journalEntryId && organizationId
      ? await getReceiptForJournalEntry(organizationId, journalEntryId)
      : { data: null, error: "Missing journal entry reference" };
    const draft = fxApprovalDraft.draft;
    setCompletedTrade({
      receiptNumber: receiptResult.data?.receipt_number ?? null,
      journalEntryId,
      givenAmount: String(draft.sold_amount ?? "—"),
      givenCurrency: String(draft.sold_currency ?? ""),
      receivedAmount: String(draft.bought_amount ?? "—"),
      receivedCurrency: String(draft.bought_currency ?? ""),
      rate: String(draft.customer_rate ?? "—"),
      occurredAt: new Date().toISOString(),
    });
    setFxApprovalDraft(null);
    const approvalParams = new URLSearchParams(location.search);
    approvalParams.delete("approval");
    navigate(`${location.pathname}${approvalParams.size ? `?${approvalParams.toString()}` : ""}`, { replace: true });
    setDashboardRefresh((value) => value + 1);
    setToast(u("savedSuccessfully"));
  };

  const printCompletedTrade = async (width: "58mm" | "80mm") => {
    if (!completedTrade) return;
    const { printThermalReceipt } = await loadExports();
    printThermalReceipt(
      {
        businessName: organizationName || u("yourBusiness"),
        reference:
          completedTrade.receiptNumber || completedTrade.journalEntryId,
        type: completedTrade.typeLabel ?? t("recordTrade"),
        amount: completedTrade.receivedAmount,
        currency: completedTrade.receivedCurrency,
        rate: completedTrade.rate,
        direction: isRtl(language) ? "rtl" : "ltr",
        locale: language,
        labels: {
          amount: t("amount"),
          rate: t("exchangeRate"),
          date: u("businessDate"),
        },
      },
      width,
    );
  };

  const openTrade = (
    side?: typeof tradeSide,
  ) => {
    if (side) setTradeSide(side);
    setAmount("");
    setTradeFee("");
    setTradeExchangeRate("");
    setTradeNote("");
    setTradeCounterparty("");
    setTradeCommandId(crypto.randomUUID());
    setRateOverrideEnabled(false);
    setRateOverride("");
    setPublishRate(false);
    setAllowStaleRate(false);
    setTradeReviewing(false);
    setTradeBusy(false);
    const nextSide = side ?? tradeSide;
    navigate(financialRoute(organizationId, nextSide === "BUY_FX" ? "/fx/buy" : nextSide === "SELL_FX" ? "/fx/sell" : "/fx/exchange"));
  };

  const submitOperation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!online) {
      setToast(u("connectionRequired"));
      return;
    }
    if (!operationKind || !organizationId) return;
    if (!branchId) {
      setToast(u("activeBranchRequired"));
      return;
    }
    if (operationCurrency !== "AFN" && !operationRateReady) {
      setToast(language === "en" ? "Choose the rate on this page before saving." : language === "fa-AF" ? "پیش از ثبت، نرخ همین معامله را در این صفحه آماده کنید." : "له ثبت مخکې د همدې معاملې نرخ په دې پاڼه کې چمتو کړئ.");
      return;
    }
    const incoming = [
      "RECEIVE_MONEY",
      "RECORD_INCOME",
      "OWNER_INVESTMENT",
    ].includes(operationKind);
    const twoAccounts = [
      "TRANSFER_CASH",
      "BANK_DEPOSIT",
      "BANK_WITHDRAWAL",
    ].includes(operationKind);
    if (
      (!incoming && !operationSourceAccount) ||
      (incoming && !operationDestinationAccount) ||
      (twoAccounts &&
        (!operationSourceAccount || !operationDestinationAccount))
    ) {
      setToast(u("chooseMoneyAccount"));
      return;
    }
    if (
      twoAccounts &&
      operationSourceAccount === operationDestinationAccount
    ) {
      setToast(u("accountsMustDiffer"));
      return;
    }
    const result = await recordOperation({
      organization_id: organizationId,
      branch_id: branchId,
      operation: operationKind,
      currency: operationCurrency,
      amount: operationAmount,
      source_money_account_id: operationSourceAccount || undefined,
      destination_money_account_id:
        operationDestinationAccount || undefined,
      category: operationCategory,
      memo: operationMemo,
      device_id: linkedDevice?.id || undefined,
      client_command_id: crypto.randomUUID(),
      publish_rate: operationRatePublication,
    });
    if (result.error) {
      setToast(localizedFinancialError(language, result.error, u("couldNotSave")));
      return;
    }
    const completedKind = operationKind;
    const completedAmount = operationAmount;
    const completedCurrency = operationCurrency;
    const journalEntryId = String(result.data?.id ?? "");
    const receiptResult = journalEntryId
      ? await getReceiptForJournalEntry(organizationId, journalEntryId)
      : { data: null, error: "Missing journal entry reference" };
    const sourceName = moneyAccounts.find((account) => account.id === operationSourceAccount)?.name;
    const destinationName = moneyAccounts.find((account) => account.id === operationDestinationAccount)?.name;
    setCompletedTrade({
      receiptNumber: receiptResult.data?.receipt_number ?? null,
      journalEntryId,
      givenAmount: completedAmount,
      givenCurrency: completedCurrency,
      receivedAmount: completedAmount,
      receivedCurrency: completedCurrency,
      rate: "—",
      occurredAt: new Date().toISOString(),
      typeLabel: operationLabel(completedKind),
      repeatPath: location.pathname,
      repeatOperation: completedKind,
      flowRows: [
        ...(sourceName ? [{ label: language === "en" ? "From" : language === "fa-AF" ? "از" : "له", value: sourceName }] : []),
        ...(destinationName ? [{ label: language === "en" ? "To" : language === "fa-AF" ? "به" : "ته", value: destinationName }] : []),
        { label: language === "en" ? "Amount" : language === "fa-AF" ? "مبلغ" : "مبلغ", value: `${formatFinancialAmount(completedAmount)} ${completedCurrency}` },
      ],
    });
    setOperationKind(null);
    setOperationRatePublication(undefined);
    setDashboardRefresh((value) => value + 1);
    setMoneyContextRefresh((value) => value + 1);
  };

  const sectionPath = (section: string) => {
    return workspaceSectionPath(organizationId, section, cashboxId);
  };
  const openSection = (section: string, replace = false) => {
    setShowBranchMenu(false);
    const next = sectionPath(section);
    navigate(next, { replace });
  };
  const actOnNotification = async (notice: NotificationRecord, dismiss = false) => {
    if (organizationId !== "inspection") await markNotificationState(notice.id, dismiss ? "dismissed" : "read");
    setNotifications((current) => dismiss ? current.filter((item) => item.id !== notice.id) : current.map((item) => item.id === notice.id ? { ...item, status: "read" } : item));
    setShowNotifications(false);
    if (!dismiss) {
      const root = workspaceRoot(organizationId);
      const subject = encodeURIComponent(notice.subject_id);
      const destination = notice.notification_type === "compliance_alert"
        ? `${root}/compliance/cases/${subject}`
        : notice.notification_type === "cashbox_variance"
          ? `${root}/cashboxes/${subject}/close`
          : notice.notification_type.includes("approval")
            ? `${root}/control/team/approvals/${subject}`
            : notice.notification_type.includes("device")
              ? `${root}/control/team/devices/${subject}`
              : notice.notification_type.includes("hawala")
                ? `${root}/hawala/${subject}`
                : `${root}/transactions/${subject}`;
      navigate(destination);
    }
  };

  const chooseWorkspace = (context: WorkspaceContextRecord, nextBranchId?: string) => {
    const nextBranch = context.branches.find((item) => item.id === nextBranchId) ?? context.branches[0] ?? null;
    const nextCashbox = context.cashboxes.find((item) => item.branch_id === nextBranch?.id) ?? context.cashboxes[0] ?? null;
    setActiveMembershipId(context.membership_id);
    window.localStorage.setItem("sarafi-active-membership", context.membership_id);
    setOrganizationId(context.organization_id);
    setOrganizationName(context.organization_name);
    if (["owner", "business_admin", "manager", "accountant", "cashier", "compliance_officer", "viewer"].includes(context.role_code))
      setWorkspaceRole(context.role_code as WorkspaceRole);
    setBranchId(nextBranch?.id ?? null);
    setBranchName(nextBranch?.name ?? "");
    setCashboxId(nextCashbox?.id ?? null);
    setLinkedDevice(null);
    setShowBranchMenu(false);
    const next = `/app/${context.organization_id}/home`;
    navigate(next);
  };

  const handleSignOut = async () => {
    const error = await signOut();
    if (error) {
      setToast(u("requestFailed"));
      return;
    }
    setUser(null);
    setOrganizationId(null);
    setBranchId(null);
    setCashboxId(null);
  };

  const submitOpeningBalance = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!online) {
      setToast(u("connectionRequired"));
      return;
    }
    if (!organizationId || !branchId || !cashboxId) {
      setToast(u("activeCashboxRequired"));
      return;
    }
    if (openingCurrency !== "AFN" && !openingRateReady) {
      setToast(language === "en" ? "Choose the rate on this page before saving." : language === "fa-AF" ? "پیش از ثبت، نرخ همین معامله را در این صفحه آماده کنید." : "له ثبت مخکې د همدې معاملې نرخ په دې پاڼه کې چمتو کړئ.");
      return;
    }
    const result = await recordOpeningBalance({
      organization_id: organizationId,
      branch_id: branchId,
      cashbox_id: cashboxId,
      currency: openingCurrency,
      amount: openingAmount,
      client_command_id: crypto.randomUUID(),
      publish_rate: openingRatePublication,
    });
    if (result.error) {
      setToast(localizedFinancialError(language, result.error, u("couldNotSave")));
      return;
    }
    const journalEntryId = String(result.data?.id ?? "");
    const receiptResult = journalEntryId
      ? await getReceiptForJournalEntry(organizationId, journalEntryId)
      : { data: null, error: "Missing journal entry reference" };
    setCompletedTrade({
      receiptNumber: receiptResult.data?.receipt_number ?? null,
      journalEntryId,
      givenAmount: "—",
      givenCurrency: "",
      receivedAmount: openingAmount,
      receivedCurrency: openingCurrency,
      rate: "—",
      occurredAt: new Date().toISOString(),
      typeLabel: u("openingBalance"),
      repeatPath: location.pathname,
      flowRows: [
        { label: language === "en" ? "To" : language === "fa-AF" ? "به" : "ته", value: activeMoneyAccountName },
        { label: language === "en" ? "Amount" : language === "fa-AF" ? "مبلغ" : "مبلغ", value: `${formatFinancialAmount(openingAmount)} ${openingCurrency}` },
      ],
    });
    setOpeningAmount("");
    setOpeningRatePublication(undefined);
    setDashboardRefresh((value) => value + 1);
    setMoneyContextRefresh((value) => value + 1);
  };

  const dashboardView = activeSection === "Dashboard";
  const transactionCenterActive = activeSection === "Trade";
  const activeFinancialRoute = financialRouteSuffix(location.pathname);
  const transactionFormActive =
    transactionCenterActive && !location.pathname.endsWith("/transactions/new");
  const fxFormActive = activeFinancialRoute?.startsWith("/fx/") ?? location.pathname.endsWith("/transactions/new/fx");
  const openingFormActive = location.pathname.endsWith("/transactions/new/opening-money");
  /* oxlint-disable react/set-state-in-effect -- shareable routes restore resumable financial form state. */
  useEffect(() => {
    if (!transactionFormActive) return;
    const params = new URLSearchParams(location.search);
    const side = params.get("side");
    if (fxFormActive) {
      // URL navigation is an external source of truth for this resumable form.
      // oxlint-disable-next-line react/set-state-in-effect
      if (activeFinancialRoute === "/fx/buy") setTradeSide("BUY_FX");
      else if (activeFinancialRoute === "/fx/sell") setTradeSide("SELL_FX");
      else if (activeFinancialRoute === "/fx/exchange") setTradeSide("EXCHANGE_FX");
      else if (side === "BUY_FX" || side === "SELL_FX" || side === "EXCHANGE_FX") setTradeSide(side);
      setOperationKind(null);
      return;
    }
    if (openingFormActive) {
      setOperationKind(null);
      return;
    }
    const action = params.get("action") ?? ({
      "/money-in/receive": "RECEIVE_MONEY",
      "/money-in/customer": "RECEIVE_MONEY",
      "/money-in/income": "RECORD_INCOME",
      "/money-in/owner-investment": "OWNER_INVESTMENT",
      "/money-in/owner-capital": "OWNER_INVESTMENT",
      "/money-out/pay": "PAY_MONEY",
      "/money-out/customer": "PAY_MONEY",
      "/money-out/expense": "RECORD_EXPENSE",
      "/money-out/owner-withdrawal": "OWNER_WITHDRAWAL",
      "/move/transfer": "TRANSFER_CASH",
      "/move/cashbox": "TRANSFER_CASH",
      "/move/branch": "TRANSFER_CASH",
      "/move/bank-deposit": "BANK_DEPOSIT",
      "/move/bank-withdrawal": "BANK_WITHDRAWAL",
      "/move/bank": "BANK_DEPOSIT",
    } as Partial<Record<NonNullable<typeof activeFinancialRoute>, OperationKind>>)[activeFinancialRoute ?? "/fx/buy"]
      ?? (location.pathname.endsWith("/transactions/new/money-in") ? "RECEIVE_MONEY"
        : location.pathname.endsWith("/transactions/new/money-out") ? "PAY_MONEY"
          : location.pathname.endsWith("/transactions/new/move-money") ? "TRANSFER_CASH"
            : null);
    if (["RECEIVE_MONEY", "PAY_MONEY", "TRANSFER_CASH", "RECORD_EXPENSE", "RECORD_INCOME", "OWNER_INVESTMENT", "OWNER_WITHDRAWAL", "BANK_DEPOSIT", "BANK_WITHDRAWAL"].includes(action ?? ""))
      setOperationKind(action as OperationKind);
  }, [activeFinancialRoute, fxFormActive, location.pathname, location.search, openingFormActive, transactionFormActive]);
  useEffect(() => {
    const approvalId = new URLSearchParams(location.search).get("approval");
    if (!fxFormActive || !approvalId || inspectionMode) {
      setFxApprovalDraft(null);
      return;
    }
    let active = true;
    setFxApprovalBusy(true);
    void getMyResumableApprovalDraft(approvalId).then((result) => {
      if (!active) return;
      setFxApprovalBusy(false);
      if (result.error) {
        setToast(localizedFinancialError(language, result.error, ux(language, "couldNotLoad")));
        return;
      }
      setFxApprovalDraft(result.data);
    });
    return () => { active = false; };
  }, [fxFormActive, inspectionMode, language, location.search]);
  useEffect(() => {
    if (!operationKind || !branchMoneyAccounts.length) return;
    const preferred = branchMoneyAccounts.find((account) => account.account_type === "cashbox") ?? branchMoneyAccounts[0];
    const alternate = branchMoneyAccounts.find((account) => account.id !== preferred.id) ?? preferred;
    const incoming = ["RECEIVE_MONEY", "RECORD_INCOME", "OWNER_INVESTMENT"].includes(operationKind);
    const transfer = ["TRANSFER_CASH", "BANK_DEPOSIT", "BANK_WITHDRAWAL"].includes(operationKind);
    if (incoming || transfer) {
      const desiredDestination = transfer ? alternate : preferred;
      setOperationDestinationAccount((current) => branchMoneyAccounts.some((account) => account.id === current) && (!transfer || current !== preferred.id) ? current : desiredDestination.id);
    }
    if (!incoming)
      setOperationSourceAccount((current) => branchMoneyAccounts.some((account) => account.id === current) ? current : preferred.id);
  }, [branchMoneyAccounts, operationKind]);
  /* oxlint-enable react/set-state-in-effect */
  const hawalaEnabled = enabledFeatureCodes.includes("hawala");
  const activeWorkspaceContext = workspaceContexts.find((context) => context.membership_id === activeMembershipId) ?? workspaceContexts.find((context) => context.organization_id === organizationId);
  const capabilityContractTtlSeconds = activeWorkspaceContext?.capability_contract?.expires_in_seconds;
  useEffect(() => {
    if (capabilityContractTtlSeconds === undefined || inspectionMode) return;
    const delay = Math.max(1_000, Math.min(capabilityContractTtlSeconds * 1_000, 300_000));
    const timeout = window.setTimeout(() => {
      void getMyWorkspaceContext().then((result) => {
        if (result.data) setWorkspaceContexts(result.data);
      });
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [capabilityContractTtlSeconds, inspectionMode]);
  const workspaceCapabilities = inspectionMode
    ? inspectionCapabilities(workspaceRole)
    : activeWorkspaceContext?.capabilities ?? [];
  const capability = (required: Capability) => hasCapability(workspaceCapabilities, required);
  const activityLabel = language === "en" ? "Activity" : language === "fa-AF" ? "فعالیت" : "فعالیت";
  const myActivityLabel = language === "en" ? "My Activity" : language === "fa-AF" ? "فعالیت من" : "زما فعالیت";
  const makeTransactionLabel = language === "en" ? "Make a Transaction" : t("newTransaction");
  const myMoneyLabel = language === "en" ? "My Money" : t("myMoney");
  const customersLabel = language === "en" ? "Customers" : t("people");
  const reconcileLabel = language === "en" ? "Reconcile" : t("reconciliation");
  const manageSarafiLabel = language === "en" ? "Manage Sarafi" : language === "fa-AF" ? "مدیریت سرافی" : "سرافي اداره کړئ";
  const reviewsLabel = language === "en" ? "Reviews" : language === "fa-AF" ? "بررسی‌ها" : "څېړنې";
  const casesLabel = language === "en" ? "Cases" : language === "fa-AF" ? "پرونده‌ها" : "قضیې";
  const searchLabel = language === "en" ? "Search" : language === "fa-AF" ? "جستجو" : "لټون";
  const cashboxesLabel = language === "en" ? "Cashboxes" : language === "fa-AF" ? "صندوق‌ها" : "صندوقونه";
  const closeCashboxLabel = language === "en" ? "Close Cashbox" : language === "fa-AF" ? "بستن صندوق" : "صندوق تړل";
  const teamLabel = language === "en" ? "Team" : language === "fa-AF" ? "کارمندان" : "کارکوونکي";
  const hawalaReviewLabel = language === "en" ? "Hawala Review" : language === "fa-AF" ? "بررسی حواله" : "د حوالې څېړنه";
  const navigationLabel: Record<string, [string, AppIconName]> = {
    Dashboard: [t("home"), "home"],
    Trade: [makeTransactionLabel, "trade"],
    Rates: [t("rates"), "rates"],
    Transactions: [workspaceRole === "cashier" ? myActivityLabel : activityLabel, "transactions"],
    "Cash & Accounts": [myMoneyLabel, "wallet"],
    People: [customersLabel, "people"],
    Reports: [t("reports"), "report"],
    Debts: [t("debts"), "debt"],
    Hawala: [hawalaReviewLabel, "hawala"],
    Reconciliation: [reconcileLabel, "cashbox"],
    "Cashbox Close": [closeCashboxLabel, "cashbox"],
    "Team & Devices": [teamLabel, "people"],
    "Compliance Reviews": [reviewsLabel, "shield"],
    "Compliance Cases": [casesLabel, "shield"],
    Search: [searchLabel, "search"],
    Control: [manageSarafiLabel, "settings"],
  };
  if (workspaceCapabilities.includes("dashboard.manager")) navigationLabel["Cash & Accounts"] = [cashboxesLabel, "wallet"];
  const primaryNavigation: Array<[string, string, AppIconName]> = navigationSections(workspaceCapabilities)
    .map((section) => [section, navigationLabel[section][0], navigationLabel[section][1]]);
  const roleName = (role: string) =>
    ({
      owner: u("owner"),
      business_admin: language === "en" ? "Business administrator" : language === "fa-AF" ? "مدیر اجرایی صرافی" : "د صرافۍ اجرائیوي مدیر",
      manager: u("manager"),
      accountant: u("accountant"),
      cashier: u("cashier"),
      compliance_officer: u("complianceOfficer"),
      viewer: u("viewer"),
    } satisfies Record<WorkspaceRole, string>)[role as WorkspaceRole] ?? role;
  const roleLabel = roleName(workspaceRole);
  const exactFinancialRoute = financialRouteSuffix(location.pathname);
  const routeAuthorized = canOpenSection(workspaceCapabilities, activeSection)
    && (!exactFinancialRoute || (
      hasCapability(workspaceCapabilities, capabilityForFinancialRoute(exactFinancialRoute))
      && (!exactFinancialRoute.startsWith("/hawala/") || hawalaEnabled)
    ));
  const normalizedSearch = globalSearch.trim().toLocaleLowerCase(language);
  const globalSearchResults = normalizedSearch
    ? [
        ...tradeCounterparties.map((person) => ({ id: `person-${person.id}`, path: `${workspaceRoot(organizationId)}/customers/${person.id}`, kind: searchUi[language].people, label: person.display_name, detail: person.phone ?? "" })),
        ...moneyAccounts.map((account) => ({ id: `account-${account.id}`, path: `${workspaceRoot(organizationId)}/money/${account.id}`, kind: searchUi[language].account, label: account.name, detail: account.reference_label ?? account.account_type.replaceAll("_", " ") })),
        ...trades.map((trade) => ({ id: `transaction-${trade.id}`, path: `${workspaceRoot(organizationId)}/transactions/${trade.id}`, kind: searchUi[language].transaction, label: trade.customer, detail: `${trade.direction} · ${trade.status}` })),
      ].filter((item) => `${item.label} ${item.detail} ${item.kind}`.toLocaleLowerCase(language).includes(normalizedSearch)).slice(0, 10)
    : [];
  const operationLabel = (kind: OperationKind) =>
    ({
      RECEIVE_MONEY: t("receive"),
      PAY_MONEY: t("pay"),
      TRANSFER_CASH: t("transfer"),
      RECORD_EXPENSE: t("expense"),
      RECORD_INCOME: u("income"),
      OWNER_INVESTMENT: t("ownerCapital"),
      OWNER_WITHDRAWAL: u("ownerWithdrawal"),
      BANK_DEPOSIT: u("bankDeposit"),
      BANK_WITHDRAWAL: u("bankWithdrawal"),
    })[kind];
  const operationReceivesMoney = Boolean(operationKind && [
    "RECEIVE_MONEY",
    "RECORD_INCOME",
    "OWNER_INVESTMENT",
  ].includes(operationKind));
  const operationPaysMoney = Boolean(operationKind && [
    "PAY_MONEY",
    "RECORD_EXPENSE",
    "OWNER_WITHDRAWAL",
  ].includes(operationKind));
  const shopTradeRate = tradeSide === "BUY_FX" ? rate : sellRate;
  const exchangeSourceValuationRate =
    exchangeSourceRatePublication?.sell_rate || sellRate;
  const exchangeTargetValuationRate =
    exchangeTargetRatePublication?.buy_rate || tradeReceiveBuyRate;
  let impliedExchangeRate = "";
  try {
    if (exchangeSourceValuationRate && exchangeTargetValuationRate) {
      impliedExchangeRate = new Decimal(exchangeSourceValuationRate)
        .div(exchangeTargetValuationRate)
        .toFixed(12);
    }
  } catch {
    impliedExchangeRate = "";
  }
  const effectiveTradeRate = tradeSide === "EXCHANGE_FX"
    ? rateOverrideEnabled
      ? tradeExchangeRate
      : impliedExchangeRate
    : rateOverrideEnabled
      ? rateOverride
      : shopTradeRate;
  const canPublishTransactionRate = capability("rates.manage");
  const rateWorkflowCopy = language === "en"
    ? {
        noRate: "No shop rate is published for this currency.",
        stale: "This shop rate is older than 24 hours.",
        current: "Current shop rate",
        useDifferent: "Use a different rate for this transaction",
        newRate: "Transaction rate",
        publish: "Publish this as the new shop rate",
        continueStale: "Continue with the current old rate",
        approval: "If this rate is outside the allowed difference, it will be sent for approval and your draft will stay open.",
        custom: "Rate for this customer",
        useShop: "Use shop rate",
        feeAfn: "Commission (AFN)",
        noteOptional: "Add a note (optional)",
        exchangeBasis: "How this cross-rate is calculated",
      }
    : language === "fa-AF"
      ? {
          noRate: "برای این اسعار نرخ صرافی ثبت نشده است.",
          stale: "این نرخ دکان بیشتر از ۲۴ ساعت قدیمی است.",
          current: "نرخ فعلی دکان",
          useDifferent: "برای این معامله نرخ متفاوت استفاده شود",
          newRate: "نرخ معامله",
          publish: "این نرخ به‌عنوان نرخ جدید دکان نشر شود",
          continueStale: "با نرخ فعلی قدیمی ادامه داده شود",
          approval: "اگر نرخ بیرون از تفاوت مجاز باشد، برای تأیید فرستاده می‌شود و پیش‌نویس باز می‌ماند.",
          custom: "نرخ همین مشتری",
          useShop: "گذاشتن نرخ صرافی",
          feeAfn: "کمیشن (AFN)",
          noteOptional: "یادداشت (اختیاری)",
          exchangeBasis: "این نرخ چگونه حساب شده؟",
        }
      : {
          noRate: "د دې اسعارو لپاره د دوکان نرخ نه دی خپور شوی.",
          stale: "د دوکان دا نرخ له ۲۴ ساعتونو زوړ دی.",
          current: "د دوکان اوسنی نرخ",
          useDifferent: "د دې معاملې لپاره بل نرخ وکاروئ",
          newRate: "د معاملې نرخ",
          publish: "دا د دوکان د نوي نرخ په توګه خپور کړئ",
          continueStale: "له اوسني زاړه نرخ سره دوام ورکړئ",
          approval: "که نرخ له اجازه شوې توپیر څخه بهر وي، د تایید لپاره لېږل کېږي او مسوده خلاصه پاتې کېږي.",
          custom: "د همدې پېرېدونکي نرخ",
          useShop: "د صرافۍ نرخ وکاروئ",
          feeAfn: "کمېشن (AFN)",
          noteOptional: "یادښت (اختیاري)",
          exchangeBasis: "دا نرخ څنګه حساب شوی؟",
        };
  const tradeRateTargetCurrency = tradeSide === "EXCHANGE_FX" ? tradeReceiveCurrency : "AFN";
  const displayedTradeRate = tradeSide === "EXCHANGE_FX"
    ? (rateOverrideEnabled ? tradeExchangeRate : impliedExchangeRate)
    : (rateOverrideEnabled ? rateOverride : shopTradeRate);
  const tradeRateMissing = rateContext.missing || (tradeSide === "EXCHANGE_FX" && tradeReceiveRateContext.missing);
  const tradeRateStale = rateContext.stale || (tradeSide === "EXCHANGE_FX" && tradeReceiveRateContext.stale);
  const tradeRateStatus = rateOverrideEnabled
    ? rateWorkflowCopy.custom
    : tradeRateMissing
      ? rateWorkflowCopy.noRate
      : tradeRateStale
        ? rateWorkflowCopy.stale
        : rateWorkflowCopy.current;
  const changeDisplayedTradeRate = (next: string) => {
    setRateOverrideEnabled(true);
    if (tradeSide === "EXCHANGE_FX") setTradeExchangeRate(next);
    else setRateOverride(next);
    setAllowStaleRate(false);
    setPublishRate(false);
    setTradeReviewing(false);
  };
  const restoreApprovedTradeRate = () => {
    setRateOverrideEnabled(false);
    setRateOverride("");
    setTradeExchangeRate("");
    setPublishRate(false);
    setTradeReviewing(false);
  };
  let tradePreview: ReturnType<typeof deriveTradeAmounts> | null = null;
  try {
    if (amount && tradeSide === "EXCHANGE_FX" && effectiveTradeRate && exchangeSourceValuationRate && exchangeTargetValuationRate)
      tradePreview = {
        rate: effectiveTradeRate,
        soldAmount: new Decimal(amount).toFixed(12),
        boughtAmount: new Decimal(amount).times(effectiveTradeRate).toFixed(12),
        soldBaseValue: new Decimal(amount).times(exchangeSourceValuationRate).toFixed(12),
        boughtBaseValue: new Decimal(amount).times(effectiveTradeRate).times(exchangeTargetValuationRate).toFixed(12),
      };
    else if (amount && tradeSide !== "EXCHANGE_FX" && effectiveTradeRate)
      tradePreview = deriveTradeAmounts(tradeSide, amount, effectiveTradeRate, effectiveTradeRate);
  } catch {
    tradePreview = null;
  }
  const tradeGivenAmount =
    tradeSide === "BUY_FX" ? tradePreview?.soldAmount : amount;
  const tradeGivenCurrency = tradeSide === "BUY_FX" ? "AFN" : tradeCurrency;
  const tradeReceivedAmount =
    tradeSide === "BUY_FX" ? amount : tradePreview?.boughtAmount;
  const tradeReceivedCurrency =
    tradeSide === "BUY_FX"
      ? tradeCurrency
      : tradeSide === "EXCHANGE_FX"
        ? tradeReceiveCurrency
        : "AFN";
  const activeMoneyAccountName =
    moneyAccounts.find((account) => account.cashbox_id === cashboxId)?.name ??
    moneyAccounts.find((account) => account.account_type === "cashbox")?.name ??
    u("activeCashboxAccount");
  const preparedBy = inspectionMode
    ? roleLabel
    : String(user?.user_metadata?.display_name ?? user?.email ?? roleLabel);

  const openingAuth = !user && !inspectionMode ? (
    <AuthScreen
      language={language}
      onLanguageChange={(nextLanguage) => {
        setLanguage(nextLanguage);
        setAuthMessage("");
        setAuthMessageKind(null);
      }}
      mode={authMode}
      email={authEmail}
      password={authPassword}
      fullName={authFullName}
      confirmPassword={authConfirmPassword}
      message={authMessage}
      messageKind={authMessageKind}
      busy={authBusy}
      invitation={Boolean(inviteToken)}
      onModeChange={(mode) => {
        setAuthMode(mode);
        setAuthMessage("");
        setAuthMessageKind(null);
      }}
      onEmailChange={setAuthEmail}
      onPasswordChange={setAuthPassword}
      onFullNameChange={setAuthFullName}
      onConfirmPasswordChange={setAuthConfirmPassword}
      onSubmit={submitAuth}
    />
  ) : null;

  if (platformAdminRoute) {
    if (!user && !platformInspectionPreview)
      return (
        <AuthScreen
          language={language}
          onLanguageChange={setLanguage}
          mode="signIn"
          email={authEmail}
          password={authPassword}
          fullName={authFullName}
          confirmPassword={authConfirmPassword}
          message={authMessage}
          messageKind={authMessageKind}
          busy={authBusy}
          invitation={false}
          adminPortal
          onModeChange={() => undefined}
          onEmailChange={setAuthEmail}
          onPasswordChange={setAuthPassword}
          onFullNameChange={setAuthFullName}
          onConfirmPasswordChange={setAuthConfirmPassword}
          onSubmit={submitAuth}
        />
      );
    return (
      <Suspense fallback={<main className="auth-shell" role="status">{t("working")}</main>}>
        <PlatformAdminConsole
          language={language}
          onLanguageChange={setLanguage}
          onSignOut={() => void handleSignOut()}
        />
      </Suspense>
    );
  }

  if (showOpening)
    return (
      <Suspense fallback={<main className="auth-shell" role="status">{t("working")}</main>}>
        <OpeningExperience language={language} onComplete={completeOpening}>
          {openingAuth}
        </OpeningExperience>
      </Suspense>
    );
  if (!user && !inspectionMode)
    return (
      <AuthScreen
        language={language}
        onLanguageChange={(nextLanguage) => {
          setLanguage(nextLanguage);
          setAuthMessage("");
          setAuthMessageKind(null);
        }}
        mode={authMode}
        email={authEmail}
        password={authPassword}
        fullName={authFullName}
        confirmPassword={authConfirmPassword}
        message={authMessage}
        messageKind={authMessageKind}
        busy={authBusy}
        invitation={Boolean(inviteToken)}
        onModeChange={(mode) => {
          setAuthMode(mode);
          setAuthMessage("");
          setAuthMessageKind(null);
        }}
        onEmailChange={(value) => {
          setAuthEmail(value);
          setAuthMessage("");
          setAuthMessageKind(null);
        }}
        onPasswordChange={(value) => {
          setAuthPassword(value);
          setAuthMessage("");
          setAuthMessageKind(null);
        }}
        onFullNameChange={setAuthFullName}
        onConfirmPasswordChange={setAuthConfirmPassword}
        onSubmit={submitAuth}
      />
    );
  if (organizationLoading)
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand auth-brand">
            <span className="brand-mark">S</span>
            <span>
              SARAFI<small>{u("sarafiTagline")}</small>
            </span>
          </div>
          <p className="auth-subtitle">{t("awaitingLiveLedger")}</p>
        </section>
      </main>
    );
  if (!organizationId && inviteToken && invitationFailure)
    return (
      <main className="auth-shell">
        <section className="auth-card invitation-problem" role="alert">
          <div className="brand auth-brand">
            <span className="brand-mark">S</span>
            <span>SARAFI</span>
          </div>
          <p className="kicker">{u("joinTeam")}</p>
          <h1>{u("invitationInvalid")}</h1>
          <p className="auth-subtitle">{invitationFailure}</p>
          <button className="primary-action full" onClick={handleSignOut}>
            {u("signOutDifferentAccount")}
          </button>
        </section>
      </main>
    );
  if (!organizationId && workspaceEntryMode === "join")
    return (
      <WorkerConnectionLobby
        language={language}
        code={connectionCode}
        kind={connectionKind}
        name={connectionName}
        busy={connectionBusy}
        message={connectionMessage}
        onLanguageChange={setLanguage}
        onKindChange={(kind) => {
          setConnectionKind(kind);
          setConnectionCode("");
          setConnectionMessage("");
        }}
        onNameChange={setConnectionName}
        onCodeChange={(value) => {
          setConnectionCode(value.replaceAll(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, connectionKind === "invitation" ? 10 : 12));
          setConnectionMessage("");
        }}
        onSubmit={submitConnectionCode}
        onCreateBusiness={() => setWorkspaceEntryMode("business")}
        onSignOut={() => void handleSignOut()}
      />
    );
  if (!organizationId)
    return (
      <OnboardingScreen
        language={language}
        businessName={businessName}
        currencies={onboardingCurrencies}
        catalog={currencyCatalog}
        cashboxName={onboardingCashboxName}
        branchName={onboardingBranchName}
        busy={organizationLoading}
        onLanguageChange={setLanguage}
        onBusinessNameChange={setBusinessName}
        onCurrenciesChange={setOnboardingCurrencies}
        onCashboxNameChange={setOnboardingCashboxName}
        onBranchNameChange={setOnboardingBranchName}
        onSubmit={submitOnboarding}
        onBack={() => setWorkspaceEntryMode("join")}
      />
    );

  return (
    <div className={`app-shell ${isRtl(language) ? "rtl" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>
            SARAFI<small>{u("sarafiTagline")}</small>
          </span>
        </div>
        <button
          className="branch-switch"
          onClick={() => setShowBranchMenu(!showBranchMenu)}
          aria-expanded={showBranchMenu}
        >
          <span className="status-dot" />
          <span>
            <b>{organizationName || u("yourBusiness")}</b>
            <small>
              {inspectionMode
                ? t("mainBranch")
                : branchName || u("assignedBranch")}
            </small>
          </span>
          <span className="chevron">⌄</span>
        </button>
        {showBranchMenu && (
          <div className="action-menu branch-menu">
            {inspectionMode ? (
              <button onClick={() => setShowBranchMenu(false)}>
                {t("mainBranch")} <small>{t("activeBranch")}</small><span>✓</span>
              </button>
            ) : (
              workspaceContexts.map((context) => (
                <div className="workspace-switch-group" key={context.membership_id}>
                  <p>{context.organization_name}</p>
                  {context.branches.map((branch) => (
                    <button key={branch.id} onClick={() => chooseWorkspace(context, branch.id)}>
                      {branch.name}
                      <small>{roleName(context.role_code)}</small>
                      <span>{activeMembershipId === context.membership_id && branchId === branch.id ? "✓" : "→"}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
        <p className="nav-label">{t("workspace")}</p>
        <nav>
          {primaryNavigation.map(([item, label, icon]) => (
            <button
              className={activeSection === item || (item === "Trade" && location.pathname.includes("/transactions/new/")) ? "nav-item active" : "nav-item"}
              key={item}
              onClick={() => {
                if (item === "Search") {
                  setShowSearch(true);
                  setShowNotifications(false);
                } else openSection(item);
              }}
            >
              <span className="nav-icon">
                <AppIcon name={icon} />
              </span>
              {label}
              {item === "Transactions" && (
                <em>{dashboard?.transaction_count ?? "—"}</em>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">
            {inspectionMode
              ? "AI"
              : (user?.email?.slice(0, 2).toUpperCase() ?? "MA")}
          </div>
          <span>
            <b>{user?.email ?? t("readOnlyInspection")}</b>
            <small>
              {inspectionMode
                ? `${roleLabel} · ${t("publicPreview")}`
                : roleLabel}
            </small>
          </span>
        </div>
      </aside>
      <nav
        className="mobile-nav"
        aria-label={t("workspace")}
        style={{ gridTemplateColumns: `repeat(${primaryNavigation.length}, minmax(0, 1fr))` }}
      >
        {primaryNavigation.map(([item, label, icon]) => (
          <button
            className={activeSection === item || (item === "Trade" && location.pathname.includes("/transactions/new/")) ? "active" : ""}
            key={item}
            onClick={() => {
              if (item === "Search") {
                setShowSearch(true);
                setShowNotifications(false);
              } else openSection(item);
            }}
          >
            <span>
              <AppIcon name={icon} />
            </span>
            {label}
          </button>
        ))}
      </nav>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{t("workspace")}</span>
            <b>/</b>
            <strong>{sectionLabel(activeSection)}</strong>
          </div>
          <div className="top-actions">
            <div className="global-search-control">
              <button className="icon-button" onClick={() => { setShowSearch((value) => !value); setShowNotifications(false); }} aria-label={searchUi[language].open} aria-expanded={showSearch}><AppIcon name="search" /></button>
              {showSearch && <section className="global-search-popover" aria-label={searchUi[language].open}>
                <label><AppIcon name="search" size={18} /><input autoFocus value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder={searchUi[language].placeholder} /></label>
                {normalizedSearch ? <div className="global-search-results">{globalSearchResults.length ? globalSearchResults.map((result) => <button key={result.id} onClick={() => { navigate(result.path); setShowSearch(false); setGlobalSearch(""); }}><span><b>{result.label}</b><small>{result.detail}</small></span><em>{result.kind}</em></button>) : <p>{searchUi[language].empty}</p>}</div> : null}
              </section>}
            </div>
            <div className="notification-control">
              <button
                className="icon-button notification-button"
                onClick={() => { setShowNotifications((value) => !value); setShowSearch(false); }}
                aria-label={notificationUi[language].open}
                aria-expanded={showNotifications}
              >
                <AppIcon name="transactions" />
                {notifications.some((item) => item.status === "unread") && <span>{notifications.filter((item) => item.status === "unread").length}</span>}
              </button>
              {showNotifications && <section className="notification-popover" aria-label={notificationUi[language].title}>
                <h2>{notificationUi[language].title}</h2>
                {notifications.length ? notifications.map((notice) => <article className={notice.status === "unread" ? "unread" : ""} key={notice.id}>
                  <button className="notification-open" onClick={() => void actOnNotification(notice)}>
                    <b>{(notificationUi[language] as Record<string, string>)[notice.notification_type] ?? notice.message}</b>
                    <time>{new Date(notice.created_at).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" })}</time>
                  </button>
                  <button className="notification-dismiss" onClick={() => void actOnNotification(notice, true)} aria-label={notificationUi[language].dismiss}>×</button>
                </article>) : <p>{notificationUi[language].empty}</p>}
              </section>}
            </div>
            <div className="profile-control">
              <button
                className="profile-button"
                onClick={() => { setShowProfileMenu((value) => !value); setShowSearch(false); setShowNotifications(false); }}
                aria-label={language === "en" ? "Profile and preferences" : language === "fa-AF" ? "پروفایل و ترجیحات" : "پروفایل او غوره توبونه"}
                aria-expanded={showProfileMenu}
              >
                <span>{inspectionMode ? "AI" : (user?.email?.slice(0, 2).toUpperCase() ?? "MA")}</span>
              </button>
              {showProfileMenu ? <section className="profile-popover" aria-label={language === "en" ? "Profile and preferences" : language === "fa-AF" ? "پروفایل و ترجیحات" : "پروفایل او غوره توبونه"}>
                <header><strong>{user?.email ?? t("readOnlyInspection")}</strong><small>{roleLabel}</small></header>
                <label>{u("changeLanguage")}<select value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">English</option><option value="fa-AF">دری</option><option value="ps-AF">پښتو</option></select></label>
                <button type="button" onClick={() => setPrivacy((value) => !value)}><AppIcon name={privacy ? "eye" : "eyeOff"} size={18} />{privacy ? u("showAmounts") : u("hideAmounts")}</button>
                <button type="button" onClick={() => { setShowHelp(true); setShowProfileMenu(false); }}>?<span>{u("openHelp")}</span></button>
                {!inspectionMode ? <button type="button" className="profile-sign-out" onClick={() => void handleSignOut()}>↪<span>{u("signOut")}</span></button> : null}
              </section> : null}
            </div>
          </div>
        </header>
        <div className="content-wrap">
          <Outlet context={{ content: <>
          {clientUpdateAvailable && <div className="system-announcement service-update" role="status"><span><b>{language === "en" ? "A verified app update is ready." : language === "fa-AF" ? "به‌روزرسانی تأییدشده برنامه آماده است." : "د اپ تایید شوی تازه‌والی چمتو دی."}</b><small>{language === "en" ? "Finish your current task, then update safely." : language === "fa-AF" ? "کار فعلی را تمام کرده، سپس با اطمینان به‌روزرسانی کنید." : "اوسنی کار پای ته ورسوئ، بیا په خوندي ډول اپ تازه کړئ."}</small></span><button onClick={() => { void navigator.serviceWorker.getRegistration().then((registration) => registration?.waiting?.postMessage({ type: "SKIP_WAITING" })); }}>{language === "en" ? "Update app" : language === "fa-AF" ? "به‌روزرسانی برنامه" : "اپ تازه کړئ"}</button></div>}
          {platformStatus?.web_version?.force_update && <div className="system-announcement security" role="alert"><span><b>{language === "en" ? "A new SARAFI web version is ready." : language === "fa-AF" ? "نسخه تازه ویب صرافی آماده است." : "د صرافۍ نوې وېب نسخه چمتو ده."}</b><small>{language === "en" ? platformStatus.web_version.release_notes_en : language === "fa-AF" ? platformStatus.web_version.release_notes_dari : platformStatus.web_version.release_notes_pashto}</small></span><button onClick={() => window.location.reload()}>{language === "en" ? "Refresh now" : language === "fa-AF" ? "تازه کردن" : "اوس تازه کول"}</button></div>}
          {platformStatus?.announcements.map((notice) => <div className={`system-announcement ${notice.type}`} role="status" key={notice.id}><span>{language === "en" ? notice.message_en : language === "fa-AF" ? notice.message_dari : notice.message_pashto}</span></div>)}
          {!routeAuthorized && (
            <section className="panel access-denied" role="alert">
              <p className="kicker">{roleLabel}</p>
              <h1>{language === "en" ? "Access not allowed" : language === "fa-AF" ? "دسترسی اجازه نیست" : "لاسرسی اجازه نه لري"}</h1>
              <p>{language === "en" ? "Your assigned role cannot open this workspace." : language === "fa-AF" ? "وظیفه تعیین‌شده شما اجازه بازکردن این بخش را نمی‌دهد." : "ستاسو ټاکل شوې دنده د دې برخې د پرانیستلو اجازه نه لري."}</p>
              <button className="primary-action" onClick={() => openSection("Dashboard", true)}>{t("home")}</button>
            </section>
          )}
          {routeAuthorized && !dashboardView && (
            transactionCenterActive && !transactionFormActive ? (
              <Suspense fallback={<section className="panel" role="status">{t("working")}</section>}>
                <TransactionCenter
                  language={language}
                  capabilities={workspaceCapabilities}
                  hawalaEnabled={hawalaEnabled}
                  onOpen={(route) => {
                    if (route === "/fx/buy") openTrade("BUY_FX");
                    else if (route === "/fx/sell") openTrade("SELL_FX");
                    else if (route === "/fx/exchange") openTrade("EXCHANGE_FX");
                    else if (route === "/debts" || route === "/hawala/partners") navigate(`${workspaceRoot(organizationId)}${route}`);
                    else navigate(financialRoute(organizationId, route));
                  }}
                />
              </Suspense>
            ) : !transactionCenterActive ? (
              <Suspense fallback={<section className="panel" role="status">{t("working")}</section>}>
                <WorkspaceView
                  language={language}
                  section={activeSection}
                  pathname={location.pathname}
                  activityRefresh={workspaceActivityRefresh}
                  businessDate={dashboardDate}
                  organizationId={organizationId}
                  organizationName={organizationName || u("yourBusiness")}
                  branchName={
                    inspectionMode ? t("mainBranch") : branchName || t("mainBranch")
                  }
                  cashboxName={activeMoneyAccountName}
                  preparedBy={preparedBy}
                  roleLabel={roleLabel}
                  canManageTeam={capability("team.manage")}
                  canManageCapabilities={capability("team.capabilities.manage")}
                  canInviteBusinessAdmin={capability("ownership.transfer")}
                  canDecideApprovals={capability("approval.decide")}
                  canApproveReconciliation={capability("reconciliation.approve")}
                  canManageMoney={hasAnyCapability(workspaceCapabilities, ["organization.manage", "money_accounts.manage", "rates.manage"])}
                  canReverse={capability("financial.reverse")}
                  capabilities={workspaceCapabilities}
                  userId={user?.id ?? "inspection-user"}
                  deviceId={linkedDevice?.id ?? ""}
                  branchId={branchId}
                  cashboxId={cashboxId}
                  onDashboard={() => openSection("Dashboard")}
                  onNavigate={openSection}
                  onRoute={(path) => navigate(path)}
                  onToast={setToast}
                  onFinancialCompleted={setCompletedTrade}
                  onCounterpartyChanged={(person) => {
                    if (person) setTradeCounterparties((current) => current.some((item) => item.id === person.id) ? current : [...current, person]);
                    setCounterpartyRefresh((value) => value + 1);
                  }}
                />
              </Suspense>
            ) : null
          )}
          {routeAuthorized && dashboardView && (
            <Suspense fallback={<section className="panel" role="status">{t("working")}</section>}>
              <RoleHome
                language={language}
                role={workspaceRole}
                roleLabel={roleLabel}
                dashboard={dashboard}
                businessDate={dashboardDate}
                online={online}
                privacy={privacy}
                onTogglePrivacy={() => setPrivacy((value) => !value)}
                onNavigate={openSection}
              />
            </Suspense>
          )}
      {routeAuthorized && fxFormActive && transactionFormActive && (
        <div className="transaction-inline-form">
          {fxApprovalBusy && !fxApprovalDraft ? <div className="empty-live" role="status">{language === "en" ? "Loading approval draft…" : language === "fa-AF" ? "بارگیری پیش‌نویس تأیید…" : "د تایید مسوده پورته کېږي…"}</div> : null}
          {fxApprovalDraft ? (
            <section className="approval-draft-status" aria-live="polite">
              <div>
                <p className="kicker">{language === "en" ? "Saved approval draft" : language === "fa-AF" ? "پیش‌نویس تأیید ذخیره‌شده" : "ساتل شوې د تایید مسوده"}</p>
                <h2>{fxApprovalDraft.status === "approved" ? (language === "en" ? "Approved — ready to post" : language === "fa-AF" ? "تأیید شد — آماده ثبت" : "تایید شوه — ثبت ته چمتو") : fxApprovalDraft.status === "pending" ? (language === "en" ? "Waiting for approval" : language === "fa-AF" ? "در انتظار تأیید" : "تایید ته په تمه") : fxApprovalDraft.status}</h2>
                <p dir="ltr">{String(fxApprovalDraft.draft.sold_amount ?? "—")} {String(fxApprovalDraft.draft.sold_currency ?? "")} → {String(fxApprovalDraft.draft.bought_amount ?? "—")} {String(fxApprovalDraft.draft.bought_currency ?? "")}</p>
                <small>{language === "en" ? "This immutable server draft survives refresh and navigation." : language === "fa-AF" ? "این پیش‌نویس تغییرناپذیر سرور پس از تازه‌سازی و رفت‌وآمد محفوظ می‌ماند." : "دا نه بدلېدونکې سروري مسوده له بیا پورته کولو او تګ راتګ وروسته هم ساتل کېږي."}</small>
              </div>
              {fxApprovalDraft.status === "approved" ? <button type="button" className="primary-action" disabled={fxApprovalBusy} onClick={() => void resumeFxApprovalDraft()}>{fxApprovalBusy ? t("working") : (language === "en" ? "Post approved transaction" : language === "fa-AF" ? "ثبت معامله تأییدشده" : "تایید شوې معامله ثبت کړئ")}</button> : null}
              {fxApprovalDraft.status === "pending" ? <button type="button" className="text-button" disabled={fxApprovalBusy} onClick={() => {
                void getMyResumableApprovalDraft(fxApprovalDraft.id).then((result) => {
                  if (result.data) setFxApprovalDraft(result.data);
                  if (result.error) setToast(localizedFinancialError(language, result.error, u("couldNotLoad")));
                });
              }}>{language === "en" ? "Refresh status" : language === "fa-AF" ? "تازه‌سازی وضعیت" : "حالت تازه کړئ"}</button> : null}
            </section>
          ) : null}
          <form
            className="financial-task-form transaction-page-form trade-entry-form"
            onSubmit={addTrade}
            aria-labelledby="trade-dialog-title"
          >
            <div className="modal-head">
              <div>
                <p className="kicker">{t("newTransaction")}</p>
                <h2 id="trade-dialog-title">
                  {tradeSide === "BUY_FX"
                    ? t("buy")
                    : tradeSide === "SELL_FX"
                      ? t("sell")
                      : t("exchange")}{" "}
                  · {t("recordTrade")}
                </h2>
              </div>
              <button
                type="button"
                className="text-button transaction-back"
                onClick={() => {
                  setTradeReviewing(false);
                  openSection("Trade");
                }}
                aria-label={t("closeTrade")}
              >
                {language === "en" ? "Back to transaction types" : language === "fa-AF" ? "بازگشت به نوع معامله" : "د معاملې ډولونو ته ستنېدل"}
              </button>
            </div>
            <div className="trade-mode-switch" role="tablist" aria-label={t("newTransaction")}>
              {([
                ["BUY_FX", t("buy")],
                ["SELL_FX", t("sell")],
                ["EXCHANGE_FX", t("exchange")],
              ] as const).map(([side, label]) => (
                <button
                  key={side}
                  type="button"
                  role="tab"
                  aria-selected={tradeSide === side}
                  className={tradeSide === side ? "active" : ""}
                  disabled={tradeBusy}
                  onClick={() => {
                    if (tradeSide === side) setTradeReviewing(false);
                    else openTrade(side);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <fieldset
              className="trade-fields"
              disabled={tradeReviewing || tradeBusy}
            >
              <div className="exchange-entry-row" dir="ltr">
                <label className="exchange-money-card">
                  <span className="exchange-card-label" dir={isRtl(language) ? "rtl" : "ltr"}>
                    {tradeSide === "BUY_FX" ? t("buyAmount") : t("sellAmount")}
                  </span>
                  <input
                    required
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    aria-label={`${tradeSide === "BUY_FX" ? t("buyAmount") : t("sellAmount")} ${tradeCurrency}`}
                    autoFocus
                  />
                  <select
                    aria-label={t("currency")}
                    value={tradeCurrency}
                    onChange={(event) => {
                      const nextCurrency = event.target.value;
                      setTradeCurrency(nextCurrency);
                      if (nextCurrency === tradeReceiveCurrency) {
                        setTradeReceiveCurrency(tradeCurrencies.find((item) => item !== nextCurrency) ?? "");
                      }
                      setRateState("");
                      setSellRate("");
                      setTradeExchangeRate("");
                      setRateOverrideEnabled(false);
                      setRateOverride("");
                      setExchangeSourceRatePublication(undefined);
                      setExchangeTargetRatePublication(undefined);
                      setTradeReviewing(false);
                    }}
                  >
                    {tradeCurrencies.map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </label>

                <div className="rate-box exchange-rate-card">
                  <span className="exchange-card-label" dir={isRtl(language) ? "rtl" : "ltr"}>{t("exchangeRate")}</span>
                  <label className="rate-input-shell">
                    <small>1 {tradeCurrency} =</small>
                    <input
                      required
                      min="0.000001"
                      step="any"
                      inputMode="decimal"
                      value={displayedTradeRate}
                      onChange={(event) => changeDisplayedTradeRate(event.target.value)}
                      placeholder="0.00"
                      aria-label={rateWorkflowCopy.newRate}
                    />
                    <small>{tradeRateTargetCurrency}</small>
                  </label>
                  <small className={!rateOverrideEnabled && (tradeRateMissing || tradeRateStale) ? "rate-warning" : "positive"} dir={isRtl(language) ? "rtl" : "ltr"}>
                    {tradeRateStatus}
                  </small>
                  {rateOverrideEnabled && (shopTradeRate || impliedExchangeRate) ? (
                    <button type="button" className="text-button" onClick={restoreApprovedTradeRate}>{rateWorkflowCopy.useShop}</button>
                  ) : null}
                </div>

                <label className="exchange-money-card">
                  <span className="exchange-card-label" dir={isRtl(language) ? "rtl" : "ltr"}>
                    {tradeSide === "BUY_FX" ? t("sellAmount") : t("buyAmount")}
                  </span>
                  <input
                    value={
                      tradeSide === "BUY_FX"
                        ? tradePreview?.soldAmount
                          ? new Decimal(tradePreview.soldAmount).toFixed(2)
                          : ""
                        : tradePreview?.boughtAmount
                          ? new Decimal(tradePreview.boughtAmount).toFixed(2)
                          : ""
                    }
                    readOnly
                    placeholder="0.00"
                    aria-label={`${tradeSide === "BUY_FX" ? t("sellAmount") : t("buyAmount")} ${tradeRateTargetCurrency}`}
                  />
                  {tradeSide === "EXCHANGE_FX" ? (
                    <select
                      aria-label={t("currency")}
                      value={tradeReceiveCurrency}
                      onChange={(event) => {
                        setTradeReceiveCurrency(event.target.value);
                        setTradeExchangeRate("");
                        setRateOverrideEnabled(false);
                        setExchangeTargetRatePublication(undefined);
                        setTradeReviewing(false);
                      }}
                    >
                      {tradeCurrencies
                        .filter((currency) => currency !== tradeCurrency)
                        .map((currency) => (
                          <option key={currency}>{currency}</option>
                        ))}
                    </select>
                  ) : (
                    <select aria-label={t("currency")} value="AFN" disabled>
                      <option>AFN</option>
                    </select>
                  )}
                </label>
              </div>
              <div className="trade-quick-fields">
                <label>
                  {t("customer")}
                  <select
                    value={tradeCounterparty}
                    onChange={(event) => setTradeCounterparty(event.target.value)}
                  >
                    <option value="">{t("walkInCustomer")}</option>
                    {tradeCounterparties.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {rateWorkflowCopy.feeAfn}
                  <input
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={tradeFee}
                    onChange={(event) => setTradeFee(event.target.value)}
                    placeholder="0.00"
                  />
                </label>
              </div>
              <details className="trade-optional-fields">
                <summary>{rateWorkflowCopy.noteOptional}</summary>
                <label>
                  {t("note")}
                  <input
                    value={tradeNote}
                    onChange={(event) => setTradeNote(event.target.value)}
                    placeholder={t("optionalNote")}
                  />
                </label>
              </details>
            </fieldset>
            {tradeSide === "EXCHANGE_FX" && (
              <details
                className={`rate-governance exchange-rate-governance ${!exchangeSourceRateReady || !exchangeTargetRateReady ? "needs-attention" : ""}`}
                open={!exchangeSourceRateReady || !exchangeTargetRateReady || rateOverrideEnabled}
              >
                <summary>{rateWorkflowCopy.exchangeBasis}</summary>
                <InlineRateResolver
                  organizationId={organizationId}
                  branchId={branchId}
                  currency={tradeCurrency}
                  language={language}
                  canPublish={canPublishTransactionRate}
                  value={exchangeSourceRatePublication}
                  onChange={(value) => { setExchangeSourceRatePublication(value); setTradeReviewing(false); }}
                  onReadyChange={setExchangeSourceRateReady}
                />
                <InlineRateResolver
                  organizationId={organizationId}
                  branchId={branchId}
                  currency={tradeReceiveCurrency}
                  language={language}
                  canPublish={canPublishTransactionRate}
                  value={exchangeTargetRatePublication}
                  onChange={(value) => { setExchangeTargetRatePublication(value); setTradeReviewing(false); }}
                  onReadyChange={setExchangeTargetRateReady}
                />
                {rateOverrideEnabled && capability("approval.request") && !capability("approval.decide") ? <p>{rateWorkflowCopy.approval}</p> : null}
              </details>
            )}
            {tradeSide !== "EXCHANGE_FX" && (rateContext.missing || rateContext.stale || rateOverrideEnabled || allowStaleRate) && (
              <section className={`rate-governance ${rateContext.missing || rateContext.stale ? "needs-attention" : ""}`} aria-label={t("exchangeRate")}>
                {rateContext.effectiveFrom ? (
                  <div className="applied-rate-row">
                    <small>{new Date(rateContext.effectiveFrom).toLocaleString(language)}</small>
                  </div>
                ) : null}
                {rateContext.stale && !rateContext.missing && (
                  <label className="choice-row">
                    <input type="checkbox" checked={allowStaleRate} disabled={tradeReviewing || tradeBusy || rateOverrideEnabled} onChange={(event) => { setAllowStaleRate(event.target.checked); setTradeReviewing(false); }} />
                    <span>{rateWorkflowCopy.continueStale}</span>
                  </label>
                )}
                {rateOverrideEnabled && canPublishTransactionRate && (
                  <label className="choice-row">
                    <input type="checkbox" checked={publishRate} disabled={tradeReviewing || tradeBusy} onChange={(event) => { setPublishRate(event.target.checked); setTradeReviewing(false); }} />
                    <span>{rateWorkflowCopy.publish}</span>
                  </label>
                )}
                {capability("approval.request") && !capability("approval.decide") && (rateOverrideEnabled || allowStaleRate || rateContext.missing) && <p>{rateWorkflowCopy.approval}</p>}
              </section>
            )}
            {(
              <section className="trade-account-flow">
                <h3>{u("tradeMoneyFlow")}</h3>
                <div className="money-flow-summary">
                  <span>
                    <small>{u("sourceAccount")}</small>
                    <b>{tradeSide === "BUY_FX" ? u("customerOutside") : activeMoneyAccountName}</b>
                  </span>
                  <strong aria-hidden="true">→</strong>
                  <span>
                    <small>{u("destinationAccount")}</small>
                    <b>{tradeSide === "BUY_FX" ? activeMoneyAccountName : tradeSide === "EXCHANGE_FX" ? activeMoneyAccountName : u("customerOutside")}</b>
                  </span>
                </div>
                <p>{u("tradeHasTwoMoneySides")}</p>
              </section>
            )}
            {tradeReviewing && tradePreview && (
              <div className="confirmation-backdrop">
              <section className="trade-confirmation confirmation-window" role="dialog" aria-modal="true" aria-labelledby="trade-confirmation-title">
                <h3 id="trade-confirmation-title">{u("confirmationTitle")}</h3>
                <p>{u("confirmationIntro")}</p>
                <div className="setup-summary receipt-review-summary">
                  <span>{t("sellAmount")}</span>
                  <b dir="ltr">
                    {new Decimal(tradeGivenAmount || "0").toFixed(2)}{" "}
                    {tradeGivenCurrency}
                  </b>
                  <span>{t("buyAmount")}</span>
                  <b dir="ltr">
                    {new Decimal(tradeReceivedAmount || "0").toFixed(2)}{" "}
                    {tradeReceivedCurrency}
                  </b>
                  <span>{t("exchangeRate")}</span>
                  <b dir="ltr">
                    {effectiveTradeRate}{" "}
                    {tradeSide === "EXCHANGE_FX" ? tradeReceiveCurrency : "AFN"}
                  </b>
                  <span>{t("marketRate")}</span>
                  <b>✓</b>
                </div>
                <div className="confirmation-actions">
                  <button type="button" className="text-button" onClick={() => setTradeReviewing(false)}>{u("editTransaction")}</button>
                  <button className="primary-action" type="submit" disabled={tradeBusy} autoFocus>{tradeBusy ? t("working") : u("confirmTransaction")} <span>→</span></button>
                </div>
              </section>
              </div>
            )}
            {!tradeReviewing && <button
              className="primary-action full"
              type="submit"
              disabled={tradeBusy || (tradeSide === "EXCHANGE_FX" && (!exchangeSourceRateReady || !exchangeTargetRateReady || !effectiveTradeRate))}
            >
              {tradeBusy ? t("working") : u("reviewTransaction")}{" "}
              <span>→</span>
            </button>}
            <p className="modal-note">{u("shopCheck")}</p>
          </form>
        </div>
      )}
      {routeAuthorized && operationKind && transactionFormActive && (
        <div className="transaction-inline-form">
          <form
            className="financial-task-form transaction-page-form"
            onSubmit={submitOperation}
            aria-labelledby="operation-dialog-title"
          >
            <div className="modal-head">
              <div>
                <p className="kicker">{u("shopAction")}</p>
                <h2 id="operation-dialog-title">
                  {operationLabel(operationKind)}
                </h2>
              </div>
              <button
                type="button"
                className="text-button transaction-back"
                onClick={() => openSection("Trade")}
                aria-label={t("closeOperation")}
              >
                {language === "en" ? "Back to transaction types" : language === "fa-AF" ? "بازگشت به نوع معامله" : "د معاملې ډولونو ته ستنېدل"}
              </button>
            </div>
            {operationReceivesMoney || operationPaysMoney ? (
              <p className={`transaction-plain-direction ${operationReceivesMoney ? "money-in" : "money-out"}`}>
                {operationReceivesMoney
                  ? (language === "en" ? "This money comes into the shop." : language === "fa-AF" ? "این پول به صرافی می‌آید." : "دا پیسې صرافۍ ته راځي.")
                  : (language === "en" ? "This money leaves the shop." : language === "fa-AF" ? "این پول از صرافی بیرون می‌شود." : "دا پیسې له صرافۍ وځي.")}
              </p>
            ) : null}
            <label>
              {t("amount")}
              <input
                required
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={operationAmount}
                onChange={(event) => setOperationAmount(event.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </label>
            <label>
              {t("currency")}
              <select
                value={operationCurrency}
                onChange={(event) => {
                  const next = event.target.value;
                  setOperationCurrency(next);
                  setOperationRatePublication(undefined);
                  setOperationRateReady(next === "AFN");
                }}
              >
                {enabledCurrencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} · {currencyName(language, currency)}
                  </option>
                ))}
              </select>
            </label>
            {operationCurrency !== "AFN" && (
              <p className="modal-note native-valuation-note">
                {language === "en"
                  ? "Enter the native amount only. SARAFI values it from the approved shop rate when you save."
                  : language === "fa-AF"
                    ? "فقط مبلغ همان اسعار را وارد کنید. سرافی هنگام ثبت، ارزش حسابداری را از نرخ تأییدشده صرافی محاسبه می‌کند."
                    : "یوازې د هماغو اسعارو مبلغ ولیکئ. سرافي یې د ثبت پر مهال د صرافۍ له تایید شوي نرخ څخه حسابوي."}
              </p>
            )}
            <InlineRateResolver
              organizationId={organizationId}
              branchId={branchId}
              currency={operationCurrency}
              language={language}
              canPublish={capability("rates.manage")}
              value={operationRatePublication}
              onChange={setOperationRatePublication}
              onReadyChange={setOperationRateReady}
            />
            {operationKind === "RECORD_EXPENSE" && (
              <label>
                {t("expenseCategory")}
                <select
                  value={operationCategory}
                  onChange={(event) => setOperationCategory(event.target.value)}
                >
                  <option value="Rent">{u("rent")}</option>
                  <option value="Salary">{u("salary")}</option>
                  <option value="Utilities">{u("utilities")}</option>
                  <option value="Internet">{u("internet")}</option>
                  <option value="Transport">{u("transport")}</option>
                  <option value="Other">{u("other")}</option>
                </select>
              </label>
            )}
            {operationKind === "TRANSFER_CASH" ||
            operationKind === "BANK_DEPOSIT" ||
            operationKind === "BANK_WITHDRAWAL" ? (
              <div className="form-grid">
                <label>
                  {u("sourceAccount")}
                  <select
                    required
                    value={operationSourceAccount}
                    onChange={(event) =>
                      setOperationSourceAccount(event.target.value)
                    }
                  >
                    <option value="">{u("chooseSourceAccount")}</option>
                    {branchMoneyAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {u(`accountType_${account.account_type}` as Parameters<typeof ux>[1])}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {u("destinationAccount")}
                  <select
                    required
                    value={operationDestinationAccount}
                    onChange={(event) =>
                      setOperationDestinationAccount(event.target.value)
                    }
                  >
                    <option value="">{u("chooseDestinationAccount")}</option>
                    {branchMoneyAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {u(`accountType_${account.account_type}` as Parameters<typeof ux>[1])}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <label>
                {["RECEIVE_MONEY", "RECORD_INCOME", "OWNER_INVESTMENT"].includes(
                  operationKind,
                )
                  ? u("destinationAccount")
                  : u("sourceAccount")}
                <select
                  required
                  value={
                    ["RECEIVE_MONEY", "RECORD_INCOME", "OWNER_INVESTMENT"].includes(
                      operationKind,
                    )
                      ? operationDestinationAccount
                      : operationSourceAccount
                  }
                  onChange={(event) => {
                    if (["RECEIVE_MONEY", "RECORD_INCOME", "OWNER_INVESTMENT"].includes(operationKind))
                      setOperationDestinationAccount(event.target.value);
                    else setOperationSourceAccount(event.target.value);
                  }}
                >
                  <option value="">{u("chooseMoneyAccount")}</option>
                  {branchMoneyAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {u(`accountType_${account.account_type}` as Parameters<typeof ux>[1])}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="money-flow-summary" aria-live="polite">
              <span>
                <small>{u("sourceAccount")}</small>
                <b>
                  {moneyAccounts.find((account) => account.id === operationSourceAccount)?.name ??
                    (operationKind === "RECEIVE_MONEY"
                      ? u("customerOutside")
                      : operationKind === "RECORD_INCOME"
                        ? u("incomeSource")
                        : operationKind === "OWNER_INVESTMENT"
                          ? u("ownerPersonal")
                          : u("chooseSourceAccount"))}
                </b>
              </span>
              <strong aria-hidden="true">→</strong>
              <span>
                <small>{u("destinationAccount")}</small>
                <b>
                  {moneyAccounts.find((account) => account.id === operationDestinationAccount)?.name ??
                    (operationKind === "PAY_MONEY"
                      ? u("customerOutside")
                      : operationKind === "RECORD_EXPENSE"
                        ? u("expenseDestination")
                        : operationKind === "OWNER_WITHDRAWAL"
                          ? u("ownerPersonal")
                          : u("chooseDestinationAccount"))}
                </b>
              </span>
            </div>
            <label>
              {t("note")}
              <input
                value={operationMemo}
                onChange={(event) => setOperationMemo(event.target.value)}
                placeholder={u("reasonReference")}
              />
            </label>
            <button className="primary-action full" type="submit" disabled={operationCurrency !== "AFN" && !operationRateReady}>
              {operationReceivesMoney
                ? (language === "en" ? "Save money received" : language === "fa-AF" ? "گرفتن پول را ثبت کنید" : "د پیسو اخیستل ثبت کړئ")
                : operationPaysMoney
                  ? (language === "en" ? "Save money paid" : language === "fa-AF" ? "دادن پول را ثبت کنید" : "د پیسو ورکول ثبت کړئ")
                  : t("postOperation")} <span>→</span>
            </button>
            <p className="modal-note">{u("shopCheck")}</p>
          </form>
        </div>
      )}
      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <section
            className="calm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="kicker">SARAFI</p>
                <h2 id="help-title">{t("helpSupport")}</h2>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setShowHelp(false)}
                aria-label={t("closeHelp")}
              >
                ×
              </button>
            </div>
            <p className="modal-note">{u("helpIntro")}</p>
            <div className="help-guide-list">
              {helpGuides[language].map(([title, explanation], index) => (
                <details key={title} open={index === 0}>
                  <summary><span>{index + 1}</span>{title}</summary>
                  <p>{explanation}</p>
                </details>
              ))}
            </div>
            <button
              className="primary-action full"
              onClick={() => setShowHelp(false)}
            >
              {t("closeHelp")}
            </button>
          </section>
        </div>
      )}
      {routeAuthorized && openingFormActive && (
        <div className="transaction-inline-form">
          <form
            className="financial-task-form transaction-page-form"
            onSubmit={submitOpeningBalance}
            aria-labelledby="opening-money-title"
          >
            <div className="modal-head">
              <div>
                <p className="kicker">{u("openingBalance")}</p>
                <h2 id="opening-money-title">{u("recordOpeningMoney")}</h2>
              </div>
              <button
                type="button"
                className="text-button transaction-back"
                onClick={() => openSection("Trade")}
                aria-label={t("close")}
              >
                {language === "en" ? "Back to transaction types" : language === "fa-AF" ? "بازگشت به نوع معامله" : "د معاملې ډولونو ته ستنېدل"}
              </button>
            </div>
            <label>
              {t("currency")}
              <select
                value={openingCurrency}
                onChange={(event) => {
                  const next = event.target.value;
                  setOpeningCurrency(next);
                  setOpeningRatePublication(undefined);
                  setOpeningRateReady(next === "AFN");
                }}
              >
                {enabledCurrencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} · {currencyName(language, currency)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {u("startingAmount")}
              <input
                required
                min="0.01"
                step="0.01"
                value={openingAmount}
                onChange={(event) => setOpeningAmount(event.target.value)}
                placeholder="0.00"
              />
            </label>
            <InlineRateResolver
              organizationId={organizationId}
              branchId={branchId}
              currency={openingCurrency}
              language={language}
              canPublish={capability("rates.manage")}
              value={openingRatePublication}
              onChange={setOpeningRatePublication}
              onReadyChange={setOpeningRateReady}
            />
            <button className="primary-action full" type="submit" disabled={openingCurrency !== "AFN" && !openingRateReady}>
              {u("saveOpeningMoney")} <span>→</span>
            </button>
            <p className="modal-note">{u("openingMoneyNote")}</p>
            <p className="modal-note native-valuation-note">
              {language === "en"
                ? "Enter only the native amount. SARAFI calculates the accounting value from the approved shop rate."
                : language === "fa-AF"
                  ? "فقط مبلغ همان اسعار را وارد کنید. سرافی ارزش حسابداری را از نرخ تأییدشده صرافی محاسبه می‌کند."
                  : "یوازې د هماغو اسعارو مبلغ ولیکئ. سرافي حسابي ارزښت د صرافۍ له تایید شوي نرخ څخه محاسبه کوي."}
            </p>
          </form>
        </div>
      )}
          </> } satisfies WorkspaceOutletContext} />
        </div>
      </main>
      {completedTrade && (
        <Suspense fallback={null}>
          <ReceiptSuccessDialog
            language={language}
            businessName={organizationName || u("yourBusiness")}
            trade={completedTrade}
            onPrint={(width) => void printCompletedTrade(width)}
            onNewSimilar={() => {
              const repeatPath = completedTrade.repeatPath;
              const repeatOperation = completedTrade.repeatOperation;
              setCompletedTrade(null);
              if (repeatOperation) setOperationKind(repeatOperation as OperationKind);
              if (repeatPath) navigate(repeatPath);
              else openTrade(tradeSide);
            }}
            onViewTransaction={() => {
              const entryId = completedTrade.journalEntryId;
              const detailPath = completedTrade.detailPath;
              setCompletedTrade(null);
              navigate(detailPath ?? `${sectionPath("Transactions")}/${entryId}`);
            }}
            onDone={() => {
              setCompletedTrade(null);
              openSection("Trade", true);
            }}
          />
        </Suspense>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function SecurityOverviewView({
  language,
  onNavigate,
}: {
  language: Language;
  onNavigate: (section: string) => void;
}) {
  const copy = language === "en"
    ? {
        kicker: "Control Center",
        title: "Security",
        intro: "Review trusted devices, approval safeguards, and the organization security trail.",
        devices: "Devices and team access",
        devicesCopy: "Review trusted devices, invitations, roles, and pending approvals.",
        controls: "Security controls and history",
        controlsCopy: "Review two-step requirements, support access, and recorded control changes.",
      }
    : language === "fa-AF"
      ? {
          kicker: "مرکز کنترول",
          title: "امنیت",
          intro: "دستگاه‌های معتبر، تأییدها و تاریخچه امنیت صرافی را بررسی کنید.",
          devices: "دستگاه‌ها و دسترسی تیم",
          devicesCopy: "دستگاه‌ها، دعوت‌ها، وظایف و درخواست‌های منتظر را بررسی کنید.",
          controls: "کنترول‌ها و تاریخچه امنیت",
          controlsCopy: "شرایط امنیت دومرحله‌ای، دسترسی پشتیبانی و تغییرات ثبت‌شده را ببینید.",
        }
      : {
          kicker: "د کنټرول مرکز",
          title: "امنیت",
          intro: "باوري وسایل، تاییدونه او د صرافۍ امنیتي تاریخ وګورئ.",
          devices: "وسایل او د ډلې لاسرسی",
          devicesCopy: "وسایل، بلنې، دندې او منتظرې غوښتنې وګورئ.",
          controls: "امنیتي کنټرولونه او تاریخ",
          controlsCopy: "دوه پړاوه شرطونه، د ملاتړ لاسرسی او ثبت شوي بدلونونه وګورئ.",
        };
  return (
    <section className="panel control-center-panel">
      <div className="panel-header"><div><p className="kicker">{copy.kicker}</p><h1>{copy.title}</h1><p>{copy.intro}</p></div></div>
      <div className="control-center-grid">
        <button className="control-center-card" onClick={() => onNavigate("Team & Devices")}><AppIcon name="people" /><span><strong>{copy.devices}</strong><small>{copy.devicesCopy}</small></span><span aria-hidden="true">→</span></button>
        <button className="control-center-card" onClick={() => onNavigate("Business Settings")}><AppIcon name="shield" /><span><strong>{copy.controls}</strong><small>{copy.controlsCopy}</small></span><span aria-hidden="true">→</span></button>
      </div>
    </section>
  );
}

function WorkspaceView({
  language,
  section,
  pathname,
  activityRefresh,
  businessDate,
  organizationId,
  organizationName,
  branchName,
  cashboxName,
  preparedBy,
  roleLabel,
  canManageTeam,
  canManageCapabilities,
  canInviteBusinessAdmin,
  canDecideApprovals,
  canApproveReconciliation,
  canManageMoney,
  canReverse,
  capabilities,
  userId,
  deviceId,
  branchId,
  cashboxId,
  onDashboard,
  onNavigate,
  onRoute,
  onToast,
  onFinancialCompleted,
  onCounterpartyChanged,
}: {
  language: Language;
  section: string;
  pathname: string;
  activityRefresh: number;
  businessDate: string;
  organizationId: string | null;
  organizationName: string;
  branchName: string;
  cashboxName: string;
  preparedBy: string;
  roleLabel: string;
  canManageTeam: boolean;
  canManageCapabilities: boolean;
  canInviteBusinessAdmin: boolean;
  canDecideApprovals: boolean;
  canApproveReconciliation: boolean;
  canManageMoney: boolean;
  canReverse: boolean;
  capabilities: readonly string[];
  userId: string;
  deviceId: string;
  branchId: string | null;
  cashboxId: string | null;
  onDashboard: () => void;
  onNavigate: (section: string) => void;
  onRoute: (path: string) => void;
  onToast: (message: string) => void;
  onFinancialCompleted: (transaction: CompletedTrade) => void;
  onCounterpartyChanged: (person?: CounterpartyRecord) => void;
}) {
  if (section === "Billing" && organizationId)
    return (
      <BillingView
        language={language}
        organizationId={organizationId}
        onBack={onDashboard}
        onToast={onToast}
      />
    );
  if (section === "Control")
    return (
      <ManageSarafi
        language={language}
        roleLabel={roleLabel}
        canManageTeam={canManageTeam}
        canManageMoney={canManageMoney}
        canManageBilling={hasCapability(capabilities, "billing.manage")}
        onNavigate={onNavigate}
      />
    );
  if (section === "Security")
    return <SecurityOverviewView language={language} onNavigate={onNavigate} />;
  if (section === "Business Settings")
    return (
      <SettingsView
        language={language}
        organizationId={organizationId}
        organizationName={organizationName}
        branchName={branchName}
        roleLabel={roleLabel}
        canManage={canManageMoney}
        onDashboard={onDashboard}
      />
    );
  if (["Compliance", "Compliance Reviews", "Compliance Cases"].includes(section))
    return (
      <ComplianceView
        language={language}
        organizationId={organizationId}
        pathname={pathname}
        activityRefresh={activityRefresh}
        onDashboard={onDashboard}
      />
    );
  if (section === "Transactions")
    return (
      <TransactionsView
        language={language}
        organizationId={organizationId}
        canReverse={canReverse}
        onDashboard={onDashboard}
        onToast={onToast}
      />
    );
  if (section === "Cash & Accounts")
    return (
      <MoneyLocationView
        language={language}
        organizationId={organizationId}
        activityRefresh={activityRefresh}
        onDashboard={onDashboard}
        onToast={onToast}
      />
    );
  if (section === "People")
    return (
      <PeopleView
        language={language}
        organizationId={organizationId}
        branchId={branchId}
        canListDocuments={hasCapability(capabilities, "documents.list")}
        canUploadDocuments={hasCapability(capabilities, "documents.upload")}
        canViewDocuments={hasCapability(capabilities, "documents.view")}
        onDashboard={onDashboard}
        onAddDebt={() => onNavigate("Debts")}
        onToast={onToast}
        onCounterpartyChanged={onCounterpartyChanged}
      />
    );
  if (section === "Rates")
    return (
      <RatesView
        language={language}
        organizationId={organizationId}
        onDashboard={onDashboard}
      />
    );
  if (section === "Reports")
    return (
      <ReportsView
        key={`${organizationId}:${branchId}:${cashboxId}`}
        language={language}
        businessDate={businessDate}
        organizationId={organizationId}
        organizationName={organizationName}
        branchName={branchName}
        cashboxName={cashboxName}
        preparedBy={preparedBy}
        branchId={branchId}
        cashboxId={cashboxId}
        onDashboard={onDashboard}
        onToast={onToast}
      />
    );
  if (section === "Team & Devices")
    return (
      <TeamDevicesView
        language={language}
        organizationId={organizationId}
        activityRefresh={activityRefresh}
        canManage={canManageTeam}
        canManageCapabilities={canManageCapabilities}
        canInviteBusinessAdmin={canInviteBusinessAdmin}
        canDecideApprovals={canDecideApprovals}
        onDashboard={onDashboard}
        onToast={onToast}
      />
    );
  if (section === "Debts")
    return (
      <DebtsView
        language={language}
        organizationId={organizationId}
        branchId={branchId}
        deviceId={deviceId}
        pathname={pathname}
        capabilities={capabilities}
        onRoute={onRoute}
        onDashboard={onDashboard}
        onToast={onToast}
        onFinancialCompleted={onFinancialCompleted}
      />
    );
  if (section === "Reconciliation" || section === "Cashbox Close")
    return (
      <ReconciliationView
        language={language}
        organizationId={organizationId}
        branchId={branchId}
        cashboxId={cashboxId}
        canApprove={canApproveReconciliation}
        onDashboard={onDashboard}
        onToast={onToast}
      />
    );
  if (section === "Hawala")
    return (
      <HawalaView
        language={language}
        organizationId={organizationId}
        branchId={branchId}
        pathname={pathname}
        deviceId={deviceId}
        capabilities={capabilities}
        onRoute={onRoute}
        onDashboard={onDashboard}
        onToast={onToast}
        onFinancialCompleted={onFinancialCompleted}
      />
    );
  if (section === "Offline")
    return (
      <OfflineView
        organizationId={organizationId}
        userId={userId}
        deviceId={deviceId}
        cashboxId={cashboxId ?? "inspection-cashbox"}
        onDashboard={onDashboard}
      />
    );
  if (section === "Import")
    return (
      <ImportWorkspace
        language={language}
        organizationId={organizationId}
        onBack={onDashboard}
        onToast={onToast}
      />
    );
  const descriptions: Record<string, string> = {
    Transactions: ux(language, "transactionsDescription"),
    "Cash & Accounts": ux(language, "moneyDescription"),
    People: ux(language, "peopleDescription"),
    Debts: ux(language, "debtsDescription"),
    Rates: ux(language, "ratesDescription"),
    Reports: ux(language, "reportsDescription"),
    "Team & Devices": ux(language, "teamDescription"),
    Control: ux(language, "settingsDescription"),
    "Business Settings": ux(language, "settingsDescription"),
  };
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">{translate(language, "workspace")}</p>
          <h1>
            {section === "Business Settings" ? translate(language, "settings") : section}
          </h1>
          <p>{descriptions[section] ?? ux(language, "workspaceSection")}</p>
        </div>
      </div>
      <div className="empty-live">
        <p>{ux(language, "workspaceSection")}</p>
        <button className="primary-action" onClick={onDashboard}>
          {ux(language, "backHome")} <span>→</span>
        </button>
      </div>
    </section>
  );
}

function OfflineView({
  organizationId,
  userId,
  deviceId,
  cashboxId,
  onDashboard,
}: {
  organizationId: string | null;
  userId: string;
  deviceId: string;
  cashboxId: string;
  onDashboard: () => void;
}) {
  const [drafts, setDrafts] = useState<ReturnType<OfflineDraftBook["all"]>>([]);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [kind, setKind] = useState<"BUY_FX" | "SELL_FX">("BUY_FX");
  const [message, setMessage] = useState("");
  const [draftBook] = useState(
    () =>
      new OfflineDraftBook(
        {
          tenantId: organizationId ?? "unknown",
          userId,
          deviceId,
          cashboxId,
          maxAmountBase: "100000",
          allowKinds: ["BUY_FX", "SELL_FX"],
        },
        indexedDbOfflineStore,
      ),
  );
  useEffect(() => {
    void draftBook
      .hydrate()
      .then(() => setDrafts(draftBook.all()))
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? `Draft storage unavailable: ${error.message}`
            : "Draft storage unavailable",
        ),
      );
  }, [draftBook]);
  const saveDraft = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const draft = draftBook.saveDraft({
        tenantId: organizationId ?? "unknown",
        userId,
        deviceId,
        cashboxId,
        amount,
        currency,
        kind,
      });
      await draftBook.persistDraft(draft);
      setDrafts(draftBook.all());
      setAmount("");
      setMessage(
        `Draft ${draft.draftId} saved. It is not posted and will not auto-submit.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft rejected");
    }
  };
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">SAFE DEGRADED MODE</p>
          <h1>Offline drafts</h1>
          <p>
            Financial posting is unavailable until connection is restored. Last
            synchronized: not available in degraded mode.
          </p>
        </div>
        <button className="text-button" onClick={onDashboard}>
          Back to dashboard →
        </button>
      </div>
      <div className="notice">
        <span className="sync-dot offline" />
        <span>
          <b>OFFLINE</b> · Financial posting is unavailable until connection is
          restored.
        </span>
      </div>
      <form className="financial-task-form" onSubmit={saveDraft}>
        <div className="form-grid">
          <label>
            Operation
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
            >
              <option value="BUY_FX">Buy FX</option>
              <option value="SELL_FX">Sell FX</option>
            </select>
          </label>
          <label>
            Currency
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              <option>USD</option>
              <option>EUR</option>
              <option>AFN</option>
            </select>
          </label>
        </div>
        <label>
          Amount
          <input
            required
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
          />
        </label>
        <button className="primary-action full" type="submit">
          Save as Draft <span>→</span>
        </button>
      </form>
      {message && (
        <p role="status" className="empty-live">
          {message}
        </p>
      )}
      <div className="balance-list">
        {drafts.length ? (
          drafts.map((draft) => (
            <div className="balance-row" key={draft.draftId}>
              <span className="currency-badge usd">{draft.currency}</span>
              <span className="balance-name">
                <b>DRAFT — NOT POSTED · {draft.kind.replace("_FX", " FX")}</b>
                <small>
                  {draft.draftId} · sequence {draft.localSequence} ·{" "}
                  {draft.status}
                </small>
              </span>
              <strong>{draft.amount}</strong>
            </div>
          ))
        ) : (
          <div className="empty-live">
            No offline drafts are stored for this identity.
          </div>
        )}
      </div>
      <div className="empty-live">
        Connection restored. Review current rates, balances, authorization, and
        limits before intentional online posting. Drafts never auto-submit.
      </div>
    </section>
  );
}

function TeamDevicesView({
  language,
  organizationId,
  activityRefresh,
  canManage,
  canManageCapabilities,
  canInviteBusinessAdmin,
  canDecideApprovals,
  onDashboard,
  onToast,
}: {
  language: Language;
  organizationId: string | null;
  activityRefresh: number;
  canManage: boolean;
  canManageCapabilities: boolean;
  canInviteBusinessAdmin: boolean;
  canDecideApprovals: boolean;
  onDashboard: () => void;
  onToast: (message: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const inspection = organizationId === "inspection";
  const roleName = (role: string) =>
    ({
      owner: u("owner"),
      business_admin: language === "en" ? "Business administrator" : language === "fa-AF" ? "مدیر اجرایی صرافی" : "د صرافۍ اجرائیوي مدیر",
      manager: u("manager"),
      accountant: u("accountant"),
      cashier: u("cashier"),
      viewer: u("viewer"),
      compliance_officer: u("complianceOfficer"),
    })[role] ?? role;
  const statusName = (status: string) =>
    ({
      active: u("active"),
      suspended: u("suspended"),
      revoked: u("revoked"),
      trusted: u("deviceTrusted"),
      untrusted: u("deviceWaiting"),
      pending: t("pending"),
      approved: u("approved"),
      rejected: u("rejected"),
    })[status] ?? u("review");
  const previewBranch: TeamScopeRecord = {
    id: "inspection-branch",
    name: translate(language, "mainBranch"),
  };
  const previewCashbox: TeamScopeRecord = {
    id: "inspection-cashbox",
    name: u("previewCashboxName"),
    branch_id: previewBranch.id,
  };
  const previewMembers: TeamMemberRecord[] = [
    {
      id: "inspection-owner",
      display_name: u("previewOwnerName"),
      email: "owner@example.com",
      role_code: "owner",
      active: true,
      mfa_required: true,
      joined_at: new Date().toISOString(),
      is_current_user: true,
      branches: [],
      cashboxes: [],
    },
    {
      id: "inspection-cashier",
      display_name: u("previewCashierName"),
      email: "cashier@example.com",
      role_code: "cashier",
      active: true,
      mfa_required: false,
      joined_at: new Date().toISOString(),
      is_current_user: false,
      branches: [previewBranch],
      cashboxes: [previewCashbox],
    },
  ];
  const [members, setMembers] = useState<TeamMemberRecord[]>(
    inspection ? previewMembers : [],
  );
  const [invitations, setInvitations] = useState<TeamInvitationRecord[]>([]);
  const [branches, setBranches] = useState<TeamScopeRecord[]>(
    inspection ? [previewBranch] : [],
  );
  const [cashboxes, setCashboxes] = useState<TeamScopeRecord[]>(
    inspection ? [previewCashbox] : [],
  );
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [joinRequests, setJoinRequests] = useState<WorkerJoinRequestRecord[]>(inspection ? [{ id: "inspection-request", display_name: language === "en" ? "Ahmad Rahimi" : language === "fa-AF" ? "احمد رحیمی" : "احمد رحیمي", email: "ahmad@example.com", status: "pending", requested_at: new Date().toISOString(), assigned_role: null, branch_ids: [], cashbox_ids: [], capability_overrides: [], limits: {}, mfa_required: true, device_review_required: true }] : []);
  const [capabilityMatrix, setCapabilityMatrix] = useState<MembershipCapabilityMatrixRecord[]>([]);
  const [teamSection, setTeamSection] = useState<"people" | "invitations" | "requests" | "devices" | "roles">("people");
  const [inviteStep, setInviteStep] = useState<1 | 2 | 3>(1);
  const [workplaceCode, setWorkplaceCode] = useState(inspection ? "AB12CD34EF56" : "");
  const [requestBusy, setRequestBusy] = useState("");
  const [reviewingRequest, setReviewingRequest] = useState<WorkerJoinRequestRecord | null>(null);
  const [requestRole, setRequestRole] = useState("viewer");
  const [requestBranches, setRequestBranches] = useState<string[]>([]);
  const [requestCashboxes, setRequestCashboxes] = useState<string[]>([]);
  const [requestCapabilities, setRequestCapabilities] = useState<string[]>([]);
  const [requestAmountLimit, setRequestAmountLimit] = useState("");
  const [requestReviewReason, setRequestReviewReason] = useState("");
  const [loading, setLoading] = useState(!inspection);
  const [refresh, setRefresh] = useState(0);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("cashier");
  const [inviteBranches, setInviteBranches] = useState<string[]>([]);
  const [inviteCashboxes, setInviteCashboxes] = useState<string[]>([]);
  const [inviteCapabilities, setInviteCapabilities] = useState<string[]>(["financial.post.fx", "financial.post.money", "financial.post.debt", "financial.post.hawala"]);
  const [inviteAmountLimit, setInviteAmountLimit] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [createdInvitation, setCreatedInvitation] =
    useState<CreatedTeamInvitation | null>(null);
  const [invitationQr, setInvitationQr] = useState("");
  const [mfa, setMfa] = useState<MfaReadiness>({
    aal: inspection ? "aal2" : null,
    verified: inspection,
    factors: [],
    error: null,
  });
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [editingMember, setEditingMember] =
    useState<TeamMemberRecord | null>(null);
  const [editRole, setEditRole] = useState("cashier");
  const [editBranches, setEditBranches] = useState<string[]>([]);
  const [editCashboxes, setEditCashboxes] = useState<string[]>([]);
  const [editCapabilities, setEditCapabilities] = useState<string[]>([]);
  const [editAmountLimit, setEditAmountLimit] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editReason, setEditReason] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [deviceReason, setDeviceReason] = useState("");
  const [deviceBusy, setDeviceBusy] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [approvalBusy, setApprovalBusy] = useState("");
  const { deviceId: routeDeviceId = null, approvalId: routeApprovalId = null } = useParams<{
    deviceId: string;
    approvalId: string;
  }>();

  const roleOptions = [
    ...(canInviteBusinessAdmin ? ["business_admin"] : []),
    "manager",
    "accountant",
    "cashier",
    "viewer",
    "compliance_officer",
  ];

  const assignableActions: Array<{ capability: Capability; label: string }> = [
    { capability: "financial.post.fx", label: language === "en" ? "Currency exchange" : language === "fa-AF" ? "خرید و فروش اسعار" : "د اسعارو راکړه ورکړه" },
    { capability: "financial.post.money", label: language === "en" ? "Money in, out & movement" : language === "fa-AF" ? "ورود، خروج و انتقال پول" : "د پیسو ترلاسه کول، ورکول او لېږد" },
    { capability: "financial.post.debt", label: language === "en" ? "Debts & settlements" : language === "fa-AF" ? "قرض‌ها و تصفیه" : "پورونه او تصفیه" },
    { capability: "financial.post.hawala", label: language === "en" ? "Hawala operations" : language === "fa-AF" ? "عملیات حواله" : "د حوالې چارې" },
  ];

  useEffect(() => {
    if (!organizationId) return;
    if (inspection) return;
    void Promise.all([getTeamControlPlane(organizationId), listWorkerJoinRequests(organizationId), getMembershipCapabilityMatrix(organizationId)]).then(([result, requestResult, capabilityResult]) => {
        if (result.data) {
          setMembers(result.data.members);
          setInvitations(result.data.invitations);
          setBranches(result.data.branches);
          setCashboxes(result.data.cashboxes);
          setDevices(result.data.devices);
          setApprovals(result.data.approvals);
        }
        if (requestResult.data) setJoinRequests(requestResult.data);
        if (capabilityResult.data) setCapabilityMatrix(capabilityResult.data);
        if (result.error || requestResult.error || capabilityResult.error) onToast(ux(language, "teamLoadFailed"));
        setLoading(false);
      });
  }, [activityRefresh, inspection, language, onToast, organizationId, refresh]);

  useEffect(() => {
    if (routeDeviceId) {
      // oxlint-disable-next-line react/set-state-in-effect -- The URL selects the exact team sub-workspace for a deep link.
      setTeamSection("devices");
    } else if (routeApprovalId) {
      // oxlint-disable-next-line react/set-state-in-effect -- The URL selects the exact approval sub-workspace for a deep link.
      setTeamSection("roles");
    }
    const targetId = routeDeviceId ? `device-${routeDeviceId}` : routeApprovalId ? `approval-${routeApprovalId}` : "";
    if (!targetId) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [devices, approvals, routeApprovalId, routeDeviceId]);

  useEffect(() => {
    if (!canManage || inspection) return;
    void getMfaReadiness().then((readiness) => setMfa(readiness));
  }, [canManage, inspection]);

  const toggleScope = (
    value: string,
    selected: string[],
    setSelected: (next: string[]) => void,
  ) =>
    setSelected(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );

  const resetInvite = () => {
    setInviteName("");
    setInviteEmail("");
    setInviteRole("cashier");
    setInviteBranches(branches[0] ? [branches[0].id] : []);
    setInviteCashboxes(cashboxes[0] ? [cashboxes[0].id] : []);
    setInviteCapabilities(["financial.post.fx", "financial.post.money", "financial.post.debt", "financial.post.hawala"]);
    setInviteAmountLimit("");
  };

  const openInvite = () => {
    resetInvite();
    setInviteStep(1);
    setCreatedInvitation(null);
    setShowInvite(true);
    setTeamSection("invitations");
  };

  const makeWorkplaceCode = async () => {
    if (!organizationId || requestBusy) return;
    setRequestBusy("code");
    if (inspection) {
      setWorkplaceCode("AB12CD34EF56");
      setRequestBusy("");
      return;
    }
    const result = await createOrganizationJoinCode(organizationId);
    setRequestBusy("");
    if (result.error || !result.data) onToast(result.error?.includes("AAL2") ? u("secureTeamIntro") : u("teamSaveFailed"));
    else setWorkplaceCode(result.data.connection_code);
  };

  const openJoinReview = (request: WorkerJoinRequestRecord) => {
    setReviewingRequest(request);
    setRequestRole("viewer");
    setRequestBranches([]);
    setRequestCashboxes([]);
    setRequestCapabilities([]);
    setRequestAmountLimit("");
    setRequestReviewReason("");
  };

  const decideJoinRequest = async (request: WorkerJoinRequestRecord, decision: "approved" | "rejected") => {
    if (decision === "approved" && !mfa.verified) { onToast(u("secureTeamIntro")); return; }
    if (requestReviewReason.trim().length < 2) { onToast(u("accessChangeReason")); return; }
    if (decision === "approved" && requestRole === "cashier" && (!requestBranches.length || !requestCashboxes.length)) { onToast(u("cashierScopeRequired")); return; }
    setRequestBusy(request.id);
    if (inspection) {
      setJoinRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: decision } : item));
      setRequestBusy("");
      setReviewingRequest(null);
      return;
    }
    const result = await reviewWorkerJoinRequest({
      requestId: request.id,
      decision,
      role: decision === "approved" ? requestRole : undefined,
      branchIds: decision === "approved" ? requestBranches : [],
      cashboxIds: decision === "approved" ? requestCashboxes : [],
      capabilityOverrides: decision === "approved" ? assignableActions.map(({ capability }) => ({ capability, allowed: requestCapabilities.includes(capability) })) : [],
      limits: decision === "approved" && requestAmountLimit ? { max_transaction_amount_base: Number(requestAmountLimit) } : {},
      requiresMfa: true,
      reason: requestReviewReason,
    });
    setRequestBusy("");
    if (result.error) onToast(result.error.includes("AAL2") ? u("secureTeamIntro") : u("teamSaveFailed"));
    else { setReviewingRequest(null); setRefresh((value) => value + 1); }
  };

  const beginAuthenticatorSetup = async () => {
    setSecurityBusy(true);
    const result = await enrollTotp("SARAFI team management");
    setSecurityBusy(false);
    if (result.error || !result.factor) {
      onToast(u("mfaSetupFailed"));
      return;
    }
    setEnrollment(result.factor);
  };

  const confirmMfa = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const factorId = enrollment?.id ?? mfa.factors[0]?.id;
    if (!factorId || !/^\d{6}$/.test(verificationCode)) {
      onToast(u("mfaVerificationFailed"));
      return;
    }
    setSecurityBusy(true);
    const error = await verifyTotp(factorId, verificationCode);
    const readiness = error ? null : await getMfaReadiness();
    setSecurityBusy(false);
    if (error || !readiness?.verified) {
      onToast(u("mfaVerificationFailed"));
      return;
    }
    setMfa(readiness);
    setEnrollment(null);
    setVerificationCode("");
    onToast(u("securityVerified"));
  };

  const submitInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || inviteBusy) return;
    if (
      inviteRole === "cashier" &&
      (!inviteBranches.length || !inviteCashboxes.length)
    ) {
      onToast(u("cashierScopeRequired"));
      return;
    }
    if (inviteAmountLimit && (!Number.isFinite(Number(inviteAmountLimit)) || Number(inviteAmountLimit) < 0)) {
      onToast(u("teamSaveFailed"));
      return;
    }
    if (!mfa.verified) {
      onToast(u("secureTeamIntro"));
      return;
    }
    setInviteBusy(true);
    if (inspection) {
      const now = new Date();
      const expires = new Date(now.getTime() + 72 * 60 * 60 * 1000);
      const result: CreatedTeamInvitation = {
        id: crypto.randomUUID(),
        invite_token: "ab".repeat(32),
        connection_code: "A1B2C3D4E5",
        email: inviteEmail.trim(),
        display_name: inviteName.trim(),
        role_code: inviteRole,
        expires_at: expires.toISOString(),
      };
      setCreatedInvitation(result);
      setInvitations((current) => [
        {
          id: result.id,
          display_name: result.display_name,
          email: result.email,
          role_code: result.role_code,
          mfa_required: false,
          status: "pending",
          created_at: now.toISOString(),
          expires_at: result.expires_at,
          branches: branches.filter((item) =>
            inviteBranches.includes(item.id),
          ),
          cashboxes: cashboxes.filter((item) =>
            inviteCashboxes.includes(item.id),
          ),
        },
        ...current,
      ]);
      setInviteBusy(false);
      setShowInvite(false);
      return;
    }
    const result = await createTeamInvitation({
      organizationId,
      email: inviteEmail,
      displayName: inviteName,
      role: inviteRole,
      branchIds: inviteBranches,
      cashboxIds: inviteCashboxes,
      capabilityOverrides: assignableActions.map(({ capability }) => ({ capability, allowed: inviteCapabilities.includes(capability) })),
      limits: inviteAmountLimit ? { max_transaction_amount_base: Number(inviteAmountLimit) } : {},
      requiresMfa: true,
    });
    setInviteBusy(false);
    if (result.error || !result.data) {
      if (result.error?.includes("AAL2")) {
        setMfa((current) => ({ ...current, verified: false, aal: "aal1" }));
        onToast(u("secureTeamIntro"));
      } else if (result.error?.toLowerCase().includes("cashier")) {
        onToast(u("cashierScopeRequired"));
      } else {
        onToast(u("teamSaveFailed"));
      }
      return;
    }
    setCreatedInvitation(result.data);
    setShowInvite(false);
    setRefresh((value) => value + 1);
  };

  const invitationUrl = createdInvitation
    ? `${window.location.origin}/?invite=${createdInvitation.invite_token}`
    : "";

  useEffect(() => {
    let cancelled = false;
    if (!invitationUrl) {
      return;
    }
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(invitationUrl, { errorCorrectionLevel: "M", margin: 2, width: 220 }))
      .then((dataUrl) => { if (!cancelled) setInvitationQr(dataUrl); })
      .catch(() => { if (!cancelled) setInvitationQr(""); });
    return () => { cancelled = true; };
  }, [invitationUrl]);

  const copyInvitation = async () => {
    if (!invitationUrl) return;
    try {
      await navigator.clipboard.writeText(invitationUrl);
      onToast(u("linkCopied"));
    } catch {
      onToast(u("inviteLinkInstructions"));
    }
  };

  const cancelInvitation = async (invitation: TeamInvitationRecord) => {
    if (
      !window.confirm(
        `${u("cancelInvite")}: ${invitation.display_name} (${invitation.email})?`,
      )
    )
      return;
    if (inspection) {
      setInvitations((current) =>
        current.filter((item) => item.id !== invitation.id),
      );
      return;
    }
    const result = await cancelTeamInvitation(
      invitation.id,
      "Cancelled by shop owner",
    );
    if (result.error) {
      onToast(
        result.error.includes("AAL2")
          ? u("secureTeamIntro")
          : u("teamSaveFailed"),
      );
      return;
    }
    setRefresh((value) => value + 1);
  };

  const openMemberEditor = (member: TeamMemberRecord, active = member.active) => {
    setTeamSection("roles");
    setEditingMember(member);
    setEditRole(member.role_code);
    setEditBranches(member.branches.map((item) => item.id));
    setEditCashboxes(member.cashboxes.map((item) => item.id));
    const matrix = capabilityMatrix.find((item) => item.membership_id === member.id);
    setEditCapabilities(assignableActions.filter((item) => matrix?.effective_capabilities.includes(item.capability) ?? inspectionCapabilities(member.role_code as WorkspaceRole).includes(item.capability)).map((item) => item.capability));
    const firstLimit = matrix?.overrides.map((item) => item.limits.max_transaction_amount_base).find((value) => typeof value === "number" || typeof value === "string");
    setEditAmountLimit(firstLimit === undefined ? "" : String(firstLimit));
    setEditActive(active);
    setEditReason("");
  };

  const saveMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingMember || editBusy) return;
    if (
      editRole === "cashier" &&
      editActive &&
      (!editBranches.length || !editCashboxes.length)
    ) {
      onToast(u("cashierScopeRequired"));
      return;
    }
    if (editAmountLimit && (!Number.isFinite(Number(editAmountLimit)) || Number(editAmountLimit) < 0)) {
      onToast(u("teamSaveFailed"));
      return;
    }
    if (!mfa.verified) {
      onToast(u("secureTeamIntro"));
      return;
    }
    setEditBusy(true);
    if (inspection) {
      setMembers((current) =>
        current.map((member) =>
          member.id === editingMember.id
            ? {
                ...member,
                role_code: editRole,
                active: editActive,
                branches: branches.filter((item) =>
                  editBranches.includes(item.id),
                ),
                cashboxes: cashboxes.filter((item) =>
                  editCashboxes.includes(item.id),
                ),
              }
            : member,
        ),
      );
      setEditBusy(false);
      setEditingMember(null);
      return;
    }
    const result = canManageCapabilities ? await updateTeamAssignment({
      membershipId: editingMember.id,
      role: editRole,
      branchIds: editBranches,
      cashboxIds: editCashboxes,
      active: editActive,
      reason: editReason,
      capabilityOverrides: assignableActions.map(({ capability }) => ({ capability, allowed: editCapabilities.includes(capability) })),
      limits: editAmountLimit ? { max_transaction_amount_base: Number(editAmountLimit) } : {},
    }) : await updateTeamMembership({
      membershipId: editingMember.id,
      role: editRole,
      branchIds: editBranches,
      cashboxIds: editCashboxes,
      active: editActive,
      reason: editReason,
    });
    setEditBusy(false);
    if (result.error) {
      onToast(
        result.error.includes("AAL2")
          ? u("secureTeamIntro")
          : u("teamSaveFailed"),
      );
      return;
    }
    setEditingMember(null);
    setRefresh((value) => value + 1);
  };

  const changeDevice = async (device: DeviceRecord, action: "trust" | "revoke") => {
    if (!mfa.verified) {
      onToast(u("secureTeamIntro"));
      return;
    }
    if (deviceReason.trim().length < 2) {
      onToast(u("deviceReasonRequired"));
      return;
    }
    if (inspection) {
      setDevices((current) => current.map((item) => item.id === device.id ? { ...item, status: action === "trust" ? "trusted" : "revoked", revoked_at: action === "revoke" ? new Date().toISOString() : null } : item));
      setDeviceReason("");
      return;
    }
    setDeviceBusy(device.id);
    const result = action === "trust"
      ? await trustTeamDevice(device.id, deviceReason)
      : await revokeTeamDevice(device.id, deviceReason);
    setDeviceBusy("");
    if (result.error) {
      onToast(result.error.includes("AAL2") ? u("secureTeamIntro") : u("teamSaveFailed"));
      return;
    }
    setDeviceReason("");
    setRefresh((value) => value + 1);
    onToast(action === "trust" ? u("deviceApproved") : u("deviceRevoked"));
  };
  const decidePendingApproval = async (approval: ApprovalRecord, decision: "approved" | "rejected") => {
    if (approvalReason.trim().length < 2) { onToast(u("accessChangeReason")); return; }
    if (decision === "approved" && !mfa.verified) { onToast(u("secureTeamIntro")); return; }
    setApprovalBusy(approval.id);
    const result = await decideApproval(approval.id, decision, approvalReason);
    setApprovalBusy("");
    if (result.error) { onToast(result.error.includes("AAL2") ? u("secureTeamIntro") : u("teamSaveFailed")); return; }
    setApprovalReason("");
    setRefresh((value) => value + 1);
    onToast(u("savedSuccessfully"));
  };

  const scopeSummary = (
    branchScope: TeamScopeRecord[],
    cashboxScope: TeamScopeRecord[],
  ) => {
    const names = [...branchScope, ...cashboxScope].map((item) => item.name);
    return names.length ? names.join(" · ") : u("noSpecificScope");
  };

  return (
    <section className="panel team-workspace">
      <div className="panel-header">
        <div>
          <p className="kicker">{u("teamGroup")}</p>
          <h1>{t("teamDevices")}</h1>
          <p>{u("teamIntro")}</p>
        </div>
        <div className="team-header-actions">
          {canManage && (
            <button className="primary-action" onClick={openInvite}>
              {u("addEmployee")}
            </button>
          )}
          <button className="text-button" onClick={onDashboard}>
            {u("backHome")} →
          </button>
        </div>
      </div>

      <nav className="calm-subnav" aria-label={language === "en" ? "Team areas" : language === "fa-AF" ? "بخش‌های تیم" : "د ډلې برخې"}>
        {([
          ["people", language === "en" ? "People" : language === "fa-AF" ? "افراد" : "خلک"],
          ["invitations", language === "en" ? "Invitations" : language === "fa-AF" ? "دعوت‌ها" : "بلنې"],
          ["requests", language === "en" ? "Join Requests" : language === "fa-AF" ? "درخواست‌های عضویت" : "د یوځای کېدو غوښتنې"],
          ["devices", language === "en" ? "Devices" : language === "fa-AF" ? "دستگاه‌ها" : "وسایل"],
          ["roles", language === "en" ? "Roles & Limits" : language === "fa-AF" ? "نقش‌ها و حدود" : "دندې او حدود"],
        ] as const).map(([id, label]) => <button key={id} type="button" className={teamSection === id ? "active" : ""} aria-current={teamSection === id ? "page" : undefined} onClick={() => setTeamSection(id)}>{label}</button>)}
      </nav>

      {canManage && teamSection !== "people" && !mfa.verified && (
        <section className="team-security-gate" aria-labelledby="team-security-title">
          <div className="settings-card-title">
            <AppIcon name="shield" />
            <div>
              <h2 id="team-security-title">{u("secureTeamAction")}</h2>
              <p>{u("secureTeamIntro")}</p>
            </div>
          </div>
          {!mfa.factors.length && !enrollment ? (
            <button
              className="primary-action"
              disabled={securityBusy}
              onClick={() => void beginAuthenticatorSetup()}
            >
              {u("setupAuthenticator")}
            </button>
          ) : (
            <form className="mfa-verification" onSubmit={confirmMfa}>
              {enrollment && (
                <div className="mfa-enrollment">
                  <img src={enrollment.qrCode} alt={u("setupAuthenticator")} />
                  <div>
                    <p>{u("authenticatorInstructions")}</p>
                    <label>
                      {u("authenticatorSecret")}
                      <input readOnly value={enrollment.secret} dir="ltr" />
                    </label>
                  </div>
                </div>
              )}
              <label>
                {u("verificationCode")}
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(event) =>
                    setVerificationCode(
                      event.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                />
              </label>
              <button className="primary-action" disabled={securityBusy}>
                {securityBusy ? u("verifyingSecurity") : u("verifySecurity")}
              </button>
            </form>
          )}
        </section>
      )}

      {teamSection === "invitations" && createdInvitation && (
        <section className="invite-success" aria-live="polite">
          <div className="invite-success-copy">
            <p className="kicker">{u("inviteCreated")}</p>
            <h2>{createdInvitation.display_name}</h2>
            <p>{u("inviteLinkInstructions")}</p>
            <p className="invite-handoff-note">{language === "en" ? "The worker can scan this code or open the link on their own phone. They sign in or create their account, then SARAFI attaches the assigned branch and cashbox." : language === "fa-AF" ? "کارمند می‌تواند این رمز را اسکن کند یا لینک را در تلفن خودش باز نماید. سپس با حساب خودش وارد شده یا حساب می‌سازد و سرافی شعبه و صندوق تعیین‌شده را وصل می‌کند." : "کارکوونکی دا کوډ سکینولای شي یا لینک په خپل تلیفون کې پرانیزي. بیا په خپل حساب ننوځي یا حساب جوړوي او سرافي ټاکل شوې څانګه او صندوق ورسره نښلوي."}</p>
          </div>
          {invitationQr && <img className="invitation-qr" src={invitationQr} alt={language === "en" ? "Worker invitation QR code" : language === "fa-AF" ? "رمز QR دعوت کارمند" : "د کارکوونکي د بلنې QR کوډ"} />}
          <label>
            {u("copyInviteLink")}
            <input readOnly dir="ltr" value={invitationUrl} />
          </label>
          {createdInvitation.connection_code && (
            <label className="connection-code-field">
              {language === "en" ? "Worker connection code" : language === "fa-AF" ? "رمز اتصال کارمند" : "د کارکوونکي د نښلولو کوډ"}
              <input readOnly dir="ltr" value={createdInvitation.connection_code} />
            </label>
          )}
          <div className="team-form-actions">
            <button className="primary-action" onClick={() => void copyInvitation()}>
              {u("copyInviteLink")}
            </button>
            <a
              className="secondary-action"
              href={`mailto:${encodeURIComponent(createdInvitation.email)}?subject=${encodeURIComponent("SARAFI team invitation")}&body=${encodeURIComponent(invitationUrl)}`}
            >
              {u("emailInvite")}
            </a>
          </div>
        </section>
      )}

      {teamSection === "invitations" && showInvite && (
        <form className="team-editor" onSubmit={submitInvitation}>
          <div className="panel-header">
            <div>
              <h2>{u("addEmployee")}</h2>
              <p>{u("addEmployeeIntro")}</p>
            </div>
            <button className="text-button" type="button" onClick={() => setShowInvite(false)}>
              ×
            </button>
          </div>
          <ol className="invite-steps" aria-label={language === "en" ? "Invitation steps" : undefined}>
            <li className={inviteStep === 1 ? "active" : ""}>1 · {language === "en" ? "Identity" : language === "fa-AF" ? "هویت" : "پېژندنه"}</li>
            <li className={inviteStep === 2 ? "active" : ""}>2 · {language === "en" ? "Assignment" : language === "fa-AF" ? "تعیین دسترسی" : "ټاکنه"}</li>
            <li className={inviteStep === 3 ? "active" : ""}>3 · {language === "en" ? "Review" : language === "fa-AF" ? "بازبینی" : "کتنه"}</li>
          </ol>
          {inviteStep === 1 ? <div className="team-form-grid">
            <label>
              {u("fullName")}
              <input required minLength={2} maxLength={100} value={inviteName} onChange={(event) => setInviteName(event.target.value)} />
            </label>
            <label>
              {u("workEmail")}
              <input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
            </label>
          </div> : null}
          {inviteStep === 2 ? <><div className="team-form-grid"><label>
              {u("employeeRole")}
              <select
                value={inviteRole}
                onChange={(event) => {
                  const nextRole = event.target.value;
                  setInviteRole(nextRole);
                  setInviteCapabilities(assignableActions.filter((item) => inspectionCapabilities(nextRole as WorkspaceRole).includes(item.capability)).map((item) => item.capability));
                  if (nextRole === "cashier") {
                    if (!inviteBranches.length && branches[0])
                      setInviteBranches([branches[0].id]);
                    if (!inviteCashboxes.length && cashboxes[0])
                      setInviteCashboxes([cashboxes[0].id]);
                  }
                }}
              >
                {roleOptions.map((role) => <option key={role} value={role}>{roleName(role)}</option>)}
              </select>
            </label>
          </div>
          {inviteRole === "cashier" ? (
            <div className="scope-grid">
              <fieldset>
                <legend>{u("branchAccess")}</legend>
                {branches.map((branch) => (
                  <label key={branch.id}>
                    <input
                      type="checkbox"
                      checked={inviteBranches.includes(branch.id)}
                      onChange={() => {
                        const removing = inviteBranches.includes(branch.id);
                        toggleScope(branch.id, inviteBranches, setInviteBranches);
                        if (removing)
                          setInviteCashboxes((current) =>
                            current.filter(
                              (cashboxId) =>
                                cashboxes.find((cashbox) => cashbox.id === cashboxId)
                                  ?.branch_id !== branch.id,
                            ),
                          );
                      }}
                    />
                    {branch.name}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>{u("cashboxAccess")}</legend>
                {cashboxes
                  .filter((cashbox) => !cashbox.branch_id || inviteBranches.includes(cashbox.branch_id))
                  .map((cashbox) => (
                    <label key={cashbox.id}>
                      <input type="checkbox" checked={inviteCashboxes.includes(cashbox.id)} onChange={() => toggleScope(cashbox.id, inviteCashboxes, setInviteCashboxes)} />
                      {cashbox.name}
                    </label>
                  ))}
              </fieldset>
            </div>
          ) : (
            <p className="form-note">{u("businessWideAccess")}</p>
          )}
          {inviteRole !== "business_admin" ? <div className="role-limit-grid">
            <fieldset>
              <legend>{language === "en" ? "Allowed action types" : language === "fa-AF" ? "نوع کارهای مجاز" : "اجازه شوې چارې"}</legend>
              {assignableActions.map((action) => <label key={action.capability}>
                <input type="checkbox" checked={inviteCapabilities.includes(action.capability)} onChange={() => toggleScope(action.capability, inviteCapabilities, setInviteCapabilities)} />
                {action.label}
              </label>)}
            </fieldset>
            <label>{language === "en" ? "Maximum transaction (AFN base)" : language === "fa-AF" ? "حد اکثر معامله (به افغانی)" : "د معاملې لوړه کچه (افغانۍ)"}
              <input type="number" inputMode="decimal" min="0" step="0.01" value={inviteAmountLimit} onChange={(event) => setInviteAmountLimit(event.target.value)} placeholder={language === "en" ? "No limit" : language === "fa-AF" ? "بدون حد" : "بې حده"} />
              <small>{language === "en" ? "Leave empty only when this role has no transaction ceiling." : language === "fa-AF" ? "تنها در صورت نبود سقف معامله خالی بگذارید." : "یوازې هغه وخت تش پرېږدئ چې حد نه لري."}</small>
            </label>
          </div> : <p className="form-note">{language === "en" ? "Business Administrator uses the delegated non-owner policy; owner powers remain unavailable." : language === "fa-AF" ? "مدیر اجرایی صلاحیت‌های غیرمالک را می‌گیرد؛ صلاحیت‌های مالک بسته می‌ماند." : "اجرائیوي مدیر ته غیرمالکي واکونه ورکول کېږي؛ د مالک واکونه تړلي پاتې کېږي."}</p>}
          </> : null}
          {inviteStep === 3 ? <section className="invite-review"><h3>{language === "en" ? "Review invitation" : language === "fa-AF" ? "بازبینی دعوت" : "بلنه وګورئ"}</h3><p><strong>{inviteName}</strong> · <bdi>{inviteEmail}</bdi></p><p>{roleName(inviteRole)} · {scopeSummary(branches.filter((item) => inviteBranches.includes(item.id)), cashboxes.filter((item) => inviteCashboxes.includes(item.id)))}</p>{inviteRole !== "business_admin" ? <><p>{assignableActions.filter((item) => inviteCapabilities.includes(item.capability)).map((item) => item.label).join(" · ") || (language === "en" ? "No financial posting" : language === "fa-AF" ? "بدون ثبت مالی" : "مالي ثبت نشته")}</p><p>{language === "en" ? "Transaction ceiling" : language === "fa-AF" ? "سقف معامله" : "د معاملې حد"}: {inviteAmountLimit ? `${inviteAmountLimit} AFN` : (language === "en" ? "No limit" : language === "fa-AF" ? "بدون حد" : "بې حده")}</p></> : null}<small>{language === "en" ? "Sending this invitation is protected by just-in-time two-step verification." : language === "fa-AF" ? "فرستادن این دعوت با تأیید دومرحله‌ای در لحظه محافظت می‌شود." : "د دې بلنې لېږل د هماغه وخت په دوه پړاوه تایید خوندي کېږي."}</small></section> : null}
          <div className="team-form-actions">
            {inviteStep > 1 ? <button className="secondary-action" type="button" onClick={() => setInviteStep((inviteStep - 1) as 1 | 2)}>{language === "en" ? "Back" : language === "fa-AF" ? "بازگشت" : "شاته"}</button> : null}
            {inviteStep < 3 ? <button key={`continue-${inviteStep}`} className="primary-action" type="button" disabled={inviteStep === 1 ? inviteName.trim().length < 2 || !inviteEmail.includes("@") : inviteRole === "cashier" && (!inviteBranches.length || !inviteCashboxes.length)} onClick={() => setInviteStep((inviteStep + 1) as 2 | 3)}>{language === "en" ? "Continue" : language === "fa-AF" ? "ادامه" : "دوام"}</button> : <button key="submit-invitation" className="primary-action" type="submit" disabled={inviteBusy || !mfa.verified}>{inviteBusy ? u("sendingInvite") : u("sendInvite")}</button>}
            <button className="secondary-action" type="button" onClick={() => setShowInvite(false)}>
              {u("cancelAction")}
            </button>
          </div>
        </form>
      )}

      {teamSection === "requests" ? <section className="team-section join-request-workspace">
        <div className="panel-header compact-header">
          <div><h2>{language === "en" ? "Independent join requests" : language === "fa-AF" ? "درخواست‌های مستقل عضویت" : "د خپلواک یوځای کېدو غوښتنې"}</h2><p>{language === "en" ? "Share the workplace code. Every request stays outside the business until an authorized reviewer assigns access." : language === "fa-AF" ? "رمز محل کار را شریک کنید. هر درخواست تا تعیین دسترسی بیرون از صرافی می‌ماند." : "د کاري ځای کوډ شریک کړئ. هره غوښتنه د لاسرسي تر ټاکلو پورې له صرافۍ بهر پاتې کېږي."}</p></div>
          {canManage ? <button className="primary-action" type="button" disabled={requestBusy === "code" || !mfa.verified} onClick={() => void makeWorkplaceCode()}>{workplaceCode ? (language === "en" ? "Rotate code" : language === "fa-AF" ? "تغییر رمز" : "کوډ بدلول") : (language === "en" ? "Create workplace code" : language === "fa-AF" ? "ساخت رمز محل کار" : "د کاري ځای کوډ جوړول")}</button> : null}
        </div>
        {workplaceCode ? <label className="connection-code-field">{language === "en" ? "12-character workplace code" : language === "fa-AF" ? "رمز دوازده‌حرفی محل کار" : "دولس توري د کاري ځای کوډ"}<input readOnly dir="ltr" value={workplaceCode} /></label> : null}
        <div className="balance-list">
          {joinRequests.length ? joinRequests.map((request) => <article className="team-member-card" key={request.id}>
            <span className="currency-badge usd">?</span>
            <span className="balance-name"><b>{request.display_name}</b><small>{request.email}</small><small>{new Date(request.requested_at).toLocaleString(language)} · {statusName(request.status)}</small><small>{language === "en" ? "Approval creates a Viewer membership; refine role and limits afterward." : language === "fa-AF" ? "تأیید، عضویت مشاهده‌گر می‌سازد؛ سپس نقش و حدود را تنظیم کنید." : "تایید د کتونکې غړیتوب جوړوي؛ وروسته دنده او حدود برابر کړئ."}</small></span>
            {canManage && request.status === "pending" ? <div className="member-actions"><button className="text-button" type="button" disabled={requestBusy === request.id} onClick={() => openJoinReview(request)}>{language === "en" ? "Review access" : language === "fa-AF" ? "بررسی دسترسی" : "لاسرسی وګورئ"}</button></div> : <strong>{statusName(request.status)}</strong>}
          </article>) : <div className="empty-live">{language === "en" ? "No pending join requests." : language === "fa-AF" ? "درخواست عضویت در انتظار نیست." : "د یوځای کېدو غوښتنه نشته."}</div>}
        </div>
        {reviewingRequest ? <form className="team-editor join-review-editor" onSubmit={(event) => { event.preventDefault(); void decideJoinRequest(reviewingRequest, "approved"); }}>
          <div className="panel-header compact-header"><div><h3>{language === "en" ? "Assign access" : language === "fa-AF" ? "تعیین دسترسی" : "لاسرسی وټاکئ"} · {reviewingRequest.display_name}</h3><p>{reviewingRequest.email}</p></div><button className="text-button" type="button" onClick={() => setReviewingRequest(null)}>×</button></div>
          <div className="team-form-grid"><label>{u("employeeRole")}<select value={requestRole} onChange={(event) => { const nextRole = event.target.value; setRequestRole(nextRole); setRequestCapabilities(assignableActions.filter((item) => inspectionCapabilities(nextRole as WorkspaceRole).includes(item.capability)).map((item) => item.capability)); }}>{roleOptions.map((role) => <option key={role} value={role}>{roleName(role)}</option>)}</select></label><label>{u("accessChangeReason")}<input required minLength={2} value={requestReviewReason} onChange={(event) => setRequestReviewReason(event.target.value)} /></label></div>
          {requestRole === "cashier" ? <div className="scope-grid"><fieldset><legend>{u("branchAccess")}</legend>{branches.map((branch) => <label key={branch.id}><input type="checkbox" checked={requestBranches.includes(branch.id)} onChange={() => toggleScope(branch.id, requestBranches, setRequestBranches)} />{branch.name}</label>)}</fieldset><fieldset><legend>{u("cashboxAccess")}</legend>{cashboxes.filter((cashbox) => !cashbox.branch_id || requestBranches.includes(cashbox.branch_id)).map((cashbox) => <label key={cashbox.id}><input type="checkbox" checked={requestCashboxes.includes(cashbox.id)} onChange={() => toggleScope(cashbox.id, requestCashboxes, setRequestCashboxes)} />{cashbox.name}</label>)}</fieldset></div> : <p className="form-note">{u("businessWideAccess")}</p>}
          {requestRole !== "business_admin" ? <div className="role-limit-grid"><fieldset><legend>{language === "en" ? "Allowed action types" : language === "fa-AF" ? "نوع کارهای مجاز" : "اجازه شوې چارې"}</legend>{assignableActions.map((action) => <label key={action.capability}><input type="checkbox" checked={requestCapabilities.includes(action.capability)} onChange={() => toggleScope(action.capability, requestCapabilities, setRequestCapabilities)} />{action.label}</label>)}</fieldset><label>{language === "en" ? "Maximum transaction (AFN base)" : language === "fa-AF" ? "حد اکثر معامله (به افغانی)" : "د معاملې لوړه کچه (افغانۍ)"}<input type="number" min="0" step="0.01" value={requestAmountLimit} onChange={(event) => setRequestAmountLimit(event.target.value)} placeholder={language === "en" ? "No limit" : language === "fa-AF" ? "بدون حد" : "بې حده"} /></label></div> : null}
          <div className="team-form-actions"><button className="primary-action" disabled={requestBusy === reviewingRequest.id || !mfa.verified}>{u("approved")}</button><button className="secondary-action danger" type="button" disabled={requestBusy === reviewingRequest.id} onClick={() => void decideJoinRequest(reviewingRequest, "rejected")}>{u("rejected")}</button></div>
        </form> : null}
      </section> : null}

      {teamSection === "roles" && !editingMember && (
        <section className="team-section role-matrix-list">
          <div className="panel-header compact-header"><div><h2>{language === "en" ? "Role assignments and limits" : language === "fa-AF" ? "نقش‌ها و حدود معامله" : "دندې او د معاملې حدونه"}</h2><p>{language === "en" ? "Review each person’s real posting abilities, scope, and transaction ceiling." : language === "fa-AF" ? "صلاحیت واقعی ثبت، ساحه و سقف معامله هر شخص را بررسی کنید." : "د هر کس ریښتیني ثبت واکونه، ساحه او د معاملې حد وګورئ."}</p></div></div>
          <div className="balance-list">
            {members.filter((member) => member.role_code !== "owner").map((member) => {
              const matrix = capabilityMatrix.find((item) => item.membership_id === member.id);
              const effective = matrix?.effective_capabilities ?? inspectionCapabilities(member.role_code as WorkspaceRole);
              const limit = matrix?.overrides.map((item) => item.limits.max_transaction_amount_base).find((value) => value !== undefined);
              return <article className="team-member-card" key={`limits-${member.id}`}><span className="currency-badge usd">{member.display_name.slice(0, 1).toUpperCase()}</span><span className="balance-name"><b>{member.display_name} · {roleName(member.role_code)}</b><small>{assignableActions.filter((item) => effective.includes(item.capability)).map((item) => item.label).join(" · ") || (language === "en" ? "No financial posting" : language === "fa-AF" ? "بدون ثبت مالی" : "مالي ثبت نشته")}</small><small>{language === "en" ? "Transaction ceiling" : language === "fa-AF" ? "سقف معامله" : "د معاملې حد"}: {limit === undefined ? (language === "en" ? "No limit" : language === "fa-AF" ? "بدون حد" : "بې حده") : `${String(limit)} AFN`}</small><small>{scopeSummary(member.branches, member.cashboxes)}</small></span>{canManageCapabilities ? <button className="text-button" type="button" onClick={() => openMemberEditor(member)}>{u("editAccess")}</button> : null}</article>;
            })}
          </div>
        </section>
      )}

      {teamSection === "roles" && editingMember && (
        <form className="team-editor" onSubmit={saveMember}>
          <div className="panel-header">
            <div>
              <h2>{u("editAccess")} · {editingMember.display_name}</h2>
              <p>{editingMember.email}</p>
            </div>
            <button className="text-button" type="button" onClick={() => setEditingMember(null)}>×</button>
          </div>
          <div className="team-form-grid">
            <label>
              {u("employeeRole")}
              <select value={editRole} onChange={(event) => setEditRole(event.target.value)}>
                {roleOptions.map((role) => <option key={role} value={role}>{roleName(role)}</option>)}
              </select>
            </label>
            <label>
              {u("accessChangeReason")}
              <input required minLength={2} value={editReason} onChange={(event) => setEditReason(event.target.value)} />
            </label>
            <label>
              {u("status")}
              <select value={editActive ? "active" : "suspended"} onChange={(event) => setEditActive(event.target.value === "active")}>
                <option value="active">{u("active")}</option>
                <option value="suspended">{u("suspended")}</option>
              </select>
            </label>
          </div>
          {editRole === "cashier" ? (
            <div className="scope-grid">
              <fieldset>
                <legend>{u("branchAccess")}</legend>
                {branches.map((branch) => (
                  <label key={branch.id}>
                    <input type="checkbox" checked={editBranches.includes(branch.id)} onChange={() => toggleScope(branch.id, editBranches, setEditBranches)} />
                    {branch.name}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>{u("cashboxAccess")}</legend>
                {cashboxes.filter((cashbox) => !cashbox.branch_id || editBranches.includes(cashbox.branch_id)).map((cashbox) => (
                  <label key={cashbox.id}>
                    <input type="checkbox" checked={editCashboxes.includes(cashbox.id)} onChange={() => toggleScope(cashbox.id, editCashboxes, setEditCashboxes)} />
                    {cashbox.name}
                  </label>
                ))}
              </fieldset>
            </div>
          ) : (
            <p className="form-note">{u("businessWideAccess")}</p>
          )}
          {canManageCapabilities ? <div className="role-limit-grid">
            <fieldset>
              <legend>{language === "en" ? "Allowed action types" : language === "fa-AF" ? "نوع کارهای مجاز" : "اجازه شوې چارې"}</legend>
              {assignableActions.map((action) => <label key={action.capability}>
                <input type="checkbox" checked={editCapabilities.includes(action.capability)} onChange={() => toggleScope(action.capability, editCapabilities, setEditCapabilities)} />
                {action.label}
              </label>)}
            </fieldset>
            <label>{language === "en" ? "Maximum transaction (AFN base)" : language === "fa-AF" ? "حد اکثر معامله (به افغانی)" : "د معاملې لوړه کچه (افغانۍ)"}
              <input type="number" inputMode="decimal" min="0" step="0.01" value={editAmountLimit} onChange={(event) => setEditAmountLimit(event.target.value)} placeholder={language === "en" ? "No limit" : language === "fa-AF" ? "بدون حد" : "بې حده"} />
            </label>
          </div> : null}
          <div className="team-form-actions">
            <button className="primary-action" disabled={editBusy || !mfa.verified}>
              {editBusy ? u("loading") : u("saveAccess")}
            </button>
            <button className="secondary-action" type="button" onClick={() => setEditingMember(null)}>
              {u("cancelAction")}
            </button>
          </div>
        </form>
      )}

      <div className="team-grid">
        <div className="team-section" hidden={teamSection !== "people"}>
          <h2>{u("teamAccess")}</h2>
          <div className="balance-list">
            {loading ? (
              <div className="empty-live">{u("loading")}</div>
            ) : members.length ? (
              members.map((member) => (
                <article className="team-member-card" key={member.id}>
                  <span className="currency-badge usd">
                    {member.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="balance-name">
                    <b>
                      {member.display_name} · {roleName(member.role_code)}
                    </b>
                    <small>{member.email}</small>
                    <small>
                      {u("assignedTo")}: {scopeSummary(member.branches, member.cashboxes)}
                    </small>
                    <small>{u("memberSince")} {new Date(member.joined_at).toLocaleDateString(language)}</small>
                  </span>
                  <div className="member-actions">
                    <strong className={member.active ? "status-active" : "status-suspended"}>
                      {member.active ? u("active") : u("suspended")}
                    </strong>
                    {canManage && !member.is_current_user && member.role_code !== "owner" && (
                      <>
                        <button className="text-button" onClick={() => openMemberEditor(member)}>
                          {u("editAccess")}
                        </button>
                        <button className="text-button danger" onClick={() => openMemberEditor(member, !member.active)}>
                          {member.active ? u("suspendAccess") : u("reactivateAccess")}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-live">{u("noTeam")}</div>
            )}
          </div>
        </div>
        <div className="team-section" hidden={teamSection !== "invitations"}>
          <h2>{u("pendingInvitations")}</h2>
          <div className="balance-list">
            {invitations.length ? invitations.map((invitation) => (
              <article className="team-member-card invitation-card" key={invitation.id}>
                <span className="currency-badge usd">✉</span>
                <span className="balance-name">
                  <b>{invitation.display_name} · {roleName(invitation.role_code)}</b>
                  <small>{invitation.email}</small>
                  <small>{u("assignedTo")}: {scopeSummary(invitation.branches, invitation.cashboxes)}</small>
                  <small>{u("expires")} {new Date(invitation.expires_at).toLocaleString(language, { hour12: false })}</small>
                </span>
                {canManage && (
                  <button className="text-button danger" onClick={() => void cancelInvitation(invitation)}>
                    {u("cancelInvite")}
                  </button>
                )}
              </article>
            )) : <div className="empty-live">{u("noPendingInvites")}</div>}
          </div>
        </div>
      </div>

      <div className="dashboard-grid team-secondary-grid" hidden={teamSection !== "devices"}>
        <div>
          <div className="panel-header compact-header">
            <div><h2>{u("registeredDevices")}</h2><p>{u("deviceControlIntro")}</p></div>
            {canManage && <label>{u("accessChangeReason")}<input value={deviceReason} onChange={(event) => setDeviceReason(event.target.value)} placeholder={u("deviceReasonPlaceholder")} /></label>}
          </div>
          <div className="balance-list">
            {devices.length ? (
              devices.map((device) => (
                <div className={`balance-row ${routeDeviceId === device.id ? "deep-link-focus" : ""}`} id={`device-${device.id}`} key={device.id}>
                  <span className="currency-badge usd">D</span>
                  <span className="balance-name">
                    <b>
                      {device.friendly_name} · {statusName(device.status)}
                    </b>
                    <small>{device.member_name}</small>
                    <small>
                      {u("lastSeen")}{" "}
                      {new Date(device.last_seen_at).toLocaleString(language, { hour12: false })}
                    </small>
                  </span>
                  <div className="member-actions">
                    <strong>{device.revoked_at ? u("revoked") : statusName(device.status)}</strong>
                    {canManage && device.status === "untrusted" && <button className="text-button" disabled={deviceBusy === device.id} onClick={() => void changeDevice(device, "trust")}>{u("approveDevice")}</button>}
                    {canManage && device.status === "trusted" && <button className="text-button danger" disabled={deviceBusy === device.id} onClick={() => void changeDevice(device, "revoke")}>{u("revokeDevice")}</button>}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-live">{u("noDevices")}</div>
            )}
          </div>
        </div>
      </div>
      <div className="panel" hidden={teamSection !== "roles"}>
        <div className="panel-header">
          <div>
            <h2>{u("approvalInbox")}</h2>
            <p>{u("selfApprovalRule")}</p>
          </div>
          {canDecideApprovals && <label>{u("accessChangeReason")}<input value={approvalReason} onChange={(event) => setApprovalReason(event.target.value)} placeholder={u("deviceReasonPlaceholder")} /></label>}
          <strong>
            {approvals.filter((item) => item.status === "pending").length}{" "}
            {t("pending")}
          </strong>
        </div>
        <div className="balance-list">
          {approvals.length ? (
            approvals.map((approval) => (
              <div className={`balance-row ${routeApprovalId === approval.id ? "deep-link-focus" : ""}`} id={`approval-${approval.id}`} key={approval.id}>
                <span className="currency-badge usd">
                  {approval.status === "pending" ? "!" : "✓"}
                </span>
                <span className="balance-name">
                  <b>
                    {u("approvalRequest")} · {statusName(approval.status)}
                  </b>
                  <small>
                    {approval.reason} · {u("requested")}{" "}
                    {new Date(approval.requested_at).toLocaleString(language, { hour12: false })}
                  </small>
                </span>
                <div className="member-actions">
                  <strong>
                    {approval.amount_base
                      ? `${approval.amount_base} ${approval.currency_code ?? ""}`
                      : u("review")}
                  </strong>
                  {canDecideApprovals && approval.status === "pending" && <><button className="text-button" disabled={approvalBusy === approval.id} onClick={() => void decidePendingApproval(approval, "approved")}>{u("approved")}</button><button className="text-button danger" disabled={approvalBusy === approval.id} onClick={() => void decidePendingApproval(approval, "rejected")}>{u("rejected")}</button></>}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-live">{u("noApprovals")}</div>
          )}
        </div>
      </div>
      <div className="empty-live">{u("accessRuleNote")}</div>
    </section>
  );
}

function MoneyLocationView({
  language,
  organizationId,
  activityRefresh,
  onDashboard,
  onToast,
}: {
  language: Language;
  organizationId: string | null;
  activityRefresh: number;
  onDashboard: () => void;
  onToast: (message: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const [loadedAccounts, setAccounts] = useState<MoneyAccountRecord[]>([]);
  const [loading, setLoading] = useState(organizationId !== "inspection");
  const { accountId: routeAccountId = null } = useParams<{ accountId: string }>();
  const accounts = organizationId === "inspection"
    ? inspectionMoneyAccounts(language)
    : loadedAccounts;
  const cashboxes = accounts.filter((account) => account.account_type === "cashbox");
  const copy = ({
    en: {
      title: "Cashboxes",
      intro: "See the money currently held in each cashbox.",
      balances: "Cashbox balances",
      balancesIntro: "One clear card for every cashbox.",
      cashbox: "Cashbox",
      empty: "No cashbox is available yet. Add one in Manage SARAFI → Business & currencies.",
      noMoney: "No money recorded",
      loading: "Loading cashboxes…",
    },
    "fa-AF": {
      title: "صندوق‌ها",
      intro: "پول موجود در هر صندوق را ساده و روشن ببینید.",
      balances: "موجودی صندوق‌ها",
      balancesIntro: "برای هر صندوق یک کارت ساده.",
      cashbox: "صندوق",
      empty: "هنوز صندوقی موجود نیست. از مدیریت سرافی ← صرافی و اسعار، صندوق بسازید.",
      noMoney: "هنوز پول ثبت نشده",
      loading: "صندوق‌ها بار می‌شود…",
    },
    "ps-AF": {
      title: "صندوقونه",
      intro: "په هر صندوق کې موجودې پیسې په ساده ډول وګورئ.",
      balances: "د صندوقونو پیسې",
      balancesIntro: "د هر صندوق لپاره یو ساده کارت.",
      cashbox: "صندوق",
      empty: "تر اوسه صندوق نشته. د سرافي اداره ← صرافي او اسعار کې صندوق جوړ کړئ.",
      noMoney: "تر اوسه پیسې نه دي ثبت شوې",
      loading: "صندوقونه پورته کېږي…",
    },
  } as const)[language];

  useEffect(() => {
    if (!organizationId || organizationId === "inspection") return;
    let active = true;
    void listMoneyAccounts(organizationId).then((result) => {
      if (!active) return;
      if (result.data) setAccounts(result.data);
      if (result.error) onToast(ux(language, "couldNotLoad"));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [activityRefresh, language, onToast, organizationId]);

  return (
    <section className="panel money-workspace">
      <div className="panel-header">
        <div>
          <p className="kicker">{t("myMoney")}</p>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </div>
        <button className="text-button" onClick={onDashboard}>
          {language === "en" ? "Back to Home" : language === "fa-AF" ? "بازگشت به خانه" : "کور ته ستنېدل"} →
        </button>
      </div>
      <section className="account-control-panel cashbox-only-panel" aria-labelledby="cashbox-balances-title">
        <div className="panel-header compact-header">
          <div>
            <h2 id="cashbox-balances-title">{copy.balances}</h2>
            <p>{copy.balancesIntro}</p>
          </div>
        </div>
        {loading ? <div className="empty-live">{copy.loading}</div> : null}
        {!loading && cashboxes.length ? (
          <div className="account-card-grid">
            {cashboxes.map((account) => (
              <article
                className={`account-card ${routeAccountId === account.id ? "deep-link-focus" : ""}`}
                id={`money-account-${account.id}`}
                key={account.id}
              >
                <span className="account-kind cashbox">{copy.cashbox}</span>
                <h3>{account.name}</h3>
                <div className="account-balances">
                  {account.balances.length ? account.balances.map((balance) => (
                    <b key={`${account.id}-${balance.currency}`} dir="ltr">
                      {formatFinancialAmount(balance.amount)} {balance.currency}
                    </b>
                  )) : <span>{copy.noMoney}</span>}
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {!loading && !cashboxes.length ? <div className="empty-live">{copy.empty}</div> : null}
      </section>
    </section>
  );
}

function PeopleView({
  language,
  organizationId,
  branchId,
  canListDocuments,
  canUploadDocuments,
  canViewDocuments,
  onDashboard,
  onAddDebt,
  onToast,
  onCounterpartyChanged,
}: {
  language: Language;
  organizationId: string | null;
  branchId: string | null;
  canListDocuments: boolean;
  canUploadDocuments: boolean;
  canViewDocuments: boolean;
  onDashboard: () => void;
  onAddDebt: () => void;
  onToast: (message: string) => void;
  onCounterpartyChanged: (person?: CounterpartyRecord) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const [people, setPeople] = useState<CounterpartyRecord[]>(() => organizationId === "inspection" ? [{ id: "inspection-customer", customer_number: 42, customer_reference: "C-00000042", display_name: ux(language, "previewCustomer"), counterparty_type: "customer", risk_status: "standard", phone: "+93 700 000 000" }] : []);
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [statement, setStatement] = useState<
    Array<{
      id: string;
      occurred_at: string;
      event_type: string;
      reference: string;
      status: string;
      memo: string | null;
      direction: "receivable" | "payable" | null;
      currency_code: string | null;
      amount: string | null;
    }>
  >([]);
  const [query, setQuery] = useState("");
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonPhone, setNewPersonPhone] = useState("");
  const [newPersonNotes, setNewPersonNotes] = useState("");
  const [newPersonType, setNewPersonType] = useState<"customer" | "saraf" | "hawala_partner" | "supplier" | "employee" | "other">("customer");
  const [personBusy, setPersonBusy] = useState(false);
  const [selectedResult, setSelectedResult] = useState<CounterpartyRecord | null>(null);
  const { customerId: routeCounterpartyId = null } = useParams<{ customerId: string }>();
  const selected = routeCounterpartyId
    ? organizationId === "inspection"
      ? people.find((person) => person.id === routeCounterpartyId) ?? null
      : selectedResult?.id === routeCounterpartyId ? selectedResult : null
    : null;
  const [documentResult, setDocumentResult] = useState<{
    counterpartyId: string;
    data: PrivateDocumentRecord[];
  } | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>("tazkira");
  const fileInput = useRef<HTMLInputElement>(null);
  const captureProvider = useRef(new BrowserDocumentCaptureProvider()).current;
  useEffect(() => {
    if (!organizationId || organizationId === "inspection") return;
    void Promise.all([
      listCounterparties(organizationId),
      listDebts(organizationId),
    ]).then(([peopleResult, debtResult]) => {
      if (peopleResult.error || debtResult.error)
        onToast(ux(language, "couldNotLoad"));
      if (peopleResult.data) setPeople(peopleResult.data);
      if (debtResult.data) setDebts(debtResult.data);
    });
  }, [language, onToast, organizationId]);
  useEffect(() => {
    if (!routeCounterpartyId || !organizationId || organizationId === "inspection") return;
    let active = true;
    void getCounterpartyDetail(organizationId, routeCounterpartyId).then((result) => {
      if (!active) return;
      setSelectedResult(result.data);
      if (result.error) onToast(ux(language, "couldNotLoad"));
    });
    return () => { active = false; };
  }, [language, onToast, organizationId, routeCounterpartyId]);
  useEffect(() => {
    if (!organizationId || organizationId === "inspection" || !selected) return;
    void listCounterpartyStatement(organizationId, selected.id).then(
      (result) => {
        if (result.data) setStatement(result.data);
        if (result.error) onToast(ux(language, "couldNotLoad"));
      },
    );
    if (canListDocuments) {
      void getPrivateCounterpartyDocuments(organizationId, selected.id).then(
        (result) => {
          if (result.data) {
            setDocumentResult({ counterpartyId: selected.id, data: result.data });
          }
          if (result.error) onToast(ux(language, "couldNotLoad"));
        },
      );
    }
  }, [canListDocuments, language, onToast, organizationId, selected]);
  const documents =
    canListDocuments && selected && documentResult?.counterpartyId === selected.id
      ? documentResult.data
      : [];
  const captureDocument = async () => {
    if (!canUploadDocuments || !organizationId || !selected || !fileInput.current) return;
    const file = await captureProvider.capture(fileInput.current);
    if (!file) return;
    const validationError = validateDocumentFile(file);
    if (validationError) {
      onToast(validationError);
      return;
    }
    const result = await uploadPrivateCounterpartyDocument(
      organizationId,
      selected.id,
      documentType,
      file,
    );
    if (result.error) {
      onToast(u("couldNotSave"));
      return;
    }
    if (result.data)
      setDocumentResult((current) => ({
        counterpartyId: selected.id,
        data: [
          result.data as PrivateDocumentRecord,
          ...(current?.counterpartyId === selected.id ? current.data : []),
        ],
      }));
    onToast(u("documentSaved"));
  };
  const previewDocument = async (documentId: string) => {
    if (!canViewDocuments || !organizationId) return;
    const result = await getPrivateDocumentUrl(organizationId, documentId);
    if (result.error) onToast(u("requestFailed"));
    else if (result.data)
      window.open(result.data, "_blank", "noopener,noreferrer");
  };
  const submitPerson = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !branchId) return;
    if (organizationId === "inspection") {
      const created: CounterpartyRecord = {
        id: crypto.randomUUID(),
        customer_number: Date.now(),
        customer_reference: "C-" + String(Date.now()).slice(-8),
        display_name: newPersonName.trim(),
        counterparty_type: newPersonType,
        risk_status: "standard",
      };
      setPeople((current) => [...current, created]);
      setShowAddPerson(false);
      setNewPersonName("");
      onCounterpartyChanged(created);
      onToast(u("customerCreated"));
      return;
    }
    setPersonBusy(true);
    const result = await createCounterparty({
      organizationId,
      branchId,
      displayName: newPersonName,
      counterpartyType: newPersonType,
      phone: newPersonPhone,
      notes: newPersonNotes,
    });
    setPersonBusy(false);
    if (result.error || !result.data) {
      onToast(u("customerCreateFailed"));
      return;
    }
    setPeople((current) => [...current, result.data as CounterpartyRecord].sort((left, right) => left.display_name.localeCompare(right.display_name)));
    setShowAddPerson(false);
    setNewPersonName("");
    setNewPersonPhone("");
    setNewPersonNotes("");
    onCounterpartyChanged(result.data as CounterpartyRecord);
    onToast(u("customerCreated"));
  };
  const filtered = people.filter((person) =>
    [person.display_name, person.phone, person.customer_reference, person.customer_number]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const personDebts = selected
    ? debts.filter((debt) => debt.counterparty_id === selected.id)
    : [];
  const total = (direction: DebtRecord["direction"], currency: string) =>
    personDebts
      .filter(
        (debt) =>
          debt.direction === direction && debt.currency_code === currency,
      )
      .reduce((sum, debt) => sum.plus(debt.outstanding_amount), new Decimal(0))
      .toFixed(2);
  const currencies = Array.from(
    new Set(personDebts.map((debt) => debt.currency_code)),
  );
  return (
    <section className="panel">
      {!selected && <>
      <div className="panel-header">
        <div>
          <p className="kicker">{t("customersDebts")}</p>
          <h1>{u("peopleTitle")}</h1>
          <p>{u("peopleIntro")}</p>
        </div>
        <div className="activity-actions">
          <button className="primary-action" onClick={() => setShowAddPerson((value) => !value)}>
            {showAddPerson ? u("cancelAction") : u("addCustomer")}
          </button>
          <button className="export-button" onClick={onAddDebt}>
            {u("addDebt")}
          </button>
          <button className="text-button" onClick={onDashboard}>
            {u("backHome")} →
          </button>
        </div>
      </div>
      {showAddPerson && (
        <form className="customer-create-form" onSubmit={submitPerson}>
          <label>{u("customerName")}<input required minLength={2} maxLength={120} value={newPersonName} onChange={(event) => setNewPersonName(event.target.value)} /></label>
          <label>{u("customerType")}<select value={newPersonType} onChange={(event) => setNewPersonType(event.target.value as typeof newPersonType)}>
            <option value="customer">{u("customerTypeCustomer")}</option>
            <option value="saraf">{u("customerTypeSaraf")}</option>
            <option value="hawala_partner">{u("customerTypeHawala")}</option>
            <option value="supplier">{u("customerTypeSupplier")}</option>
            <option value="employee">{u("customerTypeEmployee")}</option>
            <option value="other">{u("other")}</option>
          </select></label>
          <label>{u("phoneOptional")}<input inputMode="tel" dir="ltr" value={newPersonPhone} onChange={(event) => setNewPersonPhone(event.target.value)} /></label>
          <label>{t("note")}<input value={newPersonNotes} onChange={(event) => setNewPersonNotes(event.target.value)} /></label>
          <button className="primary-action" disabled={personBusy}>{personBusy ? u("posting") : u("saveCustomer")}</button>
        </form>
      )}
      <label>
        {u("searchPeople")}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={u("searchPeoplePlaceholder")}
        />
      </label>
      <div className="balance-list">
        {filtered.length ? (
          filtered.map((person) => (
            <button
              className="balance-row"
              key={person.id}
              onClick={() => {
                setSelectedResult(person);
                navigate(`${location.pathname.replace(/\/$/, "")}/${person.id}`);
              }}
            >
              <span className="currency-badge usd">
                {person.display_name.slice(0, 1).toUpperCase()}
              </span>
              <span className="balance-name">
                <b>{person.display_name}</b>
                <small>{person.customer_reference ? person.customer_reference + " · " : ""}{t("customer")}</small>
              </span>
              <strong>{u("viewStatement")} →</strong>
            </button>
          ))
        ) : (
          <div className="empty-live">{u("noPeopleMatch")}</div>
        )}
      </div>
      </>}
      {selected && (
        <section className="statement-panel customer-detail-page">
          <div className="panel-header">
            <div>
              <p className="kicker">{u("statement")}</p>
              <h2>{selected.display_name}</h2>
              <p>{selected.customer_reference ? selected.customer_reference + " · " : ""}{u("balancesStaySeparate")}</p>
            </div>
            <button className="text-button" onClick={() => {
              setSelectedResult(null);
              navigate(location.pathname.replace(/\/[^/]+$/, ""));
            }}>
              {u("closeStatement")}
            </button>
          </div>
          {canListDocuments ? <><div className="rate-strip">
            <label>
              {u("documentType")}
              <select
                value={documentType}
                onChange={(event) =>
                  setDocumentType(event.target.value as DocumentType)
                }
              >
                <option value="tazkira">{u("tazkira")}</option>
                <option value="passport">{u("passport")}</option>
                <option value="customer_photo">{u("customerPhoto")}</option>
                <option value="other">{u("other")}</option>
              </select>
            </label>
            <input
              ref={fileInput}
              type="file"
              disabled={!canUploadDocuments}
              accept="image/jpeg,image/png,application/pdf"
              capture="environment"
              onChange={() => void captureDocument()}
            />
            <button
              className="export-button"
              disabled={!canUploadDocuments}
              onClick={() => fileInput.current?.click()}
            >
              {u("captureUpload")}
            </button>
          </div>
          <div className="balance-list">
            {documents.length ? (
              documents.map((document) => (
                <button
                  className="balance-row"
                  key={document.id}
                  disabled={!canViewDocuments}
                  onClick={() => void previewDocument(document.id)}
                >
                  <span className="currency-badge usd">D</span>
                  <span className="balance-name">
                    <b>
                      {document.entity_type.endsWith("tazkira")
                        ? u("tazkira")
                        : document.entity_type.endsWith("passport")
                          ? u("passport")
                          : document.entity_type.endsWith("customer_photo")
                            ? u("customerPhoto")
                            : u("documents")}
                    </b>
                    <small>
                      {document.content_type} ·{" "}
                      {Math.round(document.size_bytes / 1024)} KB ·{" "}
                      {new Date(document.created_at).toLocaleString(language, { hour12: false })}
                    </small>
                  </span>
                  <strong>{u("preview")} →</strong>
                </button>
              ))
            ) : (
              <div className="empty-live">{u("noDocuments")}</div>
            )}
          </div></> : null}
          {currencies.length ? (
            currencies.map((item) => (
              <div className="balance-row" key={item}>
                <span className="currency-badge usd">{item}</span>
                <span className="balance-name">
                  <b>
                    {item} · {u("balanceDetails")}
                  </b>
                </span>
                <strong>
                  {u("theyOweUs")} {total("receivable", item)} ·{" "}
                  {u("weOweThem")} {total("payable", item)}
                </strong>
              </div>
            ))
          ) : (
            <div className="empty-live">{u("noOutstanding")}</div>
          )}
          {personDebts.map((debt) => (
            <div className="empty-live" key={debt.id}>
              {debt.direction === "receivable"
                ? u("theyOweUs")
                : u("weOweThem")}{" "}
              · {formatFinancialAmount(debt.outstanding_amount)} {debt.currency_code}
              {debt.due_at
                ? ` · ${u("due")} ${new Date(debt.due_at).toLocaleDateString(language)}`
                : ""}
            </div>
          ))}
          <h3>{u("statementHistory")}</h3>
          {statement.length ? (
            statement.map((item) => (
              <div
                className="balance-row"
                key={`${item.id}-${item.event_type}`}
              >
                <span className="currency-badge usd">
                  {item.status === "posted" ? "✓" : "↺"}
                </span>
                <span className="balance-name">
                  <b>{item.memo || u("recordedTransaction")}</b>
                  <small>
                    {new Date(item.occurred_at).toLocaleString(language, { hour12: false })} ·{" "}
                    {item.reference.slice(0, 12)}
                    {item.memo ? ` · ${item.memo}` : ""}
                  </small>
                </span>
                <strong>
                  {item.amount
                    ? `${item.direction === "receivable" ? u("theyOweUs") : u("weOweThem")} ${formatFinancialAmount(item.amount)} ${item.currency_code ?? ""}`
                    : item.status === "posted"
                      ? t("posted")
                      : item.status}
                </strong>
              </div>
            ))
          ) : (
            <div className="empty-live">{u("noStatementHistory")}</div>
          )}
        </section>
      )}
    </section>
  );
}

type TransactionDatePreset = "today" | "yesterday" | "week" | "month" | "custom";

function shiftBusinessDate(value: string, days: number) {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function transactionDateRange(preset: TransactionDatePreset, fromDate: string, toDate: string) {
  const today = businessDateInTimeZone(new Date(), "Asia/Kabul");
  const startDay = preset === "today"
    ? today
    : preset === "yesterday"
      ? shiftBusinessDate(today, -1)
      : preset === "week"
        ? shiftBusinessDate(today, -6)
        : preset === "month"
          ? shiftBusinessDate(today, -29)
          : fromDate;
  const endDay = preset === "yesterday" ? shiftBusinessDate(today, -1) : preset === "custom" ? toDate : today;
  return {
    from: startDay || null,
    to: endDay || null,
  };
}

function TransactionsView({
  language,
  organizationId,
  canReverse,
  onDashboard,
  onToast,
}: {
  language: Language;
  organizationId: string | null;
  canReverse: boolean;
  onDashboard: () => void;
  onToast: (message: string) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const filterCopy = ({
    en: { find: "Find transaction or customer ID", today: "Today", yesterday: "Yesterday", week: "7 days", month: "30 days", custom: "Choose dates", from: "From", to: "To", apply: "Show transactions", receipt: "Transaction receipt", transactionId: "Transaction ID", customerId: "Customer ID", receiptNo: "Receipt number", rate: "Rate", fee: "Commission", technical: "Technical reference" },
    "fa-AF": { find: "جستجوی شماره معامله یا مشتری", today: "امروز", yesterday: "دیروز", week: "۷ روز", month: "۳۰ روز", custom: "انتخاب تاریخ", from: "از تاریخ", to: "تا تاریخ", apply: "نمایش معاملات", receipt: "رسید معامله", transactionId: "شماره معامله", customerId: "شماره مشتری", receiptNo: "شماره رسید", rate: "نرخ", fee: "کمیشن", technical: "شماره تخنیکی" },
    "ps-AF": { find: "د معاملې یا پېرېدونکي شمېره ولټوئ", today: "نن", yesterday: "پرون", week: "۷ ورځې", month: "۳۰ ورځې", custom: "نېټې ټاکل", from: "له نېټې", to: "تر نېټې", apply: "معاملې ښودل", receipt: "د معاملې رسید", transactionId: "د معاملې شمېره", customerId: "د پېرېدونکي شمېره", receiptNo: "د رسید شمېره", rate: "نرخ", fee: "کمېشن", technical: "تخنیکي شمېره" },
  } as const)[language];
  const [entries, setEntries] = useState<JournalRecord[]>([]);
  const [selectedResult, setSelectedResult] = useState<JournalRecord | null>(null);
  const { transactionId: routeEntryId = null } = useParams<{ transactionId: string }>();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [filterPreset, setFilterPreset] = useState<TransactionDatePreset>("today");
  const [transactionSearch, setTransactionSearch] = useState("");
  const today = businessDateInTimeZone(new Date(), "Asia/Kabul");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const inspectionEntries = useMemo<JournalRecord[]>(() => [
          {
            id: "inspection-expense-entry",
            transaction_number: 100001,
            transaction_reference: "T-00100001",
            receipt_number: "SAR-2026-00100001",
            status: "posted",
            memo: null,
            occurred_at: new Date().toISOString(),
            branch_id: "inspection-branch",
            event_type: "record_expense",
            immutable_reference: "000001",
            source_account_name: ux(language, "previewCashboxName"),
            destination_account_name: null,
            currency_code: "AFN",
            amount: "2500.00",
            employee_name: ux(language, "previewOwnerName"),
          },
          {
            id: "inspection-buy-entry",
            transaction_number: 100002,
            transaction_reference: "T-00100002",
            receipt_number: "SAR-2026-00100002",
            status: "posted",
            memo: null,
            occurred_at: new Date().toISOString(),
            branch_id: "inspection-branch",
            event_type: "buy_fx",
            immutable_reference: "000002",
            source_account_name: null,
            destination_account_name: ux(language, "previewCashboxName"),
            currency_code: "USD",
            amount: "1000.00",
            counterparty_name: ux(language, "previewCustomer"),
            customer_number: 42,
            customer_reference: "C-00000042",
            employee_name: ux(language, "previewCashierName"),
            given_amount: "70250.00",
            given_currency: "AFN",
            received_amount: "1000.00",
            received_currency: "USD",
            customer_rate: "70.25",
            fee_amount: "250",
            fee_currency: "AFN",
          },
        ], [language]);
  const activeRange = transactionDateRange(filterPreset, customFrom, customTo);
  const visibleEntries: JournalRecord[] = useMemo(() => {
    const source = organizationId === "inspection" ? inspectionEntries : entries;
    if (organizationId !== "inspection") return source;
    const query = transactionSearch.trim().toLocaleLowerCase(language);
    return source.filter((entry) => {
      const occurred = businessDateInTimeZone(new Date(entry.occurred_at), "Asia/Kabul");
      const inRange = (!activeRange.from || occurred >= activeRange.from)
        && (!activeRange.to || occurred <= activeRange.to);
      const searchable = [
        entry.transaction_reference, entry.transaction_number, entry.customer_reference,
        entry.customer_number, entry.counterparty_name, entry.receipt_number,
      ].filter(Boolean).join(" ").toLocaleLowerCase(language);
      return inRange && (!query || searchable.includes(query));
    });
  }, [activeRange.from, activeRange.to, entries, inspectionEntries, language, organizationId, transactionSearch]);
  const selected = routeEntryId
    ? organizationId === "inspection"
      ? visibleEntries.find((entry) => entry.id === routeEntryId) ?? null
      : selectedResult?.id === routeEntryId ? selectedResult : null
    : null;
  const loadTransactions = useCallback(async () => {
    if (!organizationId || organizationId === "inspection") return;
    const range = transactionDateRange(filterPreset, customFrom, customTo);
    const result = await searchJournalEntries({
      organizationId,
      search: transactionSearch,
      from: range.from,
      to: range.to,
    });
    if (result.data) setEntries(result.data);
    if (result.error) onToast(ux(language, "couldNotLoad"));
  }, [customFrom, customTo, filterPreset, language, onToast, organizationId, transactionSearch]);
  useEffect(() => {
    const pendingLoad = window.setTimeout(() => void loadTransactions(), 0);
    return () => window.clearTimeout(pendingLoad);
  }, [loadTransactions]);
  useEffect(() => {
    if (!routeEntryId || !organizationId) return;
    if (organizationId === "inspection") return;
    let active = true;
    void getTransactionDetail(organizationId, routeEntryId).then((result) => {
      if (!active) return;
      if (result.data) setSelectedResult(result.data);
      else if (result.error) onToast(ux(language, "couldNotLoad"));
    });
    return () => { active = false; };
  }, [language, onToast, organizationId, routeEntryId, visibleEntries]);
  const reverse = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    const result = await requestReversal({
      original_entry_id: selected.id,
      reason,
      client_command_id: crypto.randomUUID(),
    });
    setBusy(false);
    onToast(result.error ? u("couldNotSave") : u("savedSuccessfully"));
    if (!result.error) {
      setSelectedResult(null);
      setReason("");
      if (organizationId) {
        const refreshed = await searchJournalEntries({
          organizationId,
          search: transactionSearch,
          from: activeRange.from,
          to: activeRange.to,
        });
        if (refreshed.data) setEntries(refreshed.data);
      }
      navigate(location.pathname.replace(/\/[^/]+$/, ""), { replace: true });
    }
  };
  const transactionName = (entry: JournalRecord) =>
    ({
      buy_fx: t("buy"),
      sell_fx: t("sell"),
      exchange_fx: t("exchange"),
      record_expense: t("expense"),
      record_income: u("income"),
      owner_investment: t("ownerCapital"),
      owner_withdrawal: u("ownerWithdrawal"),
      bank_deposit: u("bankDeposit"),
      bank_withdrawal: u("bankWithdrawal"),
      transfer_cash: t("transfer"),
      receive_money: t("receive"),
      pay_money: t("pay"),
      opening_balance: u("openingBalance"),
    })[entry.event_type ?? ""] ?? u("recordedTransaction");
  const moneyFlow = (entry: JournalRecord) => {
    const incoming = ["receive_money", "record_income", "owner_investment", "opening_balance"].includes(entry.event_type ?? "");
    const outgoing = ["pay_money", "record_expense", "owner_withdrawal"].includes(entry.event_type ?? "");
    const fx = ["buy_fx", "sell_fx", "exchange_fx"].includes(entry.event_type ?? "");
    const source =
      entry.source_account_name ||
      entry.legacy_from_name ||
      (outgoing ? entry.legacy_location_name : null) ||
      (entry.event_type === "sell_fx" ? entry.cashbox_name : null) ||
      (fx ? u("customerOutside") : null) ||
      (entry.event_type === "opening_balance" ? u("openingFundsSource") : null) ||
      (entry.event_type === "record_income" ? u("incomeSource") : null) ||
      (entry.event_type === "owner_investment" ? u("ownerPersonal") : null) ||
      (incoming ? u("customerOutside") : u("outsideAccount"));
    const destination =
      entry.destination_account_name ||
      entry.legacy_to_name ||
      (incoming ? entry.legacy_location_name : null) ||
      (entry.event_type === "sell_fx" ? u("customerOutside") : null) ||
      entry.cashbox_name ||
      (fx ? u("customerOutside") : null) ||
      (entry.event_type === "record_expense" ? u("expenseDestination") : null) ||
      (entry.event_type === "owner_withdrawal" ? u("ownerPersonal") : null) ||
      (outgoing ? u("customerOutside") : u("outsideAccount"));
    return { source, destination };
  };
  if (selected) {
    const flow = moneyFlow(selected);
    const listPath = location.pathname.replace(/\/[^/]+$/, "");
    return (
      <section className="panel transaction-detail-page" aria-labelledby="transaction-detail-title">
        <div className="panel-header">
          <div>
            <p className="kicker">{t("transactions")}</p>
            <h1 id="transaction-detail-title">{transactionName(selected)}</h1>
            <p>{selected.transaction_reference ?? selected.receipt_number ?? selected.immutable_reference ?? selected.id}</p>
          </div>
          <button className="text-button" type="button" onClick={() => navigate(listPath)}>{language === "en" ? "Back to transactions" : language === "fa-AF" ? "بازگشت به معاملات" : "معاملو ته ستنېدل"} →</button>
        </div>
        <article className="transaction-receipt">
          <header className="transaction-receipt-head">
            <div><span className="brand-mark">S</span><span><strong>{transactionName(selected)}</strong><small>{filterCopy.receipt}</small></span></div>
            <div><b dir="ltr">{selected.receipt_number ?? selected.transaction_reference ?? "—"}</b><small dir="ltr">{selected.transaction_reference ?? selected.status}</small><small>{selected.status}</small></div>
          </header>
          <div className="receipt-flow">
            <span><small>{u("sourceAccount")}</small><strong>{flow.source}</strong></span>
            <b aria-hidden="true">→</b>
            <span><small>{u("destinationAccount")}</small><strong>{flow.destination}</strong></span>
          </div>
          <div className="transaction-detail-grid">
          <article><small>{u("businessDate")}</small><strong>{new Date(selected.occurred_at).toLocaleString(language, { hour12: false })}</strong></article>
          <article><small>{u("customerLabel")}</small><strong>{selected.counterparty_name || t("walkInCustomer")}</strong></article>
          {selected.amount && selected.currency_code && <article><small>{t("amount")}</small><strong>{formatFinancialAmount(selected.amount)} {selected.currency_code}</strong></article>}
          {selected.given_amount && <article><small>{u("weGaveLabel")}</small><strong>{formatFinancialAmount(selected.given_amount)} {selected.given_currency}</strong></article>}
          {selected.received_amount && <article><small>{u("weReceivedLabel")}</small><strong>{formatFinancialAmount(selected.received_amount)} {selected.received_currency}</strong></article>}
          {selected.customer_rate && <article><small>{filterCopy.rate}</small><strong dir="ltr">{selected.customer_rate}</strong></article>}
          {selected.fee_amount && <article><small>{filterCopy.fee}</small><strong dir="ltr">{formatFinancialAmount(selected.fee_amount)} {selected.fee_currency ?? ""}</strong></article>}
          {selected.memo && <article><small>{t("note")}</small><strong>{selected.memo}</strong></article>}
          </div>
          <footer className="transaction-receipt-foot">
            <span>{language === "en" ? "Recorded by" : language === "fa-AF" ? "ثبت توسط" : "ثبت کوونکی"}: {selected.employee_name || u("teamMember")}</span>
            <details><summary>{filterCopy.technical}</summary><bdi>{selected.id}</bdi>{selected.customer_reference ? <><br /><bdi>{selected.customer_reference}</bdi></> : null}</details>
          </footer>
        </article>
        {canReverse && selected.status === "posted" && (
          <form className="transaction-correction-form" onSubmit={reverse}>
            <div><p className="kicker">{u("correction")}</p><h2>{u("correctTransaction")}</h2><p>{u("originalReference")}: {selected.transaction_reference ?? selected.receipt_number ?? selected.id.slice(0, 12)}</p></div>
            <label>{t("note")}<input required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={u("correctionReason")} /></label>
            <button className="primary-action" type="submit" disabled={busy}>{busy ? u("posting") : u("submitCorrection")} <span>→</span></button>
          </form>
        )}
      </section>
    );
  }
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">{t("transactions")}</p>
          <h1>{u("transactionHistory")}</h1>
          <p>{u("transactionIntro")}</p>
        </div>
        <button className="text-button" onClick={onDashboard}>
          {u("backHome")} →
        </button>
      </div>
      <form className="transaction-filters" onSubmit={(event) => { event.preventDefault(); void loadTransactions(); }}>
        <label className="transaction-search-field">
          <span>{filterCopy.find}</span>
          <input type="search" value={transactionSearch} onChange={(event) => setTransactionSearch(event.target.value)} placeholder="T-000001 / C-000001" />
        </label>
        <div className="transaction-date-presets" role="group" aria-label={u("businessDate")}>
          {([
            ["today", filterCopy.today],
            ["yesterday", filterCopy.yesterday],
            ["week", filterCopy.week],
            ["month", filterCopy.month],
            ["custom", filterCopy.custom],
          ] as const).map(([value, label]) => <button key={value} type="button" className={filterPreset === value ? "active" : ""} aria-pressed={filterPreset === value} onClick={() => setFilterPreset(value)}>{label}</button>)}
        </div>
        {filterPreset === "custom" && <div className="transaction-custom-dates">
          <label>{filterCopy.from}<input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} /></label>
          <label>{filterCopy.to}<input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)} /></label>
        </div>}
        <button className="primary-action" type="submit">{filterCopy.apply}</button>
      </form>
      <div className="balance-list">
        {visibleEntries.length ? (
          visibleEntries.map((entry) => (
            <button
              className="balance-row"
              key={entry.id}
              onClick={() => {
                navigate(`${location.pathname.replace(/\/$/, "")}/${entry.id}`);
                setSelectedResult(entry);
                setReason("");
              }}
            >
              <span className="currency-badge usd">
                {entry.status === "posted" ? "✓" : "↺"}
              </span>
              <span className="balance-name">
                <b>{transactionName(entry)}</b>
                <small>
                  {new Date(entry.occurred_at).toLocaleString(language, { hour12: false })} · {entry.transaction_reference ?? entry.receipt_number ?? entry.immutable_reference?.slice(0, 18) ?? entry.id.slice(0, 12)}
                </small>
                <small className="transaction-flow-line">
                  {moneyFlow(entry).source} → {moneyFlow(entry).destination}
                </small>
                <small className="transaction-people-line">
                  {u("customerLabel")}: {entry.counterparty_name || t("walkInCustomer")}{entry.customer_reference ? " · " + entry.customer_reference : ""} · {u("employeeLabel")}: {entry.employee_name || u("teamMember")}
                </small>
                {entry.given_amount && entry.received_amount && (
                  <small className="transaction-two-sides" dir="ltr">
                    {u("weGaveLabel")}: {formatFinancialAmount(entry.given_amount)} {entry.given_currency} · {u("weReceivedLabel")}: {formatFinancialAmount(entry.received_amount)} {entry.received_currency}
                  </small>
                )}
              </span>
              <strong>
                {entry.amount && entry.currency_code
                  ? `${formatFinancialAmount(entry.amount)} ${entry.currency_code}`
                  : entry.status === "posted"
                    ? t("posted")
                    : entry.status}
              </strong>
            </button>
          ))
        ) : (
          <div className="empty-live">{u("noTransactions")}</div>
        )}
      </div>
    </section>
  );
}

function RatesView({
  language,
  organizationId,
  onDashboard,
}: {
  language: Language;
  organizationId: string | null;
  onDashboard: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const copy = ({
    en: {
      title: "Market rates",
      board: "Shop buy and sell rates",
      intro: "A simple buy and sell board for today.",
      market: "Rate board",
      shop: "My shop",
      currency: "Currency",
      refresh: "Refresh",
      updated: "Updated",
      unavailable: "The shop rates are temporarily unavailable.",
      empty: "No shop rate has been saved yet.",
      back: "Back to Home",
    },
    "fa-AF": {
      title: "نرخ‌های بازار",
      board: "نرخ خرید و فروش صرافی",
      intro: "جدول ساده خرید و فروش امروز.",
      market: "جدول نرخ",
      shop: "صرافی من",
      currency: "اسعار",
      refresh: "تازه‌سازی",
      updated: "تازه‌شده",
      unavailable: "نرخ‌های صرافی فعلاً در دسترس نیست.",
      empty: "هنوز نرخی برای صرافی ذخیره نشده است.",
      back: "بازگشت به خانه",
    },
    "ps-AF": {
      title: "د بازار نرخونه",
      board: "د صرافۍ د پېر او پلور نرخونه",
      intro: "د نن ورځې د پېر او پلور ساده جدول.",
      market: "د نرخ جدول",
      shop: "زما صرافي",
      currency: "اسعار",
      refresh: "تازه کول",
      updated: "تازه شوی",
      unavailable: "د صرافۍ نرخونه اوس نه موندل کېږي.",
      empty: "تر اوسه د صرافۍ نرخ نه دی ساتل شوی.",
      back: "کور ته ستنېدل",
    },
  } as const)[language];
  const [rates, setRates] = useState<MarketRateRow[]>([]);
  const [fetchedAt, setFetchedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadRates = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      if (organizationId === "inspection") {
        setRates([
          { currency: "USD", buy: "64.25", sell: "64.3", quotedUnits: 1 },
          { currency: "EUR", buy: "74", sell: "74.2", quotedUnits: 1 },
          { currency: "GBP", buy: "85.2", sell: "85.5", quotedUnits: 1 },
          { currency: "IRR", buy: "0.00028", sell: "0.00029", quotedUnits: 1000 },
          { currency: "PKR", buy: "0.226", sell: "0.227", quotedUnits: 1000 },
          { currency: "SAR", buy: "17.11", sell: "17.12", quotedUnits: 1 },
          { currency: "AED", buy: "17.49", sell: "17.51", quotedUnits: 1 },
          { currency: "CNY", buy: "9.57", sell: "9.58", quotedUnits: 1 },
          { currency: "KWD", buy: "208", sell: "208", quotedUnits: 1 },
        ]);
        setFetchedAt(new Date().toISOString());
        return;
      }
      if (!organizationId) throw new Error("Missing organization");
      const result = await listRateHistory(organizationId);
      if (result.error) throw new Error(result.error);
      const seen = new Set<string>();
      const latest = (result.data ?? []).filter((rate) => {
        if (rate.to_currency !== "AFN" || rate.from_currency === "AFN" || seen.has(rate.from_currency)) return false;
        seen.add(rate.from_currency);
        return true;
      });
      setRates(latest.map((rate) => ({
        currency: rate.from_currency,
        buy: rate.buy_rate,
        sell: rate.sell_rate,
        quotedUnits: 1,
      })));
      setFetchedAt(latest[0]?.effective_from ?? new Date().toISOString());
    } catch {
      setError(copy.unavailable);
    } finally {
      setBusy(false);
    }
  }, [copy.unavailable, organizationId]);

  useEffect(() => {
    const pendingLoad = window.setTimeout(() => void loadRates(), 0);
    return () => window.clearTimeout(pendingLoad);
  }, [loadRates]);

  const currencySymbols: Record<string, string> = {
    USD: "$", EUR: "€", GBP: "£", IRR: "﷼", PKR: "₨", SAR: "﷼",
    AED: "د.إ", CHF: "Fr", AUD: "A$", CAD: "C$", CNY: "¥",
    KWD: "د.ك", QAR: "ر.ق", BHD: "د.ب", JPY: "¥",
  };
  const displayedRate = (value: string, quotedUnits: number) =>
    new Decimal(value).mul(quotedUnits).toDecimalPlaces(4).toString();
  const boardTime = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <section className="panel rates-market-only">
      <div className="panel-header">
        <div>
          <p className="kicker">{copy.market}</p>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </div>
        <button className="text-button" onClick={onDashboard}>{copy.back} →</button>
      </div>
      <section className="online-rate-board" aria-labelledby="online-rate-board-title">
        <div className="online-rate-board-head">
          <h2 id="online-rate-board-title">{copy.board}</h2>
          <div className="market-rate-actions">
            <label>{copy.market}<select aria-label={copy.market} defaultValue="shop"><option value="shop">{copy.shop}</option></select></label>
            <button className="text-button" type="button" onClick={() => void loadRates()} disabled={busy}>
              {busy ? t("working") : copy.refresh}
            </button>
          </div>
        </div>
        {error ? <p className="notice" role="status">{error}</p> : null}
        {!busy && !error && !rates.length ? <p className="empty-live">{copy.empty}</p> : null}
        {rates.length ? (
          <div className="market-rate-table" role="table" aria-label={copy.title}>
            <div className="market-rate-row market-rate-heading" role="row">
              <span role="columnheader">{copy.currency}</span>
              <span role="columnheader">{t("buyRate")}</span>
              <span role="columnheader">{t("sellRate")}</span>
              <span role="columnheader">{copy.updated}</span>
            </div>
            {rates.map((item) => (
              <div className="market-rate-row" role="row" key={item.currency}>
                <strong role="cell">
                  <span className="market-currency-mark" aria-hidden="true">{currencySymbols[item.currency] ?? item.currency.slice(0, 1)}</span>
                  {item.currency}{item.quotedUnits > 1 ? " 1K" : ""}
                </strong>
                <bdi role="cell">{displayedRate(item.buy, item.quotedUnits)}</bdi>
                <bdi role="cell">{displayedRate(item.sell, item.quotedUnits)}</bdi>
                <time role="cell" dateTime={fetchedAt || undefined}>{boardTime}</time>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  );
}
function ReportsView({
  language,
  businessDate,
  organizationId,
  organizationName,
  branchName,
  cashboxName,
  preparedBy,
  branchId,
  cashboxId,
  onDashboard,
  onToast,
}: {
  language: Language;
  businessDate: string;
  organizationId: string | null;
  organizationName: string;
  branchName: string;
  cashboxName: string;
  preparedBy: string;
  branchId: string | null;
  cashboxId: string | null;
  onDashboard: () => void;
  onToast: (message: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const reportCopy = useMemo(() => ({
    en: {
      choose: "Choose a full report", rows: "report rows", previous: "Previous", next: "Next", empty: "No records match this report and date range.",
      reports: [
        ["daily_transactions", "Daily transactions"], ["transaction_journal", "Transaction journal"], ["cash_movement", "Cash movement"], ["branch_balance", "Branch balances"], ["currency_position", "Currency position"], ["fx_profit", "FX profit"], ["commission", "Commission income"], ["expenses", "Expenses"], ["profit_loss", "Profit and loss"], ["balance_sheet", "Balance sheet"], ["trial_balance", "Trial balance"], ["receivables", "Receivables"], ["payables", "Payables"], ["aging", "Debt aging"], ["counterparty_statement", "Customer statement"], ["owner_capital", "Owner capital"], ["employee_activity", "Employee activity"], ["reversals", "Reversals"], ["reconciliation", "Cashbox reconciliation"], ["rate_history", "Rate history"], ["security_activity", "Security activity"], ["hawala", "Hawala transfers"],
      ],
    },
    "fa-AF": {
      choose: "یک گزارش کامل را انتخاب کنید", rows: "ردیف گزارش", previous: "قبلی", next: "بعدی", empty: "در این گزارش و تاریخ، معلوماتی پیدا نشد.",
      reports: [
        ["daily_transactions", "معاملات روزانه"], ["transaction_journal", "دفتر معاملات"], ["cash_movement", "رفت‌وآمد پول"], ["branch_balance", "موجودی شعبه‌ها"], ["currency_position", "موجودی اسعار"], ["fx_profit", "مفاد خرید و فروش اسعار"], ["commission", "عاید کمیشن"], ["expenses", "مصارف"], ["profit_loss", "مفاد و ضرر"], ["balance_sheet", "دارایی و قرض"], ["trial_balance", "تراز حساب‌ها"], ["receivables", "طلب‌های ما"], ["payables", "قرض‌های ما"], ["aging", "قرض‌های دیرشده"], ["counterparty_statement", "صورت‌حساب شخص"], ["owner_capital", "سرمایه مالک"], ["employee_activity", "کارهای کارمندان"], ["reversals", "معاملات برگشتی"], ["reconciliation", "بستن صندوق"], ["rate_history", "تاریخچه نرخ"], ["security_activity", "تاریخچه امنیت"], ["hawala", "حواله‌ها"],
      ],
    },
    "ps-AF": {
      choose: "بشپړ راپور وټاکئ", rows: "د راپور کرښې", previous: "مخکینی", next: "بل", empty: "په دې راپور او نېټه کې معلومات ونه موندل شول.",
      reports: [
        ["daily_transactions", "ورځنۍ معاملې"], ["transaction_journal", "د معاملو دفتر"], ["cash_movement", "د پیسو تګ راتګ"], ["branch_balance", "د څانګو پیسې"], ["currency_position", "د اسعارو موجودي"], ["fx_profit", "د اسعارو ګټه"], ["commission", "د کمېشن عاید"], ["expenses", "لګښتونه"], ["profit_loss", "ګټه او تاوان"], ["balance_sheet", "شتمني او پورونه"], ["trial_balance", "د حسابونو توازن"], ["receivables", "زموږ طلبونه"], ["payables", "زموږ پورونه"], ["aging", "ځنډېدلي پورونه"], ["counterparty_statement", "د کس حساب"], ["owner_capital", "د مالک پانګه"], ["employee_activity", "د کارکوونکو کارونه"], ["reversals", "بېرته ګرځول شوې معاملې"], ["reconciliation", "د صندوق تړل"], ["rate_history", "د نرخ تاریخ"], ["security_activity", "امنیتي تاریخ"], ["hawala", "حوالې"],
      ],
    },
  }[language] as { choose: string; rows: string; previous: string; next: string; empty: string; reports: Array<[string, string]> }), [language]);
  const reportStatuses = ({
    en: { posted: "Posted", pending: "Pending", submitted: "Submitted", approved: "Approved", rejected: "Rejected", reversed: "Reversed", open: "Open", settled: "Settled", active: "Active", historical: "Past rate", recorded: "Recorded" },
    "fa-AF": { posted: "ثبت‌شده", pending: "منتظر", submitted: "سپرده‌شده", approved: "تأییدشده", rejected: "ردشده", reversed: "برگشت‌شده", open: "باز", settled: "تصفیه‌شده", active: "فعال", historical: "نرخ گذشته", recorded: "ثبت‌شده" },
    "ps-AF": { posted: "ثبت شوې", pending: "منتظر", submitted: "سپارل شوې", approved: "تایید شوې", rejected: "رد شوې", reversed: "بېرته ګرځول شوې", open: "پرانیستې", settled: "تصفیه شوې", active: "فعاله", historical: "پخوانی نرخ", recorded: "ثبت شوې" },
  }[language]) as Record<string, string>;
  const reportTerms = ({
    en: { buy_fx: "Buy currency", sell_fx: "Sell currency", exchange_fx: "Exchange currencies", opening_balance: "Opening money", record_expense: "Expense", record_income: "Income", owner_investment: "Owner investment", owner_withdrawal: "Owner withdrawal", bank_deposit: "Bank deposit", bank_withdrawal: "Bank withdrawal", transfer_cash: "Transfer money", receive_money: "Receive money", pay_money: "Pay money", reversal: "Reversal", cash_variance_adjustment: "Cash difference adjustment", asset: "Asset", liability: "Liability", equity: "Owner capital", income: "Income", expense: "Expense", branch_balance: "Branch balance", carrying_value: "Carrying value in AFN", financial_actions: "Financial actions", overdue: "Overdue", receivable: "They owe us", payable: "We owe them", no_due_date: "No due date", organization_controls_updated: "Business settings changed", cashbox_close_approved: "Cashbox close approved" },
    "fa-AF": { buy_fx: "خرید اسعار", sell_fx: "فروش اسعار", exchange_fx: "تبدیل دو اسعار", opening_balance: "پول آغاز کار", record_expense: "مصرف", record_income: "عاید", owner_investment: "افزایش سرمایه مالک", owner_withdrawal: "برداشت مالک", bank_deposit: "گذاشتن پول در بانک", bank_withdrawal: "گرفتن پول از بانک", transfer_cash: "انتقال پول", receive_money: "پول گرفتن", pay_money: "پول دادن", reversal: "معامله برگشتی", cash_variance_adjustment: "اصلاح تفاوت صندوق", asset: "دارایی", liability: "قرض", equity: "سرمایه مالک", income: "عاید", expense: "مصرف", branch_balance: "موجودی شعبه", carrying_value: "ارزش ثبت‌شده به افغانی", financial_actions: "کارهای مالی", overdue: "وقت‌گذشته", receivable: "مردم به ما قرضدار اند", payable: "ما به مردم قرضدار استیم", no_due_date: "بدون تاریخ", organization_controls_updated: "تنظیمات صرافی تغییر کرد", cashbox_close_approved: "بستن صندوق تأیید شد" },
    "ps-AF": { buy_fx: "د اسعارو پېرل", sell_fx: "د اسعارو پلورل", exchange_fx: "د دوو اسعارو بدلول", opening_balance: "پیل پیسې", record_expense: "لګښت", record_income: "عاید", owner_investment: "د مالک پانګه زیاتول", owner_withdrawal: "د مالک ایستل", bank_deposit: "بانک ته جمع", bank_withdrawal: "له بانک څخه ایستل", transfer_cash: "د پیسو لېږد", receive_money: "پیسې اخیستل", pay_money: "پیسې ورکول", reversal: "بېرته ګرځول شوې معامله", cash_variance_adjustment: "د صندوق د توپیر سمون", asset: "شتمني", liability: "پور", equity: "د مالک پانګه", income: "عاید", expense: "لګښت", branch_balance: "د څانګې پیسې", carrying_value: "په افغانۍ ثبت شوی ارزښت", financial_actions: "مالي کارونه", overdue: "وخت تېر", receivable: "موږ ته پوروړی دی", payable: "موږ پوروړي یو", no_due_date: "د ورکړې نېټه نه لري", organization_controls_updated: "د صرافۍ امستنې بدلې شوې", cashbox_close_approved: "د صندوق تړل تایید شول" },
  }[language]) as Record<string, string>;
  const hawalaReportTerms = ({
    en: { hawala_outgoing_funded: "Outgoing Hawala funded", hawala_incoming_recorded: "Incoming Hawala recorded", hawala_beneficiary_paid: "Hawala beneficiary paid", hawala_partner_paid: "Hawala partner paid", hawala_partner_collected: "Hawala partner collection" },
    "fa-AF": { hawala_outgoing_funded: "پول حواله فرستادنی گرفته شد", hawala_incoming_recorded: "حواله آمدنی ثبت شد", hawala_beneficiary_paid: "پول حواله به گیرنده داده شد", hawala_partner_paid: "پول به همکار حواله داده شد", hawala_partner_collected: "پول از همکار حواله گرفته شد" },
    "ps-AF": { hawala_outgoing_funded: "د وتونکې حوالې پیسې واخیستل شوې", hawala_incoming_recorded: "راتلونکې حواله ثبت شوه", hawala_beneficiary_paid: "د حوالې ګټه اخیستونکي ته ورکړه وشوه", hawala_partner_paid: "د حوالې همکار ته ورکړه وشوه", hawala_partner_collected: "له حوالې همکار څخه پیسې واخیستل شوې" },
  }[language]) as Record<string, string>;
  const localReportTerm = (value: string) => hawalaReportTerms[value] ?? reportTerms[value] ?? value.replaceAll("_", " ");
  const [currency, setCurrency] = useState("All");
  const [status, setStatus] = useState("All");
  const [from, setFrom] = useState(businessDate);
  const [to, setTo] = useState(businessDate);
  const [namedReportCode, setNamedReportCode] = useState("daily_transactions");
  const [namedRows, setNamedRows] = useState<NamedReportRow[]>([]);
  const [namedLoading, setNamedLoading] = useState(false);
  const [reportSnapshot, setReportSnapshot] = useState<FinancialReportSnapshot | null>(null);
  const [inspectionReportGenerated, setInspectionReportGenerated] = useState(false);
  const [reportPage, setReportPage] = useState(0);
  const [exportHistory, setExportHistory] = useState<ReportExportRecord[]>(() => organizationId === "inspection" ? [{ id: "inspection-export", report_name: reportHistoryUi[language].title, format: "pdf", filters: {}, generated_at: new Date().toISOString(), expires_at: null }] : []);
  const [loadedCatalog, setCatalog] = useState<CurrencyCatalogRecord[]>([]);
  const catalog = organizationId === "inspection"
    ? inspectionCurrencies
    : loadedCatalog;
  useEffect(() => {
    if (!organizationId || organizationId === "inspection") return;
    void Promise.all([listCurrencyCatalog(organizationId), listReportExports(organizationId)]).then(([currencyResult, exportResult]) => {
      if (currencyResult.data) setCatalog(currencyResult.data);
      if (exportResult.data) setExportHistory(exportResult.data);
    });
  }, [organizationId]);
  const generateReport = async (overrides?: { reportCode?: string; fromDate?: string; toDate?: string; currency?: string; status?: string }) => {
    if (!organizationId) return;
    if (organizationId === "inspection") {
      setInspectionReportGenerated(true);
      setReportPage(0);
      return;
    }
    const effectiveReportCode = overrides?.reportCode ?? namedReportCode;
    const branchScopedReport = effectiveReportCode !== "security_activity";
    const cashboxScopedReport = !["receivables", "payables", "aging", "counterparty_statement", "rate_history", "security_activity"].includes(effectiveReportCode);
    setNamedLoading(true);
    const filters = {
      organizationId,
      reportCode: effectiveReportCode,
      fromDate: (overrides?.fromDate ?? from) || undefined,
      toDate: (overrides?.toDate ?? to) || undefined,
      currency: overrides?.currency ?? currency,
      status: overrides?.status ?? status,
      branchId: branchScopedReport ? branchId ?? undefined : undefined,
      cashboxId: cashboxScopedReport ? cashboxId ?? undefined : undefined,
    };
    const [result, activityResult, securityResult] = await Promise.all([
      createFinancialReportSnapshot(filters),
      effectiveReportCode === "daily_transactions"
        ? createFinancialReportSnapshot({ ...filters, reportCode: "employee_activity", cashboxId: undefined })
        : Promise.resolve({ data: null, error: null }),
      effectiveReportCode === "daily_transactions"
        ? createFinancialReportSnapshot({ ...filters, reportCode: "security_activity", branchId: undefined, cashboxId: undefined })
        : Promise.resolve({ data: null, error: null }),
    ]);
    setReportSnapshot(result.data);
    setNamedRows([...(result.data?.rows ?? []), ...(activityResult.data?.rows ?? []), ...(securityResult.data?.rows ?? [])]);
    if (result.error || activityResult.error || securityResult.error) onToast(ux(language, "couldNotLoad"));
    setNamedLoading(false);
  };
  const invalidateReport = () => {
    setReportSnapshot(null);
    setInspectionReportGenerated(false);
    setNamedRows([]);
  };
  const inspectionCountUnit = language === "en" ? "items" : language === "fa-AF" ? "عدد" : "شمېر";
  const reportSourceRows = organizationId === "inspection" ? [
    { reference: "000002", date: new Date().toISOString(), label: reportCopy.reports.find(([code]) => code === namedReportCode)?.[1] ?? namedReportCode, detail: branchName, amount: "1000", secondary_amount: "0", currency: namedReportCode === "employee_activity" ? inspectionCountUnit : "AFN", status: "posted" },
    { reference: "000001", date: new Date().toISOString(), label: reportCopy.reports.find(([code]) => code === namedReportCode)?.[1] ?? namedReportCode, detail: branchName, amount: "2500", currency: "AFN", status: "posted" },
    ...(namedReportCode === "daily_transactions" ? [{ reference: "000003", date: new Date().toISOString(), label: "financial_actions", detail: ux(language, "previewCashierName"), amount: "2", currency: inspectionCountUnit, status: "recorded" }] : []),
  ] satisfies NamedReportRow[] : namedRows;
  const namedFilteredRows = organizationId === "inspection"
    ? reportSourceRows.filter((row) => (currency === "All" || row.currency === currency || row.currency === "MIXED" || row.currency === "COUNT") && (status === "All" || row.status === status))
    : reportSourceRows;
  const reportRows = namedFilteredRows.map((row) => ({
    entryId: row.reference,
    occurredAt: row.date,
    type: localReportTerm(row.label) + (row.detail ? ` · ${localReportTerm(row.detail)}` : ""),
    branchId: branchName,
    status: reportStatuses[row.status] ?? localReportTerm(row.status),
    realizedProfit: `${String(row.amount ?? "0")} ${row.currency ?? ""}`.trim(),
  }));
  const pageSize = 25;
  const pageRows = namedFilteredRows.slice(reportPage * pageSize, (reportPage + 1) * pageSize);
  const pageCount = Math.max(1, Math.ceil(namedFilteredRows.length / pageSize));
  const reportName = reportCopy.reports.find(([code]) => code === namedReportCode)?.[1] ?? namedReportCode;
  const reportUsesCashbox = !["receivables", "payables", "aging", "counterparty_statement", "rate_history", "security_activity"].includes(namedReportCode);
  const reportPeriod = from && to && from !== to ? `${from} – ${to}` : to || from || businessDate;
  const reportFilterSummary = [
    currency !== "All" ? `${t("currency")}: ${currency}` : null,
    status !== "All" ? `${u("status")}: ${reportStatuses[status] ?? localReportTerm(status)}` : null,
  ].filter((value): value is string => Boolean(value)).join(" · ") || u("all");
  const reportCashboxName = reportUsesCashbox ? cashboxName : u("all");
  const reportReady = Boolean(reportSnapshot) || (organizationId === "inspection" && inspectionReportGenerated);
  const inspectionFingerprint = language === "en" ? "inspection" : language === "fa-AF" ? "آزمایشی" : "ازمایښتي";
  const reportSummary = reportSnapshot?.summary ?? {
    row_count: namedFilteredRows.length,
    total_amount: namedFilteredRows.reduce((total, row) => total.plus(String(row.amount ?? "0")), new Decimal(0)).toString(),
    total_secondary_amount: namedFilteredRows.reduce((total, row) => total.plus(String(row.secondary_amount ?? "0")), new Decimal(0)).toString(),
    currency_totals: {},
  };
  const pdfSnapshot = {
    transaction_count: Number(reportSummary.row_count),
    volume_base: String(reportSummary.total_amount),
    realized_profit: String(reportSummary.total_amount),
    expenses: "0",
    net_position_base: String(reportSummary.total_secondary_amount),
    reconciliation_differences: "0",
    locations: [],
    receivables: [],
    payables: [],
  };
  const recordSuccessfulExport = async (format: "csv" | "pdf" | "xlsx" | "print") => {
    if (!organizationId) {
      onToast(u("exportUnavailable"));
      return false;
    }
    if (organizationId === "inspection") return true;
    if (!reportSnapshot) {
      onToast(u("exportUnavailable"));
      return false;
    }
    const result = await recordReportExport({
      organization_id: organizationId,
      report_name: reportName,
      format,
      report_snapshot_id: reportSnapshot.id,
    });
    if (result.error) {
      onToast(u("exportUnavailable"));
      return false;
    }
    if (result.data) setExportHistory((current) => [result.data!, ...current.filter((item) => item.id !== result.data!.id)].slice(0, 20));
    return true;
  };
  const downloadPdf = (rows: typeof reportRows) => {
    void (async () => {
      try {
        const { downloadPdf: createPdf } = await loadExports();
        await createPdf({
          rows,
          businessName: organizationName,
          branchName,
          reportName,
          language,
          businessDate: to || from || businessDate,
          snapshot: pdfSnapshot,
          cashboxName: reportCashboxName,
          period: reportPeriod,
          filters: reportFilterSummary,
          preparedBy,
          generatedAt: reportSnapshot?.generated_at,
          snapshotHash: reportSnapshot?.snapshot_sha256,
        });
        if (await recordSuccessfulExport("pdf")) onToast(u("exportReady"));
      } catch {
        onToast(u("exportUnavailable"));
      }
    })();
  };
  const downloadCsv = () => {
    void (async () => {
      try {
        const { downloadCsv: saveCsv } = await loadExports();
        const csv = buildCsvReport(reportRows, organizationName, reportName, reportSnapshot?.generated_at ?? new Date().toISOString(), {
          branchName,
          cashboxName: reportCashboxName,
          period: reportPeriod,
          filters: reportFilterSummary,
          preparedBy,
          snapshotHash: reportSnapshot?.snapshot_sha256,
        });
        saveCsv(csv, `sarafi-${namedReportCode}-${to || from || businessDate}.csv`);
        if (await recordSuccessfulExport("csv")) onToast(u("exportReady"));
      } catch { onToast(u("exportUnavailable")); }
    })();
  };
  const downloadXlsx = () => {
    void (async () => {
      try {
        const { downloadXlsx: saveXlsx } = await loadExports();
        saveXlsx({ rows: reportRows, businessName: organizationName, reportName, generatedAt: reportSnapshot?.generated_at ?? new Date().toISOString(), language, branchName, cashboxName: reportCashboxName, period: reportPeriod, filters: reportFilterSummary, preparedBy, snapshotHash: reportSnapshot?.snapshot_sha256 }, `sarafi-${namedReportCode}-${to || from || businessDate}.xlsx`);
        if (await recordSuccessfulExport("xlsx")) onToast(u("exportReady"));
      } catch { onToast(u("exportUnavailable")); }
    })();
  };
  const printReport = () => {
    void (async () => {
      try {
        const { printReport: print } = await loadExports();
        print();
        if (await recordSuccessfulExport("print")) onToast(u("exportReady"));
      } catch { onToast(u("exportUnavailable")); }
    })();
  };
  const reportGroups = [
    { title: language === "en" ? "Daily operations" : language === "fa-AF" ? "کارهای روزانه" : "ورځني کارونه", codes: ["daily_transactions", "transaction_journal", "cash_movement", "branch_balance", "currency_position"] },
    { title: language === "en" ? "Finance & performance" : language === "fa-AF" ? "مالی و عملکرد" : "مالي او فعالیت", codes: ["fx_profit", "commission", "expenses", "profit_loss", "balance_sheet", "trial_balance", "owner_capital"] },
    { title: language === "en" ? "Customers, debt & Hawala" : language === "fa-AF" ? "مشتریان، قرض و حواله" : "پېرودونکي، پور او حواله", codes: ["receivables", "payables", "aging", "counterparty_statement", "hawala"] },
    { title: language === "en" ? "Control & audit" : language === "fa-AF" ? "کنترول و بررسی" : "کنټرول او پلټنه", codes: ["employee_activity", "reversals", "reconciliation", "rate_history", "security_activity"] },
  ];
  const showCurrencyFilter = !["employee_activity", "security_activity", "rate_history"].includes(namedReportCode);
  const showStatusFilter = !["balance_sheet", "trial_balance", "currency_position", "branch_balance", "rate_history"].includes(namedReportCode);
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">{t("reportCenter")}</p>
          <h1>{u("reportsTitle")}</h1>
          <p>{u("reportsIntro")}</p>
        </div>
        <button className="text-button" onClick={onDashboard}>
          {u("backHome")} →
        </button>
      </div>
      <section className="daily-summary" aria-labelledby="daily-summary-title">
        <h2 id="daily-summary-title">{language === "en" ? "Exact report snapshot" : language === "fa-AF" ? "نسخه دقیق گزارش" : "د راپور کره نسخه"}</h2>
        <div className="report-snapshot">
        <article><span>{reportCopy.rows}</span><b>{reportSummary.row_count}</b></article>
        <article><span>{language === "en" ? "Total amount" : language === "fa-AF" ? "مجموع مبلغ" : "ټول مبلغ"}</span><b><bdi>{formatFinancialAmount(String(reportSummary.total_amount))}</bdi></b></article>
        <article><span>{language === "en" ? "Secondary total" : language === "fa-AF" ? "مجموع دوم" : "دوهم ټولیز"}</span><b><bdi>{formatFinancialAmount(String(reportSummary.total_secondary_amount))}</bdi></b></article>
        <article><span>{language === "en" ? "Snapshot fingerprint" : language === "fa-AF" ? "نشان نسخه" : "د نسخې نښه"}</span><b><bdi>{reportSnapshot?.snapshot_sha256.slice(0, 12) ?? (reportReady ? inspectionFingerprint : "—")}</bdi></b></article>
        </div>
        {reportReady ? <div className="report-evidence" role="note">
          <span>{branchName}</span><span>{reportCashboxName}</span><span><bdi>{reportPeriod}</bdi></span><span>{reportFilterSummary}</span><span>{preparedBy}</span>
        </div> : null}
      </section>
      <div className="report-primary-action">
        <div className="daily-pdf-action">
          <button className="primary-action" type="button" disabled={namedLoading} onClick={() => {
            setNamedReportCode("daily_transactions");
            setFrom(businessDate);
            setTo(businessDate);
            setCurrency("All");
            setStatus("All");
            setReportPage(0);
            void generateReport({ reportCode: "daily_transactions", fromDate: businessDate, toDate: businessDate, currency: "All", status: "All" });
          }}>
            {namedLoading ? t("working") : language === "en" ? "Prepare today’s report" : language === "fa-AF" ? "آماده‌کردن گزارش امروز" : "د نن راپور چمتو کړئ"}
          </button>
          <button className="export-button" type="button" disabled={!reportReady || namedLoading} onClick={() => downloadPdf(reportRows)}>
            <AppIcon name="report" size={18} /> {language === "en" ? "Download simple daily PDF" : language === "fa-AF" ? "گرفتن گزارش ساده PDF" : "ساده ورځنی PDF واخلئ"}
          </button>
        </div>
        {reportSnapshot ? <small><bdi>{new Date(reportSnapshot.generated_at).toLocaleString(language)}</bdi></small> : null}
      </div>
      <details className="report-advanced-filters">
        <summary>{language === "en" ? "Advanced filters" : language === "fa-AF" ? "فیلترهای پیشرفته" : "پرمختللي چاڼونه"}</summary>
        <div className="rate-strip">
        <label>
          {reportCopy.choose}
          <select value={namedReportCode} onChange={(event) => { setNamedReportCode(event.target.value); setReportPage(0); invalidateReport(); }}>
            {reportGroups.map((group) => <optgroup key={group.title} label={group.title}>{group.codes.map((code) => { const report = reportCopy.reports.find(([candidate]) => candidate === code); return report ? <option key={code} value={code}>{report[1]}</option> : null; })}</optgroup>)}
          </select>
        </label>
        <label>
          {u("from")}
          <input
            type="date"
            value={from}
            onChange={(event) => { setFrom(event.target.value); setReportPage(0); invalidateReport(); }}
          />
        </label>
        <label>
          {u("to")}
          <input
            type="date"
            value={to}
            onChange={(event) => { setTo(event.target.value); setReportPage(0); invalidateReport(); }}
          />
        </label>
        {showCurrencyFilter ? <label>
          {t("currency")}
          <select
            value={currency}
            onChange={(event) => { setCurrency(event.target.value); setReportPage(0); invalidateReport(); }}
          >
            <option value="All">{u("all")}</option>
            {catalog.filter((item) => item.enabled).map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} · {currencyName(language, item)}
              </option>
            ))}
          </select>
        </label> : null}
        {showStatusFilter ? <label>
          {u("status")}
          <select
            value={status}
            onChange={(event) => { setStatus(event.target.value); setReportPage(0); invalidateReport(); }}
          >
            <option value="All">{u("all")}</option>
            <option value="posted">{t("posted")}</option>
            <option value="pending">{t("pending")}</option>
            <option value="reversed">{u("reversed")}</option>
          </select>
        </label> : null}
        </div>
        <button className="primary-action" type="button" disabled={namedLoading} onClick={() => void generateReport()}>
          {namedLoading ? t("working") : language === "en" ? "Generate filtered report" : language === "fa-AF" ? "ساخت گزارش فیلترشده" : "چاڼ شوی راپور جوړ کړئ"}
        </button>
      </details>
      {reportReady ? <details className="export-menu">
        <summary className="export-button">{language === "en" ? "Export formats" : language === "fa-AF" ? "قالب‌های خروجی" : "د راپور بڼې"}</summary>
        <div className="activity-actions">
        <button className="export-button" onClick={downloadCsv}>{t("exportCsv")}</button>
        <button className="export-button" onClick={downloadXlsx}>{language === "en" ? "Export Excel" : language === "fa-AF" ? "گرفتن فایل اکسل" : "د اکسل فایل اخیستل"}</button>
        <button className="export-button" onClick={printReport}>
          {u("printA4")}
        </button>
        </div>
      </details> : null}
      <section className="named-report-results" aria-live="polite">
        <div className="panel-header"><div><h2>{reportName}</h2><p>{namedFilteredRows.length} {reportCopy.rows}</p></div>{pageCount > 1 && <div className="report-pagination"><button disabled={reportPage === 0} onClick={() => setReportPage((page) => Math.max(0, page - 1))}>{reportCopy.previous}</button><b><bdi>{reportPage + 1} / {pageCount}</bdi></b><button disabled={reportPage + 1 >= pageCount} onClick={() => setReportPage((page) => Math.min(pageCount - 1, page + 1))}>{reportCopy.next}</button></div>}</div>
        {namedLoading ? <div className="empty-live">{u("reportLoading")}</div> : pageRows.length ? <div className="named-report-table" role="table">{pageRows.map((row, index) => <article role="row" key={`${row.reference}-${index}`}><span><b>{localReportTerm(row.label)}</b><small><bdi>{row.reference}</bdi> · <bdi>{new Date(row.date).toLocaleString(language)}</bdi>{row.detail ? ` · ${localReportTerm(row.detail)}` : ""}</small></span><strong><bdi>{formatFinancialAmount(String(row.amount ?? "0"))} {row.currency}</bdi>{row.secondary_amount !== undefined && <small><bdi>{formatFinancialAmount(String(row.secondary_amount))}</bdi></small>}</strong><em>{reportStatuses[row.status] ?? localReportTerm(row.status)}</em></article>)}</div> : <div className="empty-live">{reportCopy.empty}</div>}
      </section>
      <div className="empty-live">
        {namedLoading ? u("reportLoading") : reportRows.length
          ? `${reportRows.length} ${u("reportsReady")}`
          : u("noReportRows")}
      </div>
      <details className="report-export-history">
        <summary>{reportHistoryUi[language].title}</summary>
        {exportHistory.length ? <div className="report-export-list">{exportHistory.map((item) => <article key={item.id}><span><b>{item.report_name}</b><small>{reportHistoryUi[language].created}: {new Date(item.generated_at).toLocaleString(language)}</small></span><strong>{item.format.toUpperCase()}</strong></article>)}</div> : <p>{reportHistoryUi[language].empty}</p>}
      </details>
    </section>
  );
}

function DebtsView({
  language,
  organizationId,
  branchId,
  deviceId,
  pathname,
  capabilities,
  onRoute,
  onDashboard,
  onToast,
  onFinancialCompleted,
}: {
  language: Language;
  organizationId: string | null;
  branchId: string | null;
  deviceId: string;
  pathname: string;
  capabilities: readonly string[];
  onRoute: (path: string) => void;
  onDashboard: () => void;
  onToast: (message: string) => void;
  onFinancialCompleted: (transaction: CompletedTrade) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const inspection = organizationId === "inspection";
  const [debts, setDebts] = useState<DebtRecord[]>(() => inspection ? [{ id: "inspection-debt", counterparty_id: "inspection-customer", direction: "receivable", currency_code: "AFN", original_amount: "18000", outstanding_amount: "18000", due_at: null, notes: null }] : []);
  const [people, setPeople] = useState<CounterpartyRecord[]>(() => inspection ? [{ id: "inspection-customer", display_name: ux(language, "previewCustomer"), counterparty_type: "customer", risk_status: "standard" }] : []);
  const [counterpartyId, setCounterpartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("AFN");
  const [createRatePublication, setCreateRatePublication] = useState<InlineRatePublication>();
  const [createRateReady, setCreateRateReady] = useState(false);
  const [moneyAccountId, setMoneyAccountId] = useState(inspection ? "inspection-cashbox" : "");
  const [accounts, setAccounts] = useState<MoneyAccountRecord[]>(() => inspection ? inspectionMoneyAccounts(language) : []);
  const [catalog, setCatalog] = useState<CurrencyCatalogRecord[]>(() => inspection ? inspectionCurrencies : []);
  const [selectedDebtChoice, setSelectedDebt] = useState<DebtRecord | null>(null);
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementRatePublication, setSettlementRatePublication] = useState<InlineRatePublication>();
  const [settlementRateReady, setSettlementRateReady] = useState(false);
  const [settlementAccountId, setSettlementAccountId] = useState(inspection ? "inspection-cashbox" : "");
  const [busy, setBusy] = useState(false);
  const [confirmingCreate, setConfirmingCreate] = useState(false);
  const [confirmingSettlement, setConfirmingSettlement] = useState(false);
  const { debtId: routeDebtId = null } = useParams<{ debtId: string }>();
  const receivableCreateRoute = useMatch("/app/:organizationId/transactions/new/debt/receivable");
  const payableCreateRoute = useMatch("/app/:organizationId/transactions/new/debt/payable");
  const dedicatedDebtSettlementRoute = useMatch("/app/:organizationId/debts/:debtId/settle");
  const legacyDebtSettlementRoute = useMatch("/app/:organizationId/debts/settle");
  const legacyReceivableSettlementRoute = useMatch("/app/:organizationId/transactions/new/money-in/debt-payment");
  const legacyPayableSettlementRoute = useMatch("/app/:organizationId/transactions/new/money-out/debt-payment");
  const settlementRoute = dedicatedDebtSettlementRoute
    ?? legacyDebtSettlementRoute
    ?? legacyReceivableSettlementRoute
    ?? legacyPayableSettlementRoute;
  const debtDetailRoute = useMatch("/app/:organizationId/debts/:debtId");
  const journey = receivableCreateRoute
    ? "receivable"
    : payableCreateRoute
      ? "payable"
      : settlementRoute
        ? "settle"
        : debtDetailRoute
          ? "detail"
          : "list";
  const direction: "receivable" | "payable" = journey === "payable" ? "payable" : "receivable";
  const debtIdFromPath = routeDebtId;
  const [selectedDebtResult, setSelectedDebtResult] = useState<DebtRecord | null>(null);
  const selectedDebt = debtIdFromPath
    ? inspection
      ? debts.find((debt) => debt.id === debtIdFromPath) ?? null
      : selectedDebtResult?.id === debtIdFromPath ? selectedDebtResult : null
    : selectedDebtChoice;
  const selectedCreateAccount = accounts.find((account) => account.id === moneyAccountId);
  const selectedSettlementAccount = accounts.find((account) => account.id === settlementAccountId);
  const selectedCreateBalance = selectedCreateAccount?.balances.find((balance) => balance.currency === currency)?.amount ?? "0";
  const insufficientCreateBalance = direction === "receivable" && Boolean(amount)
    && new Decimal(amount || "0").gt(selectedCreateBalance);
  useEffect(() => {
    if (!organizationId || organizationId === "inspection") return;
    void Promise.all([
      listDebts(organizationId),
      listCounterparties(organizationId),
      listMoneyAccounts(organizationId),
      listCurrencyCatalog(organizationId),
    ]).then(([debtResult, peopleResult, accountResult, currencyResult]) => {
      if (debtResult.data) setDebts(debtResult.data);
      if (peopleResult.data) setPeople(peopleResult.data);
      if (accountResult.data) {
        setAccounts(accountResult.data);
        setMoneyAccountId((current) => current || accountResult.data?.find((account) => account.active)?.id || "");
        setSettlementAccountId((current) => current || accountResult.data?.find((account) => account.active)?.id || "");
      }
      if (currencyResult.data) setCatalog(currencyResult.data);
    });
  }, [organizationId]);
  useEffect(() => {
    if (!debtIdFromPath || !organizationId) return;
    if (organizationId === "inspection") return;
    let active = true;
    void getDebtDetail(organizationId, debtIdFromPath).then((result) => {
      if (!active) return;
      setSelectedDebtResult(result.data);
      if (result.error) onToast(ux(language, "couldNotLoad"));
    });
    return () => { active = false; };
  }, [debtIdFromPath, debts, language, onToast, organizationId]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !branchId || !counterpartyId || !moneyAccountId) {
      onToast(
        !counterpartyId
          ? u("choosePersonFirst")
          : !moneyAccountId
            ? u("chooseMoneyAccount")
            : u("businessSetupRequired"),
      );
      return;
    }
    if (currency !== "AFN" && !createRateReady) {
      onToast(language === "en" ? "Choose the rate on this page before saving." : language === "fa-AF" ? "پیش از ثبت، نرخ همین معامله را در این صفحه آماده کنید." : "له ثبت مخکې د همدې معاملې نرخ په دې پاڼه کې چمتو کړئ.");
      return;
    }
    if (insufficientCreateBalance) {
      onToast(language === "en" ? "The selected shop account does not have enough money." : language === "fa-AF" ? "در حساب انتخاب‌شده صرافی پول کافی نیست." : "د صرافۍ په ټاکلي حساب کې کافي پیسې نشته.");
      return;
    }
    if (!confirmingCreate) {
      setConfirmingCreate(true);
      return;
    }
    if (inspection) {
      const createdDebt: DebtRecord = {
        id: "inspection-debt-" + Date.now(),
        counterparty_id: counterpartyId,
        counterparty_name: people.find((person) => person.id === counterpartyId)?.display_name,
        branch_id: branchId,
        direction,
        currency_code: currency,
        original_amount: amount,
        outstanding_amount: amount,
        due_at: null,
        notes: null,
        created_at: new Date().toISOString(),
      };
      setDebts((current) => [createdDebt, ...current]);
      onFinancialCompleted({
        receiptNumber: "SAR-DEBT-" + String(Date.now()).slice(-6),
        journalEntryId: createdDebt.id,
        givenAmount: amount,
        givenCurrency: currency,
        receivedAmount: amount,
        receivedCurrency: currency,
        rate: "—",
        occurredAt: new Date().toISOString(),
        typeLabel: direction === "receivable" ? u("theyOweUs") : u("weOweThem"),
        repeatPath: pathname,
      });
      setCounterpartyId("");
      setAmount("");
      setConfirmingCreate(false);
      return;
    }
    setBusy(true);
    const result = await recordDebt({
      organization_id: organizationId,
      branch_id: branchId,
      counterparty_id: counterpartyId,
      direction,
      currency,
      amount,
      source_money_account_id:
        direction === "receivable" ? moneyAccountId : undefined,
      destination_money_account_id:
        direction === "payable" ? moneyAccountId : undefined,
      cashbox_id: selectedCreateAccount?.cashbox_id || undefined,
      device_id: deviceId || undefined,
      client_command_id: crypto.randomUUID(),
      publish_rate: createRatePublication,
    });
    setBusy(false);
    if (result.error) onToast(localizedFinancialError(language, result.error, u("couldNotSave")));
    if (!result.error) {
      const journalEntryId = String(result.data?.id ?? "");
      const receiptResult = journalEntryId
        ? await getReceiptForJournalEntry(organizationId, journalEntryId)
        : { data: null, error: "Missing journal entry reference" };
      onFinancialCompleted({
        receiptNumber: receiptResult.data?.receipt_number ?? null,
        journalEntryId,
        givenAmount: amount,
        givenCurrency: currency,
        receivedAmount: amount,
        receivedCurrency: currency,
        rate: "—",
        occurredAt: new Date().toISOString(),
        typeLabel: direction === "receivable"
          ? (language === "en" ? "They owe us" : language === "fa-AF" ? "طلب ما از مردم" : "اخیستونکی پور")
          : (language === "en" ? "We owe them" : language === "fa-AF" ? "قرض ما به مردم" : "ورکول کېدونکی پور"),
        repeatPath: pathname,
        flowRows: [
          { label: u("person"), value: people.find((person) => person.id === counterpartyId)?.display_name ?? "—" },
          { label: t("amount"), value: `${formatFinancialAmount(amount)} ${currency}` },
        ],
      });
      setCounterpartyId("");
      setAmount("");
      setCreateRatePublication(undefined);
      setConfirmingCreate(false);
    }
  };
  const settle = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDebt || !organizationId) return;
    if (!settlementAccountId) {
      onToast(u("chooseMoneyAccount"));
      return;
    }
    if (selectedDebt.currency_code !== "AFN" && !settlementRateReady) {
      onToast(language === "en" ? "Choose the rate on this page before saving." : language === "fa-AF" ? "پیش از ثبت، نرخ همین معامله را در این صفحه آماده کنید." : "له ثبت مخکې د همدې معاملې نرخ په دې پاڼه کې چمتو کړئ.");
      return;
    }
    if (!confirmingSettlement) {
      setConfirmingSettlement(true);
      return;
    }
    if (inspection) {
      setDebts((current) => current.map((debt) => debt.id === selectedDebt.id
        ? { ...debt, outstanding_amount: Decimal.max(new Decimal(0), new Decimal(debt.outstanding_amount).minus(settlementAmount)).toFixed(2) }
        : debt));
      onFinancialCompleted({
        receiptNumber: "SAR-SETTLE-" + String(Date.now()).slice(-6),
        journalEntryId: "inspection-settlement-" + Date.now(),
        givenAmount: settlementAmount,
        givenCurrency: selectedDebt.currency_code,
        receivedAmount: settlementAmount,
        receivedCurrency: selectedDebt.currency_code,
        rate: "—",
        occurredAt: new Date().toISOString(),
        typeLabel: selectedDebt.direction === "receivable"
          ? (language === "en" ? "Debt money received" : language === "fa-AF" ? "پول طلب گرفته شد" : "د پور پیسې واخیستل شوې")
          : (language === "en" ? "Debt money paid" : language === "fa-AF" ? "پول قرض داده شد" : "د پور پیسې ورکړل شوې"),
        repeatPath: pathname,
      });
      setConfirmingSettlement(false);
      setSettlementAmount("");
      return;
    }
    setBusy(true);
    const result = await settleDebt({
      debt_id: selectedDebt.id,
      amount: settlementAmount,
      source_money_account_id:
        selectedDebt.direction === "payable"
          ? settlementAccountId
          : undefined,
      destination_money_account_id:
        selectedDebt.direction === "receivable"
          ? settlementAccountId
          : undefined,
      cashbox_id: selectedSettlementAccount?.cashbox_id || undefined,
      device_id: deviceId || undefined,
      client_command_id: crypto.randomUUID(),
      publish_rate: settlementRatePublication,
    });
    setBusy(false);
    if (result.error) onToast(localizedFinancialError(language, result.error, u("couldNotSave")));
    if (!result.error) {
      const journalEntryId = String(result.data?.id ?? "");
      const receiptResult = journalEntryId
        ? await getReceiptForJournalEntry(organizationId, journalEntryId)
        : { data: null, error: "Missing journal entry reference" };
      onFinancialCompleted({
        receiptNumber: receiptResult.data?.receipt_number ?? null,
        journalEntryId,
        givenAmount: settlementAmount,
        givenCurrency: selectedDebt.currency_code,
        receivedAmount: settlementAmount,
        receivedCurrency: selectedDebt.currency_code,
        rate: "—",
        occurredAt: new Date().toISOString(),
        typeLabel: selectedDebt.direction === "receivable"
          ? (language === "en" ? "Debt money received" : language === "fa-AF" ? "گرفتن پول طلب" : "د پور پیسې اخیستل")
          : (language === "en" ? "Debt money paid" : language === "fa-AF" ? "دادن پول قرض" : "د پور پیسې ورکول"),
        repeatPath: pathname,
        flowRows: [
          { label: u("person"), value: selectedDebt.counterparty_name ?? people.find((person) => person.id === selectedDebt.counterparty_id)?.display_name ?? "—" },
          { label: t("amount"), value: `${formatFinancialAmount(settlementAmount)} ${selectedDebt.currency_code}` },
        ],
      });
      setSelectedDebt(null);
      setSettlementAmount("");
      setSettlementRatePublication(undefined);
      setConfirmingSettlement(false);
      if (organizationId) {
        const refreshed = await listDebts(organizationId);
        if (refreshed.data) setDebts(refreshed.data);
      }
    }
  };
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">{t("customersDebts")}</p>
          <h1>{u("debtsTitle")}</h1>
          <p>{u("debtsIntro")}</p>
        </div>
        <button className="text-button" onClick={onDashboard}>
          {u("backHome")} →
        </button>
      </div>
      {!selectedDebt && journey === "settle" && <header className="family-heading"><AppIcon name="debt" /><div><h2>{language === "en" ? "Record debt money" : language === "fa-AF" ? "گرفتن یا دادن پول قرض" : "پور تصفیه کول"}</h2><p>{language === "en" ? "Choose an open debt, then record the money received or paid." : language === "fa-AF" ? "یک طلب یا قرض باقی را انتخاب کنید؛ بعد پولی را که گرفتید یا دادید ثبت کنید." : "د ورکړې د ثبت لپاره یو پرانیستی پور وټاکئ."}</p></div></header>}
      {(journey === "receivable" || journey === "payable") && <form className="financial-task-form" onSubmit={submit}>
        <h2 className="debt-direction-summary"><AppIcon name="debt" />{direction === "receivable" ? u("theyOweUs") : u("weOweThem")}</h2>
        <p className="debt-direction-help">
          {direction === "receivable"
            ? (language === "en" ? "This person must pay this money to us." : language === "fa-AF" ? "این شخص باید این پول را به ما بدهد." : "دا کس باید دا پیسې موږ ته راکړي.")
            : (language === "en" ? "We must pay this money to this person." : language === "fa-AF" ? "ما باید این پول را به این شخص بدهیم." : "موږ باید دا پیسې دې کس ته ورکړو.")}
        </p>
        <label>
          {u("person")}
          <select
            required
            value={counterpartyId}
            onChange={(event) => { setCounterpartyId(event.target.value); setConfirmingCreate(false); }}
          >
            <option value="">{u("choosePerson")}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.display_name}{person.customer_reference ? " · " + person.customer_reference : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            {t("amount")}
            <input
              required
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => { setAmount(event.target.value); setConfirmingCreate(false); }}
              placeholder="0.00"
            />
          </label>
          <label>
            {t("currency")}
            <select value={currency} onChange={(event) => {
              const next = event.target.value;
              setCurrency(next);
              setCreateRatePublication(undefined);
              setCreateRateReady(next === "AFN");
              setConfirmingCreate(false);
            }}>
              {catalog.filter((item) => item.enabled).map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} · {currencyName(language, item)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <InlineRateResolver
          organizationId={organizationId}
          branchId={branchId}
          currency={currency}
          language={language}
          canPublish={hasCapability(capabilities, "rates.manage")}
          value={createRatePublication}
          onChange={(value) => { setCreateRatePublication(value); setConfirmingCreate(false); }}
          onReadyChange={setCreateRateReady}
        />
        <label>
          {direction === "receivable"
            ? (language === "en" ? "Which shop account paid the money?" : language === "fa-AF" ? "پول از کدام حساب صرافی بیرون شد؟" : "پیسې د صرافۍ له کوم حسابه ووتلې؟")
            : (language === "en" ? "Which shop account received the money?" : language === "fa-AF" ? "پول به کدام حساب صرافی آمد؟" : "پیسې د صرافۍ کوم حساب ته راغلې؟")}
          <select required value={moneyAccountId} onChange={(event) => { setMoneyAccountId(event.target.value); setConfirmingCreate(false); }}>
            <option value="">{u("chooseMoneyAccount")}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name} · {account.balances.find((balance) => balance.currency === currency)?.amount ?? "0"} {currency}</option>
            ))}
          </select>
        </label>
        <div className="money-flow-summary">
          <span><small>{direction === "receivable" ? (language === "en" ? "From the shop account" : language === "fa-AF" ? "از حساب صرافی" : "د صرافۍ له حسابه") : (language === "en" ? "From the person" : language === "fa-AF" ? "از طرف شخص" : "له کس څخه")}</small><b>{direction === "receivable" ? accounts.find((account) => account.id === moneyAccountId)?.name ?? u("chooseSourceAccount") : people.find((person) => person.id === counterpartyId)?.display_name ?? u("choosePerson")}</b></span>
          <strong aria-hidden="true">→</strong>
          <span><small>{direction === "payable" ? (language === "en" ? "To the shop account" : language === "fa-AF" ? "به حساب صرافی" : "د صرافۍ حساب ته") : (language === "en" ? "To the person" : language === "fa-AF" ? "به حساب شخص" : "کس ته")}</small><b>{direction === "payable" ? accounts.find((account) => account.id === moneyAccountId)?.name ?? u("chooseDestinationAccount") : people.find((person) => person.id === counterpartyId)?.display_name ?? u("choosePerson")}</b></span>
        </div>
        {insufficientCreateBalance && <p className="field-error" role="alert">{language === "en" ? "Not enough money in this shop account." : language === "fa-AF" ? "در این حساب صرافی پول کافی نیست." : "د صرافۍ په دې حساب کې کافي پیسې نشته."}</p>}
        {!confirmingCreate && <button className="primary-action full" type="submit" disabled={busy || insufficientCreateBalance || (currency !== "AFN" && !createRateReady)}>
          {busy
            ? u("posting")
            : direction === "receivable"
              ? (language === "en" ? "Review: they owe us" : language === "fa-AF" ? "بررسی: این شخص به ما قرضدار است" : "کتنه: دا کس موږ ته پوروړی دی")
              : (language === "en" ? "Review: we owe them" : language === "fa-AF" ? "بررسی: ما به این شخص قرضدار استیم" : "کتنه: موږ دې کس ته پوروړي یو")} <span>→</span>
        </button>}
        {confirmingCreate && <div className="confirmation-backdrop">
          <section className="confirmation-window debt-confirmation" role="dialog" aria-modal="true" aria-labelledby="debt-create-confirmation-title">
            <p className="kicker">{language === "en" ? "Final check" : language === "fa-AF" ? "بررسی نهایی" : "وروستۍ کتنه"}</p>
            <h2 id="debt-create-confirmation-title">{direction === "receivable" ? u("theyOweUs") : u("weOweThem")}</h2>
            <div className="setup-summary">
              <span>{u("person")}</span><b>{people.find((person) => person.id === counterpartyId)?.display_name ?? "—"}</b>
              <span>{t("amount")}</span><b dir="ltr">{formatFinancialAmount(amount)} {currency}</b>
              <span>{direction === "receivable" ? u("sourceAccount") : u("destinationAccount")}</span><b>{selectedCreateAccount?.name ?? "—"}</b>
            </div>
            <div className="confirmation-actions">
              <button className="text-button" type="button" onClick={() => setConfirmingCreate(false)}>{u("editTransaction")}</button>
              <button className="primary-action" type="submit" disabled={busy} autoFocus>{busy ? u("posting") : u("confirmTransaction")} <span>→</span></button>
            </div>
          </section>
        </div>}
      </form>}
      {!selectedDebt && (journey === "list" || journey === "settle") && <div className="balance-list debt-selection-list">
        {debts.length ? (
          debts.map((debt) => (
            <button
              className="balance-row"
              key={debt.id}
              onClick={() => {
                setSelectedDebt(debt);
                setSelectedDebtResult(debt);
                setSettlementAmount(debt.outstanding_amount);
                setSettlementRatePublication(undefined);
                setSettlementRateReady(debt.currency_code === "AFN");
                onRoute(`${workspaceRoot(organizationId)}/debts/${debt.id}${journey === "settle" ? "/settle" : ""}`);
              }}
            >
              <span className="currency-badge usd">{debt.currency_code}</span>
              <span className="balance-name">
                <b>
                  {people.find((person) => person.id === debt.counterparty_id)
                    ?.display_name ?? u("counterparty")}
                </b>
                <small>
                  {debt.direction === "receivable"
                    ? u("theyOweUs")
                    : u("weOweThem")}
                </small>
              </span>
              <strong>{debt.outstanding_amount}</strong>
            </button>
          ))
        ) : (
          <div className="empty-live">{u("noDebts")}</div>
        )}
      </div>}
      {selectedDebt && journey === "detail" && <section className="debt-detail-card" aria-labelledby="debt-detail-title">
        <p className="kicker">{selectedDebt.direction === "receivable" ? u("theyOweUs") : u("weOweThem")}</p>
        <h2 id="debt-detail-title">{people.find((person) => person.id === selectedDebt.counterparty_id)?.display_name ?? u("counterparty")}</h2>
        <dl><div><dt>{u("outstanding")}</dt><dd dir="ltr">{selectedDebt.outstanding_amount} {selectedDebt.currency_code}</dd></div><div><dt>{u("direction")}</dt><dd>{selectedDebt.direction === "receivable" ? u("theyOweUs") : u("weOweThem")}</dd></div></dl>
        <button className="primary-action" type="button" onClick={() => onRoute(`${workspaceRoot(organizationId)}/debts/${selectedDebt.id}/settle`)}>{u("settleDebt")} <span>→</span></button>
      </section>}
      {selectedDebt && journey === "settle" && (
        <form className="financial-task-form" onSubmit={settle}>
          <div className="modal-head">
            <div>
              <p className="kicker">{u("settleDebt")}</p>
              <h2>
                {selectedDebt.direction === "receivable"
                  ? (language === "en" ? "Receive debt money" : language === "fa-AF" ? "گرفتن پول طلب" : "د پور پیسې اخیستل")
                  : (language === "en" ? "Pay debt money" : language === "fa-AF" ? "دادن پول قرض" : "د پور پیسې ورکول")}
              </h2>
            </div>
            <button
              type="button"
              className="close"
              onClick={() => {
                setSelectedDebt(null);
                setSelectedDebtResult(null);
                onRoute(`${workspaceRoot(organizationId)}/debts`);
              }}
              aria-label={t("closeSettlement")}
            >
              ×
            </button>
          </div>
          <p>
            {u("outstanding")}: {selectedDebt.outstanding_amount}{" "}
            {selectedDebt.currency_code}
          </p>
          <label>
            {selectedDebt.direction === "receivable"
              ? (language === "en" ? "Amount we received" : language === "fa-AF" ? "مبلغی که گرفتیم" : "هغه مبلغ چې مو واخیست")
              : (language === "en" ? "Amount we paid" : language === "fa-AF" ? "مبلغی که دادیم" : "هغه مبلغ چې مو ورکړ")}
            <input
              required
              min="0.01"
              max={selectedDebt.outstanding_amount}
              step="0.01"
              value={settlementAmount}
              onChange={(event) => { setSettlementAmount(event.target.value); setConfirmingSettlement(false); }}
            />
          </label>
          <label>
            {selectedDebt.direction === "receivable"
              ? (language === "en" ? "Where did the money arrive?" : language === "fa-AF" ? "پول به کدام حساب آمد؟" : "پیسې کوم حساب ته راغلې؟")
              : (language === "en" ? "Where did the money leave from?" : language === "fa-AF" ? "پول از کدام حساب رفت؟" : "پیسې له کوم حسابه ووتلې؟")}
            <select required value={settlementAccountId} onChange={(event) => { setSettlementAccountId(event.target.value); setConfirmingSettlement(false); }}>
              <option value="">{u("chooseMoneyAccount")}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <InlineRateResolver
            organizationId={organizationId}
            branchId={selectedDebt.branch_id ?? branchId}
            currency={selectedDebt.currency_code}
            language={language}
            canPublish={hasCapability(capabilities, "rates.manage")}
            value={settlementRatePublication}
            onChange={(value) => { setSettlementRatePublication(value); setConfirmingSettlement(false); }}
            onReadyChange={setSettlementRateReady}
          />
          {!confirmingSettlement && <button className="primary-action full" type="submit" disabled={busy || (selectedDebt.currency_code !== "AFN" && !settlementRateReady)}>
            {busy
              ? u("settling")
              : selectedDebt.direction === "receivable"
                ? (language === "en" ? "Review money received" : language === "fa-AF" ? "پول گرفته‌شده را بررسی کنید" : "اخیستل شوې پیسې وګورئ")
                : (language === "en" ? "Review money paid" : language === "fa-AF" ? "پول داده‌شده را بررسی کنید" : "ورکړل شوې پیسې وګورئ")} <span>→</span>
          </button>}
          {confirmingSettlement && <div className="confirmation-backdrop">
            <section className="confirmation-window debt-confirmation" role="dialog" aria-modal="true" aria-labelledby="debt-settlement-confirmation-title">
              <p className="kicker">{language === "en" ? "Final check" : language === "fa-AF" ? "بررسی نهایی" : "وروستۍ کتنه"}</p>
              <h2 id="debt-settlement-confirmation-title">{selectedDebt.direction === "receivable" ? u("weReceivedLabel") : u("weGaveLabel")}</h2>
              <div className="setup-summary">
                <span>{u("person")}</span><b>{selectedDebt.counterparty_name ?? people.find((person) => person.id === selectedDebt.counterparty_id)?.display_name ?? "—"}</b>
                <span>{t("amount")}</span><b dir="ltr">{formatFinancialAmount(settlementAmount)} {selectedDebt.currency_code}</b>
                <span>{selectedDebt.direction === "receivable" ? u("destinationAccount") : u("sourceAccount")}</span><b>{selectedSettlementAccount?.name ?? "—"}</b>
              </div>
              <div className="confirmation-actions">
                <button className="text-button" type="button" onClick={() => setConfirmingSettlement(false)}>{u("editTransaction")}</button>
                <button className="primary-action" type="submit" disabled={busy} autoFocus>{busy ? u("settling") : u("confirmTransaction")} <span>→</span></button>
              </div>
            </section>
          </div>}
        </form>
      )}
      {(journey === "list" || journey === "settle") && <div className="empty-live">{u("settlementNote")}</div>}
    </section>
  );
}

function ReconciliationView({
  language,
  organizationId,
  branchId,
  cashboxId,
  canApprove,
  onDashboard,
  onToast,
}: {
  language: Language;
  organizationId: string | null;
  branchId: string | null;
  cashboxId: string | null;
  canApprove: boolean;
  onDashboard: () => void;
  onToast: (message: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [loadedCatalog, setCatalog] = useState<CurrencyCatalogRecord[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadedExpected, setExpected] = useState<Record<string, string>>({});
  const [closes, setCloses] = useState<ReconciliationCloseRecord[]>([]);
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionBusy, setDecisionBusy] = useState("");
  const catalog = organizationId === "inspection"
    ? inspectionCurrencies
    : loadedCatalog;
  const expected = organizationId === "inspection"
    ? { AFN: "1250000", USD: "18000" }
    : loadedExpected;
  useEffect(() => {
    if (organizationId === "inspection") return;
    if (organizationId && cashboxId)
      void Promise.all([
        listCashboxBalances(organizationId, cashboxId),
        listCurrencyCatalog(organizationId),
        getReconciliationWorkspace(organizationId),
      ]).then(([result, currencyResult, workspaceResult]) => {
        if (result.data) {
          setExpected(
            Object.fromEntries(
              result.data.map((item) => [
                item.currency_code,
                item.expected_amount,
              ]),
            ),
          );
        }
        if (currencyResult.data) setCatalog(currencyResult.data);
        if (workspaceResult.data) setCloses(workspaceResult.data.closes);
        if (result.error || currencyResult.error || workspaceResult.error) onToast(ux(language, "couldNotLoad"));
      });
  }, [cashboxId, language, onToast, organizationId]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !branchId || !cashboxId) {
      onToast(u("activeCashboxRequired"));
      return;
    }
    setBusy(true);
    const result = await recordCashboxClose({
      organization_id: organizationId,
      branch_id: branchId,
      cashbox_id: cashboxId,
      counts: catalog
        .filter((item) => item.enabled)
        .map((item) => ({ currency: item.code, counted_amount: counted[item.code] || "0" })),
      variance_reason: reason,
    });
    setBusy(false);
    onToast(result.error ? localizedFinancialError(language, result.error, u("couldNotSave")) : u("savedSuccessfully"));
    if (!result.error && organizationId) {
      const workspace = await getReconciliationWorkspace(organizationId);
      if (workspace.data) setCloses(workspace.data.closes);
    }
  };
  const decideClose = async (close: ReconciliationCloseRecord, decision: "approved" | "rejected") => {
    if (decisionReason.trim().length < 2) { onToast(u("reasonRequired")); return; }
    setDecisionBusy(close.id);
    const result = decision === "approved" ? await approveCashboxClose(close.id) : await rejectCashboxClose(close.id, decisionReason);
    setDecisionBusy("");
    if (result.error) { onToast(result.error.includes("AAL2") ? u("secureTeamIntro") : u("couldNotSave")); return; }
    setDecisionReason("");
    if (organizationId) {
      const workspace = await getReconciliationWorkspace(organizationId);
      if (workspace.data) setCloses(workspace.data.closes);
    }
    onToast(u("savedSuccessfully"));
  };
  const variance = (currency: string, counted: string) =>
    new Decimal(counted || "0").minus(expected[currency] ?? "0").toFixed(2);
  const countedCurrencies = catalog.filter((item) => item.enabled);
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">{t("cash")}</p>
          <h1>{u("cashboxTitle")}</h1>
          <p>{u("cashboxIntro")}</p>
        </div>
        <button className="text-button" onClick={onDashboard}>
          {u("backHome")} →
        </button>
      </div>
      <div className="balance-list">
        {countedCurrencies.map((currency) => (
          <div className="balance-row" key={currency.code}>
            <span className="currency-badge usd">{currency.code}</span>
            <span className="balance-name">
              <b>{u("expectedVsCounted")}</b>
              <small>
                {u("expectedAmount")}: {expected[currency.code] ?? "0.00"}
              </small>
            </span>
            <strong>
              {u("variance")} {variance(currency.code, counted[currency.code] || "0")}
            </strong>
          </div>
        ))}
      </div>
      <form className="financial-task-form" onSubmit={submit}>
        {countedCurrencies.map((currency) => (
          <label key={currency.code}>
            {u("countedAmount")} · {currency.code} · {currencyName(language, currency)}
            <input
              required
              min="0"
              step={currency.minor_unit === 0 ? "1" : "0.01"}
              value={counted[currency.code] || ""}
              onChange={(event) =>
                setCounted((current) => ({ ...current, [currency.code]: event.target.value }))
              }
              placeholder="0.00"
            />
          </label>
        ))}
        <label>
          {u("differenceReason")}
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={u("reasonRequired")}
          />
        </label>
        <button className="primary-action full" type="submit" disabled={busy}>
          {busy ? u("submitting") : u("submitCashCount")} <span>→</span>
        </button>
      </form>
      <div className="empty-live">{u("cashDifferenceNote")}</div>
      <section className="reconciliation-history">
        <div className="panel-header"><div><h2>{u("statementHistory")}</h2><p>{u("cashboxIntro")}</p></div>{canApprove && <label>{u("reviewDecisionReason")}<input value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder={u("reasonRequired")} /></label>}</div>
        <div className="balance-list">{closes.length ? closes.map((close) => <article className="reconciliation-record" key={close.id}><div className="balance-row"><span className="currency-badge usd">✓</span><span className="balance-name"><b>{close.cashbox_name} · {close.business_date}</b><small>{close.branch_name} · {new Date(close.submitted_at).toLocaleString(language)}</small><small>{close.variance_reason || u("expectedVsCounted")}</small></span><strong>{close.status === "submitted" ? t("pending") : close.status === "approved" ? u("approved") : u("rejected")}</strong>{canApprove && close.status === "submitted" && !close.closed_by_current_user && <div className="member-actions"><button className="text-button" disabled={decisionBusy === close.id} onClick={() => void decideClose(close, "approved")}>{u("approved")}</button><button className="text-button danger" disabled={decisionBusy === close.id} onClick={() => void decideClose(close, "rejected")}>{u("rejected")}</button></div>}</div><div className="reconciliation-lines">{close.lines.map((line) => <span key={line.currency_code}><b>{line.currency_code}</b> {u("expectedAmount")}: {formatFinancialAmount(line.expected_amount)} · {u("countedAmount")}: {formatFinancialAmount(line.counted_amount)} · {u("variance")}: {formatFinancialAmount(line.variance_amount)}</span>)}</div></article>) : <div className="empty-live">{u("noStatementHistory")}</div>}</div>
      </section>
    </section>
  );
}

function HawalaView({
  language,
  organizationId,
  branchId,
  pathname,
  deviceId,
  capabilities,
  onRoute,
  onDashboard,
  onToast,
  onFinancialCompleted,
}: {
  language: Language;
  organizationId: string | null;
  branchId: string | null;
  pathname: string;
  deviceId: string;
  capabilities: readonly string[];
  onRoute: (path: string) => void;
  onDashboard: () => void;
  onToast: (message: string) => void;
  onFinancialCompleted: (transaction: CompletedTrade) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const [transfers, setTransfers] = useState<HawalaTransferRecord[]>([]);
  const [senderName, setSenderName] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const { partnerId: routePartnerId = null, transferId: routeTransferId = null } = useParams<{
    partnerId: string;
    transferId: string;
  }>();
  const incomingRoute = useMatch("/app/:organizationId/transactions/new/hawala/incoming");
  const canonicalPayoutRoute = useMatch("/app/:organizationId/hawala/payout");
  const legacyPayoutRoute = useMatch("/app/:organizationId/transactions/new/hawala/payout");
  const payoutRoute = canonicalPayoutRoute ?? legacyPayoutRoute;
  const partnerListRoute = useMatch("/app/:organizationId/hawala/partners");
  const partnerDetailRoute = useMatch("/app/:organizationId/hawala/partners/:partnerId");
  const partnerSettlementRoute = useMatch("/app/:organizationId/hawala/partners/:partnerId/settle");
  const legacyPartnerSettlementRoute = useMatch("/app/:organizationId/transactions/new/hawala/settlement");
  const settlementRoute = partnerListRoute
    ?? partnerDetailRoute
    ?? partnerSettlementRoute
    ?? legacyPartnerSettlementRoute;
  const sendRoute = useMatch("/app/:organizationId/transactions/new/hawala/send");
  const hawalaMode = incomingRoute ? "incoming" : payoutRoute ? "payout" : settlementRoute ? "settle" : sendRoute ? "send" : "overview";
  const [origin, setOrigin] = useState("");
  const [selectedSettlementPartnerId, setSelectedSettlementPartnerId] = useState("");
  const settlementPartnerId = routePartnerId ?? selectedSettlementPartnerId;
  const [createPartnerId, setCreatePartnerId] = useState(organizationId === "inspection" ? "inspection-partner" : "");
  const [partners, setPartners] = useState<HawalaPartnerRecord[]>(organizationId === "inspection" ? [{ id: "inspection-partner", counterparty_id: null, name: "Herat Partner Exchange", active: true }] : []);
  const [statementResult, setStatementResult] = useState<{
    partnerId: string;
    data: HawalaPartnerStatement;
  } | null>(null);
  const statement = statementResult?.partnerId === settlementPartnerId
    ? statementResult.data
    : null;
  const [payoutCode, setPayoutCode] = useState("");
  const [payoutMatch, setPayoutMatch] = useState<HawalaPayoutMatch | null>(null);
  const [identityReference, setIdentityReference] = useState("");
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [settlementAmounts, setSettlementAmounts] = useState<Record<string, string>>({});
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("0");
  const [currency, setCurrency] = useState("AFN");
  const [createRatePublication, setCreateRatePublication] = useState<InlineRatePublication>();
  const [createRateReady, setCreateRateReady] = useState(false);
  const [settlementRateLineId, setSettlementRateLineId] = useState<string | null>(null);
  const [settlementRatePublication, setSettlementRatePublication] = useState<InlineRatePublication>();
  const [settlementRateReady, setSettlementRateReady] = useState(false);
  const [moneyAccountId, setMoneyAccountId] = useState(
    organizationId === "inspection" ? "inspection-cashbox" : "",
  );
  const [loadedAccounts, setAccounts] = useState<MoneyAccountRecord[]>([]);
  const [loadedCatalog, setCatalog] = useState<CurrencyCatalogRecord[]>([]);
  const accounts = organizationId === "inspection"
    ? inspectionMoneyAccounts(language)
    : loadedAccounts;
  const catalog = organizationId === "inspection"
    ? inspectionCurrencies
    : loadedCatalog;
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [transitionBusy, setTransitionBusy] = useState<string | null>(null);
  useEffect(() => {
    if (organizationId === "inspection") return;
    if (organizationId)
      void Promise.all([
        listHawalaTransfers(organizationId),
        listMoneyAccounts(organizationId),
        listCurrencyCatalog(organizationId),
        listHawalaPartners(organizationId),
      ]).then(([result, accountResult, currencyResult, partnerResult]) => {
        if (result.data) setTransfers(result.data);
        if (accountResult.data) {
          setAccounts(accountResult.data);
          setMoneyAccountId((current) => current || accountResult.data?.[0]?.id || "");
        }
        if (currencyResult.data) setCatalog(currencyResult.data);
        if (partnerResult.data) {
          setPartners(partnerResult.data);
          setCreatePartnerId((current) => current || partnerResult.data?.[0]?.id || "");
        }
      });
  }, [language, organizationId]);
  useEffect(() => {
    if (!routeTransferId) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`hawala-${routeTransferId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [routeTransferId, transfers]);
  useEffect(() => {
    if (!organizationId || organizationId === "inspection" || !settlementPartnerId) return;
    void getHawalaPartnerStatement(organizationId, settlementPartnerId).then((result) => {
      if (result.data) {
        setStatementResult({ partnerId: settlementPartnerId, data: result.data });
      }
      else if (result.error) onToast(ux(language, "couldNotLoad"));
    });
  }, [language, organizationId, settlementPartnerId, onToast]);
  const completeHawalaTransfer = async (
    transfer: HawalaTransferRecord,
    typeLabel: string,
    repeatPath: string,
    journalEntryOverride?: string | null,
  ) => {
    if (!organizationId) return;
    const journalEntryId = journalEntryOverride ?? transfer.payout_journal_entry_id ?? transfer.journal_entry_id ?? transfer.id;
    const receiptResult = journalEntryOverride || transfer.payout_journal_entry_id || transfer.journal_entry_id
      ? await getReceiptForJournalEntry(organizationId, journalEntryId)
      : { data: null, error: null };
    onFinancialCompleted({
      receiptNumber: receiptResult.data?.receipt_number ?? transfer.reference_code,
      journalEntryId,
      givenAmount: transfer.amount,
      givenCurrency: transfer.currency_code,
      receivedAmount: transfer.amount,
      receivedCurrency: transfer.currency_code,
      rate: "—",
      occurredAt: transfer.created_at || new Date().toISOString(),
      typeLabel,
      repeatPath,
      detailPath: `${workspaceRoot(organizationId)}/hawala/${transfer.id}`,
      flowRows: [
        { label: t("referenceCode"), value: transfer.reference_code },
        { label: language === "en" ? "Beneficiary" : language === "fa-AF" ? "مستفید" : "ګټه اخیستونکی", value: transfer.beneficiary_name },
        { label: t("amount"), value: `${formatFinancialAmount(transfer.amount)} ${transfer.currency_code}` },
      ],
    });
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !branchId || !createPartnerId || (hawalaMode === "send" && !moneyAccountId)) {
      onToast(!createPartnerId ? (language === "en" ? "Choose a Hawala partner." : language === "fa-AF" ? "همکار حواله را انتخاب کنید." : "د حوالې همکار وټاکئ.") : moneyAccountId ? u("activeBranchRequired") : u("chooseMoneyAccount"));
      return;
    }
    if (currency !== "AFN" && !createRateReady) {
      onToast(language === "en" ? "Resolve the accounting rate on this page before saving." : language === "fa-AF" ? "پیش از ثبت، نرخ حسابداری را در همین صفحه حل کنید." : "له ثبت مخکې حسابي نرخ په همدې پاڼه کې حل کړئ.");
      return;
    }
    if (organizationId === "inspection") {
      await completeHawalaTransfer({ id: `inspection-hawala-${Date.now()}`, beneficiary_name: beneficiary, origin_location: origin, destination_location: destination, currency_code: currency, amount, fee, reference_code: hawalaMode === "incoming" ? reference : `SAR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, status: hawalaMode === "incoming" ? "ready" : "sent", created_at: new Date().toISOString(), direction: hawalaMode === "incoming" ? "incoming" : "outgoing" }, hawalaMode === "incoming" ? (language === "en" ? "Incoming Hawala" : language === "fa-AF" ? "حواله ورودی" : "راتلونکې حواله") : (language === "en" ? "Send Hawala" : language === "fa-AF" ? "فرستادن حواله" : "حواله لېږل"), pathname);
      setSenderName(""); setBeneficiary(""); setOrigin(""); setDestination(""); setAmount(""); setFee("0"); setReference("");
      return;
    }
    setBusy(true);
    const command = {
      organization_id: organizationId,
      branch_id: branchId,
      hawala_partner_id: createPartnerId,
      sender_name: senderName,
      beneficiary_name: beneficiary,
      destination_location: destination,
      currency,
      amount,
      fee,
      destination_money_account_id: hawalaMode === "send" ? moneyAccountId : undefined,
      reference_code: hawalaMode === "incoming" ? reference : undefined,
      device_id: deviceId || undefined,
      client_command_id: crypto.randomUUID(),
      publish_rate: createRatePublication,
    };
    const result = hawalaMode === "incoming"
      ? await recordHawalaIncoming({ ...command, origin_location: origin })
      : await recordHawalaSend(command);
    setBusy(false);
    if (result.error) onToast(localizedFinancialError(language, result.error, u("couldNotSave")));
    if (!result.error) {
      if (result.data) await completeHawalaTransfer(result.data, hawalaMode === "incoming" ? (language === "en" ? "Incoming Hawala" : language === "fa-AF" ? "حواله ورودی" : "راتلونکې حواله") : (language === "en" ? "Send Hawala" : language === "fa-AF" ? "فرستادن حواله" : "حواله لېږل"), pathname);
      setBeneficiary("");
      setSenderName("");
      setOrigin("");
      setDestination("");
      setAmount("");
      setFee("0");
      setReference("");
      setCreateRatePublication(undefined);
      if (organizationId) {
        const refreshed = await listHawalaTransfers(organizationId);
        if (refreshed.data) setTransfers(refreshed.data);
      }
    }
  };
  const searchPayout = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || payoutCode.trim().length < 4) return;
    setSearchBusy(true);
    if (organizationId === "inspection") {
      setPayoutMatch(payoutCode.trim().toUpperCase() === "INCOMING-1001" ? {
        reference_code: "INCOMING-1001", beneficiary_name: "Ahmad Rahimi", destination_location: "Kabul",
        currency_code: "AFN", amount: "25000", branch_id: "inspection-branch", hawala_partner_id: "inspection-partner",
      } : null);
      setSearchBusy(false);
      return;
    }
    const result = await findHawalaPayout(organizationId, payoutCode);
    setPayoutMatch(result.data);
    setSearchBusy(false);
    if (result.error) onToast(u("couldNotLoad"));
  };
  const confirmPayout = async () => {
    if (!organizationId || !payoutMatch || !moneyAccountId || !identityConfirmed || identityReference.trim().length < 2) return;
    if (organizationId === "inspection") {
      const preview = { id: "inspection-incoming", beneficiary_name: payoutMatch.beneficiary_name, origin_location: "—", destination_location: payoutMatch.destination_location, currency_code: payoutMatch.currency_code, amount: payoutMatch.amount, fee: "0", reference_code: payoutMatch.reference_code, status: "paid", created_at: new Date().toISOString(), direction: "incoming" as const, payout_journal_entry_id: "inspection-payout-entry" };
      await completeHawalaTransfer(preview, language === "en" ? "Hawala payout" : language === "fa-AF" ? "دادن پول حواله" : "د حوالې ورکړه", pathname, preview.payout_journal_entry_id);
      setPayoutMatch(null); setPayoutCode(""); setIdentityReference(""); setIdentityConfirmed(false);
      return;
    }
    setTransitionBusy(payoutMatch.reference_code);
    const command = {
      organization_id: organizationId,
      reference_code: payoutMatch.reference_code,
      money_account_id: moneyAccountId,
      identity_confirmed: true as const,
      recipient_identity_reference: identityReference,
      device_id: deviceId || undefined,
      approval_reason: "Beneficiary payout above the configured approval threshold",
      client_command_id: crypto.randomUUID(),
    };
    const result = await payHawalaBeneficiary(command);
    if (result.error?.includes("HAWALA_APPROVAL_REQUIRED")) {
      const approval = await requestHawalaPayoutApproval(command);
      if (approval.data?.status === "approved") {
        const resumed = await resumeApprovedHawalaPayout(approval.data.id);
        setTransitionBusy(null);
        if (resumed.error) { onToast(localizedFinancialError(language, resumed.error, u("couldNotSave"))); return; }
        if (resumed.data) await completeHawalaTransfer(resumed.data, language === "en" ? "Hawala payout" : language === "fa-AF" ? "دادن پول حواله" : "د حوالې ورکړه", pathname);
        setTransfers((current) => current.map((item) => item.reference_code === payoutMatch.reference_code ? { ...item, status: "paid" } : item));
        setPayoutMatch(null); setPayoutCode(""); setIdentityReference(""); setIdentityConfirmed(false);
        return;
      }
      setTransitionBusy(null);
      onToast(approval.error ? localizedFinancialError(language, approval.error, u("couldNotSave")) : (language === "en" ? "Approval requested. The verified payout draft is preserved." : language === "fa-AF" ? "درخواست تأیید فرستاده شد و فورم دادن پول محفوظ است." : "د تایید غوښتنه ولېږل شوه او د ورکړې مسوده خوندي ده."));
      return;
    }
    setTransitionBusy(null);
    if (result.error) { onToast(localizedFinancialError(language, result.error, u("couldNotSave"))); return; }
    if (result.data) await completeHawalaTransfer(result.data, language === "en" ? "Hawala payout" : language === "fa-AF" ? "دادن پول حواله" : "د حوالې ورکړه", pathname);
    setTransfers((current) => current.map((item) => item.reference_code === payoutMatch.reference_code ? { ...item, status: "paid" } : item));
    setPayoutMatch(null); setPayoutCode(""); setIdentityReference(""); setIdentityConfirmed(false);
  };
  const settleLine = async (line: HawalaPartnerStatement["lines"][number]) => {
    const settlementAmount = settlementAmounts[line.id] || line.remaining_amount;
    if (!organizationId || !settlementPartnerId || !moneyAccountId || !settlementAmount) return;
    if (organizationId === "inspection") { onToast(u("savedSuccessfully")); return; }
    if (line.currency_code !== "AFN" && (settlementRateLineId !== line.id || !settlementRateReady)) {
      setSettlementRateLineId(line.id);
      setSettlementRatePublication(undefined);
      setSettlementRateReady(false);
      onToast(language === "en" ? "Resolve this line’s accounting rate below, then choose Settle again." : language === "fa-AF" ? "نرخ حسابداری این قلم را در پایین حل کرده و دوباره تصفیه را انتخاب کنید." : "د دې توکي حسابي نرخ لاندې حل کړئ، بیا تصفیه وټاکئ.");
      return;
    }
    setTransitionBusy(line.id);
    const result = await settleHawalaPartner({
      statement_line_id: line.id,
      hawala_partner_id: settlementPartnerId,
      money_account_id: moneyAccountId,
      amount: settlementAmount,
      device_id: deviceId || undefined,
      client_command_id: crypto.randomUUID(),
      publish_rate: settlementRatePublication,
    });
    setTransitionBusy(null);
    if (result.error) { onToast(localizedFinancialError(language, result.error, u("couldNotSave"))); return; }
    const journalEntryId = String(result.data?.journal_entry_id ?? "");
    const receiptResult = journalEntryId
      ? await getReceiptForJournalEntry(organizationId, journalEntryId)
      : { data: null, error: null };
    onFinancialCompleted({
      receiptNumber: receiptResult.data?.receipt_number ?? line.reference_code,
      journalEntryId: journalEntryId || line.transfer_id,
      givenAmount: settlementAmount,
      givenCurrency: line.currency_code,
      receivedAmount: settlementAmount,
      receivedCurrency: line.currency_code,
      rate: "—",
      occurredAt: new Date().toISOString(),
      typeLabel: language === "en" ? "Hawala partner settlement" : language === "fa-AF" ? "تصفیه همکار حواله" : "د حوالې له همکار سره تصفیه",
      repeatPath: pathname,
      detailPath: `${workspaceRoot(organizationId)}/hawala/${line.transfer_id}`,
      flowRows: [
        { label: t("referenceCode"), value: line.reference_code },
        { label: t("amount"), value: `${formatFinancialAmount(settlementAmount)} ${line.currency_code}` },
      ],
    });
    setSettlementAmounts((current) => ({ ...current, [line.id]: "" }));
    setSettlementRateLineId(null);
    setSettlementRatePublication(undefined);
    const refreshed = await getHawalaPartnerStatement(organizationId, settlementPartnerId);
    if (refreshed.data) {
      setStatementResult({ partnerId: settlementPartnerId, data: refreshed.data });
    }
  };
  const canSettle = hasCapability(capabilities, "hawala.settle");
  const settlementRateLine = settlementRateLineId
    ? statement?.lines.find((line) => line.id === settlementRateLineId) ?? null
    : null;
  const selectedTransfer = routeTransferId
    ? transfers.find((transfer) => transfer.id === routeTransferId) ?? null
    : null;
  const selectedTimeline = selectedTransfer
    ? (selectedTransfer.direction === "incoming"
      ? ["created", "ready", "paid"]
      : ["created", "funded", "sent", "paid"])
    : [];
  const reachedTimelineIndex = selectedTransfer
    ? Math.max(selectedTimeline.indexOf(selectedTransfer.status), selectedTransfer.status === "cancelled" ? 0 : -1)
    : -1;
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">{u("optionalSection")}</p>
          <h1>{u("hawalaTitle")}</h1>
          <p>{u("hawalaIntro")}</p>
        </div>
        <button className="text-button" onClick={onDashboard}>
          {u("backHome")} →
        </button>
      </div>
      {hawalaMode === "settle" ? (
        <section className="financial-task-form hawala-settlement-form" aria-labelledby="hawala-settlement-title">
          <h2 id="hawala-settlement-title">{language === "en" ? "Settle a Hawala partner" : language === "fa-AF" ? "تصفیه همکار حواله" : "د حوالې له همکار سره تصفیه"}</h2>
          {!canSettle ? <p className="calm-empty" role="status">{u("readOnlyRoleNotice")}</p> : null}
          <label>{language === "en" ? "Partner" : language === "fa-AF" ? "همکار" : "همکار"}<select required disabled={!canSettle} value={settlementPartnerId} onChange={(event) => { const next = event.target.value; setSelectedSettlementPartnerId(next); if (next) onRoute(`${workspaceRoot(organizationId)}/hawala/partners/${next}/settle`); }}><option value="">{language === "en" ? "Search or choose a partner" : language === "fa-AF" ? "همکار را جستجو یا انتخاب کنید" : "همکار ولټوئ یا وټاکئ"}</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>
          <label>{u("destinationAccount")}<select required value={moneyAccountId} onChange={(event) => setMoneyAccountId(event.target.value)}><option value="">{u("chooseDestinationAccount")}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <div className="partner-statement-summary"><span>{language === "en" ? "Open statement lines" : language === "fa-AF" ? "اقلام باز صورت‌حساب" : "د حساب پرانیستي توکي"}</span><strong>{statement?.lines.filter((line) => line.status === "open" || line.status === "partial").length ?? 0}</strong></div>
          {statement?.totals.map((total) => <div className="partner-statement-summary" key={total.currency_code}><span>{total.currency_code} · {language === "en" ? "Payable / Receivable / Net" : language === "fa-AF" ? "دادنی / گرفتنی / باقی" : "ورکول / اخیستل / خالص"}</span><strong dir="ltr">{total.payable} / {total.receivable} / {total.net_receivable}</strong></div>)}
          <div className="balance-list hawala-payout-list">
            {statement?.lines.filter((line) => line.status === "open" || line.status === "partial").map((line) => <article className="balance-row" key={line.id}><span className="balance-name"><b>{line.beneficiary_name}</b><small><bdi>{line.reference_code}</bdi> · {line.direction} · {line.currency_code}</small></span><input className="hawala-settlement-amount" aria-label={t("amount")} required min="0.01" max={line.remaining_amount} step="0.01" value={settlementAmounts[line.id] ?? ""} onChange={(event) => setSettlementAmounts((current) => ({ ...current, [line.id]: event.target.value }))} placeholder={line.remaining_amount} inputMode="decimal" /><button className="primary-action" type="button" disabled={!canSettle || transitionBusy === line.id || !settlementPartnerId || !moneyAccountId} onClick={() => void settleLine(line)}>{transitionBusy === line.id ? "…" : (language === "en" ? "Settle" : language === "fa-AF" ? "تصفیه" : "تصفیه")}</button></article>)}
            {settlementPartnerId && !statement?.lines.some((line) => line.status === "open" || line.status === "partial") ? <div className="empty-live">{u("noHawala")}</div> : null}
          </div>
          {settlementRateLine ? (
            <InlineRateResolver
              organizationId={organizationId}
              branchId={settlementRateLine.branch_id ?? branchId}
              currency={settlementRateLine.currency_code}
              language={language}
              canPublish={hasCapability(capabilities, "rates.manage")}
              value={settlementRatePublication}
              onChange={setSettlementRatePublication}
              onReadyChange={setSettlementRateReady}
            />
          ) : null}
        </section>
      ) : hawalaMode === "payout" ? (
        <section className="financial-task-form hawala-payout-form" aria-labelledby="hawala-payout-title">
          <h2 id="hawala-payout-title">{language === "en" ? "Pay by reference code" : language === "fa-AF" ? "دادن پول با رمز حواله" : "د حوالې په کوډ ورکړه"}</h2>
          <p>{language === "en" ? "Enter the customer’s code. SARAFI shows only the matching ready transfer." : language === "fa-AF" ? "رمز مشتری را وارد کنید. سرافی فقط حواله آماده و مطابق را نشان می‌دهد." : "د پېرېدونکي کوډ ولیکئ. سرافي یوازې برابره چمتو حواله ښيي."}</p>
          <form className="hawala-code-search" onSubmit={searchPayout}><label>{t("referenceCode")}<input autoFocus required dir="ltr" value={payoutCode} onChange={(event) => { setPayoutCode(event.target.value.trimStart()); setPayoutMatch(null); }} placeholder={u("uniqueReference")} /></label><button className="secondary-action" type="submit" disabled={searchBusy || payoutCode.trim().length < 4}>{searchBusy ? "…" : (language === "en" ? "Find transfer" : language === "fa-AF" ? "یافتن حواله" : "حواله ومومئ")}</button></form>
          <ReferenceScanner language={language} onDetected={(reference) => { setPayoutCode(reference); setPayoutMatch(null); }} />
          {payoutCode.trim().length >= 4 && !payoutMatch && !searchBusy ? <p className="calm-empty" role="status">{language === "en" ? "Enter the exact code and choose Find transfer." : language === "fa-AF" ? "رمز دقیق را وارد کرده و یافتن حواله را بزنید." : "کره کوډ ولیکئ او حواله ومومئ وټاکئ."}</p> : null}
          {payoutMatch ? <>
            <article className="payout-match"><span><strong>{payoutMatch.beneficiary_name}</strong><small>{payoutMatch.destination_location}</small></span><b dir="ltr">{formatFinancialAmount(payoutMatch.amount)} {payoutMatch.currency_code}</b></article>
            <label>{u("destinationAccount")}<select required value={moneyAccountId} onChange={(event) => setMoneyAccountId(event.target.value)}><option value="">{u("chooseDestinationAccount")}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <label>{language === "en" ? "Checked identity reference" : language === "fa-AF" ? "مرجع هویت بررسی‌شده" : "کتل شوې پېژندپاڼې مرجع"}<input required value={identityReference} onChange={(event) => setIdentityReference(event.target.value)} placeholder={language === "en" ? "Document type and last digits" : language === "fa-AF" ? "نوع سند و رقم‌های آخر" : "د سند ډول او وروستۍ شمېرې"} /></label>
            <label className="inline-check"><input type="checkbox" checked={identityConfirmed} onChange={(event) => setIdentityConfirmed(event.target.checked)} />{language === "en" ? "I matched the recipient to the transfer beneficiary." : language === "fa-AF" ? "هویت گیرنده را با مستفید حواله مطابقت دادم." : "ما د اخیستونکي هویت د حوالې له ګټه اخیستونکي سره برابر کړ."}</label>
            <button className="primary-action full" type="button" disabled={transitionBusy === payoutMatch.reference_code || !moneyAccountId || !identityConfirmed || identityReference.trim().length < 2} onClick={() => void confirmPayout()}>{transitionBusy === payoutMatch.reference_code ? "…" : (language === "en" ? "Confirm payout" : language === "fa-AF" ? "دادن پول را تأیید کنید" : "ورکړه تایید کړئ")}</button>
          </> : null}
        </section>
      ) : hawalaMode === "send" || hawalaMode === "incoming" ? (
        <form className="financial-task-form" onSubmit={submit}>
          <h2>{hawalaMode === "send" ? (language === "en" ? "Send Hawala" : language === "fa-AF" ? "فرستادن حواله" : "حواله لېږل") : (language === "en" ? "Record incoming instruction" : language === "fa-AF" ? "ثبت حواله رسیده" : "رارسېدلې حواله ثبتول")}</h2>
          <label>{language === "en" ? "Hawala partner" : language === "fa-AF" ? "همکار حواله" : "د حوالې همکار"}<select required value={createPartnerId} onChange={(event) => setCreatePartnerId(event.target.value)}><option value="">{language === "en" ? "Choose the canonical partner" : language === "fa-AF" ? "همکار اصلی را انتخاب کنید" : "اصلي همکار وټاکئ"}</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>
          <label>{language === "en" ? "Sender" : language === "fa-AF" ? "فرستنده" : "لېږونکی"}<input required value={senderName} onChange={(event) => setSenderName(event.target.value)} placeholder={language === "en" ? "Sender’s full name" : language === "fa-AF" ? "نام کامل فرستنده" : "د لېږونکي بشپړ نوم"} /></label>
          <label>{u("receiver")}<input required value={beneficiary} onChange={(event) => setBeneficiary(event.target.value)} placeholder={u("fullBeneficiaryName")} /></label>
          {hawalaMode === "incoming" ? <label>{language === "en" ? "Origin location" : language === "fa-AF" ? "محل مبدأ" : "د پیل ځای"}<input required value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder={u("cityCountry")} /></label> : null}
          <label>{t("destination")}<input required value={destination} onChange={(event) => setDestination(event.target.value)} placeholder={u("cityCountry")} /></label>
          <div className="form-grid"><label>{t("amount")}<input required min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label><label>{t("fee")}<input min="0" step="0.01" inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)} /></label></div>
          <label>{t("currency")}<select value={currency} onChange={(event) => {
            const next = event.target.value;
            setCurrency(next);
            setCreateRatePublication(undefined);
            setCreateRateReady(next === "AFN");
          }}>{catalog.filter((item) => item.enabled).map((item) => <option key={item.code} value={item.code}>{item.code} · {currencyName(language, item)}</option>)}</select></label>
          <InlineRateResolver
            organizationId={organizationId}
            branchId={branchId}
            currency={currency}
            language={language}
            canPublish={hasCapability(capabilities, "rates.manage")}
            value={createRatePublication}
            onChange={setCreateRatePublication}
            onReadyChange={setCreateRateReady}
          />
          {hawalaMode === "send" ? <label>{u("destinationAccount")}<select required value={moneyAccountId} onChange={(event) => setMoneyAccountId(event.target.value)}><option value="">{u("chooseDestinationAccount")}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}
          {hawalaMode === "incoming" ? <label>{t("referenceCode")}<input required dir="ltr" value={reference} onChange={(event) => setReference(event.target.value)} placeholder={u("uniqueReference")} /></label> : <p className="form-hint">{language === "en" ? "A secure reference will be issued when this Hawala is saved." : language === "fa-AF" ? "پس از ثبت حواله، یک رمز امن ساخته می‌شود." : "د حوالې له ثبت وروسته به خوندي کوډ جوړ شي."}</p>}
          <button className="primary-action full" type="submit" disabled={busy || (currency !== "AFN" && !createRateReady)}>{busy ? u("postingHawala") : u("saveHawala")} <span>→</span></button>
        </form>
      ) : null}
      {hawalaMode === "overview" && routeTransferId ? selectedTransfer ? (
        <article className="hawala-detail-card" aria-labelledby="hawala-detail-title">
          <div className="panel-header compact-header">
            <div>
              <p className="kicker">{language === "en" ? "Hawala record" : language === "fa-AF" ? "ثبت حواله" : "د حوالې ثبت"}</p>
              <h2 id="hawala-detail-title">{selectedTransfer.beneficiary_name}</h2>
              <p><bdi>{selectedTransfer.reference_code}</bdi></p>
            </div>
            <button className="text-button" type="button" onClick={() => onRoute(`${workspaceRoot(organizationId)}/hawala`)}>
              {language === "en" ? "All Hawalas" : language === "fa-AF" ? "همه حواله‌ها" : "ټولې حوالې"} →
            </button>
          </div>
          <dl className="hawala-detail-grid">
            <div><dt>{t("amount")}</dt><dd><bdi>{formatFinancialAmount(selectedTransfer.amount)} {selectedTransfer.currency_code}</bdi></dd></div>
            <div><dt>{t("fee")}</dt><dd><bdi>{formatFinancialAmount(selectedTransfer.fee)} {selectedTransfer.currency_code}</bdi></dd></div>
            <div><dt>{language === "en" ? "Direction" : language === "fa-AF" ? "جهت" : "لوری"}</dt><dd>{selectedTransfer.direction ?? "legacy"}</dd></div>
            <div><dt>{u("status")}</dt><dd><span className={`status-pill status-${selectedTransfer.status}`}>● {selectedTransfer.status}</span></dd></div>
            <div><dt>{language === "en" ? "Origin" : language === "fa-AF" ? "مبدأ" : "پیل"}</dt><dd>{selectedTransfer.origin_location || "—"}</dd></div>
            <div><dt>{t("destination")}</dt><dd>{selectedTransfer.destination_location}</dd></div>
            <div><dt>{language === "en" ? "Created" : language === "fa-AF" ? "زمان ثبت" : "د ثبت وخت"}</dt><dd><bdi>{new Date(selectedTransfer.created_at).toLocaleString(language)}</bdi></dd></div>
            <div><dt>{language === "en" ? "Integrity" : language === "fa-AF" ? "سلامت ثبت" : "د ثبت بشپړتیا"}</dt><dd>{selectedTransfer.integrity_state === "review_required" ? (language === "en" ? "Review required" : language === "fa-AF" ? "نیازمند بررسی" : "کتنې ته اړتیا لري") : (language === "en" ? "Valid" : language === "fa-AF" ? "معتبر" : "سم")}</dd></div>
          </dl>
          <section className="hawala-timeline" aria-label={language === "en" ? "Hawala status timeline" : language === "fa-AF" ? "مسیر وضعیت حواله" : "د حوالې د حالت لړۍ"}>
            <h3>{language === "en" ? "Status timeline" : language === "fa-AF" ? "مسیر وضعیت" : "د حالت لړۍ"}</h3>
            <ol>
              {selectedTimeline.map((statusItem, index) => <li className={index <= reachedTimelineIndex ? "complete" : "pending"} key={statusItem}><span aria-hidden="true">{index <= reachedTimelineIndex ? "✓" : index + 1}</span><strong>{statusItem}</strong></li>)}
              {selectedTransfer.status === "cancelled" ? <li className="cancelled"><span aria-hidden="true">×</span><strong>{language === "en" ? "Cancelled" : language === "fa-AF" ? "لغوشده" : "لغوه شوې"}</strong></li> : null}
            </ol>
          </section>
        </article>
      ) : (
        <div className="calm-empty" role="status">{language === "en" ? "This Hawala is unavailable or outside your assigned scope." : language === "fa-AF" ? "این حواله موجود نیست یا بیرون از ساحه تعیین‌شده شما است." : "دا حواله نشته یا ستاسو له ټاکل شوې ساحې بهر ده."}</div>
      ) : null}
      {hawalaMode === "overview" ? <div className="balance-list">
        {transfers.length ? (
          transfers.map((transfer) => (
            <button type="button" className={`balance-row ${routeTransferId === transfer.id ? "deep-link-focus" : ""}`} id={`hawala-${transfer.id}`} key={transfer.id} onClick={() => onRoute(`${workspaceRoot(organizationId)}/hawala/${transfer.id}`)}>
              <span className="currency-badge usd">
                {transfer.currency_code}
              </span>
              <span className="balance-name">
                <b>{transfer.beneficiary_name}</b>
                <small>
                  {transfer.reference_code} · {transfer.destination_location} · {transfer.direction ?? "legacy"}
                </small>
              </span>
              <strong>{formatFinancialAmount(transfer.amount)}</strong>
              <span className="hawala-status-actions">
                <small className={`status-pill status-${transfer.status}`}>● {transfer.status}{transfer.integrity_state === "review_required" ? " · review" : ""}</small>
              </span>
            </button>
          ))
        ) : (
          <div className="empty-live">{u("noHawala")}</div>
        )}
      </div> : null}
    </section>
  );
}

function WorkerConnectionLobby({ language, code, kind, name, busy, message, onLanguageChange, onKindChange, onNameChange, onCodeChange, onSubmit, onCreateBusiness, onSignOut }: {
  language: Language;
  code: string;
  kind: "invitation" | "request";
  name: string;
  busy: boolean;
  message: string;
  onLanguageChange: (language: Language) => void;
  onKindChange: (kind: "invitation" | "request") => void;
  onNameChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onCreateBusiness: () => void;
  onSignOut: () => void;
}) {
  const [workerSelected, setWorkerSelected] = useState(Boolean(code.trim()));
  const text = language === "en"
    ? { kicker: "Choose your next step", title: "How will you use SARAFI?", intro: "Choose the path that matches your authority. A worker stays outside the workplace until an owner approves access.", owner: "I own or manage a Sarafi", ownerCopy: "Create a new business and become its Owner.", worker: "I work for a Sarafi", workerCopy: "Use an invitation or request access for owner review.", workerTitle: "Join your SARAFI team", existing: "Sign in to an existing workplace", existingCopy: "Use another account that already has workplace access.", invitation: "I have an invitation", request: "Request access", name: "Your full name", invitationLabel: "10-character invitation code", requestLabel: "12-character workplace code", invitationPlaceholder: "A1B2C3D4E5", requestPlaceholder: "AB12CD34EF56", connect: "Connect workplace", send: "Send request", connecting: "Connecting…" }
    : language === "fa-AF"
      ? { kicker: "گام بعدی را انتخاب کنید", title: "چگونه از سرافی استفاده می‌کنید؟", intro: "راهی را انتخاب کنید که با صلاحیت شما برابر است. کارمند تا تأیید مالک بیرون از محل کار می‌ماند.", owner: "مالک یا مدیر صرافی هستم", ownerCopy: "یک صرافی جدید بسازید و مالک آن شوید.", worker: "برای یک صرافی کار می‌کنم", workerCopy: "با دعوت‌نامه وصل شوید یا درخواست تأیید مالک را بفرستید.", workerTitle: "به تیم صرافی خود بپیوندید", existing: "ورود به محل کار موجود", existingCopy: "از حساب دیگری که از قبل دسترسی دارد استفاده کنید.", invitation: "دعوت‌نامه دارم", request: "درخواست دسترسی", name: "نام کامل شما", invitationLabel: "رمز ده‌حرفی دعوت", requestLabel: "رمز دوازده‌حرفی محل کار", invitationPlaceholder: "A1B2C3D4E5", requestPlaceholder: "AB12CD34EF56", connect: "وصل‌کردن محل کار", send: "فرستادن درخواست", connecting: "در حال اتصال…" }
      : { kicker: "بل ګام وټاکئ", title: "تاسو سرافي څنګه کاروئ؟", intro: "هغه لاره وټاکئ چې ستاسو له واک سره برابره ده. کارکوونکی د مالک تر تایید پورې له کاري ځای څخه بهر پاتې کېږي.", owner: "زه د صرافۍ مالک یا مدیر یم", ownerCopy: "نوې صرافي جوړه کړئ او مالک یې شئ.", worker: "زه د یوې صرافۍ لپاره کار کوم", workerCopy: "په بلنه ونښلئ یا د مالک د تایید غوښتنه ولېږئ.", workerTitle: "د خپلې صرافۍ له ډلې سره یوځای شئ", existing: "موجود کاري ځای ته ننوتل", existingCopy: "بل حساب وکاروئ چې له مخکې لاسرسی لري.", invitation: "بلنه لرم", request: "د لاسرسي غوښتنه", name: "ستاسو بشپړ نوم", invitationLabel: "لس توري د بلنې کوډ", requestLabel: "دولس توري د کاري ځای کوډ", invitationPlaceholder: "A1B2C3D4E5", requestPlaceholder: "AB12CD34EF56", connect: "کاري ځای ونښلوئ", send: "غوښتنه لېږل", connecting: "نښلول کېږي…" };
  return (
    <main className="auth-shell worker-lobby-shell">
      <section className="auth-card worker-lobby-card">
        <div className="brand auth-brand"><span className="brand-mark">S</span><span>SARAFI<small>{ux(language, "sarafiTagline")}</small></span></div>
        <fieldset className="auth-language-switcher"><legend>{translate(language, "language")}</legend><div>{([['fa-AF','دری'],['ps-AF','پښتو'],['en','English']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={language === value} className={language === value ? "active" : ""} onClick={() => onLanguageChange(value)}>{label}</button>)}</div></fieldset>
        <p className="kicker">{text.kicker}</p>
        <h1>{text.title}</h1>
        <p className="auth-subtitle">{text.intro}</p>
        <div className="workspace-entry-choices" aria-label={text.title}>
          <button type="button" onClick={onCreateBusiness}><strong>{text.owner}</strong><small>{text.ownerCopy}</small></button>
          <button type="button" className={workerSelected ? "active" : ""} aria-current={workerSelected ? "step" : undefined} onClick={() => setWorkerSelected(true)}><strong>{text.worker}</strong><small>{text.workerCopy}</small></button>
          <button type="button" onClick={onSignOut}><strong>{text.existing}</strong><small>{text.existingCopy}</small></button>
        </div>
        {workerSelected ? <section className="worker-connection-step" aria-labelledby="worker-connection-title">
        <h2 id="worker-connection-title">{text.workerTitle}</h2>
        <div className="segmented-control" aria-label={text.workerTitle}>
          <button type="button" className={kind === "invitation" ? "active" : ""} aria-pressed={kind === "invitation"} onClick={() => onKindChange("invitation")}>{text.invitation}</button>
          <button type="button" className={kind === "request" ? "active" : ""} aria-pressed={kind === "request"} onClick={() => onKindChange("request")}>{text.request}</button>
        </div>
        <form onSubmit={onSubmit}>
          {kind === "request" ? <label>{text.name}<input required minLength={2} autoComplete="name" value={name} onChange={(event) => onNameChange(event.target.value)} /></label> : null}
          <label>{kind === "invitation" ? text.invitationLabel : text.requestLabel}<input required dir="ltr" inputMode="text" autoComplete="one-time-code" minLength={kind === "invitation" ? 10 : 12} maxLength={kind === "invitation" ? 10 : 12} value={code} placeholder={kind === "invitation" ? text.invitationPlaceholder : text.requestPlaceholder} onChange={(event) => onCodeChange(event.target.value)} /></label>
          {message && <p className={`auth-feedback ${message.toLowerCase().includes("sent") || message.includes("فرستاده") || message.includes("ولېږل") ? "success" : "error"}`} role="status">{message}</p>}
          <button className="primary-action full" disabled={busy}>{busy ? text.connecting : kind === "invitation" ? text.connect : text.send}</button>
        </form>
        </section> : null}
      </section>
    </main>
  );
}

function OnboardingScreen({
  language,
  businessName,
  currencies,
  catalog,
  cashboxName,
  branchName,
  busy,
  onLanguageChange,
  onBusinessNameChange,
  onCurrenciesChange,
  onCashboxNameChange,
  onBranchNameChange,
  onSubmit,
  onBack,
}: {
  language: Language;
  businessName: string;
  currencies: string[];
  catalog: CurrencyCatalogRecord[];
  cashboxName: string;
  branchName: string;
  busy: boolean;
  onLanguageChange: (language: Language) => void;
  onBusinessNameChange: (value: string) => void;
  onCurrenciesChange: (currencies: string[]) => void;
  onCashboxNameChange: (value: string) => void;
  onBranchNameChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onBack: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const featuredCodes = [
    "AFN",
    "USD",
    "EUR",
    "AED",
    "PKR",
    "IRR",
    "SAR",
    "TRY",
    "GBP",
  ];
  const available = catalog.length ? catalog : inspectionCurrencies;
  const featured = featuredCodes
    .map((code) => available.find((currency) => currency.code === code))
    .filter((currency): currency is CurrencyCatalogRecord => Boolean(currency));
  const additional = available.filter(
    (currency) =>
      !featuredCodes.includes(currency.code) &&
      !currencies.includes(currency.code),
  );
  const toggleCurrency = (currency: string) =>
    onCurrenciesChange(
      currencies.includes(currency)
        ? currencies.filter((item) => item !== currency && item !== "AFN")
        : [...currencies, currency],
    );
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <button type="button" className="text-button onboarding-back" onClick={onBack}>←</button>
        <div className="brand auth-brand">
          <span className="brand-mark">S</span>
          <span>
            SARAFI<small>{u("sarafiTagline")}</small>
          </span>
        </div>
        <p className="kicker">{u("firstSetup")}</p>
        <h1>{u("setupTitle")}</h1>
        <p className="auth-subtitle">{u("setupIntro")}</p>
        <form onSubmit={onSubmit}>
          <label>
            {t("language")}
            <select
              value={language}
              onChange={(event) =>
                onLanguageChange(event.target.value as Language)
              }
            >
              <option value="en">English</option>
              <option value="fa-AF">دری</option>
              <option value="ps-AF">پښتو</option>
            </select>
          </label>
          <label>
            {u("businessNameQuestion")}
            <input
              required
              minLength={2}
              value={businessName}
              onChange={(event) => onBusinessNameChange(event.target.value)}
              placeholder={u("businessNamePlaceholder")}
            />
          </label>
          <label>
            {u("mainBranchName")}
            <input
              required
              minLength={2}
              value={branchName}
              onChange={(event) => onBranchNameChange(event.target.value)}
              placeholder={u("mainBranchPlaceholder")}
            />
          </label>
          <fieldset className="currency-choices">
            <legend>{u("currenciesQuestion")}</legend>
            {featured.map((currency) => (
              <label key={currency.code}>
                <input
                  type="checkbox"
                  checked={currencies.includes(currency.code)}
                  disabled={currency.code === "AFN"}
                  onChange={() => toggleCurrency(currency.code)}
                />
                {currency.code} · {currencyName(language, currency)}
              </label>
            ))}
          </fieldset>
          <label>
            {u("addWorldCurrency")}
            <select
              value=""
              onChange={(event) => {
                if (event.target.value) toggleCurrency(event.target.value);
              }}
            >
              <option value="">{u("chooseWorldCurrency")}</option>
              {additional.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} · {currencyName(language, currency)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {u("mainCashboxName")}
            <input
              required
              minLength={2}
              value={cashboxName}
              onChange={(event) => onCashboxNameChange(event.target.value)}
              placeholder={u("mainCashboxPlaceholder")}
            />
          </label>
          <div className="setup-summary">
            <span>{u("startingCurrency")}</span>
            <b>AFN · {u("afghanAfghani")}</b>
            <span>{u("selectedCurrencies")}</span>
            <b>{currencies.join(" · ")}</b>
            <span>{u("nextStep")}</span>
            <b>{u("onboardingNext")}</b>
          </div>
          <button className="primary-action full" disabled={busy} type="submit">
            {busy ? u("creatingBusiness") : u("createBusiness")} <span>→</span>
          </button>
        </form>
      </section>
    </main>
  );
}

export default App;

function AuthScreen({
  language,
  onLanguageChange,
  mode,
  invitation,
  adminPortal = false,
  email,
  password,
  fullName = "",
  confirmPassword = "",
  message,
  messageKind,
  busy,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onFullNameChange = () => undefined,
  onConfirmPasswordChange = () => undefined,
  onSubmit,
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
  mode: "signIn" | "signUp" | "reset";
  invitation: boolean;
  adminPortal?: boolean;
  email: string;
  password: string;
  fullName?: string;
  confirmPassword?: string;
  message: string;
  messageKind: "error" | "success" | null;
  busy: boolean;
  onModeChange: (mode: "signIn" | "signUp" | "reset") => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onFullNameChange?: (value: string) => void;
  onConfirmPasswordChange?: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const reset = mode === "reset";
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  return (
    <main className="auth-shell">
      <div className="auth-layout">
        <section className="auth-intro">
          <div className="brand auth-brand">
            <span className="brand-mark">S</span>
            <span>
              SARAFI<small>{t("productTagline")}</small>
            </span>
          </div>
          <p className="kicker">{t("startHere")}</p>
          <h1>{t("productTagline")}</h1>
          <p className="auth-lead">{t("productDescription")}</p>
          <h2>{t("whatYouCanDo")}</h2>
          <div className="auth-capabilities">
            <span>{t("buySell")}</span>
            <span>{t("myMoney")}</span>
            <span>{t("employeeActivity")}</span>
          </div>
        </section>
        <section className="auth-card">
          <fieldset className="auth-language-switcher">
            <legend>{t("language")}</legend>
            <div>
              {([
                ["fa-AF", "دری"],
                ["ps-AF", "پښتو"],
                ["en", "English"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  lang={value}
                  dir={value === "en" ? "ltr" : "rtl"}
                  className={language === value ? "active" : ""}
                  aria-pressed={language === value}
                  onClick={() => onLanguageChange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          {!adminPortal && !reset && (
            <div className="auth-mode-tabs" role="tablist" aria-label={u("everyoneSignsInHere")}>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signIn"}
                className={mode === "signIn" ? "active" : ""}
                onClick={() => onModeChange("signIn")}
              >
                {t("signIn")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signUp"}
                className={mode === "signUp" ? "active" : ""}
                onClick={() => onModeChange("signUp")}
              >
                {t("createAnAccount")}
              </button>
            </div>
          )}
          <p className="kicker">{t("secureAccess")}</p>
          <h1>
            {adminPortal
              ? u("platformAdministrator")
              : reset
              ? t("resetPassword")
              : invitation
                ? u("joinTeam")
              : mode === "signUp"
                ? t("createOwnerAccount")
                : t("welcomeBack")}
          </h1>
          <p className="auth-subtitle">
            {adminPortal
              ? u("platformAdministratorSignIn")
              : reset
              ? t("resetSubtitle")
              : invitation
                ? u("joinTeamSubtitle")
              : mode === "signUp"
                ? t("signUpSubtitle")
                : t("signInSubtitle")}
          </p>
          {!adminPortal && !reset && (
            <div className="auth-audience-note">
              <b>{mode === "signUp" ? u("ownerSignupOnly") : u("everyoneSignsInHere")}</b>
              <span>{mode === "signUp" ? u("workerUsesInvite") : u("signInRoleAutomatic")}</span>
            </div>
          )}
          <form onSubmit={onSubmit} aria-describedby={message ? "auth-feedback" : undefined}>
            {mode === "signUp" && !adminPortal && (
              <label>
                {u("fullName")}
                <input required minLength={2} autoComplete="name" value={fullName} onChange={(event) => onFullNameChange(event.target.value)} />
              </label>
            )}
            <label>
              {t("emailAddress")}
              <input
                type="email"
                required
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                autoComplete="email"
              />
            </label>
            {!reset && (
              <label>
                {t("password")}
                <input
                  type="password"
                  required
                  minLength={mode === "signUp" ? 8 : undefined}
                  value={password}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  autoComplete={
                    mode === "signUp" ? "new-password" : "current-password"
                  }
                />
              </label>
            )}
            {mode === "signUp" && !adminPortal && (
              <label>
                {u("confirmPassword")}
                <input type="password" required minLength={8} value={confirmPassword} onChange={(event) => onConfirmPasswordChange(event.target.value)} autoComplete="new-password" />
              </label>
            )}
            <button
              className="primary-action full"
              type="submit"
              disabled={busy}
            >
              {busy
                ? t("working")
                : reset
                  ? t("sendResetLink")
                  : mode === "signUp"
                    ? invitation
                      ? u("createAndJoin")
                      : t("createAccount")
                    : t("signIn")}{" "}
              <span aria-hidden="true">{isRtl(language) ? "←" : "→"}</span>
            </button>
          </form>
          {message && (
            <p
              id="auth-feedback"
              className={`auth-message ${messageKind ?? ""}`}
              role={messageKind === "error" ? "alert" : "status"}
            >
              {message}
            </p>
          )}
          <div className="auth-links">
            {mode === "signIn" && !adminPortal && (
              <button type="button" onClick={() => onModeChange("reset")}>
                {t("forgotPassword")}
              </button>
            )}
            {reset && (
              <button type="button" onClick={() => onModeChange("signIn")}>
                {t("backToSignIn")}
              </button>
            )}
            <a className="auth-portal-link" href={adminPortal ? "/" : "/platform-admin"}>
              {adminPortal
                ? (language === "en" ? "Business sign in" : language === "fa-AF" ? "ورود صرافی" : "صرافۍ ته ننوتل")
                : (language === "en" ? "Platform administrator" : language === "fa-AF" ? "مدیریت عمومی سیستم" : "د سیستم عمومي اداره")}
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
