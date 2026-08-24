import { useEffect, useState } from 'react'
import Decimal from 'decimal.js'
import './App.css'
import { validateClientEnvironment } from './lib/env'
import { readPublicSupabaseConfig } from './lib/supabase'
import { calculateCounterAmount } from './domain/valuation'
import { buildCsvReport } from './domain/reporting'
import { isRtl, translate, type Language } from './lib/i18n'
import { postFxTrade } from './lib/financialApi'
import { getSupabaseClient } from './lib/supabase'
import { sendPasswordReset, signInWithPassword, signOut, signUpWithPassword } from './lib/auth'
import { createBusiness } from './lib/onboarding'

type Trade = { id: number; customer: string; direction: string; amount: string; rate: string; time: string; status: string }

const initialTrades: Trade[] = [
  { id: 1, customer: 'Walk-in customer', direction: 'USD -> AFN', amount: '$2,500.00', rate: '70.25', time: '10:42 AM', status: 'Posted' },
  { id: 2, customer: 'Ahmadi Trading Co.', direction: 'AFN -> USD', amount: '؋ 350,000', rate: '70.10', time: '10:18 AM', status: 'Posted' },
  { id: 3, customer: 'M. Rahimi', direction: 'EUR -> AFN', amount: '€1,200.00', rate: '82.60', time: '09:55 AM', status: 'Pending' },
]

