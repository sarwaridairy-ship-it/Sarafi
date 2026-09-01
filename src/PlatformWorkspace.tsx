import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Language } from './lib/i18n'
import {
  createSubscriptionPaymentRequest,
  decideSubscriptionPayment,
  getBillingPortal,
  getPlatformAdminConsole,
  getPlatformOrganizationUsers,
  setPaymentProviderState,
  setPlatformUserAccess,
  setSubscriptionStatus,
  type BillingPortal,
  type PaymentProvider,
  type PlatformConsole,
  type PlatformOrganizationUser,
  type SubscriptionPlan,
} from './lib/platformApi'

type Copy = {
  [key: string]: string
}

const copy: Record<Language, Copy> = {
  en: {
    admin: 'SARAFI administrator', adminIntro: 'Manage businesses, user access, plans, and payment activation. Shop money and transactions are not visible here.',
    businesses: 'Businesses', payments: 'Payments', providers: 'Payment methods', users: 'Users', plans: 'Plans',
    organizations: 'Active businesses', activePlans: 'Active plans', pendingPayments: 'Payments waiting', suspendedUsers: 'Suspended users',
    findBusiness: 'Find a business', members: 'employees', plan: 'Plan', status: 'Status', open: 'Open', close: 'Close',
    noAccess: 'This account is not a platform administrator.', noAccessHelp: 'Sign in with the administrator account assigned by the project operator.',
    loading: 'Loading administrator workspace…', retry: 'Try again', signOut: 'Sign out', language: 'Language',
    userAccess: 'User access', suspend: 'Suspend', restore: 'Restore', reason: 'Reason', reasonPlaceholder: 'Write a clear reason', save: 'Save',
    subscriptionControl: 'Business plan control', paymentQueue: 'Payment activation queue', receipt: 'Receipt reference', amount: 'Amount',
    approve: 'Approve and activate', reject: 'Reject', adminNote: 'Administrator note', noPayments: 'No payment is waiting for review.',
    providerControl: 'Payment method control', live: 'Active', disabled: 'Disabled', configuration_required: 'Needs secure setup',
    manualSafe: 'Manual payment review is ready. Online gateways remain locked until merchant credentials and signed webhooks are configured.',
    mfaNote: 'Approvals, suspensions, and payment changes require the administrator’s verification code.', saved: 'Saved successfully.', failed: 'This action could not be completed.',
    billing: 'Plan and payment', billingIntro: 'See your current plan and request activation. Your shop records stay available even when payment is being reviewed.',
    currentPlan: 'Current plan', validUntil: 'Valid until', trial: 'Trial', active: 'Active', pending_payment: 'Payment under review', past_due: 'Payment due', suspended: 'Suspended', expired: 'Expired', cancelled: 'Cancelled',
    choosePlan: 'Choose a plan', perMonth: 'per month', employees: 'employees', branches: 'branches', choosePayment: 'Payment method',
    referenceHelp: 'Enter the receipt or transfer reference', optionalNote: 'Optional note', requestActivation: 'Send for activation', requestSent: 'Payment was sent for administrator review.',
    paymentHistory: 'Payment requests', noRequests: 'No payment request yet.', onlyOwner: 'Only the business owner can manage plans and payments.', backHome: 'Back to Home',
  },
  'fa-AF': {
    admin: 'مدیریت عمومی صرافی', adminIntro: 'صرافی‌ها، دسترسی کاربران، بسته‌ها و فعال‌سازی پرداخت را مدیریت کنید. پول و معاملات صرافی‌ها در این صفحه دیده نمی‌شود.',
    businesses: 'صرافی‌ها', payments: 'پرداخت‌ها', providers: 'روش‌های پرداخت', users: 'کاربران', plans: 'بسته‌ها',
    organizations: 'صرافی‌های فعال', activePlans: 'بسته‌های فعال', pendingPayments: 'پرداخت‌های منتظر', suspendedUsers: 'کاربران متوقف',
    findBusiness: 'جستجوی صرافی', members: 'کارمند', plan: 'بسته', status: 'حالت', open: 'باز کردن', close: 'بستن',
    noAccess: 'این حساب مدیر عمومی سیستم نیست.', noAccessHelp: 'با حساب مدیری که مسئول پروژه تعیین کرده است وارد شوید.',
    loading: 'صفحه مدیریت آماده می‌شود…', retry: 'دوباره کوشش کنید', signOut: 'خروج', language: 'زبان',
    userAccess: 'دسترسی کاربر', suspend: 'متوقف کردن', restore: 'فعال کردن', reason: 'دلیل', reasonPlaceholder: 'دلیل روشن بنویسید', save: 'ذخیره',
    subscriptionControl: 'کنترول بسته صرافی', paymentQueue: 'پرداخت‌های منتظر فعال‌سازی', receipt: 'شماره رسید', amount: 'مبلغ',
    approve: 'تأیید و فعال کردن', reject: 'رد کردن', adminNote: 'یادداشت مدیر', noPayments: 'هیچ پرداختی منتظر بررسی نیست.',
    providerControl: 'کنترول روش پرداخت', live: 'فعال', disabled: 'غیرفعال', configuration_required: 'تنظیم مصئون لازم است',
    manualSafe: 'بررسی دستی پرداخت آماده است. درگاه آنلاین تا زمان تنظیم حساب تجارتی و پیام تأیید مصئون، قفل می‌ماند.',
    mfaNote: 'تأیید پرداخت، توقف کاربر و تغییر روش پرداخت به کود امنیتی مدیر نیاز دارد.', saved: 'با موفقیت ذخیره شد.', failed: 'این کار انجام نشد.',
    billing: 'بسته و پرداخت', billingIntro: 'بسته فعلی را ببینید و درخواست فعال‌سازی بفرستید. معلومات صرافی هنگام بررسی پرداخت از بین نمی‌رود.',
    currentPlan: 'بسته فعلی', validUntil: 'اعتبار تا', trial: 'آزمایشی', active: 'فعال', pending_payment: 'پرداخت زیر بررسی', past_due: 'پرداخت مانده', suspended: 'متوقف', expired: 'ختم شده', cancelled: 'لغو شده',
    choosePlan: 'انتخاب بسته', perMonth: 'در ماه', employees: 'کارمند', branches: 'شعبه', choosePayment: 'روش پرداخت',
    referenceHelp: 'شماره رسید یا انتقال را بنویسید', optionalNote: 'یادداشت اختیاری', requestActivation: 'فرستادن برای فعال‌سازی', requestSent: 'پرداخت برای بررسی مدیر فرستاده شد.',
    paymentHistory: 'درخواست‌های پرداخت', noRequests: 'هنوز درخواست پرداختی نیست.', onlyOwner: 'تنها مالک صرافی بسته و پرداخت را مدیریت می‌کند.', backHome: 'بازگشت به خانه',
  },
  'ps-AF': {
    admin: 'د صرافۍ عمومي اداره', adminIntro: 'صرافۍ، د کاروونکو لاسرسی، بستې او د تادیې فعالول اداره کړئ. د صرافیو پیسې او معاملې دلته نه لیدل کېږي.',
    businesses: 'صرافۍ', payments: 'تادیې', providers: 'د تادیې لارې', users: 'کاروونکي', plans: 'بستې',
    organizations: 'فعالې صرافۍ', activePlans: 'فعالې بستې', pendingPayments: 'منتظرې تادیې', suspendedUsers: 'درول شوي کاروونکي',
    findBusiness: 'صرافي پیدا کول', members: 'کارکوونکي', plan: 'بسته', status: 'حالت', open: 'پرانیستل', close: 'تړل',
    noAccess: 'دا حساب د سیستم عمومي مدیر نه دی.', noAccessHelp: 'د پروژې د مسؤل له ټاکل شوي مدیر حساب سره ننوځئ.',
    loading: 'د ادارې پاڼه چمتو کېږي…', retry: 'بیا هڅه وکړئ', signOut: 'وتل', language: 'ژبه',
    userAccess: 'د کاروونکي لاسرسی', suspend: 'درول', restore: 'فعالول', reason: 'لامل', reasonPlaceholder: 'روښانه لامل ولیکئ', save: 'ساتل',
    subscriptionControl: 'د صرافۍ د بستې کنترول', paymentQueue: 'د فعالولو منتظرې تادیې', receipt: 'د رسید شمېره', amount: 'اندازه',
    approve: 'تایید او فعالول', reject: 'ردول', adminNote: 'د مدیر یادښت', noPayments: 'د کتنې لپاره تادیه نشته.',
    providerControl: 'د تادیې د لارې کنترول', live: 'فعاله', disabled: 'غیرفعاله', configuration_required: 'خوندي تنظیم غواړي',
    manualSafe: 'د لاسي تادیې کتنه چمتو ده. انلاین دروازه تر سوداګریز حساب او خوندي تایید پورې تړلې پاتې کېږي.',
    mfaNote: 'د تادیې تایید، د کاروونکي درول او د تادیې بدلون د مدیر امنیتي کوډ غواړي.', saved: 'په بریالیتوب وساتل شو.', failed: 'دا کار ترسره نه شو.',
    billing: 'بسته او تادیه', billingIntro: 'اوسنۍ بسته وګورئ او د فعالولو غوښتنه واستوئ. د تادیې د کتنې پر مهال د صرافۍ معلومات نه ورکېږي.',
    currentPlan: 'اوسنۍ بسته', validUntil: 'تر دې نېټې', trial: 'ازمایښتي', active: 'فعاله', pending_payment: 'تادیه تر کتنې لاندې', past_due: 'تادیه پاتې ده', suspended: 'درول شوې', expired: 'پای ته رسېدلې', cancelled: 'لغوه شوې',
    choosePlan: 'بسته وټاکئ', perMonth: 'په میاشت', employees: 'کارکوونکي', branches: 'څانګې', choosePayment: 'د تادیې لاره',
    referenceHelp: 'د رسید یا لېږد شمېره ولیکئ', optionalNote: 'اختیاري یادښت', requestActivation: 'د فعالولو لپاره لېږل', requestSent: 'تادیه د مدیر کتنې ته ولېږل شوه.',
    paymentHistory: 'د تادیې غوښتنې', noRequests: 'تر اوسه د تادیې غوښتنه نشته.', onlyOwner: 'یوازې د صرافۍ مالک بسته او تادیه اداره کوي.', backHome: 'کور ته ستنېدل',
  },
}

