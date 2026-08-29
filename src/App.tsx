import { useEffect, useRef, useState } from 'react'
import Decimal from 'decimal.js'
import './App.css'
import { validateClientEnvironment } from './lib/env'
import { readPublicSupabaseConfig } from './lib/supabase'
import { calculateCounterAmount } from './domain/valuation'
import { deriveTradeAmounts } from './domain/tradePricing'
import { buildCsvReport } from './domain/reporting'
import { isRtl, translate, type Language } from './lib/i18n'
import { getCurrentRates, getOwnerDashboard, getTeamControlPlane, getPrivateCounterpartyDocuments, getPrivateDocumentUrl, listCashboxBalances, listCounterparties, listCounterpartyStatement, listDebts, listHawalaTransfers, listJournalEntries, listLocationEvidence, listRateHistory, postFxTrade, recordCashboxClose, recordDebt, recordHawalaSend, recordOpeningBalance, recordOperation, recordReportExport, requestReversal, settleDebt, uploadPrivateCounterpartyDocument, type DashboardSnapshot, type CounterpartyRecord, type DebtRecord, type HawalaTransferRecord, type JournalRecord, type LocationEvidenceRecord, type RateHistoryRecord, type TeamMemberRecord, type DeviceRecord, type ApprovalRecord, type PrivateDocumentRecord } from './lib/financialApi'
import { getSupabaseClient } from './lib/supabase'
import { createBusiness } from './lib/onboarding'
import { sendPasswordReset, signInWithPassword, signOut, signUpWithPassword } from './lib/auth'
import { BrowserDocumentCaptureProvider, type DocumentType, validateDocumentFile } from './lib/integrations'
import { OfflineDraftBook } from './lib/offline'
import { indexedDbOfflineStore } from './lib/offlineStore'
import { ImportWorkspace } from './ImportWorkspace'

const loadExports = () => import('./lib/exports')

type Trade = { id: string | number; customer: string; direction: string; amount: string; rate: string; time: string; status: string }
type OperationKind = 'RECEIVE_MONEY' | 'PAY_MONEY' | 'TRANSFER_CASH' | 'RECORD_EXPENSE' | 'RECORD_INCOME' | 'OWNER_INVESTMENT' | 'OWNER_WITHDRAWAL' | 'BANK_DEPOSIT' | 'BANK_WITHDRAWAL'
type WorkspaceRole = 'owner' | 'manager' | 'accountant' | 'cashier' | 'compliance_officer' | 'viewer'



