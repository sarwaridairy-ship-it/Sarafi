import { useEffect, useState } from 'react'
import Decimal from 'decimal.js'
import './App.css'
import { validateClientEnvironment } from './lib/env'
import { readPublicSupabaseConfig } from './lib/supabase'
import { calculateCounterAmount } from './domain/valuation'
import { buildCsvReport } from './domain/reporting'
import { isRtl, translate, type Language } from './lib/i18n'
import { getOwnerDashboard, listCounterparties, listDebts, listHawalaTransfers, postFxTrade, recordCashboxClose, recordDebt, recordHawalaSend, recordOperation, recordReportExport, settleDebt, type DashboardSnapshot, type CounterpartyRecord, type DebtRecord, type HawalaTransferRecord } from './lib/financialApi'
import { getSupabaseClient } from './lib/supabase'
import { createBusiness } from './lib/onboarding'
import { downloadPdf, printReport } from './lib/exports'
import { sendPasswordReset, signInWithPassword, signOut, signUpWithPassword } from './lib/auth'

type Trade = { id: string | number; customer: string; direction: string; amount: string; rate: string; time: string; status: string }
type OperationKind = 'RECEIVE_MONEY' | 'PAY_MONEY' | 'TRANSFER_CASH' | 'RECORD_EXPENSE' | 'RECORD_INCOME' | 'OWNER_INVESTMENT' | 'OWNER_WITHDRAWAL' | 'BANK_DEPOSIT' | 'BANK_WITHDRAWAL'