const localized = (language: Language, row: SubscriptionPlan | PaymentProvider, field: 'name' | 'description' | 'instructions') => {
  const suffix = language === 'fa-AF' ? 'dari' : language === 'ps-AF' ? 'pashto' : 'en'
  return String(row[`${field}_${suffix}` as keyof typeof row] ?? '')
}

const statusText = (language: Language, value: string) => copy[language][value] ?? value.replaceAll('_', ' ')

export function BillingView({
  language,
  organizationId,
  onBack,
  onToast,
}: {
  language: Language
  organizationId: string
  onBack: () => void
  onToast: (message: string) => void
}) {
  const c = copy[language]
  const inspection = organizationId === 'inspection'
  const [portal, setPortal] = useState<BillingPortal | null>(null)
  const [loading, setLoading] = useState(!inspection)
  const [planId, setPlanId] = useState('')
  const [providerCode, setProviderCode] = useState('manual_review')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (inspection) {
      setPortal({
        subscription: { id: 'preview-subscription', status: 'trial', trial_ends_at: new Date(Date.now() + 86400000 * 20).toISOString(), current_period_end: null, plan_id: 'starter', plan_code: 'starter', plan_name_en: 'Small shop', plan_name_dari: 'صرافی کوچک', plan_name_pashto: 'کوچنۍ صرافي' },
        plans: [
          { id: 'starter', code: 'starter', name_en: 'Small shop', name_dari: 'صرافی کوچک', name_pashto: 'کوچنۍ صرافي', description_en: 'One branch with the essential daily tools.', description_dari: 'یک شعبه با ابزارهای ضروری روزانه.', description_pashto: 'یوه څانګه او د ورځني کار اړین وسایل.', price_afn: '1000', billing_interval: 'monthly', employee_limit: 5, branch_limit: 1, features: {}, status: 'published', sort_order: 10 },
          { id: 'business', code: 'business', name_en: 'Growing business', name_dari: 'صرافی در حال رشد', name_pashto: 'پراخېدونکې صرافي', description_en: 'More employees, branches, reports, and compliance controls.', description_dari: 'کارمندان، شعبه‌ها، گزارش‌ها و کنترول بیشتر.', description_pashto: 'ډېر کارکوونکي، څانګې، راپورونه او کنترول.', price_afn: '2500', billing_interval: 'monthly', employee_limit: 25, branch_limit: 5, features: {}, status: 'published', sort_order: 20 },
        ],
        providers: [{ code: 'manual_review', name_en: 'Bank or office payment', name_dari: 'پرداخت بانکی یا در دفتر', name_pashto: 'بانکي یا د دفتر تادیه', instructions_en: 'Pay and enter the receipt reference.', instructions_dari: 'پرداخت کنید و شماره رسید را بنویسید.', instructions_pashto: 'تادیه وکړئ او د رسید شمېره ولیکئ.', provider_mode: 'manual_review', state: 'live', public_checkout_url: null }],
        requests: [],
      })
      setPlanId('starter')
      return
    }
    setLoading(true)
    const result = await getBillingPortal(organizationId)
    if (result.data) {
      setPortal(result.data)
      setPlanId(result.data.subscription?.plan_id || result.data.plans[0]?.id || '')
      setProviderCode(result.data.providers[0]?.code || '')
    }
    if (result.error) onToast(c.onlyOwner)
    setLoading(false)
  }, [c.onlyOwner, inspection, onToast, organizationId])

  // oxlint-disable-next-line react/set-state-in-effect -- Fetching the external billing record is the purpose of this effect.
  useEffect(() => { void load() }, [load])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (inspection) { onToast(c.requestSent); setReference(''); return }
    setBusy(true)
    const result = await createSubscriptionPaymentRequest({ organizationId, planId, providerCode, reference, note })
    setBusy(false)
    if (result.error) { onToast(c.failed); return }
    onToast(c.requestSent)
    setReference('')
    setNote('')
    await load()
  }

  if (loading) return <section className="panel billing-workspace"><div className="empty-live">{c.loading}</div></section>
  if (!portal) return <section className="panel billing-workspace"><div className="empty-live">{c.onlyOwner}</div></section>
  const currentPlanName = language === 'fa-AF' ? portal.subscription.plan_name_dari : language === 'ps-AF' ? portal.subscription.plan_name_pashto : portal.subscription.plan_name_en
  const periodEnd = portal.subscription.current_period_end || portal.subscription.trial_ends_at
  return (
    <section className="panel billing-workspace">
      <div className="panel-header">
        <div><p className="kicker">{c.billing}</p><h1>{c.billing}</h1><p>{c.billingIntro}</p></div>
        <button className="text-button" onClick={onBack}>{c.backHome} →</button>
      </div>
      <article className="current-plan-card">
        <span>{c.currentPlan}</span><h2>{currentPlanName}</h2>
        <strong className={`subscription-state ${portal.subscription.status}`}>{statusText(language, portal.subscription.status)}</strong>
        {periodEnd && <small>{c.validUntil}: {new Date(periodEnd).toLocaleDateString(language)}</small>}
      </article>
      <form onSubmit={submit} className="billing-form">
        <fieldset><legend>{c.choosePlan}</legend><div className="plan-card-grid">
          {portal.plans.map((plan) => <label className={`plan-choice ${planId === plan.id ? 'selected' : ''}`} key={plan.id}>
            <input type="radio" name="plan" value={plan.id} checked={planId === plan.id} onChange={() => setPlanId(plan.id)} />
            <b>{localized(language, plan, 'name')}</b><span dir="ltr">{plan.price_afn} AFN · {c.perMonth}</span>
            <small>{localized(language, plan, 'description')}</small><em>{plan.employee_limit} {c.employees} · {plan.branch_limit} {c.branches}</em>
          </label>)}
        </div></fieldset>
        <label>{c.choosePayment}<select value={providerCode} onChange={(event) => setProviderCode(event.target.value)}>{portal.providers.map((provider) => <option value={provider.code} key={provider.code}>{localized(language, provider, 'name')}</option>)}</select></label>
        {portal.providers.find((item) => item.code === providerCode) && <p className="payment-instructions">{localized(language, portal.providers.find((item) => item.code === providerCode)!, 'instructions')}</p>}
        <label>{c.receipt}<input required minLength={3} value={reference} onChange={(event) => setReference(event.target.value)} placeholder={c.referenceHelp} /></label>
        <label>{c.optionalNote}<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <button className="primary-action" disabled={busy || !planId || !providerCode}>{c.requestActivation}</button>
      </form>
      <section className="payment-history"><h2>{c.paymentHistory}</h2>{portal.requests.length ? portal.requests.map((request) => <div className="balance-row" key={request.id}><span className="currency-badge usd">؋</span><span className="balance-name"><b>{request.amount_afn} AFN</b><small>{request.payer_reference} · {new Date(request.requested_at).toLocaleDateString(language)}</small></span><strong>{statusText(language, request.status)}</strong></div>) : <div className="empty-live">{c.noRequests}</div>}</section>
    </section>
  )
}