function App() {
  validateClientEnvironment()
  const inspectionMode = !new URLSearchParams(window.location.search).has('public') && (import.meta.env.MODE === 'e2e' || (import.meta.env.DEV && import.meta.env.VITE_AUTH_GATE_DISABLED === 'true'))
  const supabaseConfigured = Boolean(readPublicSupabaseConfig())
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [showTrade, setShowTrade] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [showBranchMenu, setShowBranchMenu] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showOpeningBalance, setShowOpeningBalance] = useState(false)
  const [openingAmount, setOpeningAmount] = useState('')
  const [openingBaseValue, setOpeningBaseValue] = useState('')
  const [openingCurrency, setOpeningCurrency] = useState('AFN')
  const [operationKind, setOperationKind] = useState<OperationKind | null>(null)
  const [operationAmount, setOperationAmount] = useState('')
  const [operationCurrency, setOperationCurrency] = useState('AFN')
  const [operationLocation, setOperationLocation] = useState('Main Counter')
  const [operationFromLocation, setOperationFromLocation] = useState('Main Counter')
  const [operationToLocation, setOperationToLocation] = useState('Main Safe')
  const [operationCategory, setOperationCategory] = useState('Other')
  const [operationMemo, setOperationMemo] = useState('')
  const [activityFilter, setActivityFilter] = useState('Today')
  const [privacy, setPrivacy] = useState(false)
  const [language, setLanguage] = useState<Language>(() => {
    const saved = window.localStorage.getItem('sarafi-language')
    return saved === 'fa-AF' || saved === 'ps-AF' ? saved : 'en'
  })
  const [online, setOnline] = useState(inspectionMode ? true : navigator.onLine)
  const [trades, setTrades] = useState<Trade[]>([])
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null)
  const [dashboardError, setDashboardError] = useState('')
  const [dashboardRefresh, setDashboardRefresh] = useState(0)
  const [amount, setAmount] = useState('')
  const [tradeSide, setTradeSide] = useState<'BUY_FX' | 'SELL_FX' | 'EXCHANGE_FX'>('SELL_FX')
  const [tradeCurrency, setTradeCurrency] = useState<'AFN' | 'USD' | 'EUR'>('USD')
  const [tradeReceiveCurrency, setTradeReceiveCurrency] = useState<'AFN' | 'USD' | 'EUR'>('EUR')
  const [tradeFee, setTradeFee] = useState('')
  const [tradeNote, setTradeNote] = useState('')
  const [tradeCounterparty, setTradeCounterparty] = useState('')
  const [tradeBusy, setTradeBusy] = useState(false)
  const [calculatorAmount, setCalculatorAmount] = useState('1000')
  const [rate, setRateState] = useState(inspectionMode ? '70.25' : '')
  const setRate = (_value: string) => undefined
    const [sellRate, setSellRate] = useState(inspectionMode ? '70.35' : '')
  const [dashboardDate, setDashboardDate] = useState(new Date().toISOString().slice(0, 10))
  const [toast, setToast] = useState('')
  const [showMoreNavigation, setShowMoreNavigation] = useState(false)
  const [organizationId, setOrganizationId] = useState<string | null>(inspectionMode ? 'inspection' : null)
  const [organizationName, setOrganizationName] = useState(inspectionMode ? 'Kabul Central Exchange' : 'Your business')
  const [branchId, setBranchId] = useState<string | null>(null)
  const [branchName, setBranchName] = useState(inspectionMode ? 'Main branch' : 'Assigned branch')
  const [cashboxId, setCashboxId] = useState<string | null>(null)
  const [organizationLoading, setOrganizationLoading] = useState(!inspectionMode)
  const [businessName, setBusinessName] = useState('')
  const [onboardingCurrencies, setOnboardingCurrencies] = useState(['AFN', 'USD'])
  const [onboardingCashboxName, setOnboardingCashboxName] = useState('Main Counter')
  const [user, setUser] = useState<import('@supabase/supabase-js').User | null>(null)
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole>(inspectionMode ? 'owner' : 'viewer')
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp' | 'reset'>('signIn')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [browserDeviceId] = useState(() => { const key = 'sarafi-browser-device-id'; const existing = window.localStorage.getItem(key); if (existing) return existing; const created = crypto.randomUUID(); window.localStorage.setItem(key, created); return created })
  const hidden = privacy ? '••••••' : ''
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key)
  const sectionLabel = (section: string) => ({ Dashboard: t('dashboard'), Trade: t('trade'), Transactions: t('transactions'), 'Cash & Accounts': t('cashAccounts'), People: t('people'), Debts: t('debts'), Rates: t('rates'), Reports: t('reports'), Reconciliation: t('reconciliation'), 'Team & Devices': t('teamDevices'), Settings: t('settings') }[section] ?? section)

  useEffect(() => {
    document.documentElement.dir = isRtl(language) ? 'rtl' : 'ltr'
    document.documentElement.lang = language
    window.localStorage.setItem('sarafi-language', language)
    const updateConnection = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateConnection)
    window.addEventListener('offline', updateConnection)
    return () => { window.removeEventListener('online', updateConnection); window.removeEventListener('offline', updateConnection) }
  }, [language])

  useEffect(() => {
    if (language === 'en') return
    const localized = (key: Parameters<typeof translate>[1]) => translate(language, key)
    const replacements: Record<string, string> = {
      'Recent activity': localized('recentActivity'), 'Every movement, recorded and traceable': localized('traceable'), 'Live balances from journal lines': localized('journalBalances'), 'Where your money is': localized('whereMoney'), 'Needs attention': localized('needsAttention'), 'Live review queue': localized('liveReviewQueue'), 'Reconciliation difference': localized('reconciliation'), 'Net result AFN': `${localized('netPosition')} AFN`, 'Ledger-derived AFN equivalent': localized('ledgerDerivedAfn'), 'Awaiting live ledger data': localized('awaitingLiveLedger'), 'Ledger lines available': localized('journalBalances'), 'OWNER CONTROL': localized('administration'), 'Currency first': localized('currency'), 'Location first': localized('location'), 'Print snapshot': localized('printReport'), 'Customer or counterparty': localized('customer'), 'Counterparty': localized('customer'), 'Direction': localized('direction'), 'Transaction history': localized('transactions'), Rates: localized('rates'), Reports: localized('reports'), Debts: localized('debts'), Settings: localized('settings'), 'Loading your business workspace...': localized('awaitingLiveLedger'), 'Financial posting is unavailable until connection is restored.': localized('offlineMode'), 'Post operation': localized('postOperation'), 'Export CSV': localized('exportCsv'), 'Export PDF': localized('exportPdf'), 'Help & support': localized('helpSupport'), 'Close help': localized('closeHelp'), 'Close trade': localized('closeTrade'), 'Close operation': localized('closeOperation'), 'Close settlement': localized('closeSettlement'),
    }
    const replaceText = (node: Text) => {
      const replacement = replacements[node.nodeValue?.trim() ?? '']
      if (replacement && node.nodeValue) node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), replacement)
    }
    let observer: MutationObserver | null = null
    const scan = () => {
      observer?.disconnect()
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let node: Node | null
      while ((node = walker.nextNode())) replaceText(node as Text)
      document.querySelectorAll<HTMLElement>('[aria-label], [placeholder]').forEach((element) => {
        for (const attribute of ['aria-label', 'placeholder']) {
          const value = element.getAttribute(attribute)
          if (value && replacements[value]) element.setAttribute(attribute, replacements[value])
        }
      })
      observer?.observe(document.body, { childList: true, subtree: true })
    }
    observer = new MutationObserver(scan)
    observer.observe(document.body, { childList: true, subtree: true })
    scan()
    return () => observer.disconnect()
  }, [language])

  useEffect(() => {
    if (inspectionMode) return
    const client = getSupabaseClient()
    if (!client) return
    void client.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const listener = client.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => listener.data.subscription.unsubscribe()
  }, [inspectionMode])

  useEffect(() => {
    if (inspectionMode || !user) return
    const client = getSupabaseClient()
    if (!client) return
    void client.from('organization_memberships').select('organization_id,role_code').eq('user_id', user.id).eq('active', true).limit(1).maybeSingle().then(async ({ data }) => {
      setOrganizationId(data?.organization_id ?? null)
      if (data?.role_code && ['owner', 'manager', 'accountant', 'cashier', 'compliance_officer', 'viewer'].includes(data.role_code)) setWorkspaceRole(data.role_code as WorkspaceRole)
      if (!data?.organization_id) { setOrganizationLoading(false); return }
      const organization = await client.from('organizations').select('display_name').eq('id', data.organization_id).maybeSingle()
      setOrganizationName(organization.data?.display_name ?? 'Your business')
      setOrganizationLoading(false)
    })
  }, [inspectionMode, user])

  useEffect(() => {
    if (inspectionMode) return
    if (!organizationId) return
    const client = getSupabaseClient()
    if (!client) return
    void client.from('branches').select('id,name').eq('organization_id', organizationId).eq('active', true).order('created_at', { ascending: true }).limit(1).maybeSingle().then(({ data: branch }) => {
      setBranchId(branch?.id ?? null)
      setBranchName(branch?.name ?? 'Assigned branch')
      if (!branch) return
      void client.from('cashboxes').select('id').eq('organization_id', organizationId).eq('branch_id', branch.id).eq('active', true).order('created_at', { ascending: true }).limit(1).maybeSingle().then(({ data: cashbox }) => setCashboxId(cashbox?.id ?? null))
    })
  }, [inspectionMode, organizationId])

  useEffect(() => {
    if (inspectionMode) return
    if (!organizationId) return
    void getOwnerDashboard(organizationId, dashboardDate).then((result) => {
      if (result.error) { setDashboardError(result.error); setToast(`Dashboard not loaded: ${result.error}`); return }
      setDashboardError('')
      setDashboard(result.data)
      setTrades((result.data?.activity ?? []).map((item) => ({ id: item.id, customer: item.reference, direction: item.type, amount: 'Recorded', rate: '-', time: new Date(item.occurred_at).toLocaleTimeString(), status: item.status })))
    })
  }, [dashboardDate, dashboardRefresh, inspectionMode, organizationId])

  useEffect(() => {
    if (inspectionMode || !organizationId) return
    void getCurrentRates(organizationId, branchId ?? undefined).then((result) => {
      if (result.error) { setToast(`Rates not loaded: ${result.error}`); return }
      const current = result.data?.[0]
      if (current) { setRateState(current.buy_rate); setSellRate(current.sell_rate) }
    })
  }, [branchId, inspectionMode, organizationId])

  const submitAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthBusy(true)
    setAuthMessage('')
    const result = authMode === 'signIn' ? await signInWithPassword(authEmail, authPassword) : authMode === 'signUp' ? await signUpWithPassword(authEmail, authPassword) : { user: null, error: await sendPasswordReset(authEmail, window.location.origin) }
    setAuthBusy(false)
    if (result.user) setUser(result.user)
    setAuthMessage(result.error ?? (authMode === 'reset' ? t('passwordResetRequested') : authMode === 'signUp' ? t('verificationEmail') : t('signedIn')))
  }

  const submitOnboarding = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setOrganizationLoading(true)
    const result = await createBusiness({ display_name: businessName, language, base_currency_code: 'AFN', currencies: onboardingCurrencies, branch_name: 'Main Branch', cashbox_name: onboardingCashboxName })
    setOrganizationLoading(false)
    if (result.error) { setToast(`Business not created: ${result.error}`); return }
    setOrganizationId(result.organizationId)
  }

  const addTrade = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!online) { setToast('Offline: financial posting is unavailable until connection is restored'); return }
    if (tradeBusy) return
    if (!amount || !new Decimal(amount).isFinite() || new Decimal(amount).lte(0)) { setToast('Trade not posted: enter an amount greater than zero'); return }
    if (!organizationId || !branchId || !cashboxId) { setToast('Trade not posted: complete business setup first'); return }
    setTradeBusy(true)
    let sessionCheck
    try {
      const soldCurrency = tradeSide === 'BUY_FX' ? 'AFN' : tradeCurrency
      const boughtCurrency = tradeSide === 'BUY_FX' ? tradeCurrency : tradeSide === 'EXCHANGE_FX' ? tradeReceiveCurrency : 'AFN'
      const pricing = deriveTradeAmounts(tradeSide, amount, rate, sellRate)
      const { rate: effectiveRate, boughtAmount, soldBaseValue, boughtBaseValue } = pricing
      sessionCheck = await postFxTrade({ organization_id: organizationId, branch_id: branchId, cashbox_id: cashboxId, client_command_id: crypto.randomUUID(), side: tradeSide, sold_currency: soldCurrency, sold_amount: amount, bought_currency: boughtCurrency, bought_amount: boughtAmount, base_currency: 'AFN', sold_base_value: soldBaseValue, bought_base_value: boughtBaseValue, customer_rate: effectiveRate, fee_amount: tradeFee || undefined, fee_currency: 'AFN', counterparty_id: tradeCounterparty || undefined, memo: tradeNote || undefined })
    } catch (error) {
      setToast(`Trade not posted: ${error instanceof Error ? error.message : 'Invalid trade command'}`)
      setTradeBusy(false)
      return
    }
    if (sessionCheck.error) { setToast(`Trade not posted: ${sessionCheck.error}`); setTradeBusy(false); return }
    setDashboardRefresh((value) => value + 1)
    setAmount('')
    setTradeFee('')
    setTradeNote('')
    setTradeCounterparty('')
    setTradeBusy(false)
    setShowTrade(false)
    setToast('Trade posted to Supabase')
    window.setTimeout(() => setToast(''), 2800)
  }

  const exportActivity = async () => {
    if (!organizationId) { setToast('Export unavailable: no authenticated organization'); return }
    const authorization = await recordReportExport({ organization_id: organizationId, report_name: 'Recent Activity', format: 'csv', filters: { scope: 'loaded_activity' } })
    if (authorization.error) { setToast(`Export not authorized: ${authorization.error}`); return }
    const csv = buildCsvReport(trades.map((trade) => ({ entryId: `trade_${trade.id}`, occurredAt: trade.time, type: trade.direction, branchId: 'Kabul Central', status: trade.status.toLowerCase(), realizedProfit: '0' })), 'Kabul Central Exchange', 'Recent Activity', new Date().toISOString())
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    link.download = 'sarafi-recent-activity.csv'
    link.click()
    URL.revokeObjectURL(link.href)
    setToast('CSV export generated')
  }

  const openOperation = (kind: OperationKind) => {
    setOperationKind(kind)
    setOperationAmount('')
    setOperationMemo('')
    setOperationCategory('Other')
    setOperationFromLocation('Main Counter')
    setOperationToLocation('Main Safe')
    setShowActions(false)
  }

  const submitOperation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!online) { setToast('Offline: financial posting is unavailable until connection is restored'); return }
    if (!operationKind || !organizationId) return
    if (!branchId) { setToast('Operation not posted: no active branch is available'); return }
    const result = await recordOperation({ organization_id: organizationId, branch_id: branchId, operation: operationKind, currency: operationCurrency, amount: operationAmount, location: operationLocation, from_location: operationFromLocation, to_location: operationToLocation, category: operationCategory, memo: operationMemo, client_command_id: crypto.randomUUID() })
    if (result.error) { setToast(`Operation not posted: ${result.error}`); return }
    setOperationKind(null)
    setDashboardRefresh((value) => value + 1)
    setToast('Operation posted to Supabase')
  }

  const openSection = (section: string) => {
    setActiveNav(section)
    setShowActions(false)
    setShowMoreNavigation(false)
    setShowBranchMenu(false)
  }

  const handleSignOut = async () => {
    const error = await signOut()
    if (error) { setToast(`Sign out failed: ${error}`); return }
    setUser(null)
    setOrganizationId(null)
    setBranchId(null)
    setCashboxId(null)
  }

  const submitOpeningBalance = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!online) { setToast('Offline: financial posting is unavailable until connection is restored'); return }
    if (!organizationId || !branchId || !cashboxId) { setToast('Opening balance not posted: an authenticated cashbox is required'); return }
    const result = await recordOpeningBalance({ organization_id: organizationId, branch_id: branchId, cashbox_id: cashboxId, currency: openingCurrency, amount: openingAmount, base_value: openingBaseValue, client_command_id: crypto.randomUUID() })
    if (result.error) { setToast(`Opening balance not posted: ${result.error}`); return }
    setShowOpeningBalance(false)
    setOpeningAmount('')
    setOpeningBaseValue('')
    setDashboardRefresh((value) => value + 1)
    setToast('Opening balance posted to Supabase')
  }

  const dashboardView = activeNav === 'Dashboard' || activeNav === 'Trade'
  const ownerNavigation = workspaceRole === 'owner' || workspaceRole === 'manager' || workspaceRole === 'accountant'
  const roleLabel = ({ owner: 'Owner', manager: 'Manager', accountant: 'Accountant', cashier: 'Cashier', compliance_officer: 'Compliance', viewer: 'Viewer' } satisfies Record<WorkspaceRole, string>)[workspaceRole]

  if (!user && !inspectionMode) return <AuthScreen language={language} onLanguageChange={setLanguage} mode={authMode} email={authEmail} password={authPassword} message={authMessage} busy={authBusy} onModeChange={setAuthMode} onEmailChange={setAuthEmail} onPasswordChange={setAuthPassword} onSubmit={submitAuth} />
  if (organizationLoading) return <main className="auth-shell"><section className="auth-card"><div className="brand auth-brand"><span className="brand-mark">S</span><span>SARAFI<small>Exchange OS</small></span></div><p className="auth-subtitle">Loading your business workspace...</p></section></main>
  if (!organizationId) return <OnboardingScreen language={language} businessName={businessName} currencies={onboardingCurrencies} cashboxName={onboardingCashboxName} busy={organizationLoading} onLanguageChange={setLanguage} onBusinessNameChange={setBusinessName} onCurrenciesChange={setOnboardingCurrencies} onCashboxNameChange={setOnboardingCashboxName} onSubmit={submitOnboarding} />

  return (
    <div className={`app-shell ${isRtl(language) ? 'rtl' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><span>SARAFI<small>Exchange OS</small></span></div>
        <button className="branch-switch" onClick={() => setShowBranchMenu(!showBranchMenu)} aria-expanded={showBranchMenu}><span className="status-dot" /><span><b>{organizationName}</b><small>{branchName}</small></span><span className="chevron">⌄</span></button>
        {showBranchMenu && <div className="action-menu branch-menu"><button onClick={() => { setShowBranchMenu(false); setToast(`${branchName} is the active branch`) }}>{branchName} <small>Active branch</small><span>✓</span></button></div>}
        <p className="nav-label">{t('workspace')}</p>
        <nav>{([['Dashboard', t('home'), '◫'], ['Trade', t('newTransaction'), '+'], ['Cash & Accounts', t('myMoney'), '▣'], ['People', t('customersDebts'), '♙'], ['Transactions', t('transactions'), '≡']] as const).map(([item, label, icon]) => <button className={activeNav === item ? 'nav-item active' : 'nav-item'} key={item} onClick={() => { openSection(item); if (item === 'Trade') setShowTrade(true) }}><span className="nav-icon">{icon}</span>{label}{item === 'Transactions' && <em>{dashboard?.transaction_count ?? '—'}</em>}</button>)}<button className={showMoreNavigation || ['Debts', 'Rates', 'Reports', 'Reconciliation', 'Import', 'Offline', 'Hawala', 'Team & Devices', 'Settings', 'Compliance'].includes(activeNav) ? 'nav-item active' : 'nav-item'} onClick={() => setShowMoreNavigation(!showMoreNavigation)} aria-expanded={showMoreNavigation}><span className="nav-icon">...</span>{t('more')}<span className="chevron">⌄</span></button>{showMoreNavigation && <div className="action-menu navigation-menu">{(['Debts', 'Rates', 'Reports', 'Reconciliation', 'Import', 'Offline', 'Hawala'] as const).filter((item) => ownerNavigation || ['Offline', 'Import'].includes(item)).map((item) => { const labels = { Debts: t('debts'), Rates: t('rates'), Reports: t('reports'), Reconciliation: t('reconciliation'), Import: 'Import', Offline: 'Offline', Hawala: t('hawala') }; return <button key={item} onClick={() => openSection(item)}>{labels[item]}<span>→</span></button> })}{(workspaceRole === 'owner' || workspaceRole === 'compliance_officer') && <button onClick={() => openSection('Compliance')}>Compliance<span>→</span></button>}</div>}</nav>
        <p className="nav-label bottom-label">{t('administration')}</p>
        <nav>{ownerNavigation && <><button className={activeNav === 'Team & Devices' ? 'nav-item active' : 'nav-item'} onClick={() => openSection('Team & Devices')}><span className="nav-icon">◉</span>{t('teamDevices')}</button><button className={activeNav === 'Settings' ? 'nav-item active' : 'nav-item'} onClick={() => openSection('Settings')}><span className="nav-icon">⚙</span>{t('settings')}</button></>}</nav>
        <div className="sidebar-footer"><div className="avatar">{inspectionMode ? 'AI' : (user?.email?.slice(0, 2).toUpperCase() ?? 'MA')}</div><span><b>{user?.email ?? t('readOnlyInspection')}</b><small>{inspectionMode ? `${roleLabel} · ${t('publicPreview')}` : roleLabel}</small></span>{!inspectionMode && <button aria-label="Sign out" onClick={() => void handleSignOut()}>↪</button>}</div>
      </aside>
      <nav className="mobile-nav" aria-label={t('workspace')}>
        {([['Dashboard', t('home'), '◫'], ['Trade', t('newTransaction'), '+'], ['Cash & Accounts', t('myMoney'), '▣'], ['People', t('customersDebts'), '♙'], ['Transactions', t('transactions'), '≡']] as const).map(([item, label, icon]) => <button className={activeNav === item ? 'active' : ''} key={item} onClick={() => { openSection(item); if (item === 'Trade') setShowTrade(true) }}><span>{icon}</span>{label}</button>)}
      </nav>
      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>{t('workspace')}</span><b>/</b><strong>{sectionLabel(activeNav)}</strong></div><div className="top-actions"><button className="icon-button" onClick={() => setPrivacy(!privacy)} aria-label={privacy ? 'Show amounts' : 'Hide amounts'}>{privacy ? '◉' : '◌'}</button><button className="lang-button" onClick={() => setLanguage(language === 'en' ? 'fa-AF' : language === 'fa-AF' ? 'ps-AF' : 'en')} aria-label="Change language">{language === 'en' ? 'EN' : language === 'fa-AF' ? 'دری' : 'PS'} <span>⌄</span></button><button className="help-button" onClick={() => setShowHelp(true)} aria-label="Open help">?</button></div></header>
        <div className="content-wrap">
          {!dashboardView && <WorkspaceView section={activeNav} trades={trades} organizationId={organizationId} userId={user?.id ?? 'inspection-user'} deviceId={browserDeviceId} branchId={branchId} cashboxId={cashboxId} onDashboard={() => openSection('Dashboard')} onToast={setToast} />}
          {dashboardView && <>
          <section className="welcome"><div><p className="kicker">MONDAY, 24 AUGUST 2026 · 10:45 AM</p><h1>{user ? `${t('goodMorning').split(',')[0]}, ${user.email?.split('@')[0] ?? 'there'}.` : t('goodMorning')}</h1><p className="subtitle">{t('businessStand')}</p></div><div className="action-wrap"><div className="primary-actions" aria-label="Core cashier actions"><button disabled={!online} className="primary-action" onClick={() => { setTradeSide('BUY_FX'); setShowTrade(true) }}>{t('buy')}</button><button disabled={!online} className="primary-action" onClick={() => { setTradeSide('SELL_FX'); setShowTrade(true) }}>{t('sell')}</button><button disabled={!online} className="primary-action" onClick={() => { setTradeSide('EXCHANGE_FX'); setShowTrade(true) }}>{t('exchange')}</button><button disabled={!online} className="primary-action" onClick={() => openOperation('RECEIVE_MONEY')}>{t('receive')}</button><button disabled={!online} className="primary-action" onClick={() => openOperation('PAY_MONEY')}>{t('pay')}</button></div><button className="secondary-action" onClick={() => setShowActions(!showActions)} aria-expanded={showActions}>{t('moreActions')} <span>⌄</span></button>{showActions && <div className="action-menu">{(['Transfer cash', 'Expense', 'Owner capital', 'Bank movement'] as const).map((action) => { const kinds: Record<typeof action, OperationKind> = { 'Transfer cash': 'TRANSFER_CASH', Expense: 'RECORD_EXPENSE', 'Owner capital': 'OWNER_INVESTMENT', 'Bank movement': 'BANK_DEPOSIT' }; const labels: Record<typeof action, string> = { 'Transfer cash': t('transfer'), Expense: t('expense'), 'Owner capital': t('ownerCapital'), 'Bank movement': t('bankMovement') }; return <button disabled={!online} key={action} onClick={() => openOperation(kinds[action])}>{labels[action]}<span>→</span></button> })}<button onClick={() => openSection('Debts')}>{t('debtCredit')} <span>→</span></button><button onClick={() => openSection('Hawala')}>{t('hawala')} <span>→</span></button><button disabled={!online} onClick={() => { setShowActions(false); setShowOpeningBalance(true) }}>Opening balance <span>→</span></button></div>}</div></section>
          <div className="notice"><span className={`sync-dot ${online ? 'online' : 'offline'}`} /><span><b>{online ? t('online') : t('stillOffline')}</b> · {supabaseConfigured ? t('supabaseLoaded') : t('localWorkspace')} · {online ? `${t('lastSync')}: ${t('justNow')}` : `${t('pendingSync')}: 0`}</span><button onClick={() => setToast(online ? t('connected') : t('offlineMode'))}>{online ? t('connected') : t('offlineMode')}</button></div>
          {dashboardError && <div className="notice error" role="alert">Dashboard unavailable: {dashboardError}<button onClick={() => setDashboardRefresh((value) => value + 1)}>Retry</button></div>}
          <section className="rate-strip"><div className="rate-title"><span className="rate-live" /> <div><b>{t('rates')}</b><small>{t('retailRateContext')}</small></div></div><label>{t('buy')}<input aria-label="Live buy rate" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="Live rate" /></label><label>{t('sell')}<input aria-label="Live sell rate" value={sellRate} readOnly placeholder="Live rate" /></label><div className="calculator"><input aria-label="Rate calculator input" value={calculatorAmount} onChange={(event) => setCalculatorAmount(event.target.value)} /><span aria-label="Calculator source currency">USD</span><b>=</b><strong>{rate ? calculateCounterAmount(calculatorAmount || '0', rate, 'AFN_PER_UNIT', 2) : '—'}</strong><span aria-label="Calculator target currency">AFN</span></div><label>Business date<input aria-label="Business date" type="date" value={dashboardDate} onChange={(event) => setDashboardDate(event.target.value)} /></label><button className="text-button" onClick={() => openSection('Rates')}>{t('history')} →</button></section>
          <section className="metric-grid"><article className="metric-card hero-metric"><div className="card-head"><span>{t('netPosition')} AFN</span><button aria-label={privacy ? 'Show amounts' : 'Hide amounts'} onClick={() => setPrivacy(!privacy)}>◌</button></div><strong>{hidden || dashboard?.net_position_base || '—'}</strong><div className="metric-foot"><span>{t('ledgerDerivedAfn')}</span></div><div className="sparkline">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div></article><article className="metric-card"><div className="card-head"><span>{t('todayVolume')}</span><span className="card-symbol">↗</span></div><strong>{hidden || dashboard?.volume_base || '—'}</strong><div className="metric-foot"><span>{dashboard ? `${dashboard.transaction_count} ${t('posted')}` : t('awaitingLiveLedger')}</span></div></article><article className="metric-card"><div className="card-head"><span>{t('realizedProfit')}</span><span className="card-symbol profit">✦</span></div><strong className="profit-text">{hidden || dashboard?.realized_profit || '—'}</strong><div className="metric-foot"><span>{t('ledgerDerivedAfn')}</span></div></article><article className="metric-card"><div className="card-head"><span>{t('commissionIncome')}</span><span className="card-symbol profit">✦</span></div><strong className="profit-text">{hidden || dashboard?.commission_income || '—'}</strong><div className="metric-foot"><span>{t('ledgerDerivedAfn')}</span></div></article><article className="metric-card"><div className="card-head"><span>{t('operatingExpenses')}</span><span className="card-symbol">↘</span></div><strong>{hidden || dashboard?.expenses || '—'}</strong><div className="metric-foot"><span>{t('ledgerDerivedAfn')}</span></div></article></section>
          <section className="live-business"><div><span className="live-pulse" /> <b>{t('liveBusiness')}</b><small>{dashboard ? `Fresh ${new Date(dashboard.fresh_at).toLocaleTimeString()}` : t('awaitingLiveLedger')}</small></div><div><strong>{dashboard?.pending_approvals ?? '—'}</strong><small>{t('pending')}</small></div><div><strong>{dashboard?.reconciliation_differences ?? '—'}</strong><small>{t('reconciliation')}</small></div><div><strong>{dashboard?.net_result ?? '—'}</strong><small>{t('netPosition')} AFN</small></div><button onClick={() => setDashboardRefresh((value) => value + 1)}>{t('refreshLiveView')} →</button></section>
          <section className="dashboard-grid"><article className="panel balances"><div className="panel-header"><div><h2>{t('whereMoney')}</h2><p>{t('journalBalances')}</p></div><button className="text-button" onClick={() => openSection('Cash & Accounts')}>{t('viewAll')} -&gt;</button></div>{dashboard?.locations.length ? <div className="balance-list">{dashboard.locations.slice(0, 6).map((location) => <div className="balance-row" key={`${location.location}-${location.currency}`}><span className="currency-badge usd">{location.currency}</span><span className="balance-name"><b>{location.location}</b><small>{t('assetLocation')}</small></span><strong>{hidden || location.quantity}</strong></div>)}</div> : <div className="empty-live">{t('awaitingLiveLedger')}</div>}</article><article className="panel attention"><div className="panel-header"><div><h2>{t('needsAttention')}</h2><p>{t('liveReviewQueue')}</p></div><span className="attention-count">{dashboard?.pending_approvals ?? '—'}</span></div><div className="empty-live">{dashboard ? `${dashboard.pending_approvals} ${t('pending')}` : t('loadingReviewQueue')}</div></article></section>
          <section className="panel activity"><div className="panel-header"><div><h2>Recent activity</h2><p>Every movement, recorded and traceable</p></div><div className="activity-actions"><button className="filter-button" onClick={() => setActivityFilter(activityFilter === 'Today' ? 'All time' : 'Today')}>{activityFilter} <span>⌄</span></button><button className="export-button" onClick={() => void exportActivity()}>Export CSV</button></div></div><div className="table-wrap"><table><thead><tr><th>Transaction</th><th>Direction</th><th>Amount</th><th>Time</th><th>Status</th><th /></tr></thead><tbody>{trades.map((trade) => <tr key={trade.id}><td><span className="transaction-icon">↕</span><span className="table-person"><b>{trade.customer}</b><small>Trade #{String(trade.id).padStart(5, '0')}</small></span></td><td>{trade.direction}</td><td><b>{privacy ? '••••' : trade.amount}</b><small>@ {trade.rate}</small></td><td>{trade.time}</td><td><span className={`status ${trade.status.toLowerCase()}`}>{trade.status}</span></td><td><button className="more" onClick={() => setToast(`Details for trade #${String(trade.id).padStart(5, '0')} are available after live sync`)} aria-label={`View trade ${trade.id} details`}>•••</button></td></tr>)}</tbody></table></div></section>
          </>}
        </div>
      </main>
      {showTrade && <div className="modal-backdrop" onClick={() => { if (!tradeBusy) setShowTrade(false) }}><form className="trade-modal" onSubmit={addTrade} onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="kicker">{t('newTransaction')}</p><h2>{tradeSide === 'BUY_FX' ? t('buy') : tradeSide === 'SELL_FX' ? t('sell') : t('exchange')} · {t('recordTrade')}</h2></div><button type="button" className="close" onClick={() => setShowTrade(false)} aria-label={t('closeTrade')}>×</button></div><label>{t('customer')}<select value={tradeCounterparty} onChange={(event) => setTradeCounterparty(event.target.value)}><option value="">{language === 'en' ? 'Walk-in customer' : language === 'fa-AF' ? 'مشتری گذری' : 'تېرېدونکی پېرودونکی'}</option></select></label><div className="form-grid"><label>{t('sellAmount')}<input required min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" autoFocus /><select value={tradeSide === 'BUY_FX' ? 'AFN' : tradeCurrency} onChange={(event) => setTradeCurrency(event.target.value as typeof tradeCurrency)}><option>AFN</option><option>USD</option><option>EUR</option></select></label><label>{t('buyAmount')}<input value={amount ? (tradeSide === 'BUY_FX' ? new Decimal(amount).div(rate || '1') : new Decimal(amount).mul(rate || '0')).toFixed(2) : ''} readOnly placeholder="0.00" /><select value={tradeSide === 'BUY_FX' ? tradeCurrency : tradeSide === 'EXCHANGE_FX' ? tradeReceiveCurrency : 'AFN'} onChange={(event) => setTradeReceiveCurrency(event.target.value as typeof tradeReceiveCurrency)}><option>AFN</option><option>USD</option><option>EUR</option></select></label></div><div className="form-grid"><label>{t('fee')}<input min="0" step="0.01" value={tradeFee} onChange={(event) => setTradeFee(event.target.value)} placeholder="0.00" /></label><label>{t('note')}<input value={tradeNote} onChange={(event) => setTradeNote(event.target.value)} placeholder={language === 'en' ? 'Optional note' : language === 'fa-AF' ? 'یادداشت اختیاری' : 'اختیاري یادښت'} /></label></div><div className="rate-box"><span>{t('exchangeRate')}</span><b>1 {tradeSide === 'BUY_FX' ? tradeCurrency : tradeCurrency} = {rate} {tradeSide === 'EXCHANGE_FX' ? tradeReceiveCurrency : 'AFN'}</b><span className="positive">{t('marketRate')}</span></div><button className="primary-action full" type="submit" disabled={tradeBusy || (tradeSide === 'EXCHANGE_FX' && tradeCurrency === tradeReceiveCurrency)}>{tradeBusy ? t('working') : t('postTrade')} <span>→</span></button><p className="modal-note">{language === 'en' ? 'SARAFI checks the pair, rate, available money, permission, and duplicate submission before posting.' : language === 'fa-AF' ? 'سرافی قبل از ثبت، اسعار، نرخ، موجودی پول، اجازه و ثبت تکراری را بررسی می‌کند.' : 'سرافي د ثبتولو مخکې اسعار، نرخ، شته پیسې، اجازه او تکراري ثبتول ګوري.'}</p></form></div>}
      {operationKind && <div className="modal-backdrop" onClick={() => setOperationKind(null)}><form className="trade-modal" onSubmit={submitOperation} onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="kicker">LEDGER OPERATION</p><h2>{operationKind.replaceAll('_', ' ')}</h2></div><button type="button" className="close" onClick={() => setOperationKind(null)} aria-label="Close operation">×</button></div><label>Amount<input required min="0.01" step="0.01" inputMode="decimal" value={operationAmount} onChange={(event) => setOperationAmount(event.target.value)} placeholder="0.00" autoFocus /></label><label>Currency<select value={operationCurrency} onChange={(event) => setOperationCurrency(event.target.value)}><option>AFN</option><option>USD</option><option>EUR</option></select></label>{operationKind === 'RECORD_EXPENSE' && <label>Expense category<select value={operationCategory} onChange={(event) => setOperationCategory(event.target.value)}><option>Rent</option><option>Salary</option><option>Utilities</option><option>Internet</option><option>Transport</option><option>Other</option></select></label>}{operationKind === 'TRANSFER_CASH' || operationKind === 'BANK_DEPOSIT' || operationKind === 'BANK_WITHDRAWAL' ? <div className="form-grid"><label>From location<input required value={operationFromLocation} onChange={(event) => setOperationFromLocation(event.target.value)} /></label><label>To location<input required value={operationToLocation} onChange={(event) => setOperationToLocation(event.target.value)} /></label></div> : <label>Location<input required value={operationLocation} onChange={(event) => setOperationLocation(event.target.value)} /></label>}<label>Note<input value={operationMemo} onChange={(event) => setOperationMemo(event.target.value)} placeholder="Reason or reference" /></label><button className="primary-action full" type="submit">Post operation <span>→</span></button><p className="modal-note">The server validates authorization, tenant scope, and ledger posting before accepting this operation.</p></form></div>}
      {showHelp && <div className="modal-backdrop" onClick={() => setShowHelp(false)}><section className="trade-modal" role="dialog" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="kicker">SARAFI SUPPORT</p><h2 id="help-title">Help & support</h2></div><button type="button" className="close" onClick={() => setShowHelp(false)} aria-label="Close help">×</button></div><p className="modal-note">Use the sidebar to move between workspace sections. This public preview is read-only; posting requires an authenticated Supabase session.</p><button className="primary-action full" onClick={() => setShowHelp(false)}>Close help</button></section></div>}
      {showOpeningBalance && <div className="modal-backdrop" onClick={() => setShowOpeningBalance(false)}><form className="trade-modal" onSubmit={submitOpeningBalance} onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="kicker">OPENING BALANCE</p><h2>Record opening money</h2></div><button type="button" className="close" onClick={() => setShowOpeningBalance(false)} aria-label="Close opening balance">×</button></div><label>Currency<select value={openingCurrency} onChange={(event) => setOpeningCurrency(event.target.value)}><option>AFN</option><option>USD</option><option>EUR</option></select></label><div className="form-grid"><label>Native amount<input required min="0.01" step="0.01" value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} placeholder="0.00" /></label><label>Base value<input required min="0.01" step="0.01" value={openingBaseValue} onChange={(event) => setOpeningBaseValue(event.target.value)} placeholder="0.00" /></label></div><button className="primary-action full" type="submit">Post opening balance <span>→</span></button><p className="modal-note">Opening money posts to owner capital and remains in the immutable ledger.</p></form></div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function WorkspaceView({ section, trades, organizationId, userId, deviceId, branchId, cashboxId, onDashboard, onToast }: { section: string; trades: Trade[]; organizationId: string | null; userId: string; deviceId: string; branchId: string | null; cashboxId: string | null; onDashboard: () => void; onToast: (message: string) => void }) {
  if (section === 'Transactions') return <TransactionsView organizationId={organizationId} onDashboard={onDashboard} onToast={onToast} />
  if (section === 'Cash & Accounts') return <MoneyLocationView organizationId={organizationId} onDashboard={onDashboard} onToast={onToast} />
  if (section === 'People') return <PeopleView organizationId={organizationId} onDashboard={onDashboard} onToast={onToast} />
  if (section === 'Rates') return <RatesView organizationId={organizationId} onDashboard={onDashboard} />
  if (section === 'Reports') return <ReportsView trades={trades} organizationId={organizationId} onDashboard={onDashboard} onToast={onToast} />
  if (section === 'Team & Devices') return <TeamDevicesView organizationId={organizationId} onDashboard={onDashboard} onToast={onToast} />
  if (section === 'Debts') return <DebtsView organizationId={organizationId} branchId={branchId} onDashboard={onDashboard} onToast={onToast} />
  if (section === 'Reconciliation') return <ReconciliationView organizationId={organizationId} branchId={branchId} cashboxId={cashboxId} onDashboard={onDashboard} onToast={onToast} />
  if (section === 'Hawala') return <HawalaView organizationId={organizationId} branchId={branchId} onDashboard={onDashboard} onToast={onToast} />
  if (section === 'Offline') return <OfflineView organizationId={organizationId} userId={userId} deviceId={deviceId} cashboxId={cashboxId ?? 'inspection-cashbox'} onDashboard={onDashboard} />
  if (section === 'Import') return <ImportWorkspace organizationId={organizationId} onBack={onDashboard} onToast={onToast} />
  const descriptions: Record<string, string> = {
    Transactions: 'Review posted ledger activity and transaction history.',
    'Cash & Accounts': 'Review balances, branches, cashboxes, and money locations.',
    People: 'Manage customers and counterparties for future transactions.',
    Debts: 'Review outstanding debt and credit records.',
    Rates: 'Review market rates and branch pricing history.',
    Reports: 'Export and review operational and financial reports.',
    'Team & Devices': 'Manage team access and registered devices.',
    Settings: 'Configure language, currencies, and organization preferences.',
  }
  return <section className="panel"><div className="panel-header"><div><p className="kicker">WORKSPACE</p><h1>{section}</h1><p>{descriptions[section] ?? 'Workspace section'}</p></div></div><div className="empty-live"><p>This section is available in the workspace navigation.</p><button className="primary-action" onClick={onDashboard}>Back to dashboard <span>→</span></button></div></section>
}

function OfflineView({ organizationId, userId, deviceId, cashboxId, onDashboard }: { organizationId: string | null; userId: string; deviceId: string; cashboxId: string; onDashboard: () => void }) {
  const [drafts, setDrafts] = useState<ReturnType<OfflineDraftBook['all']>>([])
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [kind, setKind] = useState<'BUY_FX' | 'SELL_FX'>('BUY_FX')
  const [message, setMessage] = useState('')
  const [draftBook] = useState(() => new OfflineDraftBook({ tenantId: organizationId ?? 'unknown', userId, deviceId, cashboxId, maxAmountBase: '100000', allowKinds: ['BUY_FX', 'SELL_FX'] }, indexedDbOfflineStore))
  useEffect(() => { void draftBook.hydrate().then(() => setDrafts(draftBook.all())).catch((error) => setMessage(error instanceof Error ? `Draft storage unavailable: ${error.message}` : 'Draft storage unavailable')) }, [draftBook])
  const saveDraft = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); try { const draft = draftBook.saveDraft({ tenantId: organizationId ?? 'unknown', userId, deviceId, cashboxId, amount, currency, kind }); await draftBook.persistDraft(draft); setDrafts(draftBook.all()); setAmount(''); setMessage(`Draft ${draft.draftId} saved. It is not posted and will not auto-submit.`) } catch (error) { setMessage(error instanceof Error ? error.message : 'Draft rejected') } }
  return <section className="panel"><div className="panel-header"><div><p className="kicker">SAFE DEGRADED MODE</p><h1>Offline drafts</h1><p>Financial posting is unavailable until connection is restored. Last synchronized: not available in degraded mode.</p></div><button className="text-button" onClick={onDashboard}>Back to dashboard →</button></div><div className="notice"><span className="sync-dot offline" /><span><b>OFFLINE</b> · Financial posting is unavailable until connection is restored.</span></div><form className="trade-modal" onSubmit={saveDraft}><div className="form-grid"><label>Operation<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="BUY_FX">Buy FX</option><option value="SELL_FX">Sell FX</option></select></label><label>Currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option>USD</option><option>EUR</option><option>AFN</option></select></label></div><label>Amount<input required min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label><button className="primary-action full" type="submit">Save as Draft <span>→</span></button></form>{message && <p role="status" className="empty-live">{message}</p>}<div className="balance-list">{drafts.length ? drafts.map((draft) => <div className="balance-row" key={draft.draftId}><span className="currency-badge usd">{draft.currency}</span><span className="balance-name"><b>DRAFT — NOT POSTED · {draft.kind.replace('_FX', ' FX')}</b><small>{draft.draftId} · sequence {draft.localSequence} · {draft.status}</small></span><strong>{draft.amount}</strong></div>) : <div className="empty-live">No offline drafts are stored for this identity.</div>}</div><div className="empty-live">Connection restored. Review current rates, balances, authorization, and limits before intentional online posting. Drafts never auto-submit.</div></section>
}

