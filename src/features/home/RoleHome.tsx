import { AppIcon, type AppIconName } from "../../AppIcon";
import type { WorkspaceRole } from "../../app/capabilities";
import type { DashboardSnapshot } from "../../lib/financialApi";
import type { Language } from "../../lib/i18n";

type Summary = { label: string; value: string; note: string; icon: AppIconName; private?: boolean };
type HomeCopy = { eyebrow: string; title: string; intro: string; primary: string; attention: string; recent: string; clear: string };

type RoleHomeProps = {
  language: Language;
  role: WorkspaceRole;
  roleLabel: string;
  dashboard: DashboardSnapshot | null;
  businessDate: string;
  online: boolean;
  privacy: boolean;
  onTogglePrivacy: () => void;
  onNavigate: (section: string) => void;
};

const local = (language: Language, en: string, fa: string, ps: string) => language === "en" ? en : language === "fa-AF" ? fa : ps;

function money(value?: string): string {
  if (!value) return "—";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numeric) : value;
}

function commonCopy(language: Language, title: string, intro: string, primary: string): HomeCopy {
  return {
    eyebrow: local(language, "Today", "امروز", "نن"),
    title,
    intro,
    primary,
    attention: local(language, "Needs attention", "نیاز به توجه", "پاملرنې ته اړتیا"),
    recent: local(language, "Recent activity", "فعالیت اخیر", "وروستی فعالیت"),
    clear: local(language, "Nothing needs your attention right now.", "اکنون کاری نیاز به توجه شما ندارد.", "اوس هېڅ کار ستاسو پاملرنې ته اړتیا نه لري."),
  };
}

function HomeFrame({
  language,
  roleLabel,
  copy,
  dashboard,
  businessDate,
  online,
  privacy,
  summaries,
  primarySection,
  attentionSections,
  onTogglePrivacy,
  onNavigate,
}: Omit<RoleHomeProps, "role"> & {
  copy: HomeCopy;
  summaries: Summary[];
  primarySection: string;
  attentionSections: Array<{ label: string; section: string }>;
}) {
  const activities = dashboard?.activity.slice(0, 5) ?? [];
  return (
    <section className="calm-home" aria-labelledby="calm-home-title">
      <header className="calm-home-header">
        <div>
          <p className="kicker"><bdi>{businessDate}</bdi> · {copy.eyebrow}</p>
          <h1 id="calm-home-title">{copy.title}</h1>
          <p>{copy.intro}</p>
          <span className={`connection-badge ${online ? "online" : "offline"}`} role="status">
            <i aria-hidden="true" />{online ? local(language, "Connected", "متصل", "نښتی") : local(language, "Offline — posting paused", "آفلاین — ثبت متوقف است", "افلاین — ثبت درول شوی")}
          </span>
        </div>
        <div className="home-primary-wrap">
          <span>{roleLabel}</span>
          <button className="calm-primary" type="button" onClick={() => onNavigate(primarySection)}>{copy.primary}<span aria-hidden="true">→</span></button>
        </div>
      </header>

      <section className="calm-summary-grid" aria-label={local(language, "Today’s summary", "خلاصه امروز", "د نن لنډیز")}>
        {summaries.slice(0, 4).map((item) => (
          <article key={item.label}>
            <span><AppIcon name={item.icon} size={19} />{item.label}</span>
            <strong dir="ltr">{item.private && privacy ? "••••" : item.value}</strong>
            <small>{item.note}</small>
          </article>
        ))}
        {summaries.some((item) => item.private) ? <button className="privacy-toggle" type="button" onClick={onTogglePrivacy}>{privacy ? local(language, "Show amounts", "نمایش مبلغ", "مبلغ ښکاره کړئ") : local(language, "Hide amounts", "پنهان کردن مبلغ", "مبلغ پټ کړئ")}</button> : null}
      </section>

      <div className="calm-home-columns">
        <section className="calm-attention" aria-labelledby="attention-title">
          <div className="calm-section-heading"><h2 id="attention-title">{copy.attention}</h2><span>{attentionSections.length}</span></div>
          {attentionSections.length ? <div className="calm-list">{attentionSections.slice(0, 5).map((item) => <button type="button" key={`${item.section}-${item.label}`} onClick={() => onNavigate(item.section)}><span aria-hidden="true">!</span><strong>{item.label}</strong><span aria-hidden="true">→</span></button>)}</div> : <p className="calm-empty">✓ {copy.clear}</p>}
        </section>
        <section className="calm-recent" aria-labelledby="recent-title">
          <div className="calm-section-heading"><h2 id="recent-title">{copy.recent}</h2><button type="button" onClick={() => onNavigate("Transactions")}>{local(language, "View all", "نمایش همه", "ټول وګورئ")}</button></div>
          {activities.length ? <div className="calm-activity-list">{activities.map((item) => <article key={item.id}><AppIcon name="transactions" size={18} /><span><strong>{item.type.replaceAll("_", " ")}</strong><small><bdi>{item.reference}</bdi> · <bdi>{new Date(item.occurred_at).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })}</bdi></small></span><em className={`status-${item.status}`}>● {item.status}</em></article>)}</div> : <p className="calm-empty">{local(language, "No activity yet.", "هنوز فعالیتی نیست.", "لا فعالیت نشته.")}</p>}
        </section>
      </div>
    </section>
  );
}

