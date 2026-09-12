import type { CurrencyCatalogRecord, HawalaPartnerRecord, HawalaPayoutMatch, HawalaTransferRecord, MoneyAccountRecord } from "../../lib/financialApi";
import { localCurrencyName } from "../../lib/currencyNames";
import type { Language } from "../../lib/i18n";
import { isHawalaEndpointReady } from "./hawalaEndpoint";

export type HawalaRecipientType = "all" | "internal_branch" | "external_partner";
export type HawalaListTab = "incoming" | "outgoing" | "completed";

export function HawalaRecipientSearch({ language, partners, visiblePartners, recipientType, search, selectedPartnerId, onRecipientTypeChange, onSearchChange, onPartnerChange }: {
  language: Language;
  partners: HawalaPartnerRecord[];
  visiblePartners: HawalaPartnerRecord[];
  recipientType: HawalaRecipientType;
  search: string;
  selectedPartnerId: string;
  onRecipientTypeChange: (value: HawalaRecipientType) => void;
  onSearchChange: (value: string) => void;
  onPartnerChange: (partner: HawalaPartnerRecord | null) => void;
}) {
  const selectedPartner = partners.find((partner) => partner.id === selectedPartnerId) ?? null;
  const copy = language === "en"
    ? { legend: "Exact Hawala recipient", type: "Recipient type", all: "All verified recipients", branch: "Our branch", partner: "Partner branch", search: "Search recipient", placeholder: "Name, branch, or location", select: "Verified recipient and branch", choose: "Choose recipient", unnamed: "branch not named", connected: "Connected partner" }
    : language === "fa-AF"
      ? { legend: "گیرنده دقیق حواله", type: "نوع گیرنده", all: "همه گیرنده‌های تأییدشده", branch: "شعبه خود ما", partner: "شعبه همکار", search: "جستجوی گیرنده", placeholder: "نام، شعبه یا محل", select: "گیرنده و شعبه تأییدشده", choose: "گیرنده را انتخاب کنید", unnamed: "شعبه بدون نام", connected: "همکار وصل‌شده" }
      : { legend: "د حوالې کره اخیستونکی", type: "د اخیستونکي ډول", all: "ټول تایید شوي اخیستونکي", branch: "زموږ څانګه", partner: "د همکار څانګه", search: "اخیستونکی ولټوئ", placeholder: "نوم، څانګه یا ځای", select: "تایید شوی اخیستونکی او څانګه", choose: "اخیستونکی وټاکئ", unnamed: "بې نومه څانګه", connected: "نښلول شوی همکار" };

  return (
    <fieldset className="hawala-recipient-picker">
      <legend>{copy.legend}</legend>
      <div className="hawala-recipient-tools">
        <label>{copy.type}
          <select value={recipientType} onChange={(event) => onRecipientTypeChange(event.target.value as HawalaRecipientType)}>
            <option value="all">{copy.all}</option>
            <option value="internal_branch">{copy.branch}</option>
            <option value="external_partner">{copy.partner}</option>
          </select>
        </label>
        <label>{copy.search}<input type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={copy.placeholder} /></label>
      </div>
      <label>{copy.select}
        <select required value={selectedPartnerId} onChange={(event) => onPartnerChange(partners.find((partner) => partner.id === event.target.value) ?? null)}>
          <option value="">{copy.choose}</option>
          {visiblePartners.map((partner) => <option key={partner.id} value={partner.id} disabled={!isHawalaEndpointReady(partner)}>{partner.name} · {partner.recipient_branch_name ?? copy.unnamed}</option>)}
        </select>
      </label>
      {selectedPartner ? (
        <article className="hawala-selected-recipient">
          <span className="currency-badge usd">{selectedPartner.endpoint_type === "internal_branch" ? "BR" : "PT"}</span>
          <span><strong>{selectedPartner.recipient_organization_name ?? selectedPartner.name}</strong><small>{selectedPartner.recipient_branch_name ?? "—"} · {selectedPartner.recipient_location ?? "—"}</small></span>
          <b>{selectedPartner.endpoint_type === "internal_branch" ? copy.branch : copy.connected}</b>
        </article>
      ) : null}
    </fieldset>
  );
}