function TeamDevicesView({ organizationId, onDashboard, onToast }: { organizationId: string | null; onDashboard: () => void; onToast: (message: string) => void }) {
  const [members, setMembers] = useState<TeamMemberRecord[]>([])
  const [devices, setDevices] = useState<DeviceRecord[]>([])
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([])
  useEffect(() => { if (organizationId) void getTeamControlPlane(organizationId).then((result) => { if (result.data) { setMembers(result.data.members); setDevices(result.data.devices); setApprovals(result.data.approvals) }; if (result.error) onToast(`Control plane not loaded: ${result.error}`) }) }, [onToast, organizationId])
  return <section className="panel"><div className="panel-header"><div><p className="kicker">OWNER CONTROL</p><h1>Team & Devices</h1><p>Roles, MFA assurance, device status, and approval history from the authoritative control plane.</p></div><button className="text-button" onClick={onDashboard}>Back to dashboard →</button></div><div className="dashboard-grid"><div><h2>Team access</h2><div className="balance-list">{members.length ? members.map((member) => <div className="balance-row" key={member.id}><span className="currency-badge usd">{member.role_code.slice(0, 1).toUpperCase()}</span><span className="balance-name"><b>{member.role_code} · {member.active ? 'Active' : 'Suspended'}</b><small>{member.user_id} · MFA {member.mfa_required ? 'required' : 'not required'}</small></span><strong>{member.active ? 'Access on' : 'Access off'}</strong></div>) : <div className="empty-live">No team memberships are available.</div>}</div></div><div><h2>Registered devices</h2><div className="balance-list">{devices.length ? devices.map((device) => <div className="balance-row" key={device.id}><span className="currency-badge usd">D</span><span className="balance-name"><b>{device.friendly_name} · {device.status}</b><small>Last seen {new Date(device.last_seen_at).toLocaleString()} · {device.user_id}</small></span><strong>{device.revoked_at ? 'Revoked' : device.status}</strong></div>) : <div className="empty-live">No registered devices are available.</div>}</div></div></div><div className="panel"><div className="panel-header"><div><h2>Approval inbox</h2><p>Self-approval is rejected by the database constraint and RPC.</p></div><strong>{approvals.filter((item) => item.status === 'pending').length} pending</strong></div><div className="balance-list">{approvals.length ? approvals.map((approval) => <div className="balance-row" key={approval.id}><span className="currency-badge usd">{approval.status === 'pending' ? '!' : '✓'}</span><span className="balance-name"><b>{approval.action_type} · {approval.status}</b><small>{approval.reason} · Requested {new Date(approval.requested_at).toLocaleString()}</small></span><strong>{approval.amount_base ? `${approval.amount_base} ${approval.currency_code ?? ''}` : 'Review'}</strong></div>) : <div className="empty-live">No approval requests are available.</div>}</div></div><div className="empty-live">Role checks, branch/cashbox scope, revoked-device status, and self-approval rules remain authoritative on Supabase; this screen never grants access client-side.</div></section>
}