function App() {
  validateClientEnvironment()
  const supabaseConfigured = Boolean(readPublicSupabaseConfig())
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [showTrade, setShowTrade] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [language, setLanguage] = useState<Language>('en')
  const [online, setOnline] = useState(navigator.onLine)
  const [trades, setTrades] = useState(initialTrades)
  const [amount, setAmount] = useState('')
  const [calculatorAmount, setCalculatorAmount] = useState('1000')
  const [rate, setRate] = useState('70.25')
  const [toast, setToast] = useState('')
  const [user, setUser] = useState<import('@supabase/supabase-js').User | null>(null)
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp' | 'reset'>('signIn')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [organizationLoading, setOrganizationLoading] = useState(true)
  const [businessName, setBusinessName] = useState('')
  const hidden = privacy ? '••••••' : ''
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key)

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateConnection)
    window.addEventListener('offline', updateConnection)
    document.documentElement.dir = isRtl(language) ? 'rtl' : 'ltr'
    document.documentElement.lang = language
    return () => { window.removeEventListener('online', updateConnection); window.removeEventListener('offline', updateConnection) }
  }, [language])

  useEffect(() => {
    const client = getSupabaseClient()
    if (!client) return
    void client.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const listener = client.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => listener.data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    const client = getSupabaseClient()
    if (!client) return
    void client.from('organization_memberships').select('organization_id').eq('user_id', user.id).eq('active', true).limit(1).maybeSingle().then(({ data }) => { setOrganizationId(data?.organization_id ?? null); setOrganizationLoading(false) })
  }, [user])

  const submitAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthBusy(true)
    setAuthMessage('')
    const result = authMode === 'signIn' ? await signInWithPassword(authEmail, authPassword) : authMode === 'signUp' ? await signUpWithPassword(authEmail, authPassword) : { user: null, error: await sendPasswordReset(authEmail, window.location.origin) }
    setAuthBusy(false)
    if ('user' in result && result.user) setUser(result.user)
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
    let sessionCheck
    try {
      sessionCheck = await postFxTrade({ organization_id: '00000000-0000-0000-0000-000000000000', branch_id: '00000000-0000-0000-0000-000000000000', cashbox_id: '00000000-0000-0000-0000-000000000000', client_command_id: crypto.randomUUID(), side: 'SELL_FX', sold_currency: 'USD', sold_amount: amount, bought_currency: 'AFN', bought_amount: sold.mul('70.25').toFixed(12), base_currency: 'AFN', sold_base_value: sold.mul('70').toFixed(12), bought_base_value: sold.mul('70.25').toFixed(12) })
    } catch (error) {
      setToast(`Trade not posted: ${error instanceof Error ? error.message : 'Invalid trade command'}`)
      return
    }
    if (sessionCheck.error) { setToast(`Trade not posted: ${sessionCheck.error}`); return }
    setTrades([{ id: Date.now(), customer: 'Walk-in customer', direction: 'USD -> AFN', amount: `$${amount}`, rate: '70.25', time: 'Now', status: 'Posted' }, ...trades])
    setAmount('')
    setShowTrade(false)
    setToast('Trade posted to Supabase')
    window.setTimeout(() => setToast(''), 2800)
  }

  const exportActivity = () => {
    const csv = buildCsvReport(trades.map((trade) => ({ entryId: `trade_${trade.id}`, occurredAt: trade.time, type: trade.direction, branchId: 'Kabul Central', status: trade.status.toLowerCase(), realizedProfit: '0' })), 'Kabul Central Exchange', 'Recent Activity', new Date().toISOString())
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    link.download = 'sarafi-recent-activity.csv'
    link.click()
    URL.revokeObjectURL(link.href)
    setToast('CSV export generated')
  }

  if (!user) return <AuthScreen mode={authMode} email={authEmail} password={authPassword} message={authMessage} busy={authBusy} onModeChange={setAuthMode} onEmailChange={setAuthEmail} onPasswordChange={setAuthPassword} onSubmit={submitAuth} />
  if (organizationLoading) return <main className="auth-shell"><section className="auth-card"><div className="brand auth-brand"><span className="brand-mark">S</span><span>SARAFI<small>Exchange OS</small></span></div><p className="auth-subtitle">Loading your business workspace...</p></section></main>
  if (!organizationId) return <OnboardingScreen language={language} businessName={businessName} busy={organizationLoading} onLanguageChange={setLanguage} onBusinessNameChange={setBusinessName} onSubmit={submitOnboarding} />

  return (
    <div className={`app-shell ${isRtl(language) ? 'rtl' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><span>SARAFI<small>Exchange OS</small></span></div>
        <div className="branch-switch"><span className="status-dot" /><span><b>Kabul Central</b><small>Main branch</small></span><span className="chevron">⌄</span></div>
        <p className="nav-label">Workspace</p>
        <nav>{['Dashboard', 'Trade', 'Transactions', 'Cash & Accounts', 'People', 'Debts', 'Rates', 'Reports'].map((item) => <button className={activeNav === item ? 'nav-item active' : 'nav-item'} key={item} onClick={() => { setActiveNav(item); if (item === 'Trade') setShowTrade(true) }}><span className="nav-icon">{['◫', '+', '≡', '▣', '♙', '↔', '↗', '▤'][['Dashboard', 'Trade', 'Transactions', 'Cash & Accounts', 'People', 'Debts', 'Rates', 'Reports'].indexOf(item)]}</span>{item}{item === 'Transactions' && <em>12</em>}</button>)}</nav>
        <p className="nav-label bottom-label">Administration</p>
        <nav><button className="nav-item"><span className="nav-icon">◉</span>Team & Devices</button><button className="nav-item"><span className="nav-icon">⚙</span>Settings</button></nav>
        <div className="sidebar-footer"><div className="avatar">MA</div><span><b>{user.email ?? 'Authenticated owner'}</b><small>Owner · Online</small></span><button aria-label="Sign out" onClick={() => void signOut()}>↪</button></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>{t('workspace')}</span><b>/</b><strong>{activeNav}</strong></div><div className="top-actions"><button className="icon-button" onClick={() => setPrivacy(!privacy)} aria-label="Toggle privacy mode">{privacy ? '◉' : '◌'}</button><button className="lang-button" onClick={() => setLanguage(language === 'en' ? 'fa-AF' : language === 'fa-AF' ? 'ps-AF' : 'en')}>{language === 'en' ? 'EN' : language === 'fa-AF' ? 'دری' : 'PS'} <span>⌄</span></button><button className="help-button">?</button></div></header>
        <div className="content-wrap">
          <section className="welcome"><div><p className="kicker">MONDAY, 24 AUGUST 2026 · 10:45 AM</p><h1>Good morning, Mohammad.</h1><p className="subtitle">Here is where your business stands today.</p></div><div className="action-wrap"><button className="primary-action" onClick={() => setShowTrade(true)}><span>+</span> New trade <kbd>⌘ K</kbd></button><button className="secondary-action" onClick={() => setShowActions(!showActions)} aria-expanded={showActions}>More actions <span>⌄</span></button>{showActions && <div className="action-menu">{['Buy currency', 'Sell currency', 'Exchange currency', 'Receive money', 'Pay money', 'Debt / Credit', 'Transfer cash', 'Expense', 'Owner capital', 'Bank movement'].map((action) => <button key={action} onClick={() => { setShowActions(false); setToast(`${action} workflow is ready for ledger posting`) }}>{action}<span>→</span></button>)}<button className="optional-action" onClick={() => { setShowActions(false); setToast('Hawala is disabled for this organization') }}>Hawala <small>Optional module</small><span>→</span></button></div>}</div></section>
          <div className="notice"><span className={`sync-dot ${online ? 'online' : 'offline'}`} /><span><b>{online ? t('online') : t('stillOffline')}</b> · {supabaseConfigured ? 'Supabase credentials loaded' : t('localWorkspace')} · {online ? `${t('lastSync')}: just now` : `${t('pendingSync')}: 0`}</span><button onClick={() => setToast(online ? 'Authoritative sync is ready after migrations are applied' : 'Offline commands will remain pending until reconnect')}>{online ? 'Connected' : 'Offline mode'}</button></div>
          <section className="rate-strip"><div className="rate-title"><span className="rate-live" /> <div><b>{t('rates')}</b><small>Retail · Kabul Central · AFN per USD</small></div></div><label>{t('buy')}<input value={rate} onChange={(event) => setRate(event.target.value)} /></label><label>{t('sell')}<input value="70.35" readOnly /></label><div className="calculator"><input value={calculatorAmount} onChange={(event) => setCalculatorAmount(event.target.value)} /><span>USD</span><b>=</b><strong>{calculateCounterAmount(calculatorAmount || '0', rate || '1', 'AFN_PER_UNIT', 2)}</strong><span>AFN</span></div><button className="text-button" onClick={() => setToast('Rate history and branch overrides are ready for owner review')}>{t('history')} →</button></section>
          <section className="metric-grid"><article className="metric-card hero-metric"><div className="card-head"><span>Total position</span><button aria-label="Hide amount" onClick={() => setPrivacy(!privacy)}>◌</button></div><strong>{hidden || '؋ 18,245,650'}</strong><div className="metric-foot"><span className="positive">↑ 2.4%</span><span>vs yesterday</span></div><div className="sparkline">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div></article><article className="metric-card"><div className="card-head"><span>Today&apos;s volume</span><span className="card-symbol">↗</span></div><strong>{hidden || '؋ 2,840,500'}</strong><div className="metric-foot"><span className="positive">↑ 18.7%</span><span>vs last Monday</span></div></article><article className="metric-card"><div className="card-head"><span>Realized profit</span><span className="card-symbol profit">✦</span></div><strong className="profit-text">{hidden || '؋ 184,250'}</strong><div className="metric-foot"><span className="positive">↑ 8.2%</span><span>today</span></div></article></section>
          <section className="live-business"><div><span className="live-pulse" /> <b>Live business</b><small>Updates from authorized activity</small></div><div><strong>3</strong><small>Pending approvals</small></div><div><strong>2 / 2</strong><small>Cashboxes reconciled</small></div><div><strong>4</strong><small>Team online</small></div><button onClick={() => setToast('Live activity reconnects and refetches authoritative state')}>Open live view →</button></section>
          <section className="dashboard-grid"><article className="panel balances"><div className="panel-header"><div><h2>Where your money is</h2><p>Live balances across all accounts</p></div><button className="text-button">View all -&gt;</button></div><div className="balance-list"><Balance symbol="؋" tone="afn" name="Afghan Afghani" location="Cash · Kabul Central" value={hidden || '؋ 12,450,000'} change="+1.8%" /><Balance symbol="$" tone="usd" name="US Dollar" location="Cash · Safe 01" value={hidden || '$ 68,420.00'} change="+0.4%" /><Balance symbol="€" tone="eur" name="Euro" location="Bank · Azizi Bank" value={hidden || '€ 24,800.00'} change="-0.2%" negative /></div></article><article className="panel attention"><div className="panel-header"><div><h2>Needs attention</h2><p>Items requiring your review</p></div><span className="attention-count">3</span></div><div className="attention-list"><Attention tone="amber" title="Cashbox reconciliation" detail="Counter 02 · Due now" /><Attention tone="red" title="Approval requested" detail="Large trade · 5 min ago" /><Attention tone="blue" title="Rate update available" detail="Market rates · 12 min ago" /></div></article></section>
          <section className="panel activity"><div className="panel-header"><div><h2>Recent activity</h2><p>Every movement, recorded and traceable</p></div><div className="activity-actions"><button className="filter-button">Today <span>⌄</span></button><button className="export-button" onClick={exportActivity}>Export CSV</button></div></div><div className="table-wrap"><table><thead><tr><th>Transaction</th><th>Direction</th><th>Amount</th><th>Time</th><th>Status</th><th /></tr></thead><tbody>{trades.map((trade) => <tr key={trade.id}><td><span className="transaction-icon">↕</span><span className="table-person"><b>{trade.customer}</b><small>Trade #{String(trade.id).padStart(5, '0')}</small></span></td><td>{trade.direction}</td><td><b>{privacy ? '••••' : trade.amount}</b><small>@ {trade.rate}</small></td><td>{trade.time}</td><td><span className={`status ${trade.status.toLowerCase()}`}>{trade.status}</span></td><td><button className="more">•••</button></td></tr>)}</tbody></table></div></section>
        </div>
      </main>
      {showTrade && <div className="modal-backdrop" onClick={() => setShowTrade(false)}><form className="trade-modal" onSubmit={addTrade} onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="kicker">NEW TRANSACTION</p><h2>Record a trade</h2></div><button type="button" className="close" onClick={() => setShowTrade(false)}>×</button></div><label>Customer or counterparty<input placeholder="Search people or enter walk-in" /></label><div className="form-grid"><label>Sell<input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" autoFocus /><small>USD · United States Dollar</small></label><label>Buy<input placeholder="0.00" /><small>AFN · Afghan Afghani</small></label></div><div className="rate-box"><span>Exchange rate</span><b>1 USD = 70.25 AFN</b><span className="positive">Market rate</span></div><button className="primary-action full" type="submit">Post trade <span>→</span></button><p className="modal-note">Posting requires an authenticated user, active organization, branch, cashbox, and enabled currencies.</p></form></div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function Balance({ symbol, tone, name, location, value, change, negative = false }: { symbol: string; tone: string; name: string; location: string; value: string; change: string; negative?: boolean }) { return <div className="balance-row"><span className={`currency-badge ${tone}`}>{symbol}</span><span className="balance-name"><b>{name}</b><small>{location}</small></span><strong>{value}</strong><span className={`balance-change ${negative ? 'negative' : 'positive'}`}>{change}</span></div> }
function Attention({ tone, title, detail }: { tone: string; title: string; detail: string }) { return <button><span className={`alert-dot ${tone}`} /><span><b>{title}</b><small>{detail}</small></span><span>›</span></button> }

function AuthScreen({ mode, email, password, message, busy, onModeChange, onEmailChange, onPasswordChange, onSubmit }: { mode: 'signIn' | 'signUp' | 'reset'; email: string; password: string; message: string; busy: boolean; onModeChange: (mode: 'signIn' | 'signUp' | 'reset') => void; onEmailChange: (value: string) => void; onPasswordChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void> }) {
  const reset = mode === 'reset'
  return <main className="auth-shell"><section className="auth-card"><div className="brand auth-brand"><span className="brand-mark">S</span><span>SARAFI<small>Exchange OS</small></span></div><p className="kicker">SECURE ACCESS</p><h1>{reset ? 'Reset your password' : mode === 'signUp' ? 'Create your owner account' : 'Welcome back'}</h1><p className="auth-subtitle">Your business dashboard is protected by Supabase Auth.</p><form onSubmit={onSubmit}><label>Email address<input type="email" required value={email} onChange={(event) => onEmailChange(event.target.value)} autoComplete="email" /></label>{!reset && <label>Password<input type="password" required minLength={8} value={password} onChange={(event) => onPasswordChange(event.target.value)} autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} /></label>}<button className="primary-action full" type="submit" disabled={busy}>{busy ? 'Working...' : reset ? 'Send reset link' : mode === 'signUp' ? 'Create account' : 'Sign in'} <span>→</span></button></form>{message && <p className="auth-message" role="status">{message}</p>}<div className="auth-links">{!reset && <button onClick={() => onModeChange(mode === 'signIn' ? 'signUp' : 'signIn')}>{mode === 'signIn' ? 'Create an account' : 'Back to sign in'}</button>}{mode === 'signIn' && <button onClick={() => onModeChange('reset')}>Forgot password?</button>}{reset && <button onClick={() => onModeChange('signIn')}>Back to sign in</button>}</div></section></main>
}

function OnboardingScreen({ language, businessName, busy, onLanguageChange, onBusinessNameChange, onSubmit }: { language: Language; businessName: string; busy: boolean; onLanguageChange: (language: Language) => void; onBusinessNameChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void> }) {
  return <main className="auth-shell"><section className="auth-card"><div className="brand auth-brand"><span className="brand-mark">S</span><span>SARAFI<small>Exchange OS</small></span></div><p className="kicker">FIRST BUSINESS SETUP</p><h1>Set up your Sarafi</h1><p className="auth-subtitle">Your opening business structure is created securely on the server.</p><form onSubmit={onSubmit}><label>Business name<input required minLength={2} value={businessName} onChange={(event) => onBusinessNameChange(event.target.value)} placeholder="Kabul Central Exchange" /></label><label>Language<select value={language} onChange={(event) => onLanguageChange(event.target.value as Language)}><option value="en">English</option><option value="fa-AF">Dari</option><option value="ps-AF">Pashto</option></select></label><div className="setup-summary"><span>Base currency</span><b>AFN · Afghan Afghani</b><span>Enabled currencies</span><b>AFN · USD · EUR</b><span>First location</span><b>Main Branch · Main Counter</b></div><button className="primary-action full" disabled={busy} type="submit">{busy ? 'Creating business...' : 'Create business'} <span>→</span></button></form></section></main>
}

export default App
