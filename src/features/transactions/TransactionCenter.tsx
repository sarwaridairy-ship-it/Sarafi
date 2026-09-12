import { useMemo, useState } from "react";
import { AppIcon, type AppIconName } from "../../AppIcon";
import type { Language } from "../../lib/i18n";
import { type Capability, hasCapability } from "../../app/capabilities";
import type { FinancialDestination } from "../../app/routes";

type FamilyId = "fx" | "money-in" | "money-out" | "move" | "debt" | "hawala";
type Localized = { en: string; "fa-AF": string; "ps-AF": string };
type Action = { label: Localized; route: FinancialDestination; capability: Capability };
type Family = { id: FamilyId; label: Localized; intro: Localized; icon: AppIconName; actions: Action[] };

const families: Family[] = [
  {
    id: "fx",
    label: { en: "Currency Exchange", "fa-AF": "تبدیل اسعار", "ps-AF": "د اسعارو تبادله" },
    intro: { en: "Buy or sell any two currencies.", "fa-AF": "هر دو اسعار را بخرید یا بفروشید.", "ps-AF": "هر دوه اسعار وپېرئ یا وپلورئ." },
    icon: "trade",
    actions: [
      { label: { en: "Buy currency", "fa-AF": "خرید اسعار", "ps-AF": "اسعار پېرل" }, route: "/fx/buy", capability: "financial.post.fx" },
      { label: { en: "Sell currency", "fa-AF": "فروش اسعار", "ps-AF": "اسعار پلورل" }, route: "/fx/sell", capability: "financial.post.fx" },
    ],
  },
  {
    id: "money-in",
    label: { en: "Receive Money", "fa-AF": "پول می‌گیریم", "ps-AF": "پیسې اخلو" },
    intro: { en: "Why is money coming in?", "fa-AF": "پول را از کجا می‌گیریم؟", "ps-AF": "پیسې ولې راځي؟" },
    icon: "receive",
    actions: [
      { label: { en: "From a customer", "fa-AF": "از مشتری پول می‌گیریم", "ps-AF": "له پېرېدونکي" }, route: "/money-in/customer", capability: "financial.post.money" },
      { label: { en: "Debt payment", "fa-AF": "پول طلب را می‌گیریم", "ps-AF": "د طلب ورکړه" }, route: "/money-in/debt-payment", capability: "debt.settle.receivable" },
      { label: { en: "Business income", "fa-AF": "عاید صرافی", "ps-AF": "د صرافۍ عاید" }, route: "/money-in/income", capability: "financial.post.money" },
      { label: { en: "Owner capital", "fa-AF": "سرمایه مالک", "ps-AF": "د مالک پانګه" }, route: "/money-in/owner-investment", capability: "owner.capital.post" },
    ],
  },
  {
    id: "money-out",
    label: { en: "Spend Money", "fa-AF": "مصرف پول", "ps-AF": "پیسې لګول" },
    intro: { en: "Why is money going out?", "fa-AF": "پول را به کی می‌دهیم؟", "ps-AF": "پیسې ولې وځي؟" },
    icon: "pay",
    actions: [
      { label: { en: "To a customer", "fa-AF": "به مشتری پول می‌دهیم", "ps-AF": "پېرېدونکي ته" }, route: "/money-out/customer", capability: "financial.post.money" },
      { label: { en: "Debt payment", "fa-AF": "پول قرض را می‌دهیم", "ps-AF": "د پور ورکړه" }, route: "/money-out/debt-payment", capability: "debt.settle.payable" },
      { label: { en: "Business expense", "fa-AF": "مصرف صرافی", "ps-AF": "د صرافۍ لګښت" }, route: "/money-out/expense", capability: "financial.post.money" },
      { label: { en: "Owner withdrawal", "fa-AF": "برداشت مالک", "ps-AF": "د مالک ایستل" }, route: "/money-out/owner-withdrawal", capability: "owner.capital.post" },
    ],
  },
  {
    id: "move",
    label: { en: "Move Money", "fa-AF": "انتقال پول", "ps-AF": "پیسې لېږدول" },
    intro: { en: "Move money without changing profit.", "fa-AF": "پول را بدون تغییر مفاد انتقال دهید.", "ps-AF": "پیسې بې له دې چې ګټه بدله شي ولېږدوئ." },
    icon: "transfer",
    actions: [
      { label: { en: "Between cashboxes", "fa-AF": "بین صندوق‌ها", "ps-AF": "د صندوقونو ترمنځ" }, route: "/move/cashbox", capability: "financial.post.money" },
      { label: { en: "Between branches", "fa-AF": "بین شعبه‌ها", "ps-AF": "د څانګو ترمنځ" }, route: "/move/branch", capability: "financial.post.money" },
      { label: { en: "Bank account", "fa-AF": "حساب بانکی", "ps-AF": "بانکي حساب" }, route: "/move/bank", capability: "financial.post.money" },
    ],
  },
  {
    id: "debt",
    label: { en: "Debt", "fa-AF": "طلب و قرض", "ps-AF": "طلب او پور" },
    intro: { en: "Record who owes whom or settle an open debt.", "fa-AF": "ثبت کنید مردم به ما قرضدار اند یا ما به مردم.", "ps-AF": "ثبت کړئ چې څوک پوروړی دی یا پرانیستی پور تصفیه کړئ." },
    icon: "debt",
    actions: [
      { label: { en: "They owe us", "fa-AF": "مردم به ما قرضدار اند", "ps-AF": "موږ ته پوروړی دی" }, route: "/debt/receivable", capability: "debt.create.receivable" },
      { label: { en: "We owe them", "fa-AF": "ما به مردم قرضدار استیم", "ps-AF": "موږ پوروړي یو" }, route: "/debt/payable", capability: "debt.create.payable" },
      { label: { en: "Settle a debt", "fa-AF": "گرفتن یا دادن پول قرض", "ps-AF": "پور تصفیه کول" }, route: "/debts", capability: "debt.view" },
    ],
  },
  {
    id: "hawala",
    label: { en: "Hawala", "fa-AF": "حواله", "ps-AF": "حواله" },
    intro: { en: "Choose the exact Hawala job.", "fa-AF": "کار دقیق حواله را انتخاب کنید.", "ps-AF": "د حوالې کره کار وټاکئ." },
    icon: "hawala",
    actions: [
      { label: { en: "Send Hawala", "fa-AF": "فرستادن حواله", "ps-AF": "حواله لېږل" }, route: "/hawala/send", capability: "hawala.send" },
      { label: { en: "Hawala Inbox", "fa-AF": "صندوق حواله‌ها", "ps-AF": "د حوالو صندوق" }, route: "/hawala/incoming", capability: "hawala.incoming" },
      { label: { en: "Settle partner", "fa-AF": "تصفیه همکار", "ps-AF": "له همکار سره تصفیه" }, route: "/hawala/partners", capability: "hawala.settle" },
    ],
  },
];