function MoneyLocationView({ organizationId, onDashboard, onToast }: { organizationId: string | null; onDashboard: () => void; onToast: (message: string) => void }) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [evidence, setEvidence] = useState<LocationEvidenceRecord[]>([])
  const [view, setView] = useState<'currency' | 'location'>('currency')
  const [currency, setCurrency] = useState('ALL')
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!organizationId) return
    void Promise.all([getOwnerDashboard(organizationId), listLocationEvidence(organizationId)]).then(([dashboardResult, evidenceResult]) => {
      if (dashboardResult.data) setSnapshot(dashboardResult.data)
      if (evidenceResult.data) setEvidence(evidenceResult.data)
      if (dashboardResult.error || evidenceResult.error) onToast(`Money workspace incomplete: ${dashboardResult.error ?? evidenceResult.error}`)
      setLoading(false)
    })
  }, [onToast, organizationId])

  const currencies = Array.from(new Set([...(snapshot?.positions ?? []).map((item) => item.currency), ...evidence.map((item) => item.currency_code)])).sort()
  const visibleLocations = (snapshot?.locations ?? []).filter((item) => currency === 'ALL' || item.currency === currency)
  const filteredEvidence = evidence.filter((item) => (currency === 'ALL' || item.currency_code === currency) && (!selectedLocation || item.account_code === selectedLocation))
  const exposure = (direction: 'receivable' | 'payable') => evidence.filter((item) => item.account_code.startsWith(`${direction}:`) && (currency === 'ALL' || item.currency_code === currency)).reduce((total, row) => total.plus(new Decimal(row.native_debit).minus(row.native_credit)), new Decimal(0)).toFixed(2)
  const locationLabel = (value: string) => value.replace(/^location:/, '').replace(/:[A-Z]{3}$/, '').replace(/^cashbox:/, 'Cashbox ')
  const rows = view === 'currency' ? currencies.map((item) => ({ key: item, label: item, amount: snapshot?.positions.find((position) => position.currency === item)?.quantity ?? '0', currency: item })) : visibleLocations.map((item) => ({ key: `${item.location}:${item.currency}`, label: locationLabel(item.location), amount: item.quantity, currency: item.currency }))
  return <section className="panel money-workspace"><div className="panel-header"><div><p className="kicker">OWNER CONTROL</p><h1>Where is my money?</h1><p>Native currency positions, location balances, and ledger evidence in one view.</p></div><button className="text-button" onClick={onDashboard}>Back to dashboard →</button></div><div className="rate-strip"><label>Currency<select value={currency} onChange={(event) => { setCurrency(event.target.value); setSelectedLocation(null) }}><option value="ALL">All currencies</option>{currencies.map((item) => <option key={item}>{item}</option>)}</select></label><div className="segmented-control"><button className={view === 'currency' ? 'active' : ''} onClick={() => setView('currency')}>Currency first</button><button className={view === 'location' ? 'active' : ''} onClick={() => setView('location')}>Location first</button></div><button className="export-button" onClick={() => window.print()}>Print snapshot</button></div><div className="metric-grid"><article className="metric-card"><span>Receivable · they owe us</span><strong>{exposure('receivable')} {currency === 'ALL' ? 'native' : currency}</strong></article><article className="metric-card"><span>Payable · we owe them</span><strong>{exposure('payable')} {currency === 'ALL' ? 'native' : currency}</strong></article><article className="metric-card"><span>Ledger lines available</span><strong>{evidence.length}</strong></article></div>{loading ? <div className="empty-live">Loading the authoritative ledger snapshot...</div> : <div className="money-columns"><div className="balance-list">{rows.length ? rows.map((row) => <button className="balance-row" key={row.key} onClick={() => setSelectedLocation(view === 'location' ? row.key.split(':').slice(0, -1).join(':') : null)}><span className="currency-badge usd">{row.currency}</span><span className="balance-name"><b>{row.label}</b><small>{view === 'currency' ? 'Total native position' : 'Posted asset location · select for evidence'}</small></span><strong>{row.amount} {row.currency}</strong></button>) : <div className="empty-live">No posted native-currency balances are available.</div>}</div><div className="panel evidence-panel"><div className="panel-header"><div><h2>{selectedLocation ? `Evidence · ${locationLabel(selectedLocation)}` : 'Contributing ledger lines'}</h2><p>Every amount traces back to a posted journal entry.</p></div></div>{filteredEvidence.length ? <div className="balance-list">{filteredEvidence.slice(0, 80).map((line) => <div className="balance-row" key={line.id}><span className="currency-badge usd">{line.currency_code}</span><span className="balance-name"><b>{line.memo || line.account_name || 'Ledger line'}</b><small>{new Date(line.occurred_at).toLocaleString()} · {line.journal_entry_id.slice(0, 8)}</small></span><strong>{Number(line.native_debit) - Number(line.native_credit) >= 0 ? '+' : ''}{(Number(line.native_debit) - Number(line.native_credit)).toFixed(2)}</strong></div>)}</div> : <div className="empty-live">Select a location to inspect its posted ledger evidence.</div>}</div></div>}</section>
}