function OwnerHome(props: Omit<RoleHomeProps, "role">) {
  const { language, dashboard } = props;
  const copy = commonCopy(language, local(language, "Your exchange at a glance", "خلاصه صرافی شما", "ستاسو د صرافۍ لنډیز"), local(language, "Money, exceptions, and the next owner decision—without the accounting noise.", "پول، موارد مهم و تصمیم بعدی مالک؛ بدون شلوغی حسابداری.", "پیسې، مهمې چارې او د مالک بله پرېکړه؛ بې له حسابي شور څخه."), local(language, "Make a transaction", "ثبت معامله", "معامله ثبتول"));
  const summaries: Summary[] = [
    { label: local(language, "Our money", "پول ما", "زموږ پیسې"), value: `${money(dashboard?.net_position_base)} AFN`, note: local(language, "Across active locations", "در محل‌های فعال", "په فعالو ځایونو کې"), icon: "wallet", private: true },
    { label: local(language, "Today’s movement", "گردش امروز", "د نن خوځښت"), value: `${money(dashboard?.volume_base)} AFN`, note: `${dashboard?.transaction_count ?? 0} ${local(language, "transactions", "معامله", "معاملې")}`, icon: "transactions", private: true },
    { label: local(language, "Today’s result", "نتیجه امروز", "د نن پایله"), value: `${money(dashboard?.net_result)} AFN`, note: local(language, "After income and expense", "پس از عاید و مصرف", "له عاید او لګښت وروسته"), icon: "report", private: true },
    { label: local(language, "Approvals", "تأییدها", "تاییدونه"), value: String(dashboard?.pending_approvals ?? 0), note: local(language, "Waiting for a decision", "منتظر تصمیم", "پر پرېکړه منتظر"), icon: "shield" },
  ];
  const attention = [
    ...(dashboard?.pending_approvals ? [{ label: `${dashboard.pending_approvals} ${local(language, "approval requests", "درخواست تأیید", "د تایید غوښتنې")}`, section: "Team & Devices" }] : []),
    ...(Number(dashboard?.reconciliation_differences ?? 0) !== 0 ? [{ label: local(language, "A cashbox difference needs review", "تفاوت صندوق نیاز به بررسی دارد", "د صندوق توپیر کتنې ته اړتیا لري"), section: "Reconciliation" }] : []),
  ];
  return <HomeFrame {...props} copy={copy} summaries={summaries} primarySection="Trade" attentionSections={attention} />;
}

