import { useEffect, useRef, useState } from "react";
import Decimal from "decimal.js";
import "./App.css";
import "./professional.css";
import { validateClientEnvironment } from "./lib/env";
import { readPublicSupabaseConfig } from "./lib/supabase";
import { calculateCounterAmount } from "./domain/valuation";
import { deriveTradeAmounts } from "./domain/tradePricing";
import { buildCsvReport } from "./domain/reporting";
import { isRtl, translate, type Language } from "./lib/i18n";
import { ux } from "./lib/uxCopy";
import {
  getCurrentRates,
  getReceiptForJournalEntry,
  getOwnerDashboard,
  getTeamControlPlane,
  acceptTeamInvitation,
  cancelTeamInvitation,
  createTeamInvitation,
  getPrivateCounterpartyDocuments,
  getPrivateDocumentUrl,
  listCashboxBalances,
  listCounterparties,
  listCounterpartyStatement,
  listDebts,
  listHawalaTransfers,
  listJournalEntries,
  listLocationEvidence,
  listRateHistory,
  postFxTrade,
  recordCashboxClose,
  recordDebt,
  recordHawalaSend,
  recordOpeningBalance,
  recordOperation,
  recordReportExport,
  requestReversal,
  settleDebt,
  updateTeamMembership,
  uploadPrivateCounterpartyDocument,
  type DashboardSnapshot,
  type CounterpartyRecord,
  type DebtRecord,
  type HawalaTransferRecord,
  type JournalRecord,
  type LocationEvidenceRecord,
  type RateHistoryRecord,
  type TeamMemberRecord,
  type TeamInvitationRecord,
  type TeamScopeRecord,
  type CreatedTeamInvitation,
  type DeviceRecord,
  type ApprovalRecord,
  type PrivateDocumentRecord,
} from "./lib/financialApi";
import { getSupabaseClient } from "./lib/supabase";
import { createBusiness } from "./lib/onboarding";
import {
  sendPasswordReset,
  enrollTotp,
  getMfaReadiness,
  signInWithPassword,
  signOut,
  signUpWithPassword,
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
import { ImportWorkspace } from "./ImportWorkspace";
import {
  AppIcon,
  ComplianceView,
  ReceiptSuccessDialog,
  SettingsView,
  type CompletedTrade,
} from "./ProfessionalWorkspace";

const loadExports = () => import("./lib/exports");

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
type WorkspaceRole =
  | "owner"
  | "manager"
  | "accountant"
  | "cashier"
  | "compliance_officer"
  | "viewer";

function App() {
  validateClientEnvironment();
  const inspectionMode =
    !new URLSearchParams(window.location.search).has("public") &&
    (import.meta.env.MODE === "e2e" ||
      (import.meta.env.DEV &&
        import.meta.env.VITE_AUTH_GATE_DISABLED === "true"));
  const supabaseConfigured = Boolean(readPublicSupabaseConfig());
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [showTrade, setShowTrade] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showOpeningBalance, setShowOpeningBalance] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingBaseValue, setOpeningBaseValue] = useState("");
  const [openingCurrency, setOpeningCurrency] = useState("AFN");
  const [operationKind, setOperationKind] = useState<OperationKind | null>(
    null,
  );
  const [operationAmount, setOperationAmount] = useState("");
  const [operationCurrency, setOperationCurrency] = useState("AFN");
  const [operationLocation, setOperationLocation] = useState("Main Counter");
  const [operationFromLocation, setOperationFromLocation] =
    useState("Main Counter");
  const [operationToLocation, setOperationToLocation] = useState("Main Safe");
  const [operationCategory, setOperationCategory] = useState("Other");
  const [operationMemo, setOperationMemo] = useState("");
  const [activityFilter, setActivityFilter] = useState("Today");
  const [privacy, setPrivacy] = useState(false);
  const [language, setLanguage] = useState<Language>(() => {
    const saved = window.localStorage.getItem("sarafi-language");
    return saved === "fa-AF" || saved === "ps-AF" ? saved : "en";
  });
  const [online, setOnline] = useState(
    inspectionMode ? true : navigator.onLine,
  );
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const [amount, setAmount] = useState("");
  const [tradeSide, setTradeSide] = useState<
    "BUY_FX" | "SELL_FX" | "EXCHANGE_FX"
  >("SELL_FX");
  const [tradeCurrency, setTradeCurrency] = useState<"AFN" | "USD" | "EUR">(
    "USD",
  );
  const [tradeReceiveCurrency, setTradeReceiveCurrency] = useState<
    "AFN" | "USD" | "EUR"
  >("EUR");
  const [tradeFee, setTradeFee] = useState("");
  const [tradeNote, setTradeNote] = useState("");
  const [tradeCounterparty, setTradeCounterparty] = useState("");
  const [tradeBusy, setTradeBusy] = useState(false);
  const [tradeReviewing, setTradeReviewing] = useState(false);
  const [completedTrade, setCompletedTrade] = useState<CompletedTrade | null>(
    null,
  );
  const [calculatorAmount, setCalculatorAmount] = useState("1000");
  const [rate, setRateState] = useState(inspectionMode ? "70.25" : "");
  const setRate = (_value: string) => undefined;
  const [sellRate, setSellRate] = useState(inspectionMode ? "70.35" : "");
  const [dashboardDate, setDashboardDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [toast, setToast] = useState("");
  const [showMoreNavigation, setShowMoreNavigation] = useState(false);
  const modalReturnFocusRef = useRef<HTMLElement | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(
    inspectionMode ? "inspection" : null,
  );
  const [organizationName, setOrganizationName] = useState(
    inspectionMode ? "Kabul Central Exchange" : "",
  );
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchName, setBranchName] = useState(
    inspectionMode ? "Main branch" : "",
  );
  const [cashboxId, setCashboxId] = useState<string | null>(null);
  const [organizationLoading, setOrganizationLoading] =
    useState(!inspectionMode);
  const [businessName, setBusinessName] = useState("");
  const [onboardingCurrencies, setOnboardingCurrencies] = useState([
    "AFN",
    "USD",
  ]);
  const [onboardingCashboxName, setOnboardingCashboxName] =
    useState("Main Counter");
  const [user, setUser] = useState<import("@supabase/supabase-js").User | null>(
    null,
  );
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole>(
    inspectionMode &&
      [
        "owner",
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
  const [authMode, setAuthMode] = useState<"signIn" | "signUp" | "reset">(
    "signIn",
  );
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
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
  const hidden = privacy ? "••••••" : "";
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
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
      Settings: t("settings"),
      Import: u("importData"),
      Hawala: t("hawala"),
      Compliance: u("compliance"),
    })[section] ?? section;

  useEffect(() => {
    document.documentElement.dir = isRtl(language) ? "rtl" : "ltr";
    document.documentElement.lang = language;
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
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activeNav]);

  useEffect(() => {
    const modal = document.querySelector<HTMLElement>(
      ".modal-backdrop .trade-modal",
    );
    if (!modal) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const focusFirst = window.requestAnimationFrame(() => {
      modal.querySelector<HTMLElement>(focusableSelector)?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showTrade && !tradeBusy) {
          setTradeReviewing(false);
          setShowTrade(false);
        } else if (operationKind) setOperationKind(null);
        else if (showHelp) setShowHelp(false);
        else if (showOpeningBalance) setShowOpeningBalance(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(focusableSelector),
      );
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
      window.cancelAnimationFrame(focusFirst);
      document.removeEventListener("keydown", handleKeyDown);
      const returnFocus = modalReturnFocusRef.current ?? previousFocus;
      if (showTrade) modalReturnFocusRef.current = null;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [operationKind, showHelp, showOpeningBalance, showTrade, tradeBusy]);

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
    if (inspectionMode || !user) return;
    const client = getSupabaseClient();
    if (!client) return;
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
      const membership = await client
        .from("organization_memberships")
        .select("organization_id,role_code")
        .eq("user_id", user.id)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if (!active) return;
      const data = membership.data;
      setOrganizationId(data?.organization_id ?? null);
      if (
        data?.role_code &&
        [
          "owner",
          "manager",
          "accountant",
          "cashier",
          "compliance_officer",
          "viewer",
        ].includes(data.role_code)
      )
        setWorkspaceRole(data.role_code as WorkspaceRole);
      if (!data?.organization_id) {
        setOrganizationLoading(false);
        return;
      }
      const organization = await client
        .from("organizations")
        .select("display_name")
        .eq("id", data.organization_id)
        .maybeSingle();
      if (!active) return;
      setOrganizationName(organization.data?.display_name ?? "");
      setOrganizationLoading(false);
    };
    void loadMembership();
    return () => {
      active = false;
    };
  }, [inspectionMode, inviteToken, language, user]);

  useEffect(() => {
    if (inspectionMode) return;
    if (!organizationId) return;
    const client = getSupabaseClient();
    if (!client) return;
    void client
      .from("branches")
      .select("id,name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data: branch }) => {
        setBranchId(branch?.id ?? null);
        setBranchName(branch?.name ?? "");
        if (!branch) return;
        void client
          .from("cashboxes")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("branch_id", branch.id)
          .eq("active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
          .then(({ data: cashbox }) => setCashboxId(cashbox?.id ?? null));
      });
  }, [inspectionMode, organizationId]);

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
    void getCurrentRates(organizationId, branchId ?? undefined).then(
      (result) => {
        if (result.error) {
          setToast(ux(language, "couldNotLoad"));
          return;
        }
        const current = result.data?.[0];
        if (current) {
          setRateState(current.buy_rate);
          setSellRate(current.sell_rate);
        }
      },
    );
  }, [branchId, inspectionMode, language, organizationId]);

  const submitAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");
    setAuthMessageKind(null);
    const result =
      authMode === "signIn"
        ? await signInWithPassword(authEmail, authPassword)
        : authMode === "signUp"
          ? await signUpWithPassword(authEmail, authPassword)
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
      branch_name: "Main Branch",
      cashbox_name: onboardingCashboxName,
    });
    setOrganizationLoading(false);
    if (result.error) {
      setToast(u("couldNotSave"));
      return;
    }
    setOrganizationId(result.organizationId);
  };

  const addTrade = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (tradeBusy) return;
    if (tradeSide === "EXCHANGE_FX") {
      setToast(u("pairRateUnavailable"));
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
    let sessionCheck;
    try {
      const soldCurrency = tradeSide === "BUY_FX" ? "AFN" : tradeCurrency;
      const boughtCurrency = tradeSide === "BUY_FX" ? tradeCurrency : "AFN";
      const pricing = deriveTradeAmounts(tradeSide, amount, rate, sellRate);
      const {
        rate: effectiveRate,
        soldAmount,
        boughtAmount,
        soldBaseValue,
        boughtBaseValue,
      } = pricing;
      sessionCheck = await postFxTrade({
        organization_id: organizationId,
        branch_id: branchId,
        cashbox_id: cashboxId,
        client_command_id: crypto.randomUUID(),
        side: tradeSide,
        sold_currency: soldCurrency,
        sold_amount: soldAmount,
        bought_currency: boughtCurrency,
        bought_amount: boughtAmount,
        base_currency: "AFN",
        sold_base_value: soldBaseValue,
        bought_base_value: boughtBaseValue,
        customer_rate: effectiveRate,
        fee_amount: tradeFee || undefined,
        fee_currency: "AFN",
        counterparty_id: tradeCounterparty || undefined,
        memo: tradeNote || undefined,
      });
    } catch (error) {
      void error;
      setToast(u("couldNotSave"));
      setTradeBusy(false);
      return;
    }
    if (sessionCheck.error) {
      setToast(u("couldNotSave"));
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
    setTradeNote("");
    setTradeCounterparty("");
    setTradeReviewing(false);
    setTradeBusy(false);
    setShowTrade(false);
  };

  const printCompletedTrade = async (width: "58mm" | "80mm") => {
    if (!completedTrade) return;
    const { printThermalReceipt } = await loadExports();
    printThermalReceipt(
      {
        businessName: organizationName || u("yourBusiness"),
        reference:
          completedTrade.receiptNumber || completedTrade.journalEntryId,
        type: t("recordTrade"),
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

  const exportActivity = async () => {
    if (!organizationId) {
      setToast(u("exportUnavailable"));
      return;
    }
    const authorization = await recordReportExport({
      organization_id: organizationId,
      report_name: "Recent Activity",
      format: "csv",
      filters: { scope: "loaded_activity" },
    });
    if (authorization.error) {
      setToast(u("exportUnavailable"));
      return;
    }
    const csv = buildCsvReport(
      trades.map((trade) => ({
        entryId: `trade_${trade.id}`,
        occurredAt: trade.time,
        type: trade.direction,
        branchId: "Kabul Central",
        status: trade.status.toLowerCase(),
        realizedProfit: "0",
      })),
      "Kabul Central Exchange",
      "Recent Activity",
      new Date().toISOString(),
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = "sarafi-recent-activity.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    setToast(u("exportReady"));
  };

  const openOperation = (kind: OperationKind) => {
    setOperationKind(kind);
    setOperationAmount("");
    setOperationMemo("");
    setOperationCategory("Other");
    setOperationFromLocation("Main Counter");
    setOperationToLocation("Main Safe");
    setShowActions(false);
  };

  const openTrade = (
    side?: typeof tradeSide,
    returnFocus?: HTMLElement | null,
  ) => {
    modalReturnFocusRef.current =
      returnFocus ?? (document.activeElement as HTMLElement | null);
    if (side) setTradeSide(side);
    setTradeReviewing(false);
    setShowTrade(true);
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
    const result = await recordOperation({
      organization_id: organizationId,
      branch_id: branchId,
      operation: operationKind,
      currency: operationCurrency,
      amount: operationAmount,
      location: operationLocation,
      from_location: operationFromLocation,
      to_location: operationToLocation,
      category: operationCategory,
      memo: operationMemo,
      client_command_id: crypto.randomUUID(),
    });
    if (result.error) {
      setToast(u("couldNotSave"));
      return;
    }
    setOperationKind(null);
    setDashboardRefresh((value) => value + 1);
    setToast(u("savedSuccessfully"));
  };

  const openSection = (section: string) => {
    setActiveNav(section);
    setShowActions(false);
    setShowMoreNavigation(false);
    setShowBranchMenu(false);
  };

  const handleSignOut = async () => {
    const error = await signOut();
    if (error) {
      setToast(`Sign out failed: ${error}`);
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
    const result = await recordOpeningBalance({
      organization_id: organizationId,
      branch_id: branchId,
      cashbox_id: cashboxId,
      currency: openingCurrency,
      amount: openingAmount,
      base_value: openingBaseValue,
      client_command_id: crypto.randomUUID(),
    });
    if (result.error) {
      setToast(u("couldNotSave"));
      return;
    }
    setShowOpeningBalance(false);
    setOpeningAmount("");
    setOpeningBaseValue("");
    setDashboardRefresh((value) => value + 1);
    setToast(u("savedSuccessfully"));
  };

  const dashboardView = activeNav === "Dashboard" || activeNav === "Trade";
  const ownerNavigation =
    workspaceRole === "owner" ||
    workspaceRole === "manager" ||
    workspaceRole === "accountant";
  const teamNavigation =
    workspaceRole === "owner" || workspaceRole === "manager";
  const cashierNavigation = workspaceRole === "cashier";
  const canPostFinancial =
    workspaceRole === "owner" ||
    workspaceRole === "manager" ||
    workspaceRole === "accountant" ||
    workspaceRole === "cashier";
  const roleLabel = (
    {
      owner: u("owner"),
      manager: u("manager"),
      accountant: u("accountant"),
      cashier: u("cashier"),
      compliance_officer: u("complianceOfficer"),
      viewer: u("viewer"),
    } satisfies Record<WorkspaceRole, string>
  )[workspaceRole];
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
  const activityDirectionLabel = (value: string) =>
    ({
      BUY_FX: t("buy"),
      SELL_FX: t("sell"),
      EXCHANGE_FX: t("exchange"),
    })[value] ?? u("recordedTransaction");
  const activityStatusLabel = (value: string) =>
    ({
      posted: t("posted"),
      pending: t("pending"),
      reversed: u("reversed"),
      corrected: u("reversed"),
    })[value.toLowerCase()] ?? u("review");
  let tradePreview: ReturnType<typeof deriveTradeAmounts> | null = null;
  try {
    if (amount && tradeSide !== "EXCHANGE_FX")
      tradePreview = deriveTradeAmounts(tradeSide, amount, rate, sellRate);
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
  const effectiveTradeRate = tradeSide === "BUY_FX" ? rate : sellRate;

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
  if (!organizationId)
    return (
      <OnboardingScreen
        language={language}
        businessName={businessName}
        currencies={onboardingCurrencies}
        cashboxName={onboardingCashboxName}
        busy={organizationLoading}
        onLanguageChange={setLanguage}
        onBusinessNameChange={setBusinessName}
        onCurrenciesChange={setOnboardingCurrencies}
        onCashboxNameChange={setOnboardingCashboxName}
        onSubmit={submitOnboarding}
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
            <button
              onClick={() => {
                setShowBranchMenu(false);
                setToast(u("activeBranchSelected"));
              }}
            >
              {inspectionMode
                ? t("mainBranch")
                : branchName || u("assignedBranch")}{" "}
              <small>{t("activeBranch")}</small>
              <span>✓</span>
            </button>
          </div>
        )}
        <p className="nav-label">{t("workspace")}</p>
        <nav>
          {(
            [
              ["Dashboard", t("home"), "home"],
              ["Trade", t("newTransaction"), "trade"],
              ["Cash & Accounts", t("myMoney"), "wallet"],
              ["People", t("customersDebts"), "people"],
              ["Transactions", t("transactions"), "transactions"],
            ] as const
          ).map(([item, label, icon]) => (
            <button
              className={activeNav === item ? "nav-item active" : "nav-item"}
              disabled={item === "Trade" && !canPostFinancial}
              key={item}
              onClick={(event) => {
                openSection(item);
                if (item === "Trade") openTrade(undefined, event.currentTarget);
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
          <button
            className={
              showMoreNavigation ||
              [
                "Debts",
                "Rates",
                "Reports",
                "Reconciliation",
                "Import",
                "Offline",
                "Hawala",
                "Team & Devices",
                "Settings",
                "Compliance",
              ].includes(activeNav)
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => setShowMoreNavigation(!showMoreNavigation)}
            aria-expanded={showMoreNavigation}
          >
            <span className="nav-icon">
              <AppIcon name="more" />
            </span>
            {t("more")}
            <span className="chevron">⌄</span>
          </button>
          {showMoreNavigation && (
            <div className="action-menu navigation-menu">
              {(ownerNavigation || cashierNavigation) && (
                <>
                  <p className="menu-group-label">{u("businessGroup")}</p>
                  {ownerNavigation && (
                    <>
                      <button onClick={() => openSection("Reports")}>
                        {t("reports")}
                        <span>→</span>
                      </button>
                      <button onClick={() => openSection("Rates")}>
                        {t("rates")}
                        <span>→</span>
                      </button>
                    </>
                  )}
                  <button onClick={() => openSection("Reconciliation")}>
                    {t("reconciliation")}
                    <span>→</span>
                  </button>
                </>
              )}
              {teamNavigation && (
                <>
                  <p className="menu-group-label">{u("teamGroup")}</p>
                  <button onClick={() => openSection("Team & Devices")}>
                    {t("teamDevices")}
                    <span>→</span>
                  </button>
                </>
              )}
              <p className="menu-group-label">{u("settingsGroup")}</p>
              <button onClick={() => openSection("Settings")}>
                {t("settings")}
                <span>→</span>
              </button>
              {(workspaceRole === "owner" ||
                workspaceRole === "compliance_officer") && (
                <>
                  <p className="menu-group-label">{u("advancedGroup")}</p>
                  {workspaceRole === "owner" && (
                    <>
                      <button onClick={() => openSection("Import")}>
                        {u("importData")}
                        <span>→</span>
                      </button>
                      <button onClick={() => openSection("Hawala")}>
                        {t("hawala")}
                        <span>→</span>
                      </button>
                    </>
                  )}
                  <button onClick={() => openSection("Compliance")}>
                    {u("compliance")}
                    <span>→</span>
                  </button>
                </>
              )}
            </div>
          )}
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
          {!inspectionMode && (
            <button
              aria-label={u("signOut")}
              onClick={() => void handleSignOut()}
            >
              ↪
            </button>
          )}
        </div>
      </aside>
      <nav className="mobile-nav" aria-label={t("workspace")}>
        {(
          [
            ["Dashboard", t("home"), "home"],
            ["Trade", t("newTransaction"), "trade"],
            ["Cash & Accounts", t("myMoney"), "wallet"],
            ["People", t("customersDebts"), "people"],
            ["Transactions", t("transactions"), "transactions"],
          ] as const
        ).map(([item, label, icon]) => (
          <button
            className={activeNav === item ? "active" : ""}
            disabled={item === "Trade" && !canPostFinancial}
            key={item}
            onClick={(event) => {
              openSection(item);
              if (item === "Trade") openTrade(undefined, event.currentTarget);
            }}
          >
            <span>
              <AppIcon name={icon} />
            </span>
            {label}
          </button>
        ))}
        <button
          className={showMoreNavigation ? "active" : ""}
          onClick={() => setShowMoreNavigation(!showMoreNavigation)}
          aria-expanded={showMoreNavigation}
        >
          <span>
            <AppIcon name="more" />
          </span>
          {t("more")}
        </button>
      </nav>
      {showMoreNavigation && (
        <div className="mobile-more-menu">
          {(ownerNavigation || cashierNavigation) && (
            <>
              <p className="menu-group-label">{u("businessGroup")}</p>
              {ownerNavigation && (
                <>
                  <button onClick={() => openSection("Reports")}>
                    {t("reports")}
                  </button>
                  <button onClick={() => openSection("Rates")}>
                    {t("rates")}
                  </button>
                </>
              )}
              <button onClick={() => openSection("Reconciliation")}>
                {t("reconciliation")}
              </button>
            </>
          )}
          {teamNavigation && (
            <>
              <p className="menu-group-label">{u("teamGroup")}</p>
              <button onClick={() => openSection("Team & Devices")}>
                {t("teamDevices")}
              </button>
            </>
          )}
          <p className="menu-group-label">{u("settingsGroup")}</p>
          <button onClick={() => openSection("Settings")}>
            {t("settings")}
          </button>
          {(workspaceRole === "owner" ||
            workspaceRole === "compliance_officer") && (
            <>
              <p className="menu-group-label">{u("advancedGroup")}</p>
              {workspaceRole === "owner" && (
                <>
                  <button onClick={() => openSection("Import")}>
                    {u("importData")}
                  </button>
                  <button onClick={() => openSection("Hawala")}>
                    {t("hawala")}
                  </button>
                </>
              )}
              <button onClick={() => openSection("Compliance")}>
                {u("compliance")}
              </button>
            </>
          )}
        </div>
      )}
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{t("workspace")}</span>
            <b>/</b>
            <strong>{sectionLabel(activeNav)}</strong>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              onClick={() => setPrivacy(!privacy)}
              aria-label={privacy ? u("showAmounts") : u("hideAmounts")}
            >
              <AppIcon name={privacy ? "eye" : "eyeOff"} />
            </button>
            <select
              className="lang-button"
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
              aria-label={u("changeLanguage")}
            >
              <option value="en">English</option>
              <option value="fa-AF">دری</option>
              <option value="ps-AF">پښتو</option>
            </select>
            <button
              className="help-button"
              onClick={() => setShowHelp(true)}
              aria-label={u("openHelp")}
            >
              ?
            </button>
          </div>
        </header>
        <div className="content-wrap">
          {!dashboardView && (
            <WorkspaceView
              language={language}
              section={activeNav}
              trades={trades}
              organizationId={organizationId}
              organizationName={organizationName || u("yourBusiness")}
              branchName={
                inspectionMode ? t("mainBranch") : branchName || t("mainBranch")
              }
              roleLabel={roleLabel}
              canManageTeam={workspaceRole === "owner"}
              userId={user?.id ?? "inspection-user"}
              deviceId={browserDeviceId}
              branchId={branchId}
              cashboxId={cashboxId}
              onDashboard={() => openSection("Dashboard")}
              onNavigate={openSection}
              onToast={setToast}
            />
          )}
          {dashboardView && (
            <>
              <section className="welcome">
                <div>
                  <p className="kicker" dir="ltr">
                    {dashboardDate}
                  </p>
                  <h1>
                    {t("goodMorning")}
                  </h1>
                  <p className="subtitle">{t("businessStand")}</p>
                </div>
                <div className="action-wrap">
                  <div
                    className="primary-actions"
                    aria-label={u("coreCashierActions")}
                  >
                    <button
                      disabled={!online || !canPostFinancial}
                      className="primary-action"
                      onClick={(event) => {
                        openTrade("BUY_FX", event.currentTarget);
                      }}
                    >
                      {t("buy")}
                    </button>
                    <button
                      disabled={!online || !canPostFinancial}
                      className="primary-action"
                      onClick={(event) => {
                        openTrade("SELL_FX", event.currentTarget);
                      }}
                    >
                      {t("sell")}
                    </button>
                    <button
                      disabled={!online || !canPostFinancial}
                      className="primary-action"
                      onClick={(event) => {
                        openTrade("EXCHANGE_FX", event.currentTarget);
                      }}
                    >
                      {t("exchange")}
                    </button>
                    <button
                      disabled={!online || !canPostFinancial}
                      className="primary-action"
                      onClick={() => openOperation("RECEIVE_MONEY")}
                    >
                      {t("receive")}
                    </button>
                    <button
                      disabled={!online || !canPostFinancial}
                      className="primary-action"
                      onClick={() => openOperation("PAY_MONEY")}
                    >
                      {t("pay")}
                    </button>
                  </div>
                  <button
                    className="secondary-action"
                    disabled={!canPostFinancial}
                    onClick={() => setShowActions(!showActions)}
                    aria-expanded={showActions}
                  >
                    {t("moreActions")} <span>⌄</span>
                  </button>
                  {showActions && (
                    <div className="action-menu">
                      {(
                        [
                          "Transfer cash",
                          "Expense",
                          "Owner capital",
                          "Bank movement",
                        ] as const
                      ).map((action) => {
                        const kinds: Record<typeof action, OperationKind> = {
                          "Transfer cash": "TRANSFER_CASH",
                          Expense: "RECORD_EXPENSE",
                          "Owner capital": "OWNER_INVESTMENT",
                          "Bank movement": "BANK_DEPOSIT",
                        };
                        const labels: Record<typeof action, string> = {
                          "Transfer cash": t("transfer"),
                          Expense: t("expense"),
                          "Owner capital": t("ownerCapital"),
                          "Bank movement": t("bankMovement"),
                        };
                        return (
                          <button
                            disabled={!online || !canPostFinancial}
                            key={action}
                            onClick={() => openOperation(kinds[action])}
                          >
                            {labels[action]}
                            <span>→</span>
                          </button>
                        );
                      })}
                      <button
                        disabled={!online || !canPostFinancial}
                        onClick={() => {
                          setShowActions(false);
                          setShowOpeningBalance(true);
                        }}
                      >
                        {u("openingBalance")} <span>→</span>
                      </button>
                    </div>
                  )}
                </div>
              </section>
              <div className="notice">
                <span className={`sync-dot ${online ? "online" : "offline"}`} />
                <span>
                  <b>{online ? t("online") : t("stillOffline")}</b> ·{" "}
                  {supabaseConfigured
                    ? u("connectionNotice")
                    : t("localWorkspace")}{" "}
                  ·{" "}
                  {online
                    ? `${t("lastSync")}: ${t("justNow")}`
                    : u("postingPaused")}
                </span>
                <button
                  onClick={() =>
                    setToast(online ? t("connected") : t("offlineMode"))
                  }
                >
                  {online ? t("connected") : t("offlineMode")}
                </button>
              </div>
              {dashboardError && (
                <div className="notice error" role="alert">
                  {dashboardError}
                  <button
                    onClick={() => setDashboardRefresh((value) => value + 1)}
                  >
                    {u("retry")}
                  </button>
                </div>
              )}
              <section className="rate-strip">
                <div className="rate-title">
                  <span className="rate-live" />{" "}
                  <div>
                    <b>{t("rates")}</b>
                    <small>{t("retailRateContext")}</small>
                  </div>
                </div>
                <label>
                  {t("buyRate")}
                  <input
                    aria-label={u("liveBuyRate")}
                    value={rate}
                    onChange={(event) => setRate(event.target.value)}
                    placeholder={u("liveRate")}
                    readOnly
                  />
                </label>
                <label>
                  {t("sellRate")}
                  <input
                    aria-label={u("liveSellRate")}
                    value={sellRate}
                    readOnly
                    placeholder={u("liveRate")}
                  />
                </label>
                <div className="calculator">
                  <input
                    aria-label={u("rateCalculator")}
                    value={calculatorAmount}
                    onChange={(event) =>
                      setCalculatorAmount(event.target.value)
                    }
                  />
                  <span aria-label={u("sourceCurrency")}>USD</span>
                  <b>=</b>
                  <strong>
                    {rate
                      ? calculateCounterAmount(
                          calculatorAmount || "0",
                          rate,
                          "AFN_PER_UNIT",
                          2,
                        )
                      : "—"}
                  </strong>
                  <span aria-label={u("targetCurrency")}>AFN</span>
                </div>
                <label>
                  {u("businessDate")}
                  <input
                    aria-label={u("businessDate")}
                    type="date"
                    value={dashboardDate}
                    onChange={(event) => setDashboardDate(event.target.value)}
                  />
                </label>
                <button
                  className="text-button"
                  onClick={() => openSection("Rates")}
                >
                  {t("history")} →
                </button>
              </section>
              <section className="metric-grid">
                <article className="metric-card hero-metric">
                  <div className="card-head">
                    <span>{t("netPosition")} AFN</span>
                    <button
                      aria-label={privacy ? u("showAmounts") : u("hideAmounts")}
                      onClick={() => setPrivacy(!privacy)}
                    >
                      ◌
                    </button>
                  </div>
                  <strong>
                    {hidden || dashboard?.net_position_base || "—"}
                  </strong>
                  <div className="metric-foot">
                    <span>{t("ledgerDerivedAfn")}</span>
                  </div>
                  <div className="sparkline">
                    {Array.from({ length: 12 }, (_, index) => (
                      <i key={index} />
                    ))}
                  </div>
                </article>
                <article className="metric-card">
                  <div className="card-head">
                    <span>{t("todayVolume")}</span>
                    <span className="card-symbol">↗</span>
                  </div>
                  <strong>{hidden || dashboard?.volume_base || "—"}</strong>
                  <div className="metric-foot">
                    <span>
                      {dashboard
                        ? `${dashboard.transaction_count} ${t("posted")}`
                        : t("awaitingLiveLedger")}
                    </span>
                  </div>
                </article>
                <article className="metric-card">
                  <div className="card-head">
                    <span>{t("realizedProfit")}</span>
                    <span className="card-symbol profit">✦</span>
                  </div>
                  <strong className="profit-text">
                    {hidden || dashboard?.realized_profit || "—"}
                  </strong>
                  <div className="metric-foot">
                    <span>{t("ledgerDerivedAfn")}</span>
                  </div>
                </article>
                <article className="metric-card">
                  <div className="card-head">
                    <span>{t("commissionIncome")}</span>
                    <span className="card-symbol profit">✦</span>
                  </div>
                  <strong className="profit-text">
                    {hidden || dashboard?.commission_income || "—"}
                  </strong>
                  <div className="metric-foot">
                    <span>{t("ledgerDerivedAfn")}</span>
                  </div>
                </article>
                <article className="metric-card">
                  <div className="card-head">
                    <span>{t("operatingExpenses")}</span>
                    <span className="card-symbol">↘</span>
                  </div>
                  <strong>{hidden || dashboard?.expenses || "—"}</strong>
                  <div className="metric-foot">
                    <span>{t("ledgerDerivedAfn")}</span>
                  </div>
                </article>
              </section>
              <section className="live-business">
                <div>
                  <span className="live-pulse" /> <b>{t("liveBusiness")}</b>
                  <small>
                    {dashboard
                      ? `${t("lastSync")}: ${new Date(
                          dashboard.fresh_at,
                        ).toLocaleTimeString(language)}`
                      : t("awaitingLiveLedger")}
                  </small>
                </div>
                <div>
                  <strong>{dashboard?.pending_approvals ?? "—"}</strong>
                  <small>{t("pending")}</small>
                </div>
                <div>
                  <strong>
                    {dashboard?.reconciliation_differences ?? "—"}
                  </strong>
                  <small>{t("reconciliation")}</small>
                </div>
                <div>
                  <strong>{dashboard?.net_result ?? "—"}</strong>
                  <small>{t("netPosition")} AFN</small>
                </div>
                <button
                  onClick={() => setDashboardRefresh((value) => value + 1)}
                >
                  {t("refreshLiveView")} →
                </button>
              </section>
              <section className="dashboard-grid">
                <article className="panel balances">
                  <div className="panel-header">
                    <div>
                      <h2>{t("whereMoney")}</h2>
                      <p>{t("journalBalances")}</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => openSection("Cash & Accounts")}
                    >
                      {t("viewAll")} -&gt;
                    </button>
                  </div>
                  {dashboard?.locations.length ? (
                    <div className="balance-list">
                      {dashboard.locations.slice(0, 6).map((location) => (
                        <div
                          className="balance-row"
                          key={`${location.location_id}-${location.currency}`}
                        >
                          <span className="currency-badge usd">
                            {location.currency}
                          </span>
                          <span className="balance-name">
                            <b>{location.location_name}</b>
                            <small>{t("assetLocation")}</small>
                          </span>
                          <strong>{hidden || location.quantity}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-live">{t("awaitingLiveLedger")}</div>
                  )}
                </article>
                <article className="panel attention">
                  <div className="panel-header">
                    <div>
                      <h2>{t("needsAttention")}</h2>
                      <p>{t("liveReviewQueue")}</p>
                    </div>
                    <span className="attention-count">
                      {dashboard?.pending_approvals ?? "—"}
                    </span>
                  </div>
                  <div className="empty-live">
                    {dashboard
                      ? `${dashboard.pending_approvals} ${t("pending")}`
                      : t("loadingReviewQueue")}
                  </div>
                </article>
              </section>
              <section className="panel activity">
                <div className="panel-header">
                  <div>
                    <h2>{u("recentActivity")}</h2>
                    <p>{u("traceable")}</p>
                  </div>
                  <div className="activity-actions">
                    <button
                      className="filter-button"
                      onClick={() =>
                        setActivityFilter(
                          activityFilter === "Today" ? "All time" : "Today",
                        )
                      }
                    >
                      {activityFilter === "Today" ? t("today") : u("allTime")}{" "}
                      <span>⌄</span>
                    </button>
                    <button
                      className="export-button"
                      onClick={() => void exportActivity()}
                    >
                      {t("exportCsv")}
                    </button>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("transaction")}</th>
                        <th>{t("direction")}</th>
                        <th>{t("amount")}</th>
                        <th>{t("time")}</th>
                        <th>{u("status")}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((trade) => (
                        <tr key={trade.id}>
                          <td>
                            <span className="transaction-icon">↕</span>
                            <span className="table-person">
                              <b>{trade.customer}</b>
                              <small>
                                {u("tradeReference")} #
                                {String(trade.id).padStart(5, "0")}
                              </small>
                            </span>
                          </td>
                          <td>{activityDirectionLabel(trade.direction)}</td>
                          <td>
                            <b>
                              {privacy
                                ? "••••"
                                : trade.amount === "Recorded"
                                  ? u("recordedTransaction")
                                  : trade.amount}
                            </b>
                            <small>@ {trade.rate}</small>
                          </td>
                          <td>{trade.time}</td>
                          <td>
                            <span
                              className={`status ${trade.status.toLowerCase()}`}
                            >
                              {activityStatusLabel(trade.status)}
                            </span>
                          </td>
                          <td>
                            <button
                              className="more"
                              onClick={() => setToast(u("detailsAfterSync"))}
                              aria-label={`${u("viewTradeDetails")} ${trade.id}`}
                            >
                              •••
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
      {showTrade && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!tradeBusy) {
              setTradeReviewing(false);
              setShowTrade(false);
            }
          }}
        >
          <form
            className="trade-modal"
            onSubmit={addTrade}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
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
                className="close"
                onClick={() => {
                  setTradeReviewing(false);
                  setShowTrade(false);
                }}
                aria-label={t("closeTrade")}
              >
                ×
              </button>
            </div>
            <fieldset
              className="trade-fields"
              disabled={tradeReviewing || tradeBusy}
            >
              <label>
                {t("customer")}
                <select
                  value={tradeCounterparty}
                  onChange={(event) => setTradeCounterparty(event.target.value)}
                >
                  <option value="">{t("walkInCustomer")}</option>
                </select>
              </label>
              <div className="form-grid">
                <label>
                  {tradeSide === "BUY_FX" ? t("buyAmount") : t("sellAmount")}
                  <input
                    required
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    autoFocus
                  />
                  <select
                    value={tradeCurrency}
                    onChange={(event) =>
                      setTradeCurrency(
                        event.target.value as typeof tradeCurrency,
                      )
                    }
                  >
                    <option>USD</option>
                    <option>EUR</option>
                  </select>
                </label>
                <label>
                  {tradeSide === "BUY_FX" ? t("sellAmount") : t("buyAmount")}
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
                  />
                  {tradeSide === "EXCHANGE_FX" ? (
                    <select
                      value={tradeReceiveCurrency}
                      onChange={(event) =>
                        setTradeReceiveCurrency(
                          event.target.value as typeof tradeReceiveCurrency,
                        )
                      }
                    >
                      <option>USD</option>
                      <option>EUR</option>
                    </select>
                  ) : (
                    <select value="AFN" disabled>
                      <option>AFN</option>
                    </select>
                  )}
                </label>
              </div>
              <div className="form-grid">
                <label>
                  {t("fee")}
                  <input
                    min="0"
                    step="0.01"
                    value={tradeFee}
                    onChange={(event) => setTradeFee(event.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  {t("note")}
                  <input
                    value={tradeNote}
                    onChange={(event) => setTradeNote(event.target.value)}
                    placeholder={t("optionalNote")}
                  />
                </label>
              </div>
            </fieldset>
            <div className="rate-box">
              <span>{t("exchangeRate")}</span>
              {tradeSide === "EXCHANGE_FX" ? (
                <b>{u("pairRateUnavailable")}</b>
              ) : (
                <>
                  <b dir="ltr">
                    1 {tradeCurrency} = {effectiveTradeRate} AFN
                  </b>
                  <span className="positive">{t("marketRate")}</span>
                </>
              )}
            </div>
            {tradeReviewing && tradePreview && (
              <section className="trade-confirmation" aria-live="polite">
                <h3>{u("confirmationTitle")}</h3>
                <p>{u("confirmationIntro")}</p>
                <div className="setup-summary">
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
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setTradeReviewing(false)}
                >
                  {u("editTransaction")}
                </button>
              </section>
            )}
            <button
              className="primary-action full"
              type="submit"
              disabled={tradeBusy || tradeSide === "EXCHANGE_FX"}
            >
              {tradeBusy
                ? t("working")
                : tradeReviewing
                  ? u("confirmTransaction")
                  : u("reviewTransaction")}{" "}
              <span>→</span>
            </button>
            <p className="modal-note">{u("shopCheck")}</p>
          </form>
        </div>
      )}
      {operationKind && (
        <div className="modal-backdrop" onClick={() => setOperationKind(null)}>
          <form
            className="trade-modal"
            onSubmit={submitOperation}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
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
                className="close"
                onClick={() => setOperationKind(null)}
                aria-label={t("closeOperation")}
              >
                ×
              </button>
            </div>
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
                onChange={(event) => setOperationCurrency(event.target.value)}
              >
                <option>AFN</option>
                <option>USD</option>
                <option>EUR</option>
              </select>
            </label>
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
                  {t("fromLocation")}
                  <input
                    required
                    value={operationFromLocation}
                    onChange={(event) =>
                      setOperationFromLocation(event.target.value)
                    }
                  />
                </label>
                <label>
                  {t("toLocation")}
                  <input
                    required
                    value={operationToLocation}
                    onChange={(event) =>
                      setOperationToLocation(event.target.value)
                    }
                  />
                </label>
              </div>
            ) : (
              <label>
                {t("location")}
                <input
                  required
                  value={operationLocation}
                  onChange={(event) => setOperationLocation(event.target.value)}
                />
              </label>
            )}
            <label>
              {t("note")}
              <input
                value={operationMemo}
                onChange={(event) => setOperationMemo(event.target.value)}
                placeholder={u("reasonReference")}
              />
            </label>
            <button className="primary-action full" type="submit">
              {t("postOperation")} <span>→</span>
            </button>
            <p className="modal-note">{u("shopCheck")}</p>
          </form>
        </div>
      )}
      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <section
            className="trade-modal"
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
            <button
              className="primary-action full"
              onClick={() => setShowHelp(false)}
            >
              {t("closeHelp")}
            </button>
          </section>
        </div>
      )}
      {showOpeningBalance && (
        <div
          className="modal-backdrop"
          onClick={() => setShowOpeningBalance(false)}
        >
          <form
            className="trade-modal"
            onSubmit={submitOpeningBalance}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="opening-money-title"
          >
            <div className="modal-head">
              <div>
                <p className="kicker">{u("openingBalance")}</p>
                <h2 id="opening-money-title">{u("recordOpeningMoney")}</h2>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setShowOpeningBalance(false)}
                aria-label={t("close")}
              >
                ×
              </button>
            </div>
            <label>
              {t("currency")}
              <select
                value={openingCurrency}
                onChange={(event) => setOpeningCurrency(event.target.value)}
              >
                <option>AFN</option>
                <option>USD</option>
                <option>EUR</option>
              </select>
            </label>
            <div className="form-grid">
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
              <label>
                {u("afnValue")}
                <input
                  required
                  min="0.01"
                  step="0.01"
                  value={openingBaseValue}
                  onChange={(event) => setOpeningBaseValue(event.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>
            <button className="primary-action full" type="submit">
              {u("saveOpeningMoney")} <span>→</span>
            </button>
            <p className="modal-note">{u("openingMoneyNote")}</p>
          </form>
        </div>
      )}
      {completedTrade && (
        <ReceiptSuccessDialog
          language={language}
          businessName={organizationName || u("yourBusiness")}
          trade={completedTrade}
          onPrint={(width) => void printCompletedTrade(width)}
          onDone={() => setCompletedTrade(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function WorkspaceView({
  language,
  section,
  trades,
  organizationId,
  organizationName,
  branchName,
  roleLabel,
  canManageTeam,
  userId,
  deviceId,
  branchId,
  cashboxId,
  onDashboard,
  onNavigate,
  onToast,
}: {
  language: Language;
  section: string;
  trades: Trade[];
  organizationId: string | null;
  organizationName: string;
  branchName: string;
  roleLabel: string;
  canManageTeam: boolean;
  userId: string;
  deviceId: string;
  branchId: string | null;
  cashboxId: string | null;
  onDashboard: () => void;
  onNavigate: (section: string) => void;
  onToast: (message: string) => void;
}) {
  if (section === "Settings")
    return (
      <SettingsView
        language={language}
        organizationId={organizationId}
        organizationName={organizationName}
        branchName={branchName}
        roleLabel={roleLabel}
        onDashboard={onDashboard}
      />
    );
  if (section === "Compliance")
    return (
      <ComplianceView
        language={language}
        organizationId={organizationId}
        onDashboard={onDashboard}
      />
    );
  if (section === "Transactions")
    return (
      <TransactionsView
        language={language}
        organizationId={organizationId}
        onDashboard={onDashboard}
        onToast={onToast}
      />
    );
  if (section === "Cash & Accounts")
    return (
      <MoneyLocationView
        language={language}
        organizationId={organizationId}
        onDashboard={onDashboard}
        onToast={onToast}
      />
    );
  if (section === "People")
    return (
      <PeopleView
        language={language}
        organizationId={organizationId}
        onDashboard={onDashboard}
        onAddDebt={() => onNavigate("Debts")}
        onToast={onToast}
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
        language={language}
        trades={trades}
        organizationId={organizationId}
        onDashboard={onDashboard}
        onToast={onToast}
      />
    );
  if (section === "Team & Devices")
    return (
      <TeamDevicesView
        language={language}
        organizationId={organizationId}
        canManage={canManageTeam}
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
        onDashboard={onDashboard}
        onToast={onToast}
      />
    );
  if (section === "Reconciliation")
    return (
      <ReconciliationView
        language={language}
        organizationId={organizationId}
        branchId={branchId}
        cashboxId={cashboxId}
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
        onDashboard={onDashboard}
        onToast={onToast}
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
    Settings: ux(language, "settingsDescription"),
  };
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">{translate(language, "workspace")}</p>
          <h1>
            {section === "Settings" ? translate(language, "settings") : section}
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
      <form className="trade-modal" onSubmit={saveDraft}>
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
  canManage,
  onDashboard,
  onToast,
}: {
  language: Language;
  organizationId: string | null;
  canManage: boolean;
  onDashboard: () => void;
  onToast: (message: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const inspection = organizationId === "inspection";
  const roleName = (role: string) =>
    ({
      owner: u("owner"),
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
  const [loading, setLoading] = useState(!inspection);
  const [refresh, setRefresh] = useState(0);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("cashier");
  const [inviteBranches, setInviteBranches] = useState<string[]>([]);
  const [inviteCashboxes, setInviteCashboxes] = useState<string[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [createdInvitation, setCreatedInvitation] =
    useState<CreatedTeamInvitation | null>(null);
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
  const [editActive, setEditActive] = useState(true);
  const [editReason, setEditReason] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const roleOptions = [
    "manager",
    "accountant",
    "cashier",
    "viewer",
    "compliance_officer",
  ];

  useEffect(() => {
    if (!organizationId) return;
    if (inspection) return;
    void getTeamControlPlane(organizationId).then((result) => {
        if (result.data) {
          setMembers(result.data.members);
          setInvitations(result.data.invitations);
          setBranches(result.data.branches);
          setCashboxes(result.data.cashboxes);
          setDevices(result.data.devices);
          setApprovals(result.data.approvals);
        }
        if (result.error) onToast(ux(language, "teamLoadFailed"));
        setLoading(false);
      });
  }, [inspection, language, onToast, organizationId, refresh]);

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
  };

  const openInvite = () => {
    resetInvite();
    setCreatedInvitation(null);
    setShowInvite(true);
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
    setEditingMember(member);
    setEditRole(member.role_code);
    setEditBranches(member.branches.map((item) => item.id));
    setEditCashboxes(member.cashboxes.map((item) => item.id));
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
    const result = await updateTeamMembership({
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

      {canManage && !mfa.verified && (
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

      {createdInvitation && (
        <section className="invite-success" aria-live="polite">
          <div>
            <p className="kicker">{u("inviteCreated")}</p>
            <h2>{createdInvitation.display_name}</h2>
            <p>{u("inviteLinkInstructions")}</p>
          </div>
          <label>
            {u("copyInviteLink")}
            <input readOnly dir="ltr" value={invitationUrl} />
          </label>
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

      {showInvite && (
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
          <div className="team-form-grid">
            <label>
              {u("fullName")}
              <input required minLength={2} maxLength={100} value={inviteName} onChange={(event) => setInviteName(event.target.value)} />
            </label>
            <label>
              {u("workEmail")}
              <input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
            </label>
            <label>
              {u("employeeRole")}
              <select
                value={inviteRole}
                onChange={(event) => {
                  const nextRole = event.target.value;
                  setInviteRole(nextRole);
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
          <div className="team-form-actions">
            <button className="primary-action" disabled={inviteBusy || !mfa.verified}>
              {inviteBusy ? u("sendingInvite") : u("sendInvite")}
            </button>
            <button className="secondary-action" type="button" onClick={() => setShowInvite(false)}>
              {u("cancelAction")}
            </button>
          </div>
        </form>
      )}

      {editingMember && (
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
        <div className="team-section">
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
        <div className="team-section">
          <h2>{u("pendingInvitations")}</h2>
          <div className="balance-list">
            {invitations.length ? invitations.map((invitation) => (
              <article className="team-member-card invitation-card" key={invitation.id}>
                <span className="currency-badge usd">✉</span>
                <span className="balance-name">
                  <b>{invitation.display_name} · {roleName(invitation.role_code)}</b>
                  <small>{invitation.email}</small>
                  <small>{u("assignedTo")}: {scopeSummary(invitation.branches, invitation.cashboxes)}</small>
                  <small>{u("expires")} {new Date(invitation.expires_at).toLocaleString(language)}</small>
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

      <div className="dashboard-grid team-secondary-grid">
        <div>
          <h2>{u("registeredDevices")}</h2>
          <div className="balance-list">
            {devices.length ? (
              devices.map((device) => (
                <div className="balance-row" key={device.id}>
                  <span className="currency-badge usd">D</span>
                  <span className="balance-name">
                    <b>
                      {device.friendly_name} · {statusName(device.status)}
                    </b>
                    <small>{device.member_name}</small>
                    <small>
                      {u("lastSeen")}{" "}
                      {new Date(device.last_seen_at).toLocaleString(language)}
                    </small>
                  </span>
                  <strong>
                    {device.revoked_at
                      ? u("revoked")
                      : statusName(device.status)}
                  </strong>
                </div>
              ))
            ) : (
              <div className="empty-live">{u("noDevices")}</div>
            )}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>{u("approvalInbox")}</h2>
            <p>{u("selfApprovalRule")}</p>
          </div>
          <strong>
            {approvals.filter((item) => item.status === "pending").length}{" "}
            {t("pending")}
          </strong>
        </div>
        <div className="balance-list">
          {approvals.length ? (
            approvals.map((approval) => (
              <div className="balance-row" key={approval.id}>
                <span className="currency-badge usd">
                  {approval.status === "pending" ? "!" : "✓"}
                </span>
                <span className="balance-name">
                  <b>
                    {u("approvalRequest")} · {statusName(approval.status)}
                  </b>
                  <small>
                    {approval.reason} · {u("requested")}{" "}
                    {new Date(approval.requested_at).toLocaleString(language)}
                  </small>
                </span>
                <strong>
                  {approval.amount_base
                    ? `${approval.amount_base} ${approval.currency_code ?? ""}`
                    : u("review")}
                </strong>
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
  onDashboard,
  onToast,
}: {
  language: Language;
  organizationId: string | null;
  onDashboard: () => void;
  onToast: (message: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [evidence, setEvidence] = useState<LocationEvidenceRecord[]>([]);
  const [view, setView] = useState<"currency" | "location">("currency");
  const [currency, setCurrency] = useState("ALL");
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [loading, setLoading] = useState(organizationId !== "inspection");
  useEffect(() => {
    if (!organizationId) return;
    if (organizationId === "inspection") return;
    void Promise.all([
      getOwnerDashboard(organizationId),
      listLocationEvidence(organizationId),
    ]).then(([dashboardResult, evidenceResult]) => {
      if (dashboardResult.data) setSnapshot(dashboardResult.data);
      if (evidenceResult.data) setEvidence(evidenceResult.data);
      if (dashboardResult.error || evidenceResult.error)
        onToast(ux(language, "couldNotLoad"));
      setLoading(false);
    });
  }, [language, onToast, organizationId]);

  const currencies = Array.from(
    new Set([
      ...(snapshot?.positions ?? []).map((item) => item.currency),
      ...evidence.map((item) => item.currency_code),
    ]),
  ).sort();
  const visibleLocations = (snapshot?.locations ?? []).filter(
    (item) => currency === "ALL" || item.currency === currency,
  );
  const filteredEvidence = evidence.filter(
    (item) =>
      (currency === "ALL" || item.currency_code === currency) &&
      (!selectedLocation || item.location_id === selectedLocation),
  );
  const exposure = (direction: "receivable" | "payable") => {
    const balances =
      direction === "receivable"
        ? (snapshot?.receivables ?? [])
        : (snapshot?.payables ?? []);
    const visible = balances.filter(
      (item) => currency === "ALL" || item.currency === currency,
    );
    if (!visible.length) return currency === "ALL" ? "0" : `0.00 ${currency}`;
    return visible
      .map((item) => `${new Decimal(item.amount).toFixed(2)} ${item.currency}`)
      .join(" · ");
  };
  const selectedLocationName =
    snapshot?.locations.find((item) => item.location_id === selectedLocation)
      ?.location_name ??
    evidence.find((item) => item.location_id === selectedLocation)
      ?.location_name ??
    "";
  const rows =
    view === "currency"
      ? currencies.map((item) => ({
          key: item,
          selectionKey: null,
          label: item,
          amount:
            snapshot?.positions.find((position) => position.currency === item)
              ?.quantity ?? "0",
          currency: item,
        }))
      : visibleLocations.map((item) => ({
          key: `${item.location_id}:${item.currency}`,
          selectionKey: item.location_id,
          label: item.location_name,
          amount: item.quantity,
          currency: item.currency,
        }));
  return (
    <section className="panel money-workspace">
      <div className="panel-header">
        <div>
          <p className="kicker">{t("myMoney")}</p>
          <h1>{u("whereIsMoney")}</h1>
          <p>{u("moneyIntro")}</p>
        </div>
        <button className="text-button" onClick={onDashboard}>
          {u("backHome")} →
        </button>
      </div>
      <div className="rate-strip">
        <label>
          {t("currency")}
          <select
            value={currency}
            onChange={(event) => {
              setCurrency(event.target.value);
              setSelectedLocation(null);
            }}
          >
            <option value="ALL">{u("allCurrencies")}</option>
            {currencies.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <div className="segmented-control">
          <button
            className={view === "currency" ? "active" : ""}
            onClick={() => setView("currency")}
          >
            {u("currencyFirst")}
          </button>
          <button
            className={view === "location" ? "active" : ""}
            onClick={() => setView("location")}
          >
            {u("locationFirst")}
          </button>
        </div>
        <button className="export-button" onClick={() => window.print()}>
          {u("printSnapshot")}
        </button>
      </div>
      <div className="metric-grid">
        <article className="metric-card">
          <span>{u("theyOweUs")}</span>
          <strong>{exposure("receivable")}</strong>
        </article>
        <article className="metric-card">
          <span>{u("weOweThem")}</span>
          <strong>{exposure("payable")}</strong>
        </article>
        <article className="metric-card">
          <span>{u("postedRecords")}</span>
          <strong>{evidence.length}</strong>
        </article>
      </div>
      {loading ? (
        <div className="empty-live">{u("loadingMoney")}</div>
      ) : (
        <div className="money-columns">
          <div className="balance-list">
            {rows.length ? (
              rows.map((row) => (
                <button
                  className="balance-row"
                  key={row.key}
                  onClick={() =>
                    setSelectedLocation(
                      view === "location" ? row.selectionKey : null,
                    )
                  }
                >
                  <span className="currency-badge usd">{row.currency}</span>
                  <span className="balance-name">
                    <b>{row.label}</b>
                    <small>
                      {view === "currency"
                        ? u("totalCurrency")
                        : u("moneyAtPlace")}
                    </small>
                  </span>
                  <strong>
                    {row.amount} {row.currency}
                  </strong>
                </button>
              ))
            ) : (
              <div className="empty-live">{u("noMoney")}</div>
            )}
          </div>
          <div className="panel evidence-panel">
            <div className="panel-header">
              <div>
                <h2>
                  {selectedLocation
                    ? `${u("amountSource")} · ${selectedLocationName}`
                    : u("amountSource")}
                </h2>
                <p>{u("eachAmountSource")}</p>
              </div>
            </div>
            {filteredEvidence.length ? (
              <div className="balance-list">
                {filteredEvidence.slice(0, 80).map((line) => (
                  <div className="balance-row" key={line.id}>
                    <span className="currency-badge usd">
                      {line.currency_code}
                    </span>
                    <span className="balance-name">
                      <b>
                        {line.memo ||
                          line.location_name ||
                          u("recordedTransaction")}
                      </b>
                      <small>
                        {new Date(line.occurred_at).toLocaleString(language)}
                      </small>
                    </span>
                    <strong>
                      {Number(line.native_debit) - Number(line.native_credit) >=
                      0
                        ? "+"
                        : ""}
                      {(
                        Number(line.native_debit) - Number(line.native_credit)
                      ).toFixed(2)}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-live">{u("selectLocation")}</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function PeopleView({
  language,
  organizationId,
  onDashboard,
  onAddDebt,
  onToast,
}: {
  language: Language;
  organizationId: string | null;
  onDashboard: () => void;
  onAddDebt: () => void;
  onToast: (message: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const [people, setPeople] = useState<CounterpartyRecord[]>([]);
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
  const [selected, setSelected] = useState<CounterpartyRecord | null>(null);
  const [documents, setDocuments] = useState<PrivateDocumentRecord[]>([]);
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
    if (!organizationId || organizationId === "inspection" || !selected) return;
    void listCounterpartyStatement(organizationId, selected.id).then(
      (result) => {
        if (result.data) setStatement(result.data);
        if (result.error) onToast(ux(language, "couldNotLoad"));
      },
    );
    void getPrivateCounterpartyDocuments(organizationId, selected.id).then(
      (result) => {
        if (result.data) setDocuments(result.data);
        if (result.error) onToast(ux(language, "couldNotLoad"));
      },
    );
  }, [language, onToast, organizationId, selected]);
  const captureDocument = async () => {
    if (!organizationId || !selected || !fileInput.current) return;
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
      setDocuments((current) => [
        result.data as PrivateDocumentRecord,
        ...current,
      ]);
    onToast(u("documentSaved"));
  };
  const previewDocument = async (documentId: string) => {
    if (!organizationId) return;
    const result = await getPrivateDocumentUrl(organizationId, documentId);
    if (result.error) onToast(u("requestFailed"));
    else if (result.data)
      window.open(result.data, "_blank", "noopener,noreferrer");
  };
  const filtered = people.filter((person) =>
    person.display_name
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
      <div className="panel-header">
        <div>
          <p className="kicker">{t("customersDebts")}</p>
          <h1>{u("peopleTitle")}</h1>
          <p>{u("peopleIntro")}</p>
        </div>
        <div className="activity-actions">
          <button className="export-button" onClick={onAddDebt}>
            {u("addDebt")}
          </button>
          <button className="text-button" onClick={onDashboard}>
            {u("backHome")} →
          </button>
        </div>
      </div>
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
              onClick={() => setSelected(person)}
            >
              <span className="currency-badge usd">
                {person.display_name.slice(0, 1).toUpperCase()}
              </span>
              <span className="balance-name">
                <b>{person.display_name}</b>
                <small>{t("customer")}</small>
              </span>
              <strong>{u("viewStatement")} →</strong>
            </button>
          ))
        ) : (
          <div className="empty-live">{u("noPeopleMatch")}</div>
        )}
      </div>
      {selected && (
        <section className="panel statement-panel">
          <div className="panel-header">
            <div>
              <p className="kicker">{u("statement")}</p>
              <h2>{selected.display_name}</h2>
              <p>{u("balancesStaySeparate")}</p>
            </div>
            <button className="text-button" onClick={() => setSelected(null)}>
              {u("closeStatement")}
            </button>
          </div>
          <div className="rate-strip">
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
              accept="image/jpeg,image/png,application/pdf"
              capture="environment"
              onChange={() => void captureDocument()}
            />
            <button
              className="export-button"
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
                      {new Date(document.created_at).toLocaleString(language)}
                    </small>
                  </span>
                  <strong>{u("preview")} →</strong>
                </button>
              ))
            ) : (
              <div className="empty-live">{u("noDocuments")}</div>
            )}
          </div>
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
              · {debt.outstanding_amount} {debt.currency_code}
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
                    {new Date(item.occurred_at).toLocaleString(language)} ·{" "}
                    {item.reference.slice(0, 12)}
                    {item.memo ? ` · ${item.memo}` : ""}
                  </small>
                </span>
                <strong>
                  {item.amount
                    ? `${item.direction === "receivable" ? u("theyOweUs") : u("weOweThem")} ${item.amount} ${item.currency_code ?? ""}`
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

function TransactionsView({
  language,
  organizationId,
  onDashboard,
  onToast,
}: {
  language: Language;
  organizationId: string | null;
  onDashboard: () => void;
  onToast: (message: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const [entries, setEntries] = useState<JournalRecord[]>([]);
  const [selected, setSelected] = useState<JournalRecord | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (organizationId && organizationId !== "inspection")
      void listJournalEntries(organizationId).then((result) => {
        if (result.data) setEntries(result.data);
      });
  }, [organizationId]);
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
      setSelected(null);
      setReason("");
      if (organizationId) {
        const refreshed = await listJournalEntries(organizationId);
        if (refreshed.data) setEntries(refreshed.data);
      }
    }
  };
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
      <div className="balance-list">
        {entries.length ? (
          entries.map((entry) => (
            <button
              className="balance-row"
              key={entry.id}
              onClick={() => {
                setSelected(entry);
                setReason("");
              }}
            >
              <span className="currency-badge usd">
                {entry.status === "posted" ? "✓" : "↺"}
              </span>
              <span className="balance-name">
                <b>{entry.memo || u("recordedTransaction")}</b>
                <small>
                  {new Date(entry.occurred_at).toLocaleString(language)}
                </small>
              </span>
              <strong>
                {entry.status === "posted" ? t("posted") : entry.status}
              </strong>
            </button>
          ))
        ) : (
          <div className="empty-live">{u("noTransactions")}</div>
        )}
      </div>
      {selected && selected.status === "posted" && (
        <form className="trade-modal" onSubmit={reverse}>
          <div className="modal-head">
            <div>
              <p className="kicker">{u("correction")}</p>
              <h2>{u("correctTransaction")}</h2>
            </div>
            <button
              type="button"
              className="close"
              onClick={() => setSelected(null)}
              aria-label={t("close")}
            >
              ×
            </button>
          </div>
          <p>
            {u("originalReference")}: {selected.id.slice(0, 12)}
          </p>
          <label>
            {t("note")}
            <input
              required
              minLength={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={u("correctionReason")}
            />
          </label>
          <button className="primary-action full" type="submit" disabled={busy}>
            {busy ? u("posting") : u("submitCorrection")} <span>→</span>
          </button>
        </form>
      )}
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
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const [history, setHistory] = useState<RateHistoryRecord[]>([]);
  useEffect(() => {
    if (organizationId && organizationId !== "inspection")
      void listRateHistory(organizationId).then((result) => {
        if (result.data) setHistory(result.data);
      });
  }, [organizationId]);
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">{u("rateHistory")}</p>
          <h1>{u("ratesTitle")}</h1>
          <p>{u("ratesIntro")}</p>
        </div>
        <button className="text-button" onClick={onDashboard}>
          {u("backHome")} →
        </button>
      </div>
      <div className="rate-strip">
        <div className="rate-title">
          <span className="rate-live" />
          <div>
            <b>USD / AFN</b>
            <small>{u("rateHistory")}</small>
          </div>
        </div>
        <label>
          {t("buyRate")}
          <input
            value={history[0]?.buy_rate ?? ""}
            readOnly
            placeholder={u("liveRate")}
          />
        </label>
        <label>
          {t("sellRate")}
          <input
            value={history[0]?.sell_rate ?? ""}
            readOnly
            placeholder={u("liveRate")}
          />
        </label>
      </div>
      <div className="balance-list">
        {history.length ? (
          history.map((item) => (
            <div className="balance-row" key={item.id}>
              <span className="currency-badge usd">{item.from_currency}</span>
              <span className="balance-name">
                <b>
                  {item.group_name} ·{" "}
                  {item.branch_id ? u("branchRate") : u("shopDefault")}
                </b>
                <small>
                  {u("effectiveFrom")}{" "}
                  {new Date(item.effective_from).toLocaleString(language)} ·{" "}
                  {item.to_currency}
                </small>
              </span>
              <strong>
                {t("buyRate")} {item.buy_rate} · {t("sellRate")}{" "}
                {item.sell_rate}
              </strong>
            </div>
          ))
        ) : (
          <div className="empty-live">{u("noRateHistory")}</div>
        )}
      </div>
      <div className="empty-live">{u("calculatorNote")}</div>
    </section>
  );
}

function ReportsView({
  language,
  trades,
  organizationId,
  onDashboard,
  onToast,
}: {
  language: Language;
  trades: Trade[];
  organizationId: string | null;
  onDashboard: () => void;
  onToast: (message: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const [currency, setCurrency] = useState("All");
  const [status, setStatus] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = trades.map((trade) => ({
    entryId: `trade_${trade.id}`,
    occurredAt: trade.time,
    type: trade.direction,
    branchId: "Kabul Central",
    status: trade.status.toLowerCase(),
    realizedProfit: "0",
  }));
  const filteredRows = rows.filter(
    (row) =>
      (status === "All" || row.status === status.toLowerCase()) &&
      (!from || row.occurredAt >= from) &&
      (!to || row.occurredAt <= `${to}T23:59:59`) &&
      (currency === "All" || row.type.includes(currency)),
  );
  const authorizeExport = async (format: "pdf" | "print") => {
    if (!organizationId) {
      onToast(u("exportUnavailable"));
      return false;
    }
    const result = await recordReportExport({
      organization_id: organizationId,
      report_name: "Recent Activity",
      format,
      filters: { scope: "loaded_activity" },
    });
    if (result.error) {
      onToast(u("exportUnavailable"));
      return false;
    }
    return true;
  };
  const share = async () => {
    const allowed = await authorizeExport("print");
    if (allowed) {
      const { shareReportViaWhatsApp } = await loadExports();
      shareReportViaWhatsApp({
        reportName: "Recent Activity",
        reference: filteredRows[0]?.entryId ?? "snapshot",
        businessName: "Kabul Central Exchange",
      });
      onToast(u("shareOpened"));
    }
  };
  const downloadPdf = (
    rows: typeof filteredRows,
    businessName: string,
    reportName: string,
  ) => {
    void authorizeExport("pdf").then(async (allowed) => {
      if (allowed) {
        const { downloadPdf: createPdf } = await loadExports();
        createPdf(rows, businessName, reportName);
        onToast(u("exportReady"));
      }
    });
  };
  const printReport = () => {
    void authorizeExport("print").then(async (allowed) => {
      if (allowed) {
        const { printReport: print } = await loadExports();
        print();
      }
    });
  };
  const printThermalReceipt = (
    input: {
      businessName: string;
      reference: string;
      type: string;
      amount: string;
      currency: string;
      rate?: string;
      direction: "ltr" | "rtl";
      locale: string;
      labels: { amount: string; rate: string; date: string };
    },
    width: "58mm" | "80mm",
  ) => {
    void authorizeExport("print").then(async (allowed) => {
      if (allowed) {
        const { printThermalReceipt: print } = await loadExports();
        print(input, width);
      }
    });
  };
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
      <div className="rate-strip">
        <label>
          {u("from")}
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          {u("to")}
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label>
          {t("currency")}
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          >
            <option value="All">{u("all")}</option>
            <option>AFN</option>
            <option>USD</option>
            <option>EUR</option>
          </select>
        </label>
        <label>
          {u("status")}
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="All">{u("all")}</option>
            <option value="posted">{t("posted")}</option>
            <option value="pending">{t("pending")}</option>
            <option value="reversed">{u("reversed")}</option>
          </select>
        </label>
      </div>
      <div className="activity-actions">
        <button
          className="export-button"
          onClick={() =>
            downloadPdf(
              filteredRows,
              "Kabul Central Exchange",
              u("recentActivity"),
            )
          }
        >
          {t("exportPdf")}
        </button>
        <button className="export-button" onClick={printReport}>
          {u("printA4")}
        </button>
        <button
          className="export-button"
          onClick={() =>
            printThermalReceipt(
              {
                businessName: "Kabul Central Exchange",
                reference: filteredRows[0]?.entryId ?? "snapshot",
                type: filteredRows[0]?.type ?? u("statement"),
                amount: filteredRows[0]?.realizedProfit ?? "0",
                currency: "AFN",
                direction: isRtl(language) ? "rtl" : "ltr",
                locale: language,
                labels: {
                  amount: t("amount"),
                  rate: t("exchangeRate"),
                  date: u("businessDate"),
                },
              },
              "58mm",
            )
          }
        >
          {u("print58")}
        </button>
        <button
          className="export-button"
          onClick={() =>
            printThermalReceipt(
              {
                businessName: "Kabul Central Exchange",
                reference: filteredRows[0]?.entryId ?? "snapshot",
                type: filteredRows[0]?.type ?? u("statement"),
                amount: filteredRows[0]?.realizedProfit ?? "0",
                currency: "AFN",
                direction: isRtl(language) ? "rtl" : "ltr",
                locale: language,
                labels: {
                  amount: t("amount"),
                  rate: t("exchangeRate"),
                  date: u("businessDate"),
                },
              },
              "80mm",
            )
          }
        >
          {u("print80")}
        </button>
        <button className="export-button" onClick={() => void share()}>
          {u("shareWhatsApp")}
        </button>
      </div>
      <div className="empty-live">
        {filteredRows.length
          ? `${filteredRows.length} ${u("reportsReady")}`
          : u("noReportRows")}
      </div>
    </section>
  );
}

function DebtsView({
  language,
  organizationId,
  branchId,
  onDashboard,
  onToast,
}: {
  language: Language;
  organizationId: string | null;
  branchId: string | null;
  onDashboard: () => void;
  onToast: (message: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [people, setPeople] = useState<CounterpartyRecord[]>([]);
  const [direction, setDirection] = useState<"receivable" | "payable">(
    "receivable",
  );
  const [counterpartyId, setCounterpartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("AFN");
  const [selectedDebt, setSelectedDebt] = useState<DebtRecord | null>(null);
  const [settlementAmount, setSettlementAmount] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!organizationId || organizationId === "inspection") return;
    void Promise.all([
      listDebts(organizationId),
      listCounterparties(organizationId),
    ]).then(([debtResult, peopleResult]) => {
      if (debtResult.data) setDebts(debtResult.data);
      if (peopleResult.data) setPeople(peopleResult.data);
    });
  }, [organizationId]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !branchId || !counterpartyId) {
      onToast(
        counterpartyId ? u("businessSetupRequired") : u("choosePersonFirst"),
      );
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
      location: "Main Counter",
      client_command_id: crypto.randomUUID(),
    });
    setBusy(false);
    onToast(result.error ? u("couldNotSave") : u("savedSuccessfully"));
    if (!result.error) {
      setCounterpartyId("");
      setAmount("");
    }
  };
  const settle = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDebt) return;
    setBusy(true);
    const result = await settleDebt({
      debt_id: selectedDebt.id,
      amount: settlementAmount,
      location: "Main Counter",
      client_command_id: crypto.randomUUID(),
    });
    setBusy(false);
    onToast(result.error ? u("couldNotSave") : u("savedSuccessfully"));
    if (!result.error) {
      setSelectedDebt(null);
      setSettlementAmount("");
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
      <form className="trade-modal" onSubmit={submit}>
        <label>
          {u("direction")}
          <select
            value={direction}
            onChange={(event) =>
              setDirection(event.target.value as typeof direction)
            }
          >
            <option value="receivable">{u("theyOweUs")}</option>
            <option value="payable">{u("weOweThem")}</option>
          </select>
        </label>
        <label>
          {u("person")}
          <select
            required
            value={counterpartyId}
            onChange={(event) => setCounterpartyId(event.target.value)}
          >
            <option value="">{u("choosePerson")}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.display_name}
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
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
            />
          </label>
          <label>
            {t("currency")}
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              <option>AFN</option>
              <option>USD</option>
              <option>EUR</option>
            </select>
          </label>
        </div>
        <button className="primary-action full" type="submit" disabled={busy}>
          {busy ? u("posting") : u("postDebt")} <span>→</span>
        </button>
      </form>
      <div className="balance-list">
        {debts.length ? (
          debts.map((debt) => (
            <button
              className="balance-row"
              key={debt.id}
              onClick={() => {
                setSelectedDebt(debt);
                setSettlementAmount(debt.outstanding_amount);
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
      </div>
      {selectedDebt && (
        <form className="trade-modal" onSubmit={settle}>
          <div className="modal-head">
            <div>
              <p className="kicker">{u("settleDebt")}</p>
              <h2>{u("settleDebt")}</h2>
            </div>
            <button
              type="button"
              className="close"
              onClick={() => setSelectedDebt(null)}
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
            {u("paymentAmount")}
            <input
              required
              min="0.01"
              max={selectedDebt.outstanding_amount}
              step="0.01"
              value={settlementAmount}
              onChange={(event) => setSettlementAmount(event.target.value)}
            />
          </label>
          <button className="primary-action full" type="submit" disabled={busy}>
            {busy ? u("settling") : u("savePayment")} <span>→</span>
          </button>
        </form>
      )}
      <div className="empty-live">{u("settlementNote")}</div>
    </section>
  );
}

function ReconciliationView({
  language,
  organizationId,
  branchId,
  cashboxId,
  onDashboard,
  onToast,
}: {
  language: Language;
  organizationId: string | null;
  branchId: string | null;
  cashboxId: string | null;
  onDashboard: () => void;
  onToast: (message: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const [afn, setAfn] = useState("");
  const [usd, setUsd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [expected, setExpected] = useState<Record<string, string>>({});
  useEffect(() => {
    if (organizationId && organizationId !== "inspection" && cashboxId)
      void listCashboxBalances(organizationId, cashboxId).then((result) => {
        if (result.data)
          setExpected(
            Object.fromEntries(
              result.data.map((item) => [
                item.currency_code,
                item.expected_amount,
              ]),
            ),
          );
        if (result.error) onToast(ux(language, "couldNotLoad"));
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
      counts: [
        { currency: "AFN", counted_amount: afn },
        { currency: "USD", counted_amount: usd },
      ],
      variance_reason: reason,
    });
    setBusy(false);
    onToast(result.error ? u("couldNotSave") : u("savedSuccessfully"));
  };
  const variance = (currency: string, counted: string) =>
    new Decimal(counted || "0").minus(expected[currency] ?? "0").toFixed(2);
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
        <div className="balance-row">
          <span className="currency-badge usd">AFN</span>
          <span className="balance-name">
            <b>{u("expectedVsCounted")}</b>
            <small>
              {u("expectedAmount")}: {expected.AFN ?? u("loading")}
            </small>
          </span>
          <strong>
            {u("variance")} {variance("AFN", afn)}
          </strong>
        </div>
        <div className="balance-row">
          <span className="currency-badge usd">USD</span>
          <span className="balance-name">
            <b>{u("expectedVsCounted")}</b>
            <small>
              {u("expectedAmount")}: {expected.USD ?? u("loading")}
            </small>
          </span>
          <strong>
            {u("variance")} {variance("USD", usd)}
          </strong>
        </div>
      </div>
      <form className="trade-modal" onSubmit={submit}>
        <label>
          {t("countedAfn")}
          <input
            required
            min="0"
            step="0.01"
            value={afn}
            onChange={(event) => setAfn(event.target.value)}
            placeholder="0.00"
          />
        </label>
        <label>
          {t("countedUsd")}
          <input
            required
            min="0"
            step="0.01"
            value={usd}
            onChange={(event) => setUsd(event.target.value)}
            placeholder="0.00"
          />
        </label>
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
    </section>
  );
}

function HawalaView({
  language,
  organizationId,
  branchId,
  onDashboard,
  onToast,
}: {
  language: Language;
  organizationId: string | null;
  branchId: string | null;
  onDashboard: () => void;
  onToast: (message: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const [transfers, setTransfers] = useState<HawalaTransferRecord[]>([]);
  const [beneficiary, setBeneficiary] = useState("");
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("0");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (organizationId && organizationId !== "inspection")
      void listHawalaTransfers(organizationId).then((result) => {
        if (result.data) setTransfers(result.data);
      });
  }, [organizationId]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !branchId) {
      onToast(u("activeBranchRequired"));
      return;
    }
    setBusy(true);
    const result = await recordHawalaSend({
      organization_id: organizationId,
      branch_id: branchId,
      beneficiary_name: beneficiary,
      origin_location: "Main Counter",
      destination_location: destination,
      currency: "AFN",
      amount,
      fee,
      reference_code: reference,
      client_command_id: crypto.randomUUID(),
    });
    setBusy(false);
    onToast(result.error ? u("couldNotSave") : u("savedSuccessfully"));
    if (!result.error) {
      setBeneficiary("");
      setDestination("");
      setAmount("");
      setFee("0");
      setReference("");
      if (organizationId) {
        const refreshed = await listHawalaTransfers(organizationId);
        if (refreshed.data) setTransfers(refreshed.data);
      }
    }
  };
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
      <form className="trade-modal" onSubmit={submit}>
        <label>
          {u("receiver")}
          <input
            required
            value={beneficiary}
            onChange={(event) => setBeneficiary(event.target.value)}
            placeholder={u("fullBeneficiaryName")}
          />
        </label>
        <label>
          {t("destination")}
          <input
            required
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder={u("cityCountry")}
          />
        </label>
        <div className="form-grid">
          <label>
            {u("amountAfn")}
            <input
              required
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
            />
          </label>
          <label>
            {u("feeAfn")}
            <input
              min="0"
              step="0.01"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
            />
          </label>
        </div>
        <label>
          {t("referenceCode")}
          <input
            required
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder={u("uniqueReference")}
          />
        </label>
        <button className="primary-action full" type="submit" disabled={busy}>
          {busy ? u("postingHawala") : u("saveHawala")} <span>→</span>
        </button>
      </form>
      <div className="balance-list">
        {transfers.length ? (
          transfers.map((transfer) => (
            <div className="balance-row" key={transfer.id}>
              <span className="currency-badge usd">
                {transfer.currency_code}
              </span>
              <span className="balance-name">
                <b>{transfer.beneficiary_name}</b>
                <small>
                  {transfer.reference_code} · {transfer.destination_location}
                </small>
              </span>
              <strong>{transfer.amount}</strong>
            </div>
          ))
        ) : (
          <div className="empty-live">{u("noHawala")}</div>
        )}
      </div>
    </section>
  );
}

function OnboardingScreen({
  language,
  businessName,
  currencies,
  cashboxName,
  busy,
  onLanguageChange,
  onBusinessNameChange,
  onCurrenciesChange,
  onCashboxNameChange,
  onSubmit,
}: {
  language: Language;
  businessName: string;
  currencies: string[];
  cashboxName: string;
  busy: boolean;
  onLanguageChange: (language: Language) => void;
  onBusinessNameChange: (value: string) => void;
  onCurrenciesChange: (currencies: string[]) => void;
  onCashboxNameChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const available = [
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
  const toggleCurrency = (currency: string) =>
    onCurrenciesChange(
      currencies.includes(currency)
        ? currencies.filter((item) => item !== currency && item !== "AFN")
        : [...currencies, currency],
    );
  return (
    <main className="auth-shell">
      <section className="auth-card">
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
          <fieldset className="currency-choices">
            <legend>{u("currenciesQuestion")}</legend>
            {available.map((currency) => (
              <label key={currency}>
                <input
                  type="checkbox"
                  checked={currencies.includes(currency)}
                  disabled={currency === "AFN"}
                  onChange={() => toggleCurrency(currency)}
                />
                {currency}
              </label>
            ))}
          </fieldset>
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
  email,
  password,
  message,
  messageKind,
  busy,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
  mode: "signIn" | "signUp" | "reset";
  invitation: boolean;
  email: string;
  password: string;
  message: string;
  messageKind: "error" | "success" | null;
  busy: boolean;
  onModeChange: (mode: "signIn" | "signUp" | "reset") => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
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
            <span>{t("trackDebts")}</span>
            <span>{t("controlCashboxes")}</span>
            <span>{t("employeeActivity")}</span>
            <span>{t("todayReports")}</span>
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
          <p className="kicker">{t("secureAccess")}</p>
          <h1>
            {reset
              ? t("resetPassword")
              : invitation
                ? u("joinTeam")
              : mode === "signUp"
                ? t("createOwnerAccount")
                : t("welcomeBack")}
          </h1>
          <p className="auth-subtitle">
            {reset
              ? t("resetSubtitle")
              : invitation
                ? u("joinTeamSubtitle")
              : mode === "signUp"
                ? t("signUpSubtitle")
                : t("signInSubtitle")}
          </p>
          <form onSubmit={onSubmit} aria-describedby={message ? "auth-feedback" : undefined}>
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
            {!reset && (
              <button
                type="button"
                onClick={() =>
                  onModeChange(mode === "signIn" ? "signUp" : "signIn")
                }
              >
                {mode === "signIn" ? t("createAnAccount") : t("backToSignIn")}
              </button>
            )}
            {mode === "signIn" && (
              <button type="button" onClick={() => onModeChange("reset")}>
                {t("forgotPassword")}
              </button>
            )}
            {reset && (
              <button type="button" onClick={() => onModeChange("signIn")}>
                {t("backToSignIn")}
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