export function HawalaIdentityCapture({ language, front, back, frontPreview, backPreview, onFrontChange, onBackChange }: {
  language: Language;
  front: File | null;
  back: File | null;
  frontPreview: string;
  backPreview: string;
  onFrontChange: (file: File | null) => void;
  onBackChange: (file: File | null) => void;
}) {
  const copy = language === "en"
    ? { title: "Tazkira evidence", intro: "Use a clear, well-lit photo with all four corners visible. Location metadata is removed before upload.", front: "Front side", back: "Back side", choose: "Take or choose photo", remove: "Remove and retake", frontAlt: "Tazkira front preview", backAlt: "Tazkira back preview", privacy: "Private evidence is retained only under the organization’s approved identity-document policy. Access is logged." }
    : language === "fa-AF"
      ? { title: "سند تذکره", intro: "عکس روشن بگیرید و چهار گوشه تذکره را نشان دهید. معلومات موقعیت پیش از بارگذاری پاک می‌شود.", front: "روی تذکره", back: "پشت تذکره", choose: "عکس بگیرید یا انتخاب کنید", remove: "پاک‌کردن و عکس دوباره", frontAlt: "پیش‌نمایش روی تذکره", backAlt: "پیش‌نمایش پشت تذکره", privacy: "سند خصوصی تنها مطابق پالیسی تأییدشده نگهداری می‌شود و هر دسترسی ثبت می‌گردد." }
      : { title: "د تذکرې ثبوت", intro: "روښانه انځور واخلئ او څلور واړه کونجونه ښکاره کړئ. د ځای معلومات له پورته کولو مخکې پاکېږي.", front: "مخکنی اړخ", back: "شاتنی اړخ", choose: "انځور واخلئ یا وټاکئ", remove: "لرې کول او بیا انځور", frontAlt: "د تذکرې د مخ کتنه", backAlt: "د تذکرې د شا کتنه", privacy: "شخصي سند یوازې د تایید شوې پالیسۍ له مخې ساتل کېږي او هر لاسرسی ثبتېږي." };
  const side = (kind: "front" | "back") => {
    const file = kind === "front" ? front : back;
    const preview = kind === "front" ? frontPreview : backPreview;
    const change = kind === "front" ? onFrontChange : onBackChange;
    return (
      <div className="hawala-identity-side">
        <label>
          <span>{kind === "front" ? copy.front : copy.back}</span>
          {preview ? <img src={preview} alt={kind === "front" ? copy.frontAlt : copy.backAlt} /> : <b>{copy.choose}</b>}
          <input required type="file" accept="image/*" capture="environment" onChange={(event) => change(event.target.files?.[0] ?? null)} />
        </label>
        {file ? <button type="button" className="text-button" onClick={() => change(null)}>{copy.remove}</button> : null}
      </div>
    );
  };
  return <section className="hawala-identity-capture" aria-labelledby="hawala-identity-title"><h3 id="hawala-identity-title">{copy.title}</h3><p>{copy.intro}</p><div>{side("front")}{side("back")}</div><small>{copy.privacy}</small></section>;
}

export function HawalaPayoutConfirmation({ language, match, accounts, moneyAccountId, identityReference, identityConfirmed, identityFront, identityBack, frontPreview, backPreview, busy, accountLabel, chooseAccountLabel, formatAmount, onMoneyAccountChange, onIdentityReferenceChange, onIdentityConfirmedChange, onFrontChange, onBackChange, onConfirm }: {
  language: Language;
  match: HawalaPayoutMatch;
  accounts: MoneyAccountRecord[];
  moneyAccountId: string;
  identityReference: string;
  identityConfirmed: boolean;
  identityFront: File | null;
  identityBack: File | null;
  frontPreview: string;
  backPreview: string;
  busy: boolean;
  accountLabel: string;
  chooseAccountLabel: string;
  formatAmount: (value: string | number) => string;
  onMoneyAccountChange: (value: string) => void;
  onIdentityReferenceChange: (value: string) => void;
  onIdentityConfirmedChange: (value: boolean) => void;
  onFrontChange: (file: File | null) => void;
  onBackChange: (file: File | null) => void;
  onConfirm: () => void;
}) {
  const copy = language === "en"
    ? { reference: "Checked identity reference", referenceHint: "Document type and last digits", confirmed: "I matched the recipient to the transfer beneficiary.", action: "Give Money and Complete Hawala" }
    : language === "fa-AF"
      ? { reference: "مرجع هویت بررسی‌شده", referenceHint: "نوع سند و رقم‌های آخر", confirmed: "هویت گیرنده را با مستفید حواله مطابقت دادم.", action: "پول را بدهید و حواله را تکمیل کنید" }
      : { reference: "کتل شوې پېژندپاڼې مرجع", referenceHint: "د سند ډول او وروستۍ شمېرې", confirmed: "ما د اخیستونکي هویت د حوالې له ګټه اخیستونکي سره برابر کړ.", action: "پیسې ورکړئ او حواله بشپړه کړئ" };
  const disabled = busy || !moneyAccountId || !identityConfirmed || identityReference.trim().length < 2 || !identityFront || !identityBack;
  return (
    <>
      <article className="payout-match"><span><strong>{match.beneficiary_name}</strong><small>{match.destination_location}</small></span><b dir="ltr">{formatAmount(match.amount)} {match.currency_code}</b></article>
      <label>{accountLabel}<select required value={moneyAccountId} onChange={(event) => onMoneyAccountChange(event.target.value)}><option value="">{chooseAccountLabel}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label>{copy.reference}<input required value={identityReference} onChange={(event) => onIdentityReferenceChange(event.target.value)} placeholder={copy.referenceHint} /></label>
      <HawalaIdentityCapture language={language} front={identityFront} back={identityBack} frontPreview={frontPreview} backPreview={backPreview} onFrontChange={onFrontChange} onBackChange={onBackChange} />
      <label className="inline-check"><input type="checkbox" checked={identityConfirmed} onChange={(event) => onIdentityConfirmedChange(event.target.checked)} />{copy.confirmed}</label>
      <button className="primary-action full" type="button" disabled={disabled} onClick={onConfirm}>{busy ? "…" : copy.action}</button>
    </>
  );
}