function BusinessAdminHome(props: Omit<RoleHomeProps, "role">) {
  const { language, dashboard } = props;
  const copy = commonCopy(language, local(language, "Operations are under control", "عملیات زیر کنترول است", "عملیات تر کنټرول لاندې دي"), local(language, "See today’s flow, team exceptions, and operational decisions.", "گردش امروز، موارد تیم و تصمیم‌های عملیاتی را ببینید.", "د نن جریان، د ډلې موارد او عملیاتي پرېکړې وګورئ."), local(language, "Make a transaction", "ثبت معامله", "معامله ثبتول"));
  const summaries: Summary[] = [
    { label: local(language, "Today’s volume", "حجم امروز", "د نن حجم"), value: `${money(dashboard?.volume_base)} AFN`, note: `${dashboard?.transaction_count ?? 0} ${local(language, "posted", "ثبت‌شده", "ثبت شوې")}`, icon: "transactions", private: true },
    { label: local(language, "Cash position", "وضعیت پول", "د پیسو حالت"), value: `${money(dashboard?.net_position_base)} AFN`, note: local(language, "All assigned locations", "همه محل‌های تعیین‌شده", "ټول ټاکل شوي ځایونه"), icon: "wallet", private: true },
    { label: local(language, "Approvals", "تأییدها", "تاییدونه"), value: String(dashboard?.pending_approvals ?? 0), note: local(language, "Waiting now", "منتظر", "منتظر"), icon: "shield" },
    { label: local(language, "Open debts", "قرض‌های باز", "پرانیستي پورونه"), value: String((dashboard?.receivables.length ?? 0) + (dashboard?.payables.length ?? 0)), note: local(language, "Currency positions", "وضعیت اسعار", "د اسعارو حالتونه"), icon: "debt" },
  ];
  const attention = dashboard?.pending_approvals ? [{ label: local(language, "Review pending approvals", "بررسی تأییدهای منتظر", "منتظر تاییدونه وڅېړئ"), section: "Team & Devices" }] : [];
  return <HomeFrame {...props} copy={copy} summaries={summaries} primarySection="Trade" attentionSections={attention} />;
}

function ManagerHome(props: Omit<RoleHomeProps, "role">) {
  const { language, dashboard } = props;
  const copy = commonCopy(language, local(language, "Today’s branch work", "کار امروز شعبه", "د نن د څانګې کار"), local(language, "Focus on customer flow, cashboxes, and exceptions.", "روی مشتریان، صندوق‌ها و موارد استثنایی تمرکز کنید.", "پر پېرېدونکو، صندوقونو او استثناوو تمرکز وکړئ."), local(language, "Make a transaction", "ثبت معامله", "معامله ثبتول"));
  const summaries: Summary[] = [
    { label: local(language, "Transactions", "معاملات", "معاملې"), value: String(dashboard?.transaction_count ?? 0), note: local(language, "Posted today", "ثبت امروز", "نن ثبت شوې"), icon: "transactions" },
    { label: local(language, "Volume", "حجم", "حجم"), value: `${money(dashboard?.volume_base)} AFN`, note: local(language, "Today", "امروز", "نن"), icon: "wallet", private: true },
    { label: local(language, "Approvals", "تأییدها", "تاییدونه"), value: String(dashboard?.pending_approvals ?? 0), note: local(language, "Waiting", "منتظر", "منتظر"), icon: "shield" },
    { label: local(language, "Cashbox difference", "تفاوت صندوق", "د صندوق توپیر"), value: `${money(dashboard?.reconciliation_differences)} AFN`, note: local(language, "Needs zero at close", "در ختم باید صفر باشد", "په تړلو کې باید صفر وي"), icon: "cashbox", private: true },
  ];
  const attention = [
    ...(dashboard?.pending_approvals ? [{ label: local(language, "Decide pending approvals", "تصمیم درباره تأییدها", "د تاییدونو پرېکړه وکړئ"), section: "Team & Devices" }] : []),
    ...(Number(dashboard?.reconciliation_differences ?? 0) !== 0 ? [{ label: local(language, "Review the cashbox difference", "بررسی تفاوت صندوق", "د صندوق توپیر وڅېړئ"), section: "Reconciliation" }] : []),
  ];
  return <HomeFrame {...props} copy={copy} summaries={summaries} primarySection="Trade" attentionSections={attention} />;
}