function PeopleView({ organizationId, onDashboard, onToast }: { organizationId: string | null; onDashboard: () => void; onToast: (message: string) => void }) {
  const [people, setPeople] = useState<CounterpartyRecord[]>([])
  const [debts, setDebts] = useState<DebtRecord[]>([])
  const [statement, setStatement] = useState<Array<{ id: string; occurred_at: string; event_type: string; reference: string; status: string; memo: string | null; direction: 'receivable' | 'payable' | null; currency_code: string | null; amount: string | null }>>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CounterpartyRecord | null>(null)
  const [documents, setDocuments] = useState<PrivateDocumentRecord[]>([])
  const [documentType, setDocumentType] = useState<DocumentType>('tazkira')
  const fileInput = useRef<HTMLInputElement>(null)
  const captureProvider = useRef(new BrowserDocumentCaptureProvider()).current
  useEffect(() => {
    if (!organizationId) return
    void Promise.all([listCounterparties(organizationId), listDebts(organizationId)]).then(([peopleResult, debtResult]) => {
      if (peopleResult.error || debtResult.error) onToast(`People not loaded: ${peopleResult.error ?? debtResult.error}`)
      if (peopleResult.data) setPeople(peopleResult.data)
      if (debtResult.data) setDebts(debtResult.data)
    })
  }, [onToast, organizationId])
  useEffect(() => {
    if (!organizationId || !selected) return
    void listCounterpartyStatement(organizationId, selected.id).then((result) => { if (result.data) setStatement(result.data); if (result.error) onToast(`Statement not loaded: ${result.error}`) })
    void getPrivateCounterpartyDocuments(organizationId, selected.id).then((result) => { if (result.data) setDocuments(result.data); if (result.error) onToast(`Documents not loaded: ${result.error}`) })
  }, [onToast, organizationId, selected])
  const captureDocument = async () => {
    if (!organizationId || !selected || !fileInput.current) return
    const file = await captureProvider.capture(fileInput.current)
    if (!file) return
    const validationError = validateDocumentFile(file)
    if (validationError) { onToast(validationError); return }
    const result = await uploadPrivateCounterpartyDocument(organizationId, selected.id, documentType, file)
    if (result.error) { onToast(`Document upload failed: ${result.error}`); return }
    if (result.data) setDocuments((current) => [result.data as PrivateDocumentRecord, ...current])
    onToast('Private document uploaded and access audited')
  }
  const previewDocument = async (documentId: string) => { if (!organizationId) return; const result = await getPrivateDocumentUrl(organizationId, documentId); if (result.error) onToast(`Document access denied: ${result.error}`); else if (result.data) window.open(result.data, '_blank', 'noopener,noreferrer') }
  const filtered = people.filter((person) => person.display_name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const personDebts = selected ? debts.filter((debt) => debt.counterparty_id === selected.id) : []
  const total = (direction: DebtRecord['direction'], currency: string) => personDebts.filter((debt) => debt.direction === direction && debt.currency_code === currency).reduce((sum, debt) => sum.plus(debt.outstanding_amount), new Decimal(0)).toFixed(2)
  const currencies = Array.from(new Set(personDebts.map((debt) => debt.currency_code)))
  return <section className="panel"><div className="panel-header"><div><p className="kicker">PEOPLE & STATEMENTS</p><h1>People</h1><p>Search counterparties and reconstruct what each person owes by currency.</p></div><button className="text-button" onClick={onDashboard}>Back to dashboard →</button></div><label>Search people<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or counterparty" /></label><div className="balance-list">{filtered.length ? filtered.map((person) => <button className="balance-row" key={person.id} onClick={() => setSelected(person)}><span className="currency-badge usd">{person.display_name.slice(0, 1).toUpperCase()}</span><span className="balance-name"><b>{person.display_name}</b><small>{person.counterparty_type} · {person.risk_status}</small></span><strong>View statement →</strong></button>) : <div className="empty-live">No counterparties match this search.</div>}</div>{selected && <section className="panel statement-panel"><div className="panel-header"><div><p className="kicker">STATEMENT</p><h2>{selected.display_name}</h2><p>Native balances remain separate; no forced conversion.</p></div><button className="text-button" onClick={() => setSelected(null)}>Close statement</button></div><div className="rate-strip"><label>Document type<select value={documentType} onChange={(event) => setDocumentType(event.target.value as DocumentType)}><option value="tazkira">Tazkira</option><option value="passport">Passport</option><option value="customer_photo">Customer photo</option><option value="other">Other</option></select></label><input ref={fileInput} type="file" accept="image/jpeg,image/png,application/pdf" capture="environment" onChange={() => void captureDocument()} /><button className="export-button" onClick={() => fileInput.current?.click()}>Capture or upload</button></div><div className="balance-list">{documents.length ? documents.map((document) => <button className="balance-row" key={document.id} onClick={() => void previewDocument(document.id)}><span className="currency-badge usd">D</span><span className="balance-name"><b>{document.entity_type.replace('counterparty:', '')}</b><small>{document.content_type} · {Math.round(document.size_bytes / 1024)} KB · {new Date(document.created_at).toLocaleString()}</small></span><strong>Preview securely →</strong></button>) : <div className="empty-live">No private documents uploaded for this counterparty.</div>}</div>{currencies.length ? currencies.map((item) => <div className="balance-row" key={item}><span className="currency-badge usd">{item}</span><span className="balance-name"><b>{item} balances</b><small>Reconstructed from outstanding debt records</small></span><strong>Owes us {total('receivable', item)} · We owe {total('payable', item)}</strong></div>) : <div className="empty-live">No outstanding balances for this counterparty.</div>}{personDebts.map((debt) => <div className="empty-live" key={debt.id}>{debt.direction === 'receivable' ? 'Receivable' : 'Payable'} · {debt.outstanding_amount} {debt.currency_code}{debt.due_at ? ` · Due ${new Date(debt.due_at).toLocaleDateString()}` : ''}</div>)}<h3>Statement timeline</h3>{statement.length ? statement.map((item) => <div className="balance-row" key={`${item.id}-${item.event_type}`}><span className="currency-badge usd">{item.status === 'posted' ? '✓' : '↺'}</span><span className="balance-name"><b>{item.event_type.replaceAll('_', ' ')}</b><small>{new Date(item.occurred_at).toLocaleString()} · {item.reference.slice(0, 12)}{item.memo ? ` · ${item.memo}` : ''}</small></span><strong>{item.amount ? `${item.direction === 'receivable' ? 'Owes us' : 'We owe'} ${item.amount} ${item.currency_code ?? ''}` : item.status}</strong></div>) : <div className="empty-live">No statement events are available for this counterparty.</div>}</section>}</section>
}

function TransactionsView({ organizationId, onDashboard, onToast }: { organizationId: string | null; onDashboard: () => void; onToast: (message: string) => void }) {
  const [entries, setEntries] = useState<JournalRecord[]>([])
  const [selected, setSelected] = useState<JournalRecord | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (organizationId) void listJournalEntries(organizationId).then((result) => { if (result.data) setEntries(result.data) }) }, [organizationId])
  const reverse = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    const result = await requestReversal({ original_entry_id: selected.id, reason, client_command_id: crypto.randomUUID() })
    setBusy(false)
    onToast(result.error ? `Reversal not posted: ${result.error}` : 'Reversal posted to Supabase')
    if (!result.error) { setSelected(null); setReason(''); if (organizationId) { const refreshed = await listJournalEntries(organizationId); if (refreshed.data) setEntries(refreshed.data) } }
  }
  return <section className="panel"><div className="panel-header"><div><p className="kicker">TRANSACTIONS</p><h1>Transaction history</h1><p>Posted entries remain traceable and can only be corrected through reversal.</p></div><button className="text-button" onClick={onDashboard}>Back to dashboard →</button></div><div className="balance-list">{entries.length ? entries.map((entry) => <button className="balance-row" key={entry.id} onClick={() => { setSelected(entry); setReason('') }}><span className="currency-badge usd">{entry.status === 'posted' ? '✓' : '↺'}</span><span className="balance-name"><b>{entry.memo || 'Financial entry'}</b><small>{new Date(entry.occurred_at).toLocaleString()} · {entry.status}</small></span><strong>{entry.id.slice(0, 8)}</strong></button>) : <div className="empty-live">No posted transactions are available for this organization.</div>}</div>{selected && selected.status === 'posted' && <form className="trade-modal" onSubmit={reverse}><div className="modal-head"><div><p className="kicker">CORRECTION</p><h2>Request reversal</h2></div><button type="button" className="close" onClick={() => setSelected(null)} aria-label="Close reversal">×</button></div><p>Original entry: {selected.id}</p><label>Reason<input required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why should this entry be reversed?" /></label><button className="primary-action full" type="submit" disabled={busy}>{busy ? 'Posting...' : 'Post reversal'} <span>→</span></button></form>}</section>
}

