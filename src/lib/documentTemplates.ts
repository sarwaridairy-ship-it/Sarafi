import type { DocumentTemplateRecord } from './financialApi'
import type { Language } from './i18n'

const template = (
  template_code: string,
  document_kind: DocumentTemplateRecord['document_kind'],
  title: [string, string, string],
  body: [string, string, string],
): DocumentTemplateRecord => ({
  template_code,
  document_kind,
  title_en: title[0],
  title_dari: title[1],
  title_pashto: title[2],
  body_en: body[0],
  body_dari: body[1],
  body_pashto: body[2],
})

export const fallbackDocumentTemplates: DocumentTemplateRecord[] = [
  template('transaction.buy_fx', 'transaction_receipt', ['Currency purchase', 'خرید اسعار', 'د اسعارو پېرل'], ['The shop bought {received_amount} {received_currency} and paid {given_amount} {given_currency}.', 'صرافی {received_amount} {received_currency} خرید و {given_amount} {given_currency} پرداخت کرد.', 'صرافۍ {received_amount} {received_currency} وپېرل او {given_amount} {given_currency} یې ورکړل.']),
  template('transaction.sell_fx', 'transaction_receipt', ['Currency sale', 'فروش اسعار', 'د اسعارو پلورل'], ['The shop sold {given_amount} {given_currency} and received {received_amount} {received_currency}.', 'صرافی {given_amount} {given_currency} فروخت و {received_amount} {received_currency} دریافت کرد.', 'صرافۍ {given_amount} {given_currency} وپلورل او {received_amount} {received_currency} یې واخیستل.']),
  template('transaction.exchange_fx', 'transaction_receipt', ['Currency exchange', 'تبدیل اسعار', 'د اسعارو بدلول'], ['The shop exchanged {given_amount} {given_currency} for {received_amount} {received_currency}.', 'صرافی {given_amount} {given_currency} را به {received_amount} {received_currency} تبدیل کرد.', 'صرافۍ {given_amount} {given_currency} په {received_amount} {received_currency} بدل کړل.']),
  template('transaction.receive_money', 'transaction_receipt', ['Money received', 'پول دریافت شد', 'پیسې واخیستل شوې'], ['The shop received {amount} {currency} from {customer}.', 'صرافی {amount} {currency} از {customer} دریافت کرد.', 'صرافۍ له {customer} څخه {amount} {currency} واخیستل.']),
  template('transaction.pay_money', 'transaction_receipt', ['Money paid', 'پول پرداخت شد', 'پیسې ورکړل شوې'], ['The shop paid {amount} {currency} to {customer}.', 'صرافی {amount} {currency} به {customer} پرداخت کرد.', 'صرافۍ {customer} ته {amount} {currency} ورکړل.']),
  template('transaction.record_income', 'transaction_receipt', ['Income recorded', 'عاید ثبت شد', 'عاید ثبت شو'], ['The shop recorded income of {amount} {currency}.', 'صرافی عاید {amount} {currency} را ثبت کرد.', 'صرافۍ {amount} {currency} عاید ثبت کړ.']),
  template('transaction.record_expense', 'transaction_receipt', ['Expense recorded', 'مصرف ثبت شد', 'لګښت ثبت شو'], ['The shop recorded an expense of {amount} {currency}.', 'صرافی مصرف {amount} {currency} را ثبت کرد.', 'صرافۍ د {amount} {currency} لګښت ثبت کړ.']),
  template('transaction.owner_investment', 'transaction_receipt', ['Owner investment', 'افزایش سرمایه مالک', 'د مالک پانګه'], ['The owner added {amount} {currency} to the shop.', 'مالک {amount} {currency} به سرمایه صرافی افزود.', 'مالک صرافۍ ته {amount} {currency} پانګه ورزیاته کړه.']),
  template('transaction.owner_withdrawal', 'transaction_receipt', ['Owner withdrawal', 'برداشت مالک', 'د مالک ایستل'], ['The owner withdrew {amount} {currency} from the shop.', 'مالک {amount} {currency} از صرافی برداشت کرد.', 'مالک له صرافۍ څخه {amount} {currency} وایستل.']),
  template('transaction.transfer_cash', 'transaction_receipt', ['Money transfer', 'انتقال پول', 'د پیسو لېږد'], ['The shop moved {amount} {currency} from {source} to {destination}.', 'صرافی {amount} {currency} را از {source} به {destination} انتقال داد.', 'صرافۍ {amount} {currency} له {source} څخه {destination} ته ولېږدول.']),
  template('transaction.opening_balance', 'transaction_receipt', ['Opening money', 'پول آغاز کار', 'پیل پیسې'], ['The shop recorded opening money of {amount} {currency}.', 'صرافی پول آغاز کار به مبلغ {amount} {currency} را ثبت کرد.', 'صرافۍ د پیل {amount} {currency} پیسې ثبت کړې.']),
  template('transaction.default', 'transaction_receipt', ['Recorded transaction', 'معامله ثبت‌شده', 'ثبت شوې معامله'], ['This transaction records {amount} {currency} for {customer}.', 'این معامله مبلغ {amount} {currency} را برای {customer} ثبت می‌کند.', 'دا معامله د {customer} لپاره {amount} {currency} ثبتوي.']),
  template('report.daily_transactions', 'report', ['About this report', 'درباره این گزارش', 'د دې راپور په اړه'], ['This report lists the shop activity recorded for {period}. Only saved records matching {filters} are included.', 'این گزارش کارهای ثبت‌شده صرافی برای {period} را نشان می‌دهد. تنها معلومات ذخیره‌شده مطابق {filters} شامل است.', 'دا راپور د {period} لپاره د صرافۍ ثبت شوي کارونه ښيي. یوازې له {filters} سره برابر ساتل شوي معلومات پکې دي.']),
  template('report.filtered', 'report', ['About this report', 'درباره این گزارش', 'د دې راپور په اړه'], ['This {report_name} report covers {period}. It includes only saved records matching {filters}.', 'گزارش {report_name} دوره {period} را نشان می‌دهد و تنها معلومات ذخیره‌شده مطابق {filters} را شامل می‌کند.', 'د {report_name} راپور د {period} موده ښيي او یوازې له {filters} سره برابر ساتل شوي معلومات پکې شامل دي.']),
]

export const mergeDocumentTemplates = (records: DocumentTemplateRecord[]) => {
  const merged = new Map(fallbackDocumentTemplates.map((item) => [item.template_code, item]))
  for (const record of records) merged.set(record.template_code, record)
  return [...merged.values()]
}

export const localizedDocumentTemplate = (record: DocumentTemplateRecord, language: Language) => ({
  title: language === 'fa-AF' ? record.title_dari : language === 'ps-AF' ? record.title_pashto : record.title_en,
  body: language === 'fa-AF' ? record.body_dari : language === 'ps-AF' ? record.body_pashto : record.body_en,
})

export const renderDocumentTemplate = (value: string, variables: Record<string, string | number | null | undefined>) =>
  value.replace(/\{([a-z_]+)\}/g, (_match, key: string) => String(variables[key] ?? '—'))