export function HawalaReceivedList({ language, transfers, tab, search, currencyFilter, statusFilter, catalog, routeTransferId, noHawalaLabel, statusLabel, directionLabel, formatAmount, onSend, onTabChange, onSearchChange, onCurrencyFilterChange, onStatusFilterChange, onOpen }: {
  language: Language;
  transfers: HawalaTransferRecord[];
  tab: HawalaListTab;
  search: string;
  currencyFilter: string;
  statusFilter: string;
  catalog: CurrencyCatalogRecord[];
  routeTransferId: string | null;
  noHawalaLabel: string;
  statusLabel: (status: string) => string;
  directionLabel: (direction?: string) => string;
  formatAmount: (value: string | number) => string;
  onSend: () => void;
  onTabChange: (tab: HawalaListTab) => void;
  onSearchChange: (value: string) => void;
  onCurrencyFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onOpen: (transfer: HawalaTransferRecord) => void;
}) {
  const copy = language === "en"
    ? { send: "Send Hawala", incoming: "Received Hawala", outgoing: "Sent Hawala", completed: "Completed", search: "Search", searchHint: "Search name, partner, or Hawala number", currency: "Currency", allCurrencies: "All currencies", status: "Status", allStatuses: "All statuses", review: "Review payout", open: "Open" }
    : language === "fa-AF"
      ? { send: "فرستادن حواله", incoming: "حواله‌های رسیده", outgoing: "حواله‌های فرستاده‌شده", completed: "تکمیل‌شده", search: "جستجو", searchHint: "جستجوی نام، همکار یا شماره حواله", currency: "اسعار", allCurrencies: "همه اسعار", status: "حالت", allStatuses: "همه حالت‌ها", review: "بررسی پرداخت", open: "بازکردن" }
      : { send: "حواله لېږل", incoming: "رارسېدلې حوالې", outgoing: "لېږل شوې حوالې", completed: "بشپړې", search: "لټون", searchHint: "نوم، همکار یا د حوالې شمېره ولټوئ", currency: "اسعار", allCurrencies: "ټول اسعار", status: "حالت", allStatuses: "ټول حالتونه", review: "ورکړه کتل", open: "پرانیستل" };
  const tabs: Array<[HawalaListTab, string]> = [["incoming", copy.incoming], ["outgoing", copy.outgoing], ["completed", copy.completed]];
  return (
    <>
      <section className="hawala-inbox-controls">
        <button className="primary-action hawala-send-action" type="button" onClick={onSend}>{copy.send}</button>
        <div className="hawala-inbox-tabs" role="tablist">
          {tabs.map(([value, label]) => <button type="button" role="tab" aria-selected={tab === value} className={tab === value ? "active" : ""} key={value} onClick={() => onTabChange(value)}>{label}</button>)}
        </div>
        <div className="hawala-inbox-filters">
          <label><span className="sr-only">{copy.search}</span><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={copy.searchHint} /></label>
          <label><span className="sr-only">{copy.currency}</span><select aria-label={copy.currency} value={currencyFilter} onChange={(event) => onCurrencyFilterChange(event.target.value)}><option value="">{copy.allCurrencies}</option>{catalog.filter((item) => item.enabled).map((item) => <option key={item.code} value={item.code}>{item.code} · {localCurrencyName(language, item.code, item)}</option>)}</select></label>
          <label><span className="sr-only">{copy.status}</span><select aria-label={copy.status} value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}><option value="">{copy.allStatuses}</option>{["draft", "sent", "acknowledged", "ready", "paid", "cancelled", "expired", "review_required"].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
        </div>
      </section>
      <div className="balance-list hawala-inbox-list">
        {transfers.length ? transfers.map((transfer) => (
          <button type="button" className={`balance-row ${routeTransferId === transfer.id ? "deep-link-focus" : ""}`} id={`hawala-${transfer.id}`} key={transfer.id} onClick={() => onOpen(transfer)}>
            <span className="currency-badge usd">{transfer.direction === "incoming" ? "IN" : "OUT"}</span>
            <span className="balance-name"><b>{transfer.beneficiary_name}</b><small>{transfer.reference_code} · {transfer.destination_location} · {directionLabel(transfer.direction)}</small></span>
            <strong><bdi>{formatAmount(transfer.amount)} {transfer.currency_code}</bdi></strong>
            <span className="hawala-status-actions"><small className={`status-pill status-${transfer.status}`}>● {statusLabel(transfer.status)}{transfer.integrity_state === "review_required" ? ` · ${statusLabel("review_required")}` : ""}</small><b>{transfer.direction === "incoming" && transfer.status === "ready" ? copy.review : copy.open} →</b></span>
          </button>
        )) : <div className="empty-live">{noHawalaLabel}</div>}
      </div>
    </>
  );
}