function RatesView({ organizationId, onDashboard }: { organizationId: string | null; onDashboard: () => void }) {
  const [history, setHistory] = useState<RateHistoryRecord[]>([])
  useEffect(() => { if (organizationId) void listRateHistory(organizationId).then((result) => { if (result.data) setHistory(result.data) }) }, [organizationId])
  return <section className="panel"><div className="panel-header"><div><p className="kicker">RATE BOARD</p><h1>Rates</h1><p>Live buy/sell rates, rate groups, branch overrides, and effective history.</p></div><button className="text-button" onClick={onDashboard}>Back to dashboard →</button></div><div className="rate-strip"><div className="rate-title"><span className="rate-live" /><div><b>USD / AFN</b><small>Historical values remain immutable</small></div></div><label>Buy rate<input value={history[0]?.buy_rate ?? ''} readOnly placeholder="Live rate" /></label><label>Sell rate<input value={history[0]?.sell_rate ?? ''} readOnly placeholder="Live rate" /></label></div><div className="balance-list">{history.length ? history.map((item) => <div className="balance-row" key={item.id}><span className="currency-badge usd">{item.from_currency}</span><span className="balance-name"><b>{item.group_name} · {item.branch_id ? 'Branch override' : 'Organization default'}</b><small>Effective {new Date(item.effective_from).toLocaleString()} · {item.to_currency}</small></span><strong>Buy {item.buy_rate} · Sell {item.sell_rate}</strong></div>) : <div className="empty-live">No authorized rate history is available for this organization.</div>}</div><div className="empty-live">Calculator previews never post transactions; historical journal lines retain the rate applied at posting time.</div></section>
}