function CashierHome(props: Omit<RoleHomeProps, "role">) {
  const { language, dashboard } = props;
  const copy = commonCopy(language, local(language, "Ready for the next customer", "آماده مشتری بعدی", "د بل پېرېدونکي لپاره چمتو"), local(language, "Only your daily work and cashbox are shown here.", "فقط کار روزانه و صندوق شما اینجا نمایش داده می‌شود.", "دلته یوازې ستاسو ورځنی کار او صندوق ښودل کېږي."), local(language, "New transaction", "معامله جدید", "نوې معامله"));
  const summaries: Summary[] = [
    { label: local(language, "My transactions", "معاملات من", "زما معاملې"), value: String(dashboard?.transaction_count ?? 0), note: local(language, "Today", "امروز", "نن"), icon: "transactions" },
    { label: local(language, "Buy", "خرید", "پېرل"), value: String(dashboard?.buy_count ?? 0), note: local(language, "Currency trades", "معاملات اسعار", "د اسعارو معاملې"), icon: "receive" },
    { label: local(language, "Sell", "فروش", "پلورل"), value: String(dashboard?.sell_count ?? 0), note: local(language, "Currency trades", "معاملات اسعار", "د اسعارو معاملې"), icon: "pay" },
    { label: local(language, "Cashbox close", "بستن صندوق", "د صندوق تړل"), value: Number(dashboard?.reconciliation_differences ?? 0) === 0 ? local(language, "Ready", "آماده", "چمتو") : local(language, "Check", "بررسی", "وګورئ"), note: local(language, "End-of-shift count", "شمارش پایان نوبت", "د نوبت پای شمېرنه"), icon: "cashbox" },
  ];
  const attention = Number(dashboard?.reconciliation_differences ?? 0) !== 0 ? [{ label: local(language, "Your cashbox count needs attention", "شمارش صندوق شما نیاز به توجه دارد", "ستاسو د صندوق شمېرنه پاملرنې ته اړتیا لري"), section: "Cashbox Close" }] : [];
  return <HomeFrame {...props} copy={copy} summaries={summaries} primarySection="Trade" attentionSections={attention} />;
}

function AccountantHome(props: Omit<RoleHomeProps, "role">) {
  const { language, dashboard } = props;
  const copy = commonCopy(language, local(language, "Review today’s books", "بررسی حساب‌های امروز", "د نن حسابونه وڅېړئ"), local(language, "Reports and reconciliation only—posting controls stay out of the way.", "فقط گزارش و تصفیه؛ ابزار ثبت نمایش داده نمی‌شود.", "یوازې راپورونه او تصفیه؛ د ثبت وسایل نه ښودل کېږي."), local(language, "Open daily summary", "باز کردن خلاصه روزانه", "ورځنی لنډیز پرانیزئ"));
  const summaries: Summary[] = [
    { label: local(language, "Transactions", "معاملات", "معاملې"), value: String(dashboard?.transaction_count ?? 0), note: local(language, "Posted today", "ثبت امروز", "نن ثبت شوې"), icon: "transactions" },
    { label: local(language, "Income", "عاید", "عاید"), value: `${money(dashboard?.commission_income)} AFN`, note: local(language, "Recorded", "ثبت‌شده", "ثبت شوی"), icon: "report", private: true },
    { label: local(language, "Expenses", "مصارف", "لګښتونه"), value: `${money(dashboard?.expenses)} AFN`, note: local(language, "Recorded", "ثبت‌شده", "ثبت شوي"), icon: "expense", private: true },
    { label: local(language, "Difference", "تفاوت", "توپیر"), value: `${money(dashboard?.reconciliation_differences)} AFN`, note: local(language, "Reconciliation", "تصفیه", "تصفیه"), icon: "cashbox", private: true },
  ];
  const attention = Number(dashboard?.reconciliation_differences ?? 0) !== 0 ? [{ label: local(language, "Reconciliation difference to review", "تفاوت تصفیه برای بررسی", "د تصفیې توپیر د کتنې لپاره"), section: "Reconciliation" }] : [];
  return <HomeFrame {...props} copy={copy} summaries={summaries} primarySection="Reports" attentionSections={attention} />;
}

