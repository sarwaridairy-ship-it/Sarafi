import type { Language } from './i18n'

type LocalNames = { en: string; dari: string; pashto: string }

const names: Record<string, LocalNames> = {
  AFN: { en: 'Afghan Afghani', dari: 'افغانی', pashto: 'افغانۍ' },
  USD: { en: 'United States Dollar', dari: 'دالر امریکایی', pashto: 'امریکايي ډالر' },
  EUR: { en: 'Euro', dari: 'یورو', pashto: 'یورو' },
  GBP: { en: 'British Pound', dari: 'پوند انگلیسی', pashto: 'بریتانوي پونډ' },
  IRR: { en: 'Iranian Toman', dari: 'تومان ایران', pashto: 'ایراني تومان' },
  PKR: { en: 'Pakistani Rupee', dari: 'روپیه پاکستان', pashto: 'پاکستانۍ روپۍ' },
  SAR: { en: 'Saudi Riyal', dari: 'ریال سعودی', pashto: 'سعودي ریال' },
  AED: { en: 'UAE Dirham', dari: 'درهم امارات', pashto: 'اماراتي درهم' },
  CHF: { en: 'Swiss Franc', dari: 'فرانک سویس', pashto: 'سویسي فرانک' },
  AUD: { en: 'Australian Dollar', dari: 'دالر استرالیا', pashto: 'اسټرالیايي ډالر' },
  CAD: { en: 'Canadian Dollar', dari: 'دالر کانادا', pashto: 'کاناډايي ډالر' },
  RUB: { en: 'Russian Ruble', dari: 'روبل روسیه', pashto: 'روسي روبل' },
  DKK: { en: 'Danish Krone', dari: 'کرون دنمارک', pashto: 'ډنمارکي کرون' },
  SEK: { en: 'Swedish Krona', dari: 'کرون سویدن', pashto: 'سویډني کرون' },
  NOK: { en: 'Norwegian Krone', dari: 'کرون ناروی', pashto: 'ناروېژي کرون' },
  TRY: { en: 'Turkish Lira', dari: 'لیره ترکیه', pashto: 'ترکي لیره' },
  CNY: { en: 'Chinese Yuan', dari: 'یوان چین', pashto: 'چینايي یوان' },
  KWD: { en: 'Kuwaiti Dinar', dari: 'دینار کویت', pashto: 'کویټي دینار' },
  QAR: { en: 'Qatari Riyal', dari: 'ریال قطر', pashto: 'قطري ریال' },
  BHD: { en: 'Bahraini Dinar', dari: 'دینار بحرین', pashto: 'بحریني دینار' },
  JPY: { en: 'Japanese Yen', dari: 'ین جاپان', pashto: 'جاپاني ین' },
  INR: { en: 'Indian Rupee', dari: 'روپیه هند', pashto: 'هندي روپۍ' },
}

export function localCurrencyName(
  language: Language,
  code: string,
  fallback?: { name_en: string; name_dari: string; name_pashto: string },
) {
  const known = names[code.toUpperCase()]
  if (known) return language === 'fa-AF' ? known.dari : language === 'ps-AF' ? known.pashto : known.en
  if (!fallback) return code.toUpperCase()
  return language === 'fa-AF' ? fallback.name_dari : language === 'ps-AF' ? fallback.name_pashto : fallback.name_en
}