function App() {
  validateClientEnvironment()
  const inspectionMode = import.meta.env.MODE === 'e2e' || (import.meta.env.DEV && import.meta.env.VITE_AUTH_GATE_DISABLED === 'true')
  const supabaseConfigured = Boolean(readPublicSupabaseConfig())
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [showTrade, setShowTrade] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [showBranchMenu, setShowBranchMenu] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
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
  const [online, setOnline] = useState(navigator.onLine)
  const [trades, setTrades] = useState<Trade[]>([])
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null)
  const [dashboardRefresh, setDashboardRefresh] = useState(0)
  const [amount, setAmount] = useState('')
  const [calculatorAmount, setCalculatorAmount] = useState('1000')
  const [rate, setRate] = useState('70.25')
  const [toast, setToast] = useState('')
  const [organizationId, setOrganizationId] = useState<string | null>(inspectionMode ? 'inspection' : null)
  const [organizationName, setOrganizationName] = useState(inspectionMode ? 'Kabul Central Exchange' : 'Your business')
  const [branchId, setBranchId] = useState<string | null>(null)
  const [branchName, setBranchName] = useState(inspectionMode ? 'Main branch' : 'Assigned branch')
  const [cashboxId, setCashboxId] = useState<string | null>(null)
  const [organizationLoading, setOrganizationLoading] = useState(!inspectionMode)
  const [businessName, setBusinessName] = useState('')
  const [user, setUser] = useState<import('@supabase/supabase-js').User | null>(null)
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp' | 'reset'>('signIn')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
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
    void client.from('organization_memberships').select('organization_id').eq('user_id', user.id).eq('active', true).limit(1).maybeSingle().then(async ({ data }) => {
      setOrganizationId(data?.organization_id ?? null)
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
    void getOwnerDashboard(organizationId).then((result) => {
      if (result.error) { setToast(`Dashboard not loaded: ${result.error}`); return }
      setDashboard(result.data)
      setTrades((result.data?.activity ?? []).map((item) => ({ id: item.id, customer: item.reference, direction: item.type, amount: 'Recorded', rate: '-', time: new Date(item.occurred_at).toLocaleTimeString(), status: item.status })))
    })
  }, [dashboardRefresh, inspectionMode, organizationId])

  const submitAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthBusy(true)
    setAuthMessage('')
    const result = authMode === 'signIn' ? await signInWithPassword(authEmail, authPassword) : authMode === 'signUp' ? await signUpWithPassword(authEmail, authPassword) : { user: null, error: await sendPasswordReset(authEmail, window.location.origin) }
    setAuthBusy(false)
    if (result.user) setUser(result.user)
    setAuthMessage(result.error ?? (authMode === 'reset' ? 'Password reset email requested.' : authMode === 'signUp' ? 'Check your email to verify your account.' : 'Signed in.'))
  }

  const submitOnboarding = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setOrganizationLoading(true)
    const result = await createBusiness({ display_name: businessName, language, base_currency_code: 'AFN', currencies: ['AFN', 'USD', 'EUR'], branch_name: 'Main Branch', cashbox_name: 'Main Counter' })
    setOrganizationLoading(false)
    if (result.error) { setToast(`Business not created: ${result.error}`); return }
    setOrganizationId(result.organizationId)
  }

  const addTrade = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!amount) return
    const sold = new Decimal(amount)
    if (!organizationId || !branchId || !cashboxId) { setToast('Trade not posted: complete business setup first'); return }
    let sessionCheck
    try {
      sessionCheck = await postFxTrade({ organization_id: organizationId, branch_id: branchId, cashbox_id: cashboxId, client_command_id: crypto.randomUUID(), side: 'SELL_FX', sold_currency: 'USD', sold_amount: amount, bought_currency: 'AFN', bought_amount: sold.mul('70.25').toFixed(12), base_currency: 'AFN', sold_base_value: sold.mul('70').toFixed(12), bought_base_value: sold.mul('70.25').toFixed(12) })
    } catch (error) {
      setToast(`Trade not posted: ${error instanceof Error ? error.message : 'Invalid trade command'}`)
      return
    }
    if (sessionCheck.error) { setToast(`Trade not posted: ${sessionCheck.error}`); return }
    setDashboardRefresh((value) => value + 1)
    setAmount('')
    setShowTrade(false)
    setToast('Trade posted to Supabase')
    window.setTimeout(() => setToast(''), 2800)
  }

  const exportActivity = async () => {
    const authorization = await recordReportExport({ organization_id: 'inspection', report_name: 'Recent Activity', format: 'csv', filters: { scope: 'loaded_activity' } })
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

  const dashboardView = activeNav === 'Dashboard' || activeNav === 'Trade'

  if (!user && !inspectionMode) return <AuthScreen mode={authMode} email={authEmail} password={authPassword} message={authMessage} busy={authBusy} onModeChange={setAuthMode} onEmailChange={setAuthEmail} onPasswordChange={setAuthPassword} onSubmit={submitAuth} />
  if (organizationLoading) return <main className="auth-shell"><section className="auth-card"><div className="brand auth-brand"><span className="brand-mark">S</span><span>SARAFI<small>Exchange OS</small></span></div><p className="auth-subtitle">Loading your business workspace...</p></section></main>
  if (!organizationId) return <OnboardingScreen language={language} businessName={businessName} busy={organizationLoading} onLanguageChange={setLanguage} onBusinessNameChange={setBusinessName} onSubmit={submitOnboarding} />

  return (
    <div className={`app-shell ${isRtl(language) ? 'rtl' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><span>SARAFI<small>Exchange OS</small></span></div>
        <button className="branch-switch" onClick={() => setShowBranchMenu(!showBranchMenu)} aria-expanded={showBranchMenu}><span className="status-dot" /><span><b>{organizationName}</b><small>{branchName}</small></span><span className="chevron">⌄</span></button>
        {showBranchMenu && <div className="action-menu branch-menu"><button onClick={() => { setShowBranchMenu(false); setToast(`${branchName} is the active branch`) }}>{branchName} <small>Active branch</small><span>✓</span></button></div>}
        <p className="nav-label">{t('workspace')}</p>
        <nav>{(['Dashboard', 'Trade', 'Transactions', 'Cash & Accounts', 'People', 'Debts', 'Rates', 'Reports', 'Reconciliation'] as const).map((item) => { const labels = { Dashboard: t('dashboard'), Trade: t('trade'), Transactions: t('transactions'), 'Cash & Accounts': t('cashAccounts'), People: t('people'), Debts: t('debts'), Rates: t('rates'), Reports: t('reports'), Reconciliation: 'Reconciliation' }; return <button className={activeNav === item ? 'nav-item active' : 'nav-item'} key={item} onClick={() => { openSection(item); if (item === 'Trade') setShowTrade(true) }}><span className="nav-icon">{['◫', '+', '≡', '▣', '♙', '↔', '↗', '▤', '✓'][['Dashboard', 'Trade', 'Transactions', 'Cash & Accounts', 'People', 'Debts', 'Rates', 'Reports', 'Reconciliation'].indexOf(item)]}</span>{labels[item]}{item === 'Transactions' && <em>12</em>}</button> })}</nav>
        <p className="nav-label bottom-label">{t('administration')}</p>
        <nav><button className={activeNav === 'Team & Devices' ? 'nav-item active' : 'nav-item'} onClick={() => openSection('Team & Devices')}><span className="nav-icon">◉</span>{t('teamDevices')}</button><button className={activeNav === 'Settings' ? 'nav-item active' : 'nav-item'} onClick={() => openSection('Settings')}><span className="nav-icon">⚙</span>{t('settings')}</button></nav>
        <div className="sidebar-footer"><div className="avatar">{inspectionMode ? 'AI' : (user?.email?.slice(0, 2).toUpperCase() ?? 'MA')}</div><span><b>{user?.email ?? t('readOnlyInspection')}</b><small>{inspectionMode ? t('publicPreview') : 'Authenticated workspace'}</small></span>{!inspectionMode && <button aria-label="Sign out" onClick={() => void handleSignOut()}>↪</button>}</div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>{t('workspace')}</span><b>/</b><strong>{sectionLabel(activeNav)}</strong></div><div className="top-actions"><button className="icon-button" onClick={() => setPrivacy(!privacy)} aria-label={privacy ? 'Show amounts' : 'Hide amounts'}>{privacy ? '◉' : '◌'}</button><button className="lang-button" onClick={() => setLanguage(language === 'en' ? 'fa-AF' : language === 'fa-AF' ? 'ps-AF' : 'en')} aria-label="Change language">{language === 'en' ? 'EN' : language === 'fa-AF' ? 'دری' : 'PS'} <span>⌄</span></button><button className="help-button" onClick={() => setShowHelp(true)} aria-label="Open help">?</button></div></header>
        <div className="content-wrap">
          {!dashboardView && <WorkspaceView section={activeNav} trades={trades} organizationId={organizationId} branchId={branchId} cashboxId={cashboxId} onDashboard={() => openSection('Dashboard')} onToast={setToast} />}
          {dashboardView && <>
          <section className="welcome"><div><p className="kicker">MONDAY, 24 AUGUST 2026 · 10:45 AM</p><h1>{user ? `${t('goodMorning').split(',')[0]}, ${user.email?.split('@')[0] ?? 'there'}.` : t('goodMorning')}</h1><p className="subtitle">{t('businessStand')}</p></div><div className="action-wrap"><button className="primary-action" onClick={() => setShowTrade(true)}><span>+</span> {t('newTrade')} <kbd>⌘ K</kbd></button><button className="secondary-action" onClick={() => setShowActions(!showActions)} aria-expanded={showActions}>{t('moreActions')} <span>⌄</span></button>{showActions && <div className="action-menu">{(['Receive money', 'Pay money', 'Transfer cash', 'Expense', 'Owner capital', 'Bank movement'] as const).map((action) => { const kinds: Record<typeof action, OperationKind> = { 'Receive money': 'RECEIVE_MONEY', 'Pay money': 'PAY_MONEY', 'Transfer cash': 'TRANSFER_CASH', Expense: 'RECORD_EXPENSE', 'Owner capital': 'OWNER_INVESTMENT', 'Bank movement': 'BANK_DEPOSIT' }; const labels: Record<typeof action, string> = { 'Receive money': t('receive'), 'Pay money': t('pay'), 'Transfer cash': t('transfer'), Expense: t('expense'), 'Owner capital': t('ownerCapital'), 'Bank movement': t('bankMovement') }; return <button key={action} onClick={() => openOperation(kinds[action])}>{labels[action]}<span>→</span></button> })}<button onClick={() => setShowTrade(true)}>{t('buy')} / {t('sell')} / {t('exchange')} <span>→</span></button><button onClick={() => openSection('Debts')}>{t('debtCredit')} <span>→</span></button><button onClick={() => openSection('Hawala')}>{t('hawala')} <span>→</span></button></div>}</div></section>
          <div className="notice"><span className={`sync-dot ${online ? 'online' : 'offline'}`} /><span><b>{online ? t('online') : t('stillOffline')}</b> · {supabaseConfigured ? t('supabaseLoaded') : t('localWorkspace')} · {online ? `${t('lastSync')}: ${t('justNow')}` : `${t('pendingSync')}: 0`}</span><button onClick={() => setToast(online ? t('connected') : t('offlineMode'))}>{online ? t('connected') : t('offlineMode')}</button></div>
          <section className="rate-strip"><div className="rate-title"><span className="rate-live" /> <div><b>{t('rates')}</b><small>{t('retailRateContext')}</small></div></div><label>{t('buy')}<input value={rate} onChange={(event) => setRate(event.target.value)} /></label><label>{t('sell')}<input value="70.35" readOnly /></label><div className="calculator"><input value={calculatorAmount} onChange={(event) => setCalculatorAmount(event.target.value)} /><span>USD</span><b>=</b><strong>{calculateCounterAmount(calculatorAmount || '0', rate || '1', 'AFN_PER_UNIT', 2)}</strong><span>AFN</span></div><button className="text-button" onClick={() => openSection('Rates')}>{t('history')} →</button></section>
          <section className="metric-grid"><article className="metric-card hero-metric"><div className="card-head"><span>{t('totalPosition')}</span><button aria-label={privacy ? 'Show amounts' : 'Hide amounts'} onClick={() => setPrivacy(!privacy)}>◌</button></div><strong>{hidden || '—'}</strong><div className="metric-foot"><span>{dashboard ? `${dashboard.positions.length} currencies from ledger` : 'Awaiting live ledger data'}</span></div><div className="sparkline">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div></article><article className="metric-card"><div className="card-head"><span>{t('todayVolume')}</span><span className="card-symbol">↗</span></div><strong>{hidden || dashboard?.volume_base || '—'}</strong><div className="metric-foot"><span>{dashboard ? `${dashboard.transaction_count} posted entries` : 'Awaiting live ledger data'}</span></div></article><article className="metric-card"><div className="card-head"><span>{t('realizedProfit')}</span><span className="card-symbol profit">✦</span></div><strong className="profit-text">{hidden || dashboard?.realized_profit || '—'}</strong><div className="metric-foot"><span>Ledger-derived AFN equivalent</span></div></article></section>
          <section className="live-business"><div><span className="live-pulse" /> <b>{t('liveBusiness')}</b><small>{t('authoritativeSnapshot')}</small></div><div><strong>{dashboard?.pending_approvals ?? '—'}</strong><small>{t('pending')}</small></div><div><strong>{dashboard ? dashboard.locations.length : '—'}</strong><small>{t('moneyLocations')}</small></div><div><strong>{dashboard?.transaction_count ?? '—'}</strong><small>{t('postedToday')}</small></div><button onClick={() => setDashboardRefresh((value) => value + 1)}>{t('refreshLiveView')} →</button></section>
          <section className="dashboard-grid"><article className="panel balances"><div className="panel-header"><div><h2>Where your money is</h2><p>Live balances from journal lines</p></div><button className="text-button" onClick={() => openSection('Cash & Accounts')}>View all -&gt;</button></div>{dashboard?.locations.length ? <div className="balance-list">{dashboard.locations.slice(0, 6).map((location) => <div className="balance-row" key={`${location.location}-${location.currency}`}><span className="currency-badge usd">{location.currency}</span><span className="balance-name"><b>{location.location}</b><small>Authoritative asset location</small></span><strong>{hidden || location.quantity}</strong></div>)}</div> : <div className="empty-live">No live balances are available yet. Complete onboarding and post an authorized transaction to populate this view.</div>}</article><article className="panel attention"><div className="panel-header"><div><h2>Needs attention</h2><p>Live review queue</p></div><span className="attention-count">{dashboard?.pending_approvals ?? '—'}</span></div><div className="empty-live">{dashboard ? `${dashboard.pending_approvals} pending approvals from Supabase.` : 'Loading live review queue.'}</div></article></section>
          <section className="panel activity"><div className="panel-header"><div><h2>Recent activity</h2><p>Every movement, recorded and traceable</p></div><div className="activity-actions"><button className="filter-button" onClick={() => setActivityFilter(activityFilter === 'Today' ? 'All time' : 'Today')}>{activityFilter} <span>⌄</span></button><button className="export-button" onClick={() => void exportActivity()}>Export CSV</button></div></div><div className="table-wrap"><table><thead><tr><th>Transaction</th><th>Direction</th><th>Amount</th><th>Time</th><th>Status</th><th /></tr></thead><tbody>{trades.map((trade) => <tr key={trade.id}><td><span className="transaction-icon">↕</span><span className="table-person"><b>{trade.customer}</b><small>Trade #{String(trade.id).padStart(5, '0')}</small></span></td><td>{trade.direction}</td><td><b>{privacy ? '••••' : trade.amount}</b><small>@ {trade.rate}</small></td><td>{trade.time}</td><td><span className={`status ${trade.status.toLowerCase()}`}>{trade.status}</span></td><td><button className="more" onClick={() => setToast(`Details for trade #${String(trade.id).padStart(5, '0')} are available after live sync`)} aria-label={`View trade ${trade.id} details`}>•••</button></td></tr>)}</tbody></table></div></section>
          </>}
        </div>
      </main>
      {showTrade && <div className="modal-backdrop" onClick={() => setShowTrade(false)}><form className="trade-modal" onSubmit={addTrade} onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="kicker">NEW TRANSACTION</p><h2>{t('recordTrade')}</h2></div><button type="button" className="close" onClick={() => setShowTrade(false)} aria-label="Close trade">×</button></div><label>{t('customer')}<input placeholder={t('customer')} /></label><div className="form-grid"><label>{t('sellAmount')}<input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" autoFocus /><small>USD · United States Dollar</small></label><label>{t('buyAmount')}<input value={amount ? new Decimal(amount).mul(rate || '0').toFixed(2) : ''} readOnly placeholder="0.00" /><small>AFN · Afghan Afghani</small></label></div><div className="rate-box"><span>{t('exchangeRate')}</span><b>1 USD = {rate} AFN</b><span className="positive">{t('marketRate')}</span></div><button className="primary-action full" type="submit">{t('postTrade')} <span>→</span></button><p className="modal-note">Posting requires an authenticated user, active organization, branch, cashbox, and enabled currencies.</p></form></div>}
      {operationKind && <div className="modal-backdrop" onClick={() => setOperationKind(null)}><form className="trade-modal" onSubmit={submitOperation} onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="kicker">LEDGER OPERATION</p><h2>{operationKind.replaceAll('_', ' ')}</h2></div><button type="button" className="close" onClick={() => setOperationKind(null)} aria-label="Close operation">×</button></div><label>Amount<input required min="0.01" step="0.01" inputMode="decimal" value={operationAmount} onChange={(event) => setOperationAmount(event.target.value)} placeholder="0.00" autoFocus /></label><label>Currency<select value={operationCurrency} onChange={(event) => setOperationCurrency(event.target.value)}><option>AFN</option><option>USD</option><option>EUR</option></select></label>{operationKind === 'RECORD_EXPENSE' && <label>Expense category<select value={operationCategory} onChange={(event) => setOperationCategory(event.target.value)}><option>Rent</option><option>Salary</option><option>Utilities</option><option>Internet</option><option>Transport</option><option>Other</option></select></label>}{operationKind === 'TRANSFER_CASH' || operationKind === 'BANK_DEPOSIT' || operationKind === 'BANK_WITHDRAWAL' ? <div className="form-grid"><label>From location<input required value={operationFromLocation} onChange={(event) => setOperationFromLocation(event.target.value)} /></label><label>To location<input required value={operationToLocation} onChange={(event) => setOperationToLocation(event.target.value)} /></label></div> : <label>Location<input required value={operationLocation} onChange={(event) => setOperationLocation(event.target.value)} /></label>}<label>Note<input value={operationMemo} onChange={(event) => setOperationMemo(event.target.value)} placeholder="Reason or reference" /></label><button className="primary-action full" type="submit">Post operation <span>→</span></button><p className="modal-note">The server validates authorization, tenant scope, and ledger posting before accepting this operation.</p></form></div>}
      {showHelp && <div className="modal-backdrop" onClick={() => setShowHelp(false)}><section className="trade-modal" role="dialog" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="kicker">SARAFI SUPPORT</p><h2 id="help-title">Help & support</h2></div><button type="button" className="close" onClick={() => setShowHelp(false)} aria-label="Close help">×</button></div><p className="modal-note">Use the sidebar to move between workspace sections. This public preview is read-only; posting requires an authenticated Supabase session.</p><button className="primary-action full" onClick={() => setShowHelp(false)}>Close help</button></section></div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function WorkspaceView({ section, trades, organizationId, branchId, cashboxId, onDashboard, onToast }: { section: string; trades: Trade[]; organizationId: string | null; branchId: string | null; cashboxId: string | null; onDashboard: () => void; onToast: (message: string) => void }) {
  if (section === 'Rates') return <RatesView onDashboard={onDashboard} />
  if (section === 'Reports') return <ReportsView trades={trades} onDashboard={onDashboard} onToast={onToast} />
  if (section === 'Debts') return <DebtsView organizationId={organizationId} branchId={branchId} onDashboard={onDashboard} onToast={onToast} />
  if (section === 'Reconciliation') return <ReconciliationView organizationId={organizationId} branchId={branchId} cashboxId={cashboxId} onDashboard={onDashboard} onToast={onToast} />
  if (section === 'Hawala') return <HawalaView organizationId={organizationId} branchId={branchId} onDashboard={onDashboard} onToast={onToast} />
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

function RatesView({ onDashboard }: { onDashboard: () => void }) {
  return <section className="panel"><div className="panel-header"><div><p className="kicker">RATE BOARD</p><h1>Rates</h1><p>Current retail rates for Kabul Central.</p></div><button className="text-button" onClick={onDashboard}>Back to dashboard →</button></div><div className="rate-strip"><div className="rate-title"><span className="rate-live" /><div><b>USD / AFN</b><small>Local preview rate</small></div></div><label>Buy rate<input defaultValue="70.25" inputMode="decimal" /></label><label>Sell rate<input defaultValue="70.35" inputMode="decimal" /></label></div><div className="empty-live">Rate changes require an authenticated owner or manager session and are recorded with an effective timestamp.</div></section>
}

function ReportsView({ trades, onDashboard, onToast }: { trades: Trade[]; onDashboard: () => void; onToast: (message: string) => void }) {
  const rows = trades.map((trade) => ({ entryId: `trade_${trade.id}`, occurredAt: trade.time, type: trade.direction, branchId: 'Kabul Central', status: trade.status.toLowerCase(), realizedProfit: '0' }))
  const authorizeExport = async (format: 'pdf' | 'print') => {
    const result = await recordReportExport({ organization_id: 'inspection', report_name: 'Recent Activity', format, filters: { scope: 'loaded_activity' } })
    if (result.error) { onToast(`Export not authorized: ${result.error}`); return false }
    return true
  }
  return <section className="panel"><div className="panel-header"><div><p className="kicker">REPORT CENTER</p><h1>Reports</h1><p>Generate reports from authorized ledger activity.</p></div><button className="text-button" onClick={onDashboard}>Back to dashboard →</button></div><div className="activity-actions"><button className="export-button" onClick={() => void authorizeExport('pdf').then((allowed) => { if (allowed) { downloadPdf(rows, 'Kabul Central Exchange', 'Recent Activity'); onToast('PDF report generated') } })}>Export PDF</button><button className="export-button" onClick={() => void authorizeExport('print').then((allowed) => { if (allowed) printReport() })}>Print report</button></div><div className="empty-live">{trades.length ? `${trades.length} ledger activities are ready for export.` : 'No live ledger activity is available for reporting yet.'}</div></section>
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
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!organizationId || !branchId || !cashboxId) { onToast('Close not submitted: an authenticated cashbox is required'); return }
    setBusy(true)
    const result = await recordCashboxClose({ organization_id: organizationId, branch_id: branchId, cashbox_id: cashboxId, counts: [{ currency: 'AFN', counted_amount: afn }, { currency: 'USD', counted_amount: usd }], variance_reason: reason })
    setBusy(false)
    onToast(result.error ? `Close not submitted: ${result.error}` : 'Cashbox close submitted for review')
  }
  return <section className="panel"><div className="panel-header"><div><p className="kicker">CASH CONTROL</p><h1>Reconciliation</h1><p>Enter the physical count; expected balances come from the immutable ledger.</p></div><button className="text-button" onClick={onDashboard}>Back to dashboard →</button></div><form className="trade-modal" onSubmit={submit}><label>Counted AFN<input required min="0" step="0.01" value={afn} onChange={(event) => setAfn(event.target.value)} placeholder="0.00" /></label><label>Counted USD<input required min="0" step="0.01" value={usd} onChange={(event) => setUsd(event.target.value)} placeholder="0.00" /></label><label>Variance reason<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required when there is a difference" /></label><button className="primary-action full" type="submit" disabled={busy}>{busy ? 'Submitting...' : 'Submit cash count'} <span>→</span></button></form><div className="empty-live">A shortage or overage remains visible and requires authorized approval before its ledger adjustment is posted.</div></section>
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

function OnboardingScreen({ language, businessName, busy, onLanguageChange, onBusinessNameChange, onSubmit }: { language: Language; businessName: string; busy: boolean; onLanguageChange: (language: Language) => void; onBusinessNameChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void> }) {
  return <main className="auth-shell"><section className="auth-card"><div className="brand auth-brand"><span className="brand-mark">S</span><span>SARAFI<small>Exchange OS</small></span></div><p className="kicker">FIRST BUSINESS SETUP</p><h1>Set up your Sarafi</h1><p className="auth-subtitle">Your opening business structure is created securely on the server.</p><form onSubmit={onSubmit}><label>Business name<input required minLength={2} value={businessName} onChange={(event) => onBusinessNameChange(event.target.value)} placeholder="Kabul Central Exchange" /></label><label>Language<select value={language} onChange={(event) => onLanguageChange(event.target.value as Language)}><option value="en">English</option><option value="fa-AF">Dari</option><option value="ps-AF">Pashto</option></select></label><div className="setup-summary"><span>Base currency</span><b>AFN · Afghan Afghani</b><span>Enabled currencies</span><b>AFN · USD · EUR</b><span>First location</span><b>Main Branch · Main Counter</b></div><button className="primary-action full" disabled={busy} type="submit">{busy ? 'Creating business...' : 'Create business'} <span>→</span></button></form></section></main>
}

export default App

function AuthScreen({ mode, email, password, message, busy, onModeChange, onEmailChange, onPasswordChange, onSubmit }: { mode: 'signIn' | 'signUp' | 'reset'; email: string; password: string; message: string; busy: boolean; onModeChange: (mode: 'signIn' | 'signUp' | 'reset') => void; onEmailChange: (value: string) => void; onPasswordChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void> }) {
  const reset = mode === 'reset'
  return <main className="auth-shell"><section className="auth-card"><div className="brand auth-brand"><span className="brand-mark">S</span><span>SARAFI<small>Exchange OS</small></span></div><p className="kicker">SECURE ACCESS</p><h1>{reset ? 'Reset your password' : mode === 'signUp' ? 'Create your owner account' : 'Welcome back'}</h1><p className="auth-subtitle">Sign in to access your protected business workspace.</p><form onSubmit={onSubmit}><label>Email address<input type="email" required value={email} onChange={(event) => onEmailChange(event.target.value)} autoComplete="email" /></label>{!reset && <label>Password<input type="password" required minLength={8} value={password} onChange={(event) => onPasswordChange(event.target.value)} autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} /></label>}<button className="primary-action full" type="submit" disabled={busy}>{busy ? 'Working...' : reset ? 'Send reset link' : mode === 'signUp' ? 'Create account' : 'Sign in'} <span>→</span></button></form>{message && <p className="auth-message" role="status">{message}</p>}<div className="auth-links">{!reset && <button type="button" onClick={() => onModeChange(mode === 'signIn' ? 'signUp' : 'signIn')}>{mode === 'signIn' ? 'Create an account' : 'Back to sign in'}</button>}{mode === 'signIn' && <button type="button" onClick={() => onModeChange('reset')}>Forgot password?</button>}{reset && <button type="button" onClick={() => onModeChange('signIn')}>Back to sign in</button>}</div></section></main>
}