function ComplianceHome(props: Omit<RoleHomeProps, "role">) {
  const { language, dashboard } = props;
  const copy = commonCopy(language, local(language, "Compliance review queue", "صف بررسی تطبیق", "د مطابقت د کتنې کتار"), local(language, "Open exceptions and traceable activity, without transaction controls.", "موارد استثنایی و فعالیت قابل پیگیری؛ بدون ابزار معامله.", "استثناوې او د تعقیب وړ فعالیت؛ د معاملې له وسایلو پرته."), local(language, "Open reviews", "باز کردن بررسی‌ها", "کتنې پرانیزئ"));
  const summaries: Summary[] = [
    { label: local(language, "Pending reviews", "بررسی‌های منتظر", "منتظرې کتنې"), value: String(dashboard?.pending_approvals ?? 0), note: local(language, "Assigned queue", "صف تعیین‌شده", "ټاکل شوی کتار"), icon: "shield" },
    { label: local(language, "Hawala activity", "فعالیت حواله", "د حوالې فعالیت"), value: String(dashboard?.activity.filter((item) => item.type.toLowerCase().includes("hawala")).length ?? 0), note: local(language, "Recent records", "اسناد اخیر", "وروستي اسناد"), icon: "hawala" },
    { label: local(language, "Recent records", "اسناد اخیر", "وروستي اسناد"), value: String(dashboard?.activity.length ?? 0), note: local(language, "Traceable", "قابل پیگیری", "د تعقیب وړ"), icon: "transactions" },
  ];
  const attention = dashboard?.pending_approvals ? [{ label: local(language, "Review assigned exceptions", "بررسی موارد تعیین‌شده", "ټاکل شوې استثناوې وڅېړئ"), section: "Compliance Reviews" }] : [];
  return <HomeFrame {...props} copy={copy} summaries={summaries} primarySection="Compliance Reviews" attentionSections={attention} />;
}

function ViewerHome(props: Omit<RoleHomeProps, "role">) {
  const { language, dashboard } = props;
  const copy = commonCopy(language, local(language, "Business overview", "نمای کلی صرافی", "د صرافۍ لنډه کتنه"), local(language, "A calm read-only view of balances and recent activity.", "نمای آرام و فقط‌خواندنی موجودی و فعالیت اخیر.", "د پیسو او وروستي فعالیت ارام، یوازې لوست لید."), local(language, "View activity", "نمایش فعالیت", "فعالیت وګورئ"));
  const summaries: Summary[] = [
    { label: local(language, "Money position", "وضعیت پول", "د پیسو حالت"), value: `${money(dashboard?.net_position_base)} AFN`, note: local(language, "Read only", "فقط نمایش", "یوازې لوستل"), icon: "wallet", private: true },
    { label: local(language, "Transactions", "معاملات", "معاملې"), value: String(dashboard?.transaction_count ?? 0), note: local(language, "Today", "امروز", "نن"), icon: "transactions" },
    { label: local(language, "Currencies", "اسعار", "اسعار"), value: String(dashboard?.positions.length ?? 0), note: local(language, "Active positions", "وضعیت‌های فعال", "فعال حالتونه"), icon: "rates" },
  ];
  return <HomeFrame {...props} copy={copy} summaries={summaries} primarySection="Transactions" attentionSections={[]} />;
}

export function RoleHome({ role, ...props }: RoleHomeProps) {
  switch (role) {
    case "owner": return <OwnerHome {...props} />;
    case "business_admin": return <BusinessAdminHome {...props} />;
    case "manager": return <ManagerHome {...props} />;
    case "cashier": return <CashierHome {...props} />;
    case "accountant": return <AccountantHome {...props} />;
    case "compliance_officer": return <ComplianceHome {...props} />;
    default: return <ViewerHome {...props} />;
  }
}
