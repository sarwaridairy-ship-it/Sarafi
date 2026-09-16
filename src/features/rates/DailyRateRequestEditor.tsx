import { useState } from 'react'
import Decimal from 'decimal.js'
import { positiveRate } from '../../domain/rateMath'
import { resolveOperationRateRequest } from '../../lib/financialApi'
import type { Language } from '../../lib/i18n'

const copy = {
  en: { title: 'Update the branch daily rate', buy: 'Shop buy rate', sell: 'Shop sell rate', save: 'Publish rates and approve', saving: 'Saving…', invalid: 'Enter positive rates. The sell rate must not be below the buy rate.', reason: 'Enter a reason for this decision.', mfa: 'Verify your authenticator before approving.', failed: 'Could not update the rates. Check your access and try again.', help: 'AFN for 1 unit. These rates apply to this branch. The cashier still reviews and saves the transaction.' },
  'fa-AF': { title: 'نرخ روزانه شعبه را تازه کنید', buy: 'نرخ خرید صرافی', sell: 'نرخ فروش صرافی', save: 'ثبت نرخ‌ها و تأیید', saving: 'در حال ثبت…', invalid: 'نرخ درست بنویسید. نرخ فروش از نرخ خرید کمتر نباشد.', reason: 'دلیل این تصمیم را بنویسید.', mfa: 'پیش از تأیید، کود برنامه امنیتی را وارد کنید.', failed: 'نرخ ثبت نشد. دسترسی خود را بررسی کنید و دوباره کوشش کنید.', help: 'افغانی برای ۱ واحد اسعار. این نرخ‌ها برای همین شعبه است. صندوق‌دار معامله را بررسی و ثبت می‌کند.' },
  'ps-AF': { title: 'د څانګې ورځنی نرخ تازه کړئ', buy: 'د صرافۍ د پېر نرخ', sell: 'د صرافۍ د پلور نرخ', save: 'نرخونه ثبت او تایید کړئ', saving: 'ثبتېږي…', invalid: 'سم نرخونه ولیکئ. د پلور نرخ دې د پېر له نرخ څخه کم نه وي.', reason: 'د دې پرېکړې دلیل ولیکئ.', mfa: 'له تایید مخکې د امنیتي پروګرام کوډ ولیکئ.', failed: 'نرخ ثبت نه شو. خپل لاسرسی وګورئ او بیا هڅه وکړئ.', help: 'د ۱ واحد اسعارو لپاره افغانۍ. دا نرخونه د همدې څانګې لپاره دي. صندوقدار معامله ګوري او ثبتوي.' },
} as const

export function DailyRateRequestEditor({ id, currency, language, reason, verified, onSaved, onToast }: {
  id: string; currency: string; language: Language; reason: string; verified: boolean;
  onSaved: () => void; onToast: (message: string) => void;
}) {
  const text = copy[language]
  const [buy, setBuy] = useState('')
  const [sell, setSell] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (busy) return
    if (!positiveRate(buy) || !positiveRate(sell) || new Decimal(buy).gt(sell)) { onToast(text.invalid); return }
    if (reason.trim().length < 2) { onToast(text.reason); return }
    if (!verified) { onToast(text.mfa); return }
    setBusy(true)
    try {
      const result = await resolveOperationRateRequest(id, buy, sell, reason)
      if (result.error) onToast(result.error.includes('AAL2') ? text.mfa : text.failed)
      else onSaved()
    } finally { setBusy(false) }
  }
  return <fieldset className="daily-rate-request-editor">
    <legend>{text.title} · {currency}/AFN</legend>
    <small>{text.help}</small>
    <div className="daily-rate-request-inputs">
      <label>{text.buy}<input inputMode="decimal" value={buy} onChange={(event) => setBuy(event.target.value)} disabled={busy} /></label>
      <label>{text.sell}<input inputMode="decimal" value={sell} onChange={(event) => setSell(event.target.value)} disabled={busy} /></label>
    </div>
    <button type="button" className="primary-action" disabled={busy} onClick={() => void save()}>{busy ? text.saving : text.save}</button>
  </fieldset>
}