function ReportsView({ trades, organizationId, onDashboard, onToast }: { trades: Trade[]; organizationId: string | null; onDashboard: () => void; onToast: (message: string) => void }) {
  const [currency, setCurrency] = useState('All')
  const [status, setStatus] = useState('All')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const rows = trades.map((trade) => ({ entryId: `trade_${trade.id}`, occurredAt: trade.time, type: trade.direction, branchId: 'Kabul Central', status: trade.status.toLowerCase(), realizedProfit: '0' }))
  const filteredRows = rows.filter((row) => (status === 'All' || row.status === status.toLowerCase()) && (!from || row.occurredAt >= from) && (!to || row.occurredAt <= `${to}T23:59:59`) && (currency === 'All' || row.type.includes(currency)))
  const authorizeExport = async (format: 'pdf' | 'print') => {
    if (!organizationId) { onToast('Export unavailable: no authenticated organization'); return false }
    const result = await recordReportExport({ organization_id: organizationId, report_name: 'Recent Activity', format, filters: { scope: 'loaded_activity' } })
    if (result.error) { onToast(`Export not authorized: ${result.error}`); return false }
    return true
  }
  const share = async () => { const allowed = await authorizeExport('print'); if (allowed) { const { shareReportViaWhatsApp } = await loadExports(); shareReportViaWhatsApp({ reportName: 'Recent Activity', reference: filteredRows[0]?.entryId ?? 'snapshot', businessName: 'Kabul Central Exchange' }); onToast('WhatsApp share opened') } }
  const downloadPdf = (rows: typeof filteredRows, businessName: string, reportName: string) => { void authorizeExport('pdf').then(async (allowed) => { if (allowed) { const { downloadPdf: createPdf } = await loadExports(); createPdf(rows, businessName, reportName); onToast('PDF report generated') } }) }
  const printReport = () => { void authorizeExport('print').then(async (allowed) => { if (allowed) { const { printReport: print } = await loadExports(); print() } }) }
  const printThermalReceipt = (input: { businessName: string; reference: string; type: string; amount: string; currency: string }, width: '58mm' | '80mm') => { void authorizeExport('print').then(async (allowed) => { if (allowed) { const { printThermalReceipt: print } = await loadExports(); print(input, width) } }) }
  return <section className="panel"><div className="panel-header"><div><p className="kicker">REPORT CENTER</p><h1>Reports</h1><p>Generate authorized journal, profit, position, and statement documents.</p></div><button className="text-button" onClick={onDashboard}>Back to dashboard →</button></div><div className="rate-strip"><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label>Currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option>All</option><option>AFN</option><option>USD</option><option>EUR</option></select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option><option>posted</option><option>pending</option><option>reversed</option></select></label></div><div className="activity-actions"><button className="export-button" onClick={() => void authorizeExport('pdf').then((allowed) => { if (allowed) { downloadPdf(filteredRows, 'Kabul Central Exchange', 'Recent Activity'); onToast('PDF report generated') } })}>Export PDF</button><button className="export-button" onClick={() => void authorizeExport('print').then((allowed) => { if (allowed) printReport() })}>Print A4</button><button className="export-button" onClick={() => void authorizeExport('print').then((allowed) => { if (allowed) printThermalReceipt({ businessName: 'Kabul Central Exchange', reference: filteredRows[0]?.entryId ?? 'snapshot', type: filteredRows[0]?.type ?? 'Statement', amount: filteredRows[0]?.realizedProfit ?? '0', currency: 'AFN' }, '58mm') })}>Print 58mm</button><button className="export-button" onClick={() => void authorizeExport('print').then((allowed) => { if (allowed) printThermalReceipt({ businessName: 'Kabul Central Exchange', reference: filteredRows[0]?.entryId ?? 'snapshot', type: filteredRows[0]?.type ?? 'Statement', amount: filteredRows[0]?.realizedProfit ?? '0', currency: 'AFN' }, '80mm') })}>Print 80mm</button><button className="export-button" onClick={() => void share()}>WhatsApp</button></div><div className="empty-live">{filteredRows.length ? `${filteredRows.length} filtered ledger activities are ready for export.` : 'No live ledger activity matches these filters.'}</div></section>
}

function DebtsView({ organizationId, branchId, onDashboard, onToast }: { organizationId: string | null; branchId: string | null; onDashboard: () => void; onToast: (message: string) => void }) {
  const [debts, setDebts] = useState<DebtRecord[]>([])
  const [people, setPeople] = useState<CounterpartyRecord[]>([])
  const [direction, setDirection] = useState<'receivable' | 'payable'>('receivable')
  const [counterpartyId, setCounterpartyId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('AFN')
  const [selectedDebt, setSelectedDebt] = useState<DebtRecord | null>(null)
  const [settlementAmount, setSettlementAmount] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!organizationId) return
    void Promise.all([listDebts(organizationId), listCounterparties(organizationId)]).then(([debtResult, peopleResult]) => {
      if (debtResult.data) setDebts(debtResult.data)
      if (peopleResult.data) setPeople(peopleResult.data)
    })
  }, [organizationId])
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!organizationId || !branchId || !counterpartyId) { onToast('Debt not posted: choose an authenticated organization, branch, and counterparty'); return }
    setBusy(true)
    const result = await recordDebt({ organization_id: organizationId, branch_id: branchId, counterparty_id: counterpartyId, direction, currency, amount, location: 'Main Counter', client_command_id: crypto.randomUUID() })
    setBusy(false)
    onToast(result.error ? `Debt not posted: ${result.error}` : 'Debt posted to Supabase')
    if (!result.error) { setCounterpartyId(''); setAmount('') }
  }
  const settle = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedDebt) return
    setBusy(true)
    const result = await settleDebt({ debt_id: selectedDebt.id, amount: settlementAmount, location: 'Main Counter', client_command_id: crypto.randomUUID() })
    setBusy(false)
    onToast(result.error ? `Settlement not posted: ${result.error}` : 'Settlement posted to Supabase')
    if (!result.error) { setSelectedDebt(null); setSettlementAmount(''); if (organizationId) { const refreshed = await listDebts(organizationId); if (refreshed.data) setDebts(refreshed.data) } }
  }
  return <section className="panel"><div className="panel-header"><div><p className="kicker">DEBT & CREDIT</p><h1>Debts</h1><p>Record receivables and payables with an immutable ledger entry.</p></div><button className="text-button" onClick={onDashboard}>Back to dashboard →</button></div><form className="trade-modal" onSubmit={submit}><label>Direction<select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}><option value="receivable">They owe us</option><option value="payable">We owe them</option></select></label><label>Counterparty<select required value={counterpartyId} onChange={(event) => setCounterpartyId(event.target.value)}><option value="">Choose a counterparty</option>{people.map((person) => <option key={person.id} value={person.id}>{person.display_name} · {person.counterparty_type}</option>)}</select></label><div className="form-grid"><label>Amount<input required min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label><label>Currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option>AFN</option><option>USD</option><option>EUR</option></select></label></div><button className="primary-action full" type="submit" disabled={busy}>{busy ? 'Posting...' : 'Post debt'} <span>→</span></button></form><div className="balance-list">{debts.length ? debts.map((debt) => <button className="balance-row" key={debt.id} onClick={() => { setSelectedDebt(debt); setSettlementAmount(debt.outstanding_amount) }}><span className="currency-badge usd">{debt.currency_code}</span><span className="balance-name"><b>{people.find((person) => person.id === debt.counterparty_id)?.display_name ?? 'Counterparty'}</b><small>{debt.direction === 'receivable' ? 'They owe us' : 'We owe them'}</small></span><strong>{debt.outstanding_amount}</strong></button>) : <div className="empty-live">No outstanding debts are available for this organization.</div>}</div>{selectedDebt && <form className="trade-modal" onSubmit={settle}><div className="modal-head"><div><p className="kicker">SETTLEMENT</p><h2>Settle debt</h2></div><button type="button" className="close" onClick={() => setSelectedDebt(null)} aria-label="Close settlement">×</button></div><p>Outstanding: {selectedDebt.outstanding_amount} {selectedDebt.currency_code}</p><label>Settlement amount<input required min="0.01" max={selectedDebt.outstanding_amount} step="0.01" value={settlementAmount} onChange={(event) => setSettlementAmount(event.target.value)} /></label><button className="primary-action full" type="submit" disabled={busy}>{busy ? 'Posting...' : 'Post settlement'} <span>→</span></button></form>}<div className="empty-live">Settlements remain linked to the original debt and reduce its outstanding amount; they never delete history.</div></section>
}

