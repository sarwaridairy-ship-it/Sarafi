import { AppIcon } from "../../AppIcon";
import { translate, type Language } from "../../lib/i18n";
import { ux } from "../../lib/uxCopy";

type ManageSarafiProps = {
  language: Language;
  roleLabel: string;
  canManageTeam: boolean;
  canManageMoney: boolean;
  canManageBilling: boolean;
  onNavigate: (section: string) => void;
};

export function ManageSarafi({ language, roleLabel, canManageTeam, canManageMoney, canManageBilling, onNavigate }: ManageSarafiProps) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const controls = [
    { id: "Business Settings", title: language === "en" ? "Business & currencies" : language === "fa-AF" ? "صرافی و اسعار" : "صرافي او اسعار", copy: canManageMoney ? (language === "en" ? "Set shop details, currencies, branches, and cashboxes." : language === "fa-AF" ? "معلومات صرافی، اسعار، شعبه‌ها و صندوق‌ها را تنظیم کنید." : "د صرافۍ معلومات، اسعار، څانګې او صندوقونه تنظیم کړئ.") : (language === "en" ? "View only · ask an authorized administrator to change setup." : u("businessWideAccess")), icon: "settings" as const, enabled: canManageMoney },
    { id: "Cash & Accounts", title: language === "en" ? "Cashboxes" : language === "fa-AF" ? "صندوق‌ها" : "صندوقونه", copy: language === "en" ? "See the money currently held in each cashbox." : language === "fa-AF" ? "پول موجود در هر صندوق را ببینید." : "په هر صندوق کې موجودې پیسې وګورئ.", icon: "cashbox" as const, enabled: true },
    { id: "Team & Devices", title: language === "en" ? "Team & access" : language === "fa-AF" ? "تیم و دسترسی" : "ډله او لاسرسی", copy: canManageTeam ? (language === "en" ? "Protected · people, invitations, requests, devices, roles, and limits." : u("teamAccess")) : (language === "en" ? "View only · access changes require authorization." : u("accessRuleNote")), icon: "people" as const, enabled: canManageTeam },
    { id: "Billing", title: language === "en" ? "Subscription & payment" : language === "fa-AF" ? "اشتراک و پرداخت" : "ګډون او تادیه", copy: language === "en" ? "Choose a 1, 3, 6, or 12-month plan and review payment status." : language === "fa-AF" ? "اشتراک ۱، ۳، ۶ یا ۱۲ ماهه و حالت پرداخت را ببینید." : "د ۱، ۳، ۶ یا ۱۲ میاشتو ګډون او د تادیې حالت وګورئ.", icon: "wallet" as const, enabled: canManageBilling },
    { id: "Security", title: language === "en" ? "Security" : language === "fa-AF" ? "امنیت" : "امنیت", copy: language === "en" ? "Review two-step safeguards and trusted devices." : u("settingsDescription"), icon: "shield" as const, enabled: true },
  ];

  return (
    <section className="panel control-center-panel">
      <div className="panel-header">
        <div>
          <p className="kicker">{t("workspace")}</p>
          <h1>{language === "en" ? "Manage SARAFI" : language === "fa-AF" ? "مدیریت سرافی" : "سرافي اداره کړئ"}</h1>
          <p>{roleLabel} · {language === "en" ? "Business administration in five clear areas." : u("settingsDescription")}</p>
        </div>
      </div>
      <div className="control-center-grid">
        {controls.map((control) => (
          <button className="control-center-card" key={control.id} disabled={!control.enabled} onClick={() => onNavigate(control.id)}>
            <AppIcon name={control.icon} />
            <span><strong>{control.title}</strong><small>{control.copy}</small></span>
            <span aria-hidden="true">→</span>
          </button>
        ))}
      </div>
    </section>
  );
}