function local(language: Language, value: Localized): string {
  return value[language];
}

export function TransactionCenter({
  language,
  capabilities,
  hawalaEnabled,
  onOpen,
}: {
  language: Language;
  capabilities: readonly string[];
  hawalaEnabled: boolean;
  onOpen: (route: FinancialDestination) => void;
}) {
  const [selectedFamily, setSelectedFamily] = useState<FamilyId | null>(null);
  const visibleFamilies = useMemo(
    () => families.map((family) => ({
      ...family,
      actions: family.actions.filter((action) => hasCapability(capabilities, action.capability))
        .filter(() => family.id !== "hawala" || hawalaEnabled),
    })),
    [capabilities, hawalaEnabled],
  );
  const selected = visibleFamilies.find((family) => family.id === selectedFamily) ?? null;
  const copy = language === "en"
    ? { kicker: "One task at a time", title: "Make a Transaction", intro: "Choose what happened with the money.", back: "Back to Transaction Types", unavailable: "This family is not enabled for your assignment." }
    : language === "fa-AF"
      ? { kicker: "هر بار یک کار", title: "ثبت معامله", intro: "انتخاب کنید با پول چه اتفاق افتاده است.", back: "بازگشت به نوع معامله", unavailable: "این بخش در وظیفه شما فعال نیست." }
      : { kicker: "په یو وخت کې یو کار", title: "معامله ثبتول", intro: "وټاکئ چې له پیسو سره څه شوي دي.", back: "د معاملې ډولونو ته ستنېدل", unavailable: "دا برخه ستاسو په دنده کې فعاله نه ده." };

  return (
    <section className="calm-page transaction-hub" aria-labelledby="transaction-center-title">
      <header className="calm-page-header">
        <p className="kicker">{copy.kicker}</p>
        <h1 id="transaction-center-title">{copy.title}</h1>
        <p>{copy.intro}</p>
      </header>

      {selected ? (
        <section className="transaction-family-actions" aria-labelledby={`family-${selected.id}`}>
          <button className="calm-back" type="button" onClick={() => setSelectedFamily(null)}>← {copy.back}</button>
          <div className="family-heading">
            <AppIcon name={selected.icon} size={24} />
            <div><h2 id={`family-${selected.id}`}>{local(language, selected.label)}</h2><p>{local(language, selected.intro)}</p></div>
          </div>
          {selected.actions.length ? (
            <div className="transaction-action-list">
              {selected.actions.slice(0, 4).map((action) => (
                <button type="button" key={action.route} onClick={() => onOpen(action.route)}>
                  <span>{local(language, action.label)}</span><span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          ) : <p className="calm-empty" role="status">{copy.unavailable}</p>}
        </section>
      ) : (
        <div className="transaction-family-grid">
            {visibleFamilies.map((family) => (
              <button type="button" key={family.id} onClick={() => setSelectedFamily(family.id)} aria-controls={`family-${family.id}`}>
                <AppIcon name={family.icon} size={24} />
                <span><strong>{local(language, family.label)}</strong><small>{local(language, family.intro)}</small></span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
        </div>
      )}
    </section>
  );
}