export function PlatformAdminConsole({
  language,
  onLanguageChange,
  onSignOut,
}: {
  language: Language
  onLanguageChange: (language: Language) => void
  onSignOut: () => void
}) {
  const c = copy[language]
  const inspection = import.meta.env.MODE === 'e2e' && new URLSearchParams(window.location.search).get('preview') === '1'
  const [data, setData] = useState<PlatformConsole | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'businesses' | 'payments' | 'providers'>('businesses')
  const [query, setQuery] = useState('')
  const [selectedOrganization, setSelectedOrganization] = useState<string | null>(null)
  const [users, setUsers] = useState<PlatformOrganizationUser[]>([])
  const [reason, setReason] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getPlatformAdminConsole()
    setData(result.data)
    setError(result.error ?? '')
    setLoading(false)
  }, [])
  // oxlint-disable-next-line react/set-state-in-effect -- Fetching the external administrator record is the purpose of this effect.
  useEffect(() => { void load() }, [load])
  // oxlint-disable-next-line react/set-state-in-effect -- User rows are external data keyed by the selected organization.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Clearing stale external rows when no organization is selected.
    if (!selectedOrganization) { setUsers([]); return }
    void getPlatformOrganizationUsers(selectedOrganization).then((result) => {
      setUsers(result.data ?? [])
      if (result.error) setToast(c.failed)
    })
  }, [c.failed, selectedOrganization])

  const organizations = useMemo(() => (data?.organizations ?? []).filter((item) => item.display_name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [data, query])
  const act = async (promise: Promise<{ error: string | null }>) => {
    const result = await promise
    setToast(result.error ? `${c.failed} ${result.error.includes('AAL2') ? c.mfaNote : ''}` : c.saved)
    if (!result.error) { setReason(''); setAdminNote(''); await load() }
  }

  if (loading) return <main className="platform-shell"><div className="platform-state">{c.loading}</div></main>
  if (error || !data) return <main className="platform-shell"><section className="platform-state"><h1>{c.noAccess}</h1><p>{c.noAccessHelp}</p><button className="primary-action" onClick={() => void load()}>{c.retry}</button><button className="text-button" onClick={onSignOut}>{c.signOut}</button></section></main>

  return <main className="platform-shell">
    <header className="platform-header"><div><span className="brand-mark">S</span><span><b>{c.admin}</b><small>{c.adminIntro}</small></span></div><div><select value={language} aria-label={c.language} onChange={(event) => onLanguageChange(event.target.value as Language)}><option value="fa-AF">دری</option><option value="ps-AF">پښتو</option><option value="en">English</option></select><button className="text-button" onClick={onSignOut}>{c.signOut}</button></div></header>
    <section className="platform-metrics"><article><span>{c.organizations}</span><b>{data.counts.organizations}</b></article><article><span>{c.activePlans}</span><b>{data.counts.active_subscriptions}</b></article><article><span>{c.pendingPayments}</span><b>{data.counts.pending_payments}</b></article><article><span>{c.suspendedUsers}</span><b>{data.counts.suspended_users}</b></article></section>
    <nav className="platform-tabs"><button className={tab === 'businesses' ? 'active' : ''} onClick={() => setTab('businesses')}>{c.businesses}</button><button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>{c.payments}</button><button className={tab === 'providers' ? 'active' : ''} onClick={() => setTab('providers')}>{c.providers}</button></nav>
    {toast && <div className="notice" role="status">{toast}<button onClick={() => setToast('')}>×</button></div>}
    <p className="platform-security-note">{c.mfaNote}</p>
    {tab === 'businesses' && <section className="platform-grid"><div className="platform-list"><label>{c.findBusiness}<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>{organizations.map((organization) => <button className={selectedOrganization === organization.id ? 'platform-business active' : 'platform-business'} key={organization.id} onClick={() => setSelectedOrganization(organization.id)}><span><b>{organization.display_name}</b><small>{organization.member_count} {c.members} · {organization.plan_code ?? '—'}</small></span><strong>{statusText(language, organization.subscription_status ?? 'trial')}</strong></button>)}</div><div className="platform-detail">{selectedOrganization ? <><h2>{c.subscriptionControl}</h2><label>{c.reason}<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={c.reasonPlaceholder} /></label><div className="inline-actions"><button onClick={() => void act(setSubscriptionStatus({ organizationId: selectedOrganization, status: 'active', reason: reason || c.restore }))}>{c.restore}</button><button className="danger" onClick={() => void act(setSubscriptionStatus({ organizationId: selectedOrganization, status: 'suspended', reason }))}>{c.suspend}</button></div><h2>{c.userAccess}</h2>{users.map((user) => <div className="platform-user" key={user.user_id}><span><b>{user.display_name}</b><small>{user.email} · {user.role_code}</small></span><strong>{statusText(language, user.platform_status)}</strong><button onClick={() => void act(setPlatformUserAccess({ userId: user.user_id, status: user.platform_status === 'active' ? 'suspended' : 'active', reason }))}>{user.platform_status === 'active' ? c.suspend : c.restore}</button></div>)}</> : <div className="empty-live">{c.open}</div>}</div></section>}
    {tab === 'payments' && <section className="platform-panel"><h1>{c.paymentQueue}</h1><label>{c.adminNote}<input value={adminNote} onChange={(event) => setAdminNote(event.target.value)} placeholder={c.reasonPlaceholder} /></label>{data.payment_requests.length ? data.payment_requests.map((request) => <article className="payment-review-card" key={request.id}><div><h2>{request.organization_name}</h2><p>{request.plan_name} · {request.amount_afn} AFN</p><small>{c.receipt}: {request.payer_reference || '—'} · {new Date(request.requested_at).toLocaleString(language)}</small></div><div><button className="primary-action" onClick={() => void act(decideSubscriptionPayment({ requestId: request.id, decision: 'approved', note: adminNote }))}>{c.approve}</button><button className="danger" onClick={() => void act(decideSubscriptionPayment({ requestId: request.id, decision: 'rejected', note: adminNote }))}>{c.reject}</button></div></article>) : <div className="empty-live">{c.noPayments}</div>}</section>}
    {tab === 'providers' && <section className="platform-panel"><h1>{c.providerControl}</h1><p>{c.manualSafe}</p>{data.providers.map((provider) => <article className="provider-card" key={provider.code}><div><h2>{localized(language, provider, 'name')}</h2><p>{localized(language, provider, 'instructions')}</p></div><select value={provider.state} disabled={provider.provider_mode === 'hosted_gateway' && !provider.public_checkout_url} onChange={(event) => void act(setPaymentProviderState({ providerCode: provider.code, state: event.target.value as PaymentProvider['state'] }))}><option value="live">{c.live}</option><option value="disabled">{c.disabled}</option><option value="configuration_required">{c.configuration_required}</option></select></article>)}</section>}
    {inspection && <small>preview</small>}
  </main>
}
