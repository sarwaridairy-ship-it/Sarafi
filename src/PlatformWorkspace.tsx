import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Language } from './lib/i18n'
import {
  createSubscriptionPaymentRequest,
  decideSubscriptionPayment,
  getBillingPortal,
  getPlatformAdminConsole,
  getPlatformOperations,
  getPlatformOrganizationUsers,
  getSupportDiagnostics,
  requestSupportAccess,
  revokePlatformSupportAccess,
  setPlatformAnnouncement,
  setPlatformAppVersion,
  setPlatformOrganizationFeature,
  setPaymentProviderState,
  setPlatformUserAccess,
  setSubscriptionStatus,
  type BillingPortal,
  type PaymentProvider,
  type PlatformConsole,
  type PlatformOperations,
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
    currentPlan: 'Current plan', validUntil: 'Valid until', trial: 'Trial', active: 'Active', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', revoked: 'Ended', pending_payment: 'Payment under review', past_due: 'Payment due', suspended: 'Suspended', expired: 'Expired', cancelled: 'Cancelled',
    choosePlan: 'Choose a plan', perMonth: 'per month', employees: 'employees', branches: 'branches', choosePayment: 'Payment method',
    referenceHelp: 'Enter the receipt or transfer reference', optionalNote: 'Optional note', requestActivation: 'Send for activation', requestSent: 'Payment was sent for administrator review.',
    paymentHistory: 'Payment requests', noRequests: 'No payment request yet.', onlyOwner: 'Only the business owner can manage plans and payments.', backHome: 'Back to Home',
    planCatalog: 'Plan catalog', published: 'Available', draft: 'Draft', retired: 'Retired', includedServices: 'Included controls',
    audit: 'Security history', auditTrail: 'Administrator security history', noAudit: 'No administrator action has been recorded yet.',
    operations: 'System health', support: 'Safe support', announcements: 'Notices', healthy: 'Healthy', needsAttention: 'Needs attention', database: 'Database', privateFiles: 'Private files', unbalanced: 'Unbalanced entries', expiredApprovals: 'Expired approvals', supportWaiting: 'Support requests waiting', checkedAt: 'Checked',
    appVersion: 'Web version control', minimumVersion: 'Minimum version', recommendedVersion: 'Recommended version', forceUpdate: 'Require update', releaseNotes: 'Release notes', saveVersion: 'Save version',
    featureControl: 'Business feature controls', reportsFeature: 'Reports', complianceFeature: 'Compliance', hawalaFeature: 'Hawala', offlineFeature: 'Offline posting', enabled: 'Enabled',
    supportIntro: 'Ask the business owner for short, recorded diagnostic access. Financial transactions remain hidden.', supportBusiness: 'Business needing help', supportReason: 'Why access is needed', supportHours: 'Hours', requestSupport: 'Ask owner for access', accessRequested: 'Request sent to the owner', supportScope: 'Diagnostic scope', diagnostics: 'Diagnostics', configuration: 'Configuration', securityEvents: 'Security events', viewDiagnostics: 'View safe diagnostics', revoke: 'End access', ownerDecision: 'The owner must approve this request with a security code.', noSupport: 'No support request yet.',
    noticeIntro: 'Show a clear service or maintenance notice in all three languages.', noticeType: 'Notice type', maintenance: 'Maintenance', security: 'Security', service: 'Service', englishMessage: 'English message', dariMessage: 'Dari message', pashtoMessage: 'Pashto message', activeNotice: 'Show this notice', saveNotice: 'Save notice', noNotices: 'No notices have been created.',
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
    currentPlan: 'بسته فعلی', validUntil: 'اعتبار تا', trial: 'آزمایشی', active: 'فعال', pending: 'منتظر', approved: 'تأییدشده', rejected: 'ردشده', revoked: 'پایان‌یافته', pending_payment: 'پرداخت زیر بررسی', past_due: 'پرداخت مانده', suspended: 'متوقف', expired: 'ختم شده', cancelled: 'لغو شده',
    choosePlan: 'انتخاب بسته', perMonth: 'در ماه', employees: 'کارمند', branches: 'شعبه', choosePayment: 'روش پرداخت',
    referenceHelp: 'شماره رسید یا انتقال را بنویسید', optionalNote: 'یادداشت اختیاری', requestActivation: 'فرستادن برای فعال‌سازی', requestSent: 'پرداخت برای بررسی مدیر فرستاده شد.',
    paymentHistory: 'درخواست‌های پرداخت', noRequests: 'هنوز درخواست پرداختی نیست.', onlyOwner: 'تنها مالک صرافی بسته و پرداخت را مدیریت می‌کند.', backHome: 'بازگشت به خانه',
    planCatalog: 'فهرست بسته‌ها', published: 'قابل استفاده', draft: 'پیش‌نویس', retired: 'بازنشسته', includedServices: 'خدمات شامل',
    audit: 'تاریخچه امنیت', auditTrail: 'تاریخچه امنیت مدیران', noAudit: 'هنوز عملیات مدیری ثبت نشده است.',
    operations: 'سلامتی سیستم', support: 'کمک مصئون', announcements: 'اطلاعیه‌ها', healthy: 'سالم', needsAttention: 'بررسی لازم', database: 'دیتابیس', privateFiles: 'فایل‌های خصوصی', unbalanced: 'سندهای نامتوازن', expiredApprovals: 'تأییدی‌های وقت‌گذشته', supportWaiting: 'درخواست کمک منتظر', checkedAt: 'بررسی',
    appVersion: 'کنترول نسخه ویب', minimumVersion: 'کمترین نسخه', recommendedVersion: 'نسخه پیشنهادی', forceUpdate: 'اجبار به تازه‌سازی', releaseNotes: 'یادداشت نسخه', saveVersion: 'ذخیره نسخه',
    featureControl: 'کنترول امکانات صرافی', reportsFeature: 'گزارش‌ها', complianceFeature: 'رعایت اصول', hawalaFeature: 'حواله', offlineFeature: 'ثبت بدون انترنت', enabled: 'فعال',
    supportIntro: 'برای دیدن معلومات تخنیکی کوتاه و ثبت‌شده از مالک اجازه بخواهید. معاملات مالی پنهان می‌ماند.', supportBusiness: 'صرافی نیازمند کمک', supportReason: 'دلیل نیاز به دسترسی', supportHours: 'ساعت', requestSupport: 'درخواست اجازه از مالک', accessRequested: 'درخواست به مالک فرستاده شد', supportScope: 'حدود بررسی', diagnostics: 'معلومات تخنیکی', configuration: 'تنظیمات', securityEvents: 'رویدادهای امنیتی', viewDiagnostics: 'دیدن معلومات مصئون', revoke: 'پایان دسترسی', ownerDecision: 'مالک باید این درخواست را با کود امنیتی تأیید کند.', noSupport: 'هنوز درخواست کمک نیست.',
    noticeIntro: 'اطلاعیه خدمت یا ترمیم را به هر سه زبان نشان دهید.', noticeType: 'نوع اطلاعیه', maintenance: 'ترمیم', security: 'امنیت', service: 'خدمت', englishMessage: 'متن انگلیسی', dariMessage: 'متن دری', pashtoMessage: 'متن پشتو', activeNotice: 'نمایش اطلاعیه', saveNotice: 'ذخیره اطلاعیه', noNotices: 'هنوز اطلاعیه‌ای ساخته نشده است.',
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
    currentPlan: 'اوسنۍ بسته', validUntil: 'تر دې نېټې', trial: 'ازمایښتي', active: 'فعاله', pending: 'منتظر', approved: 'تایید شوې', rejected: 'رد شوې', revoked: 'پای ته رسېدلې', pending_payment: 'تادیه تر کتنې لاندې', past_due: 'تادیه پاتې ده', suspended: 'درول شوې', expired: 'پای ته رسېدلې', cancelled: 'لغوه شوې',
    choosePlan: 'بسته وټاکئ', perMonth: 'په میاشت', employees: 'کارکوونکي', branches: 'څانګې', choosePayment: 'د تادیې لاره',
    referenceHelp: 'د رسید یا لېږد شمېره ولیکئ', optionalNote: 'اختیاري یادښت', requestActivation: 'د فعالولو لپاره لېږل', requestSent: 'تادیه د مدیر کتنې ته ولېږل شوه.',
    paymentHistory: 'د تادیې غوښتنې', noRequests: 'تر اوسه د تادیې غوښتنه نشته.', onlyOwner: 'یوازې د صرافۍ مالک بسته او تادیه اداره کوي.', backHome: 'کور ته ستنېدل',
    planCatalog: 'د بستو لېست', published: 'د کار وړ', draft: 'مسوده', retired: 'تړل شوې', includedServices: 'شامل خدمتونه',
    audit: 'امنیتي تاریخ', auditTrail: 'د مدیرانو امنیتي تاریخ', noAudit: 'تر اوسه د مدیر کوم کار نه دی ثبت شوی.',
    operations: 'د سیستم روغتیا', support: 'خوندي مرسته', announcements: 'خبرتیاوې', healthy: 'روغ', needsAttention: 'کتنه غواړي', database: 'ډیټابیس', privateFiles: 'شخصي فایلونه', unbalanced: 'بې‌توازنه سندونه', expiredApprovals: 'وخت تېر تاییدونه', supportWaiting: 'منتظرې مرستې غوښتنې', checkedAt: 'کتل شوی',
    appVersion: 'د وېب نسخې کنټرول', minimumVersion: 'تر ټولو کمه نسخه', recommendedVersion: 'سپارښتل شوې نسخه', forceUpdate: 'نوې نسخه اړینه ده', releaseNotes: 'د نسخې یادښت', saveVersion: 'نسخه ساتل',
    featureControl: 'د صرافۍ د اسانتیاوو کنټرول', reportsFeature: 'راپورونه', complianceFeature: 'د اصولو څارنه', hawalaFeature: 'حواله', offlineFeature: 'بې‌انټرنېټه ثبت', enabled: 'فعاله',
    supportIntro: 'د لنډ او ثبت شوي تخنیکي لاسرسي اجازه له مالک څخه وغواړئ. مالي معاملې پټې پاتې کېږي.', supportBusiness: 'مرستې ته اړتیا لرونکې صرافي', supportReason: 'ولې لاسرسی اړین دی', supportHours: 'ساعتونه', requestSupport: 'له مالک څخه اجازه غوښتل', accessRequested: 'غوښتنه مالک ته ولېږل شوه', supportScope: 'د کتنې حد', diagnostics: 'تخنیکي معلومات', configuration: 'تنظیمات', securityEvents: 'امنیتي پېښې', viewDiagnostics: 'خوندي معلومات کتل', revoke: 'لاسرسی ختمول', ownerDecision: 'مالک باید دا غوښتنه په امنیتي کوډ تایید کړي.', noSupport: 'تر اوسه د مرستې غوښتنه نشته.',
    noticeIntro: 'د خدمت یا ترمیم خبرتیا په درې واړو ژبو وښایئ.', noticeType: 'د خبرتیا ډول', maintenance: 'ترمیم', security: 'امنیت', service: 'خدمت', englishMessage: 'انګلیسي متن', dariMessage: 'دري متن', pashtoMessage: 'پښتو متن', activeNotice: 'خبرتیا ښودل', saveNotice: 'خبرتیا ساتل', noNotices: 'تر اوسه خبرتیا نه ده جوړه شوې.',
  },
}

