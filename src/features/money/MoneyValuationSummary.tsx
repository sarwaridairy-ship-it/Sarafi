import Decimal from "decimal.js";
import { useState } from "react";
import type { MoneyValuationSnapshot } from "../../lib/financialApi";
import type { Language } from "../../lib/i18n";

export type MoneyValuationLabels = {
  total: string;
  equivalent: string;
  partialQuality: string;
  receivables: string;
  payables: string;
  hawalaNet: string;
  bookValue: string;
  breakdown: string;
  native: string;
  dailyRate: string;
  currentValue: string;
  quality: string;
  currentQuality: string;
  handling: string;
  missingRule: string;
  staleRule: string;
  locations: string;
  hideLocations: string;
  missingCurrencies: string;
};

type SharedProps = {
  language: Language;
  valuation: MoneyValuationSnapshot;
  labels: MoneyValuationLabels;
  currencyLabel: string;
  formatAmount: (value: string | number) => string;
};

function rateStatusLabel(language: Language, status: MoneyValuationSnapshot["currencies"][number]["rate_status"]) {
  return ({
    en: { current: "Current", stale: "Stale", missing: "Missing" },
    "fa-AF": { current: "تازه", stale: "کهنه", missing: "بدون نرخ" },
    "ps-AF": { current: "تازه", stale: "زوړ", missing: "بې نرخه" },
  } as const)[language][status];
}

export function CurrencyValuationTable({ language, valuation, labels, currencyLabel, formatAmount }: SharedProps) {
  const availableCurrencies = valuation.currencies.filter((item) => !new Decimal(item.available || 0).isZero());
  const valuedTotal = new Decimal(valuation.totals.available_valued_base || 0);

  return (
    <section className="money-currency-breakdown" aria-labelledby="money-currency-title">
      <h2 id="money-currency-title">{labels.breakdown}</h2>
      <div className="money-currency-row heading">
        <span>{currencyLabel}</span>
        <span>{labels.native}</span>
        <span>{labels.dailyRate} {valuation.base_currency}</span>
        <span>{labels.currentValue}</span>
      </div>
      {availableCurrencies.map((item) => {
        const share = item.available_base && !valuedTotal.isZero()
          ? new Decimal(item.available_base).div(valuedTotal).mul(100).toDecimalPlaces(1).toString()
          : null;
        return (
          <div className={`money-currency-row rate-${item.rate_status}`} key={item.currency_code}>
            <span><b>{item.currency_code}</b><small>{rateStatusLabel(language, item.rate_status)}</small></span>
            <strong dir="ltr">{formatAmount(item.available)}</strong>
            <bdi>{item.rate ?? "—"}</bdi>
            <span><strong dir="ltr">{item.available_base ? formatAmount(item.available_base) : "—"}</strong>{share ? <small>{share}%</small> : null}</span>
          </div>
        );
      })}
    </section>
  );
}

export function MoneyValuationSummary(props: SharedProps) {
  const { language, valuation, labels, formatAmount } = props;
  const [showLocations, setShowLocations] = useState(false);
  const availableCurrencyCount = valuation.currencies.filter((item) => new Decimal(item.available || 0).isPositive()).length;
  const availableCurrencyCopy = language === "en" ? "available currencies" : language === "fa-AF" ? "اسعار موجود" : "شته اسعار";

  return (
    <>
      <section className="money-valuation-hero">
        <div>
          <small>{labels.total}</small>
          <strong dir="ltr">{valuation.total_complete && valuation.totals.available_base ? `${formatAmount(valuation.totals.available_base)} ${valuation.base_currency}` : labels.partialQuality}</strong>
          <span>{availableCurrencyCount} {availableCurrencyCopy}</span>
        </div>
        <div>
          <small>{labels.equivalent} {valuation.comparison_currency}</small>
          <strong dir="ltr">{valuation.totals.comparison_value ? new Decimal(valuation.totals.comparison_value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toString() : "—"} {valuation.comparison_currency}</strong>
          <span dir="ltr">{valuation.totals.comparison_rate ? `1 ${valuation.comparison_currency} = ${formatAmount(valuation.totals.comparison_rate)} ${valuation.base_currency}` : labels.partialQuality}</span>
        </div>
      </section>
      <section className="money-position-strip">
        <span><small>{labels.receivables}</small><b dir="ltr">{formatAmount(valuation.totals.receivables_base)} {valuation.base_currency}</b></span>
        <span><small>{labels.payables}</small><b dir="ltr">{formatAmount(valuation.totals.payables_base)} {valuation.base_currency}</b></span>
        <span><small>{labels.hawalaNet}</small><b dir="ltr">{formatAmount(valuation.totals.hawala_net_base)} {valuation.base_currency}</b></span>
        <span><small>{labels.bookValue}</small><b dir="ltr">{formatAmount(valuation.totals.book_value_base)} {valuation.base_currency}</b></span>
      </section>
      <div className="money-valuation-layout">
        <CurrencyValuationTable {...props} />
        <aside className="money-valuation-aside">
          <section>
            <h2>{labels.quality}</h2>
            <p className={valuation.total_complete ? "positive" : "money-partial"}>● {valuation.total_complete ? labels.currentQuality : labels.partialQuality}</p>
            {!valuation.total_complete ? <small>{labels.missingCurrencies}: {[...valuation.missing_currencies, ...valuation.stale_currencies].join(", ") || "—"}</small> : null}
          </section>
          <section><h2>{labels.handling}</h2><p>● {labels.missingRule}</p><p>● {labels.staleRule}</p></section>
        </aside>
      </div>
      <button className="secondary-action money-location-toggle" type="button" aria-expanded={showLocations} onClick={() => setShowLocations((value) => !value)}>{showLocations ? labels.hideLocations : labels.locations}</button>
      {showLocations ? (
        <section className="money-location-details" aria-label={labels.locations}>
          {valuation.locations.length ? valuation.locations.map((location) => (
            <article key={location.money_account_id}>
              <span><b>{location.name}</b><small>{location.account_type}</small></span>
              <div>{location.balances.map((balance) => <strong key={`${location.money_account_id}-${balance.currency_code}`} dir="ltr">{formatAmount(balance.amount)} {balance.currency_code}</strong>)}</div>
            </article>
          )) : <div className="empty-live">—</div>}
        </section>
      ) : null}
    </>
  );
}
