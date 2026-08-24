export type Language = 'en' | 'fa-AF' | 'ps-AF'
export type TranslationKey = keyof typeof translations.en

const translations = {
  en: {
    dashboard: 'Dashboard', trade: 'Trade', transactions: 'Transactions', cashAccounts: 'Cash & Accounts', people: 'People', debts: 'Debts', rates: 'Rates', reports: 'Reports',
    workspace: 'Workspace', goodMorning: 'Good morning, Mohammad.', businessStand: 'Here is where your business stands today.', newTrade: 'New trade', localWorkspace: 'Local workspace', supabaseLoaded: 'Supabase credentials loaded',
    totalPosition: 'Total position', todayVolume: "Today's volume", realizedProfit: 'Realized profit', whereMoney: 'Where your money is', liveBalances: 'Live balances across all accounts', needsAttention: 'Needs attention', reviewItems: 'Items requiring your review', recentActivity: 'Recent activity', traceable: 'Every movement, recorded and traceable',
    buy: 'Buy currency', sell: 'Sell currency', exchange: 'Exchange currency', receive: 'Receive money', pay: 'Pay money', debtCredit: 'Debt / Credit', transfer: 'Transfer cash', expense: 'Expense', ownerCapital: 'Owner capital', bankMovement: 'Bank movement', hawala: 'Hawala', optionalModule: 'Optional module',
    stillOffline: 'Offline', online: 'Online', pendingSync: 'Pending sync', syncConflict: 'Sync conflict', lastSync: 'Last sync', postTrade: 'Post trade', recordTrade: 'Record a trade', customer: 'Customer or counterparty', sellAmount: 'Sell', buyAmount: 'Buy', exchangeRate: 'Exchange rate', marketRate: 'Market rate',
    viewAll: 'View all', history: 'History', posted: 'Posted', pending: 'Pending', mainBranch: 'Main branch', cash: 'Cash', bank: 'Bank', today: 'Today', completed: 'Completed',
  },
  'fa-AF': {
    dashboard: 'داشبورد', trade: 'معامله', transactions: 'معاملات', cashAccounts: 'صندوق و حساب‌ها', people: 'اشخاص', debts: 'قرض و بدهی', rates: 'نرخ‌ها', reports: 'گزارش‌ها',
    workspace: 'محیط کاری', goodMorning: 'صبح بخیر، محمد.', businessStand: 'وضعیت امروز تجارت شما در اینجا است.', newTrade: 'معامله جدید', localWorkspace: 'محیط کاری محلی', supabaseLoaded: 'تنظیمات اتصال بارگذاری شد',
    totalPosition: 'مجموع دارایی', todayVolume: 'حجم امروز', realizedProfit: 'مفاد تحقق‌یافته', whereMoney: 'پول من کجا است؟', liveBalances: 'موجودی زنده همه حساب‌ها', needsAttention: 'نیازمند توجه', reviewItems: 'مواردی که نیاز به بررسی دارند', recentActivity: 'فعالیت اخیر', traceable: 'هر حرکت ثبت و قابل پیگیری است',
    buy: 'خرید ارز', sell: 'فروش ارز', exchange: 'تبدیل ارز', receive: 'دریافت پول', pay: 'پرداخت پول', debtCredit: 'قرض / اعتبار', transfer: 'انتقال پول', expense: 'مصرف', ownerCapital: 'سرمایه مالک', bankMovement: 'حرکت بانکی', hawala: 'حواله', optionalModule: 'بخش اختیاری',
    stillOffline: 'آفلاین', online: 'آنلاین', pendingSync: 'در انتظار همگام‌سازی', syncConflict: 'تعارض همگام‌سازی', lastSync: 'آخرین همگام‌سازی', postTrade: 'ثبت معامله', recordTrade: 'ثبت معامله', customer: 'مشتری یا طرف معامله', sellAmount: 'فروش', buyAmount: 'خرید', exchangeRate: 'نرخ تبدیل', marketRate: 'نرخ بازار',
    viewAll: 'مشاهده همه', history: 'تاریخچه', posted: 'ثبت‌شده', pending: 'در انتظار', mainBranch: 'شعبه اصلی', cash: 'نقدی', bank: 'بانک', today: 'امروز', completed: 'تکمیل‌شده',
  },
  'ps-AF': {
    dashboard: 'ډشبورډ', trade: 'راکړه ورکړه', transactions: 'معاملې', cashAccounts: 'صندوق او حسابونه', people: 'خلک', debts: 'پور', rates: 'نرخونه', reports: 'راپورونه',
    workspace: 'کاري ځای', goodMorning: 'سهار مو پخیر، محمد.', businessStand: 'ستاسو د سوداګرۍ د نن ورځې حالت دلته دی.', newTrade: 'نوې راکړه ورکړه', localWorkspace: 'ځايي کاري ځای', supabaseLoaded: 'د اتصال معلومات چمتو دي',
    totalPosition: 'ټوله شتمني', todayVolume: 'د نن ورځې حجم', realizedProfit: 'ترلاسه شوې ګټه', whereMoney: 'زما پیسې چېرته دي؟', liveBalances: 'د ټولو حسابونو اوسنی بیلانس', needsAttention: 'پاملرنې ته اړتیا', reviewItems: 'هغه موارد چې ستاسو کتنې ته اړتیا لري', recentActivity: 'وروستی فعالیت', traceable: 'هر حرکت ثبت او د تعقیب وړ دی',
    buy: 'د اسعارو پېرود', sell: 'د اسعارو پلور', exchange: 'د اسعارو تبادله', receive: 'پیسې ترلاسه کول', pay: 'پیسې ورکول', debtCredit: 'پور / اعتبار', transfer: 'د صندوق انتقال', expense: 'لګښت', ownerCapital: 'د مالک پانګه', bankMovement: 'بانکي حرکت', hawala: 'حواله', optionalModule: 'اختیاري برخه',
    stillOffline: 'آفلاین', online: 'آنلاین', pendingSync: 'همغږۍ ته په تمه', syncConflict: 'د همغږۍ شخړه', lastSync: 'وروستۍ همغږي', postTrade: 'راکړه ورکړه ثبتول', recordTrade: 'راکړه ورکړه ثبتول', customer: 'پېرودونکی یا مقابل لوری', sellAmount: 'پلور', buyAmount: 'پېرود', exchangeRate: 'د تبادلې نرخ', marketRate: 'د بازار نرخ',
    viewAll: 'ټول کتل', history: 'تاریخچه', posted: 'ثبت شوی', pending: 'په تمه', mainBranch: 'اصلي څانګه', cash: 'نغدې', bank: 'بانک', today: 'نن', completed: 'بشپړ شوی',
  },
} as const

export function translate(language: Language, key: TranslationKey): string { return translations[language][key] ?? translations.en[key] }
export function isRtl(language: Language): boolean { return language !== 'en' }
export function requiredTranslationKeys(): TranslationKey[] { return Object.keys(translations.en) as TranslationKey[] }
export function hasCompleteTranslations(language: Language): boolean { return requiredTranslationKeys().every((key) => Boolean(translations[language][key])) }