const localized = (language: Language, row: SubscriptionPlan | PaymentProvider, field: 'name' | 'description' | 'instructions') => {
  const suffix = language === 'fa-AF' ? 'dari' : language === 'ps-AF' ? 'pashto' : 'en'
  return String(row[`${field}_${suffix}` as keyof typeof row] ?? '')
}

const statusText = (language: Language, value: string) => copy[language][value] ?? value.replaceAll('_', ' ')
const auditText = (language: Language, value: string) => ({
  en: { subscription_payment_approved: 'Payment approved', subscription_payment_rejected: 'Payment rejected', platform_user_active: 'User restored', platform_user_suspended: 'User suspended', subscription_status_changed: 'Plan status changed', payment_provider_state_changed: 'Payment method changed' },
  'fa-AF': { subscription_payment_approved: 'پرداخت تأیید شد', subscription_payment_rejected: 'پرداخت رد شد', platform_user_active: 'کاربر فعال شد', platform_user_suspended: 'کاربر متوقف شد', subscription_status_changed: 'حالت بسته تغییر کرد', payment_provider_state_changed: 'روش پرداخت تغییر کرد' },
  'ps-AF': { subscription_payment_approved: 'تادیه تایید شوه', subscription_payment_rejected: 'تادیه رد شوه', platform_user_active: 'کاروونکی فعال شو', platform_user_suspended: 'کاروونکی ودرول شو', subscription_status_changed: 'د بستې حالت بدل شو', payment_provider_state_changed: 'د تادیې لاره بدله شوه' },
}[language] as Record<string, string>)[value] ?? value.replaceAll('_', ' ')
const planFeatureText = (language: Language, value: string) => ({
  en: { reports: 'Reports', team: 'Team controls', compliance: 'Compliance', hawala: 'Hawala' },
  'fa-AF': { reports: 'گزارش‌ها', team: 'کنترول کارمندان', compliance: 'رعایت اصول', hawala: 'حواله' },
  'ps-AF': { reports: 'راپورونه', team: 'د کارکوونکو کنټرول', compliance: 'د اصولو څارنه', hawala: 'حواله' },
}[language] as Record<string, string>)[value] ?? (language === 'en' ? 'Other control' : language === 'fa-AF' ? 'کنترول دیگر' : 'بل کنټرول')
const roleText = (language: Language, value: string) => ({
  en: { owner: 'Owner', manager: 'Manager', accountant: 'Accountant', cashier: 'Cashier', compliance_officer: 'Compliance officer', viewer: 'Viewer' },
  'fa-AF': { owner: 'مالک', manager: 'مدیر', accountant: 'حسابدار', cashier: 'صندوق‌دار', compliance_officer: 'مسئول رعایت اصول', viewer: 'بیننده' },
  'ps-AF': { owner: 'مالک', manager: 'مدیر', accountant: 'حسابدار', cashier: 'صندوق‌دار', compliance_officer: 'د اصولو مسئول', viewer: 'لیدونکی' },
}[language] as Record<string, string>)[value] ?? value
const supportScopeText = (language: Language, value: string) => ({
  en: { diagnostics: 'Diagnostics', configuration: 'Configuration', security_events: 'Security events' },
  'fa-AF': { diagnostics: 'معلومات تخنیکی', configuration: 'تنظیمات', security_events: 'رویدادهای امنیتی' },
  'ps-AF': { diagnostics: 'تخنیکي معلومات', configuration: 'تنظیمات', security_events: 'امنیتي پېښې' },
}[language] as Record<string, string>)[value] ?? value
const diagnosticText = (language: Language, value: string) => ({
  en: { checked_at: 'Checked', active_members: 'Active employees', active_branches: 'Active branches', active_cashboxes: 'Active cashboxes', posted_entries: 'Posted entries', pending_approvals: 'Pending approvals', last_financial_event_at: 'Last financial activity', unbalanced_entries: 'Unbalanced entries' },
  'fa-AF': { checked_at: 'زمان بررسی', active_members: 'کارمندان فعال', active_branches: 'شعبه‌های فعال', active_cashboxes: 'صندوق‌های فعال', posted_entries: 'سندهای ثبت‌شده', pending_approvals: 'تأییدی‌های منتظر', last_financial_event_at: 'آخرین کار مالی', unbalanced_entries: 'سندهای نامتوازن' },
  'ps-AF': { checked_at: 'د کتنې وخت', active_members: 'فعال کارکوونکي', active_branches: 'فعالې څانګې', active_cashboxes: 'فعال صندوقونه', posted_entries: 'ثبت شوي سندونه', pending_approvals: 'منتظر تاییدونه', last_financial_event_at: 'وروستی مالي کار', unbalanced_entries: 'بې‌توازنه سندونه' },
}[language] as Record<string, string>)[value] ?? value.replaceAll('_', ' ')

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
  const [operations, setOperations] = useState<PlatformOperations | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'businesses' | 'payments' | 'providers' | 'plans' | 'operations' | 'support' | 'announcements' | 'audit'>('businesses')
  const [query, setQuery] = useState('')
  const [selectedOrganization, setSelectedOrganization] = useState<string | null>(null)
  const [users, setUsers] = useState<PlatformOrganizationUser[]>([])
  const [reason, setReason] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [toast, setToast] = useState('')
  const [minimumVersion, setMinimumVersion] = useState('1.0.0')
  const [recommendedVersion, setRecommendedVersion] = useState('1.0.0')
  const [releaseNotesEn, setReleaseNotesEn] = useState('')
  const [releaseNotesDari, setReleaseNotesDari] = useState('')
  const [releaseNotesPashto, setReleaseNotesPashto] = useState('')
  const [forceUpdate, setForceUpdate] = useState(false)
  const [supportReason, setSupportReason] = useState('')
  const [supportHours, setSupportHours] = useState(2)
  const [supportScope, setSupportScope] = useState<string[]>(['diagnostics'])
  const [diagnosticResult, setDiagnosticResult] = useState<Record<string, unknown> | null>(null)
  const [noticeType, setNoticeType] = useState<'maintenance' | 'security' | 'service'>('maintenance')
  const [noticeEn, setNoticeEn] = useState('')
  const [noticeDari, setNoticeDari] = useState('')
  const [noticePashto, setNoticePashto] = useState('')
  const [noticeActive, setNoticeActive] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    if (inspection) {
      const previewPlans: SubscriptionPlan[] = [
        { id: 'starter', code: 'starter', name_en: 'Small shop', name_dari: 'صرافی کوچک', name_pashto: 'کوچنۍ صرافي', description_en: 'One branch with essential daily tools.', description_dari: 'یک شعبه با ابزارهای ضروری روزانه.', description_pashto: 'یوه څانګه او د ورځني کار اړین وسایل.', price_afn: '1000', billing_interval: 'monthly', employee_limit: 5, branch_limit: 1, features: { reports: true, team: true }, status: 'published', sort_order: 10 },
        { id: 'business', code: 'business', name_en: 'Growing business', name_dari: 'صرافی در حال رشد', name_pashto: 'پراخېدونکې صرافي', description_en: 'More employees, branches, reports, and compliance controls.', description_dari: 'کارمندان، شعبه‌ها، گزارش‌ها و کنترول بیشتر.', description_pashto: 'ډېر کارکوونکي، څانګې، راپورونه او کنترول.', price_afn: '2500', billing_interval: 'monthly', employee_limit: 25, branch_limit: 5, features: { reports: true, team: true, compliance: true }, status: 'published', sort_order: 20 },
      ]
      setData({ organizations: [{ id: 'preview-org', display_name: 'Kabul Central Exchange', created_at: new Date().toISOString(), member_count: 6, plan_code: 'business', subscription_status: 'active', period_end: new Date(Date.now() + 86400000 * 30).toISOString() }], plans: previewPlans, providers: [{ code: 'manual_review', name_en: 'Bank or office payment', name_dari: 'پرداخت بانکی یا در دفتر', name_pashto: 'بانکي یا د دفتر تادیه', instructions_en: 'Review the receipt reference before activation.', instructions_dari: 'پیش از فعال‌سازی شماره رسید را بررسی کنید.', instructions_pashto: 'له فعالولو مخکې د رسید شمېره وګورئ.', provider_mode: 'manual_review', state: 'live', public_checkout_url: null }], payment_requests: [], audit_events: [{ id: 'preview-audit', event_type: 'subscription_payment_approved', target_organization_id: 'preview-org', organization_name: 'Kabul Central Exchange', target_user_id: null, created_at: new Date().toISOString() }], counts: { organizations: 1, active_subscriptions: 1, pending_payments: 0, suspended_users: 0 } })
      setOperations({ health: { database: 'healthy', checked_at: new Date().toISOString(), private_storage: true, unbalanced_posted_entries: 0, expired_pending_approvals: 0, pending_support_requests: 0 }, versions: [{ id: 'preview-version', platform: 'web', minimum_version: '1.0.0', recommended_version: '1.0.0', force_update: false, release_notes_en: 'Production web controls', release_notes_dari: 'کنترول‌های نسخه ویب', release_notes_pashto: 'د وېب کنټرولونه', active: true, updated_at: new Date().toISOString() }], announcements: [], support_requests: [], organization_features: [] })
      setError('')
      setLoading(false)
      return
    }
    const [result, operationResult] = await Promise.all([getPlatformAdminConsole(), getPlatformOperations()])
    setData(result.data)
    setOperations(operationResult.data)
    setError(result.error ?? operationResult.error ?? '')
    const webVersion = operationResult.data?.versions.find((item) => item.platform === 'web')
    if (webVersion) {
      setMinimumVersion(webVersion.minimum_version)
      setRecommendedVersion(webVersion.recommended_version)
      setForceUpdate(webVersion.force_update)
      setReleaseNotesEn(webVersion.release_notes_en)
      setReleaseNotesDari(webVersion.release_notes_dari)
      setReleaseNotesPashto(webVersion.release_notes_pashto)
    }
    setLoading(false)
  }, [inspection])
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
  const toggleSupportScope = (scope: string) => setSupportScope((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope])
  const requestSupport = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedOrganization || supportScope.length === 0) { setToast(c.failed); return }
    const result = await requestSupportAccess({ organizationId: selectedOrganization, scope: supportScope, reason: supportReason, hours: supportHours })
    setToast(result.error ? `${c.failed} ${result.error.includes('AAL2') ? c.mfaNote : ''}` : c.accessRequested)
    if (!result.error) { setSupportReason(''); await load() }
  }
  const viewDiagnostics = async (organizationId: string) => {
    const result = await getSupportDiagnostics(organizationId)
    setDiagnosticResult(result.data)
    if (result.error) setToast(c.failed)
  }
  const saveVersion = async (event: React.FormEvent) => {
    event.preventDefault()
    await act(setPlatformAppVersion({ platform: 'web', minimumVersion, recommendedVersion, forceUpdate, releaseNotesEn, releaseNotesDari, releaseNotesPashto }))
  }
  const saveNotice = async (event: React.FormEvent) => {
    event.preventDefault()
    await act(setPlatformAnnouncement({ type: noticeType, messageEn: noticeEn, messageDari: noticeDari, messagePashto: noticePashto, active: noticeActive }))
    setNoticeEn(''); setNoticeDari(''); setNoticePashto('')
  }

  if (loading) return <main className="platform-shell"><div className="platform-state">{c.loading}</div></main>
  if (error || !data) return <main className="platform-shell"><section className="platform-state"><h1>{c.noAccess}</h1><p>{c.noAccessHelp}</p><button className="primary-action" onClick={() => void load()}>{c.retry}</button><button className="text-button" onClick={onSignOut}>{c.signOut}</button></section></main>

  return <main className="platform-shell">
    <header className="platform-header"><div><span className="brand-mark">S</span><span><b>{c.admin}</b><small>{c.adminIntro}</small></span></div><div><select value={language} aria-label={c.language} onChange={(event) => onLanguageChange(event.target.value as Language)}><option value="fa-AF">دری</option><option value="ps-AF">پښتو</option><option value="en">English</option></select><button className="text-button" onClick={onSignOut}>{c.signOut}</button></div></header>
    <section className="platform-metrics"><article><span>{c.organizations}</span><b>{data.counts.organizations}</b></article><article><span>{c.activePlans}</span><b>{data.counts.active_subscriptions}</b></article><article><span>{c.pendingPayments}</span><b>{data.counts.pending_payments}</b></article><article><span>{c.suspendedUsers}</span><b>{data.counts.suspended_users}</b></article></section>
    <nav className="platform-tabs"><button className={tab === 'businesses' ? 'active' : ''} onClick={() => setTab('businesses')}>{c.businesses}</button><button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>{c.payments}</button><button className={tab === 'providers' ? 'active' : ''} onClick={() => setTab('providers')}>{c.providers}</button><button className={tab === 'plans' ? 'active' : ''} onClick={() => setTab('plans')}>{c.plans}</button><button className={tab === 'operations' ? 'active' : ''} onClick={() => setTab('operations')}>{c.operations}</button><button className={tab === 'support' ? 'active' : ''} onClick={() => setTab('support')}>{c.support}</button><button className={tab === 'announcements' ? 'active' : ''} onClick={() => setTab('announcements')}>{c.announcements}</button><button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>{c.audit}</button></nav>
    {toast && <div className="notice" role="status">{toast}<button onClick={() => setToast('')}>×</button></div>}
    <p className="platform-security-note">{c.mfaNote}</p>
    {tab === 'businesses' && <section className="platform-grid"><div className="platform-list"><label>{c.findBusiness}<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>{organizations.map((organization) => <button className={selectedOrganization === organization.id ? 'platform-business active' : 'platform-business'} key={organization.id} onClick={() => setSelectedOrganization(organization.id)}><span><b>{organization.display_name}</b><small>{organization.member_count} {c.members} · {data.plans.find((plan) => plan.code === organization.plan_code) ? localized(language, data.plans.find((plan) => plan.code === organization.plan_code)!, 'name') : '—'}</small></span><strong>{statusText(language, organization.subscription_status ?? 'trial')}</strong></button>)}</div><div className="platform-detail">{selectedOrganization ? <><h2>{c.subscriptionControl}</h2><label>{c.reason}<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={c.reasonPlaceholder} /></label><div className="inline-actions"><button onClick={() => void act(setSubscriptionStatus({ organizationId: selectedOrganization, status: 'active', reason: reason || c.restore }))}>{c.restore}</button><button className="danger" onClick={() => void act(setSubscriptionStatus({ organizationId: selectedOrganization, status: 'suspended', reason }))}>{c.suspend}</button></div><h2>{c.userAccess}</h2>{users.map((user) => <div className="platform-user" key={user.user_id}><span><b>{user.display_name}</b><small>{user.email} · {roleText(language, user.role_code)}</small></span><strong>{statusText(language, user.platform_status)}</strong><button onClick={() => void act(setPlatformUserAccess({ userId: user.user_id, status: user.platform_status === 'active' ? 'suspended' : 'active', reason }))}>{user.platform_status === 'active' ? c.suspend : c.restore}</button></div>)}</> : <div className="empty-live">{c.open}</div>}</div></section>}
    {tab === 'payments' && <section className="platform-panel"><h1>{c.paymentQueue}</h1><label>{c.adminNote}<input value={adminNote} onChange={(event) => setAdminNote(event.target.value)} placeholder={c.reasonPlaceholder} /></label>{data.payment_requests.length ? data.payment_requests.map((request) => <article className="payment-review-card" key={request.id}><div><h2>{request.organization_name}</h2><p>{request.plan_name} · {request.amount_afn} AFN</p><small>{c.receipt}: {request.payer_reference || '—'} · {new Date(request.requested_at).toLocaleString(language)}</small></div><div><button className="primary-action" onClick={() => void act(decideSubscriptionPayment({ requestId: request.id, decision: 'approved', note: adminNote }))}>{c.approve}</button><button className="danger" onClick={() => void act(decideSubscriptionPayment({ requestId: request.id, decision: 'rejected', note: adminNote }))}>{c.reject}</button></div></article>) : <div className="empty-live">{c.noPayments}</div>}</section>}
    {tab === 'providers' && <section className="platform-panel"><h1>{c.providerControl}</h1><p>{c.manualSafe}</p>{data.providers.map((provider) => <article className="provider-card" key={provider.code}><div><h2>{localized(language, provider, 'name')}</h2><p>{localized(language, provider, 'instructions')}</p></div><select value={provider.state} disabled={provider.provider_mode === 'hosted_gateway' && !provider.public_checkout_url} onChange={(event) => void act(setPaymentProviderState({ providerCode: provider.code, state: event.target.value as PaymentProvider['state'] }))}><option value="live">{c.live}</option><option value="disabled">{c.disabled}</option><option value="configuration_required">{c.configuration_required}</option></select></article>)}</section>}
    {tab === 'plans' && <section className="platform-panel"><h1>{c.planCatalog}</h1><div className="platform-plan-grid">{data.plans.map((plan) => <article className="plan-choice selected" key={plan.id}><span className={`subscription-state ${plan.status}`}>{statusText(language, plan.status)}</span><h2>{localized(language, plan, 'name')}</h2><p>{localized(language, plan, 'description')}</p><b dir="ltr">{plan.price_afn} AFN · {c.perMonth}</b><small>{plan.employee_limit} {c.employees} · {plan.branch_limit} {c.branches}</small><em>{c.includedServices}: {Object.entries(plan.features).filter(([, enabled]) => enabled).map(([name]) => planFeatureText(language, name)).join(' · ') || '—'}</em></article>)}</div></section>}
    {tab === 'operations' && operations && <section className="platform-panel platform-operations"><div className="panel-header"><div><h1>{c.operations}</h1><p>{c.checkedAt}: {new Date(operations.health.checked_at).toLocaleString(language)}</p></div><strong className="subscription-state active">{operations.health.database === 'healthy' && operations.health.private_storage && operations.health.unbalanced_posted_entries === 0 ? c.healthy : c.needsAttention}</strong></div><div className="platform-health-grid"><article><span>{c.database}</span><b>{operations.health.database === 'healthy' ? c.healthy : c.needsAttention}</b></article><article><span>{c.privateFiles}</span><b>{operations.health.private_storage ? c.healthy : c.needsAttention}</b></article><article><span>{c.unbalanced}</span><b>{operations.health.unbalanced_posted_entries}</b></article><article><span>{c.expiredApprovals}</span><b>{operations.health.expired_pending_approvals}</b></article><article><span>{c.supportWaiting}</span><b>{operations.health.pending_support_requests}</b></article></div><form className="platform-control-form" onSubmit={saveVersion}><h2>{c.appVersion}</h2><div className="form-grid"><label>{c.minimumVersion}<input required value={minimumVersion} onChange={(event) => setMinimumVersion(event.target.value)} /></label><label>{c.recommendedVersion}<input required value={recommendedVersion} onChange={(event) => setRecommendedVersion(event.target.value)} /></label></div><label className="switch-row"><input type="checkbox" checked={forceUpdate} onChange={(event) => setForceUpdate(event.target.checked)} /><span>{c.forceUpdate}</span></label><label>{c.releaseNotes} · English<textarea required value={releaseNotesEn} onChange={(event) => setReleaseNotesEn(event.target.value)} /></label><label>{c.releaseNotes} · دری<textarea required value={releaseNotesDari} onChange={(event) => setReleaseNotesDari(event.target.value)} /></label><label>{c.releaseNotes} · پښتو<textarea required value={releaseNotesPashto} onChange={(event) => setReleaseNotesPashto(event.target.value)} /></label><button className="primary-action">{c.saveVersion}</button></form><section className="platform-control-form"><h2>{c.featureControl}</h2><label>{c.supportBusiness}<select value={selectedOrganization ?? ''} onChange={(event) => setSelectedOrganization(event.target.value || null)}><option value="">{c.open}</option>{data.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.display_name}</option>)}</select></label>{selectedOrganization && <div className="feature-control-grid">{([['advanced_analytics', c.reportsFeature], ['advanced_compliance', c.complianceFeature], ['hawala', c.hawalaFeature]] as const).map(([feature, label]) => { const enabled = operations.organization_features.find((item) => item.organization_id === selectedOrganization && item.feature_code === feature)?.enabled ?? false; return <label className="switch-row" key={feature}><input type="checkbox" checked={enabled} onChange={(event) => void act(setPlatformOrganizationFeature(selectedOrganization, feature, event.target.checked))} /><span>{label} · {enabled ? c.enabled : c.disabled}</span></label> })}</div>}</section></section>}
    {tab === 'support' && operations && <section className="platform-panel"><h1>{c.support}</h1><p>{c.supportIntro}</p><form className="platform-control-form" onSubmit={requestSupport}><label>{c.supportBusiness}<select required value={selectedOrganization ?? ''} onChange={(event) => setSelectedOrganization(event.target.value || null)}><option value="">{c.open}</option>{data.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.display_name}</option>)}</select></label><fieldset><legend>{c.supportScope}</legend><div className="support-scope-grid">{([['diagnostics', c.diagnostics], ['configuration', c.configuration], ['security_events', c.securityEvents]] as const).map(([scope, label]) => <label key={scope}><input type="checkbox" checked={supportScope.includes(scope)} onChange={() => toggleSupportScope(scope)} /> {label}</label>)}</div></fieldset><label>{c.supportReason}<textarea required minLength={5} value={supportReason} onChange={(event) => setSupportReason(event.target.value)} /></label><label>{c.supportHours}<input type="number" required min="1" max="24" value={supportHours} onChange={(event) => setSupportHours(Number(event.target.value))} /></label><button className="primary-action" disabled={!selectedOrganization || supportScope.length === 0}>{c.requestSupport}</button><small>{c.ownerDecision}</small></form><div className="support-request-list">{operations.support_requests.length ? operations.support_requests.map((request) => <article className="provider-card" key={request.id}><div><h2>{request.organization_name}</h2><p>{request.reason}</p><small>{request.requested_scope.map((scope) => supportScopeText(language, scope)).join(' · ')} · {request.requested_hours} {c.supportHours} · {statusText(language, request.status)}</small>{request.expires_at && <small>{c.validUntil}: {new Date(request.expires_at).toLocaleString(language)}</small>}</div><div className="inline-actions">{request.status === 'approved' && !request.revoked_at && request.expires_at && new Date(request.expires_at) > new Date() && <><button onClick={() => void viewDiagnostics(request.organization_id)}>{c.viewDiagnostics}</button><button className="danger" onClick={() => void act(revokePlatformSupportAccess(request.id, supportReason || c.revoke))}>{c.revoke}</button></>}</div></article>) : <div className="empty-live">{c.noSupport}</div>}</div>{diagnosticResult && <div className="diagnostic-grid">{Object.entries(diagnosticResult).filter(([key]) => key !== 'organization_id').map(([key, value]) => <article key={key}><span>{diagnosticText(language, key)}</span><b><bdi>{String(value ?? '—')}</bdi></b></article>)}</div>}</section>}
    {tab === 'announcements' && operations && <section className="platform-panel"><h1>{c.announcements}</h1><p>{c.noticeIntro}</p><form className="platform-control-form" onSubmit={saveNotice}><label>{c.noticeType}<select value={noticeType} onChange={(event) => setNoticeType(event.target.value as typeof noticeType)}><option value="maintenance">{c.maintenance}</option><option value="security">{c.security}</option><option value="service">{c.service}</option></select></label><label>{c.englishMessage}<textarea required minLength={2} value={noticeEn} onChange={(event) => setNoticeEn(event.target.value)} /></label><label>{c.dariMessage}<textarea required minLength={2} value={noticeDari} onChange={(event) => setNoticeDari(event.target.value)} /></label><label>{c.pashtoMessage}<textarea required minLength={2} value={noticePashto} onChange={(event) => setNoticePashto(event.target.value)} /></label><label className="switch-row"><input type="checkbox" checked={noticeActive} onChange={(event) => setNoticeActive(event.target.checked)} /><span>{c.activeNotice}</span></label><button className="primary-action">{c.saveNotice}</button></form><div className="support-request-list">{operations.announcements.length ? operations.announcements.map((notice) => <article className="provider-card" key={notice.id}><div><h2>{statusText(language, notice.announcement_type)}</h2><p>{language === 'fa-AF' ? notice.message_dari : language === 'ps-AF' ? notice.message_pashto : notice.message_en}</p><small>{new Date(notice.updated_at).toLocaleString(language)}</small></div><strong>{notice.active ? c.live : c.disabled}</strong></article>) : <div className="empty-live">{c.noNotices}</div>}</div></section>}
    {tab === 'audit' && <section className="platform-panel"><h1>{c.auditTrail}</h1><div className="platform-audit-list">{data.audit_events?.length ? data.audit_events.map((event) => <article key={event.id}><span><b>{auditText(language, event.event_type)}</b><small>{event.organization_name || event.target_user_id || 'SARAFI'}</small></span><time>{new Date(event.created_at).toLocaleString(language)}</time></article>) : <div className="empty-live">{c.noAudit}</div>}</div></section>}
    {inspection && <small>preview</small>}
  </main>
}