function ReconciliationView({ organizationId, branchId, cashboxId, onDashboard, onToast }: { organizationId: string | null; branchId: string | null; cashboxId: string | null; onDashboard: () => void; onToast: (message: string) => void }) {
  const [afn, setAfn] = useState('')
  const [usd, setUsd] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [expected, setExpected] = useState<Record<string, string>>({})
  useEffect(() => { if (organizationId && cashboxId) void listCashboxBalances(organizationId, cashboxId).then((result) => { if (result.data) setExpected(Object.fromEntries(result.data.map((item) => [item.currency_code, item.expected_amount]))); if (result.error) onToast(`Expected cash not loaded: ${result.error}`) }) }, [cashboxId, onToast, organizationId])
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!organizationId || !branchId || !cashboxId) { onToast('Close not submitted: an authenticated cashbox is required'); return }
    setBusy(true)
    const result = await recordCashboxClose({ organization_id: organizationId, branch_id: branchId, cashbox_id: cashboxId, counts: [{ currency: 'AFN', counted_amount: afn }, { currency: 'USD', counted_amount: usd }], variance_reason: reason })
    setBusy(false)
    onToast(result.error ? `Close not submitted: ${result.error}` : 'Cashbox close submitted for review')
  }
  const variance = (currency: string, counted: string) => new Decimal(counted || '0').minus(expected[currency] ?? '0').toFixed(2)
  return <section className="panel"><div className="panel-header"><div><p className="kicker">CASH CONTROL</p><h1>Check cashbox</h1><p>Compare counted cash with today’s expected amounts; unexplained differences stay visible.</p></div><button className="text-button" onClick={onDashboard}>Back to dashboard →</button></div><div className="balance-list"><div className="balance-row"><span className="currency-badge usd">AFN</span><span className="balance-name"><b>Expected vs actual</b><small>Ledger expected: {expected.AFN ?? 'Loading...'}</small></span><strong>Variance {variance('AFN', afn)}</strong></div><div className="balance-row"><span className="currency-badge usd">USD</span><span className="balance-name"><b>Expected vs actual</b><small>Ledger expected: {expected.USD ?? 'Loading...'}</small></span><strong>Variance {variance('USD', usd)}</strong></div></div><form className="trade-modal" onSubmit={submit}><label>Counted AFN<input required min="0" step="0.01" value={afn} onChange={(event) => setAfn(event.target.value)} placeholder="0.00" /></label><label>Counted USD<input required min="0" step="0.01" value={usd} onChange={(event) => setUsd(event.target.value)} placeholder="0.00" /></label><label>Variance reason<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required when there is a difference" /></label><button className="primary-action full" type="submit" disabled={busy}>{busy ? 'Submitting...' : 'Submit cash count'} <span>→</span></button></form><div className="empty-live">A shortage or overage remains visible and requires authorized approval before its ledger adjustment is posted.</div></section>
}

function HawalaView({ organizationId, branchId, onDashboard, onToast }: { organizationId: string | null; branchId: string | null; onDashboard: () => void; onToast: (message: string) => void }) {
  const [transfers, setTransfers] = useState<HawalaTransferRecord[]>([])
  const [beneficiary, setBeneficiary] = useState('')
  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState('0')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (organizationId) void listHawalaTransfers(organizationId).then((result) => { if (result.data) setTransfers(result.data) }) }, [organizationId])
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!organizationId || !branchId) { onToast('Hawala not posted: an authenticated branch is required'); return }
    setBusy(true)
    const result = await recordHawalaSend({ organization_id: organizationId, branch_id: branchId, beneficiary_name: beneficiary, origin_location: 'Main Counter', destination_location: destination, currency: 'AFN', amount, fee, reference_code: reference, client_command_id: crypto.randomUUID() })
    setBusy(false)
    onToast(result.error ? `Hawala not posted: ${result.error}` : 'Hawala transfer posted to Supabase')
    if (!result.error) { setBeneficiary(''); setDestination(''); setAmount(''); setFee('0'); setReference(''); if (organizationId) { const refreshed = await listHawalaTransfers(organizationId); if (refreshed.data) setTransfers(refreshed.data) } }
  }
  return <section className="panel"><div className="panel-header"><div><p className="kicker">OPTIONAL MODULE</p><h1>Hawala</h1><p>Record a traceable send with beneficiary, route, fee, and reference.</p></div><button className="text-button" onClick={onDashboard}>Back to dashboard →</button></div><form className="trade-modal" onSubmit={submit}><label>Beneficiary<input required value={beneficiary} onChange={(event) => setBeneficiary(event.target.value)} placeholder="Full beneficiary name" /></label><label>Destination<input required value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="City or country" /></label><div className="form-grid"><label>Amount (AFN)<input required min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label><label>Fee (AFN)<input min="0" step="0.01" value={fee} onChange={(event) => setFee(event.target.value)} /></label></div><label>Reference code<input required value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Unique transfer reference" /></label><button className="primary-action full" type="submit" disabled={busy}>{busy ? 'Posting...' : 'Post Hawala send'} <span>→</span></button></form><div className="balance-list">{transfers.length ? transfers.map((transfer) => <div className="balance-row" key={transfer.id}><span className="currency-badge usd">{transfer.currency_code}</span><span className="balance-name"><b>{transfer.beneficiary_name}</b><small>{transfer.reference_code} · {transfer.destination_location}</small></span><strong>{transfer.amount}</strong></div>) : <div className="empty-live">No Hawala transfers are available for this organization.</div>}</div></section>
}

function OnboardingScreen({ language, businessName, currencies, cashboxName, busy, onLanguageChange, onBusinessNameChange, onCurrenciesChange, onCashboxNameChange, onSubmit }: { language: Language; businessName: string; currencies: string[]; cashboxName: string; busy: boolean; onLanguageChange: (language: Language) => void; onBusinessNameChange: (value: string) => void; onCurrenciesChange: (currencies: string[]) => void; onCashboxNameChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void> }) {
  const available = ['AFN', 'USD', 'EUR', 'AED', 'PKR', 'IRR', 'SAR', 'TRY', 'GBP']
  const toggleCurrency = (currency: string) => onCurrenciesChange(currencies.includes(currency) ? currencies.filter((item) => item !== currency && item !== 'AFN') : [...currencies, currency])
  return <main className="auth-shell"><section className="auth-card"><div className="brand auth-brand"><span className="brand-mark">S</span><span>SARAFI<small>Exchange OS</small></span></div><p className="kicker">FIRST BUSINESS SETUP</p><h1>Set up your Sarafi</h1><p className="auth-subtitle">Start with the few things SARAFI needs. You can change advanced settings later.</p><form onSubmit={onSubmit}><label>Language<select value={language} onChange={(event) => onLanguageChange(event.target.value as Language)}><option value="en">English</option><option value="fa-AF">Dari</option><option value="ps-AF">Pashto</option></select></label><label>What is your Sarafi called?<input required minLength={2} value={businessName} onChange={(event) => onBusinessNameChange(event.target.value)} placeholder="Sarwari Exchange" /></label><fieldset className="currency-choices"><legend>Which currencies do you use?</legend>{available.map((currency) => <label key={currency}><input type="checkbox" checked={currencies.includes(currency)} disabled={currency === 'AFN'} onChange={() => toggleCurrency(currency)} />{currency}</label>)}</fieldset><label>Main cashbox name<input required minLength={2} value={cashboxName} onChange={(event) => onCashboxNameChange(event.target.value)} placeholder="Main Counter" /></label><div className="setup-summary"><span>Starting currency</span><b>AFN · Afghan Afghani</b><span>Selected currencies</span><b>{currencies.join(' · ')}</b><span>Next step</span><b>Add starting money, then record your first transaction</b></div><button className="primary-action full" disabled={busy} type="submit">{busy ? 'Creating business...' : 'Create my Sarafi'} <span>→</span></button></form></section></main>
}

export default App

function AuthScreen({ language, onLanguageChange, mode, email, password, message, busy, onModeChange, onEmailChange, onPasswordChange, onSubmit }: { language: Language; onLanguageChange: (language: Language) => void; mode: 'signIn' | 'signUp' | 'reset'; email: string; password: string; message: string; busy: boolean; onModeChange: (mode: 'signIn' | 'signUp' | 'reset') => void; onEmailChange: (value: string) => void; onPasswordChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void> }) {
  const reset = mode === 'reset'
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key)
  return <main className="auth-shell"><div className="auth-layout"><section className="auth-intro"><div className="brand auth-brand"><span className="brand-mark">S</span><span>SARAFI<small>{t('productTagline')}</small></span></div><p className="kicker">{t('startHere')}</p><h1>{t('productTagline')}</h1><p className="auth-lead">{t('productDescription')}</p><h2>{t('whatYouCanDo')}</h2><div className="auth-capabilities"><span>{t('buySell')}</span><span>{t('myMoney')}</span><span>{t('trackDebts')}</span><span>{t('controlCashboxes')}</span><span>{t('employeeActivity')}</span><span>{t('todayReports')}</span></div></section><section className="auth-card"><label>{t('language')}<select aria-label={t('language')} value={language} onChange={(event) => onLanguageChange(event.target.value as Language)}><option value="fa-AF">دری</option><option value="ps-AF">پښتو</option><option value="en">English</option></select></label><p className="kicker">{t('secureAccess')}</p><h1>{reset ? t('resetPassword') : mode === 'signUp' ? t('createOwnerAccount') : t('welcomeBack')}</h1><p className="auth-subtitle">{reset ? t('resetSubtitle') : mode === 'signUp' ? t('signUpSubtitle') : t('signInSubtitle')}</p><form onSubmit={onSubmit}><label>{t('emailAddress')}<input type="email" required value={email} onChange={(event) => onEmailChange(event.target.value)} autoComplete="email" /></label>{!reset && <label>{t('password')}<input type="password" required minLength={8} value={password} onChange={(event) => onPasswordChange(event.target.value)} autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} /></label>}<button className="primary-action full" type="submit" disabled={busy}>{busy ? t('working') : reset ? t('sendResetLink') : mode === 'signUp' ? t('createAccount') : t('signIn')} <span>→</span></button></form>{message && <p className="auth-message" role="status">{message}</p>}<div className="auth-links">{!reset && <button type="button" onClick={() => onModeChange(mode === 'signIn' ? 'signUp' : 'signIn')}>{mode === 'signIn' ? t('createAnAccount') : t('backToSignIn')}</button>}{mode === 'signIn' && <button type="button" onClick={() => onModeChange('reset')}>{t('forgotPassword')}</button>}{reset && <button type="button" onClick={() => onModeChange('signIn')}>{t('backToSignIn')}</button>}</div></section></div></main>
}
