import { AppIcon } from "../../AppIcon";
import { translate, type Language } from "../../lib/i18n";
import { ux } from "../../lib/uxCopy";

type ManageSarafiProps = {
  language: Language;
  organizationId: string | null;
  roleLabel: string;
  canManageTeam: boolean;
  canManageMoney: boolean;
  onRoute: (path: string) => void;
};

export function ManageSarafi({ language, organizationId, roleLabel, canManageTeam, canManageMoney, onRoute }: ManageSarafiProps) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const controls = [
    { path: "business", title: language === "en" ? "Business Information" : language === "fa-AF" ? "معلومات صرافی" : "د صرافۍ معلومات", copy: canManageMoney ? (language === "en" ? "Business name, license, base currency, language, and working context." : language === "fa-AF" ? "نام صرافی، جواز، اسعار اصلی، زبان و معلومات کاری." : "د صرافۍ نوم، جواز، اصلي اسعار، ژبه او کاري معلومات.") : u("businessWideAccess"), icon: "settings" as const, enabled: canManageMoney },
    { path: "branches", title: language === "en" ? "Branches and Connected Partners" : language === "fa-AF" ? "شعبه‌ها و همکاران وصل‌شده" : "څانګې او نښلول شوي همکاران", copy: language === "en" ? "Manage branches, cashboxes, and verified Hawala endpoints." : language === "fa-AF" ? "شعبه‌ها، صندوق‌ها و مقصدهای تأییدشده حواله را مدیریت کنید." : "څانګې، صندوقونه او د حوالې تایید شوي مقصدونه اداره کړئ.", icon: "cashbox" as const, enabled: canManageMoney },
    { path: "rates", title: language === "en" ? "Currencies and Rates" : language === "fa-AF" ? "اسعار و نرخ‌ها" : "اسعار او نرخونه", copy: language === "en" ? "Enabled currencies, buy, sell, and daily valuation rates." : language === "fa-AF" ? "اسعار فعال، نرخ خرید، فروش و ارزش‌گذاری روزانه." : "فعال اسعار، د پېر، پلور او ورځنۍ ارزونې نرخونه.", icon: "rates" as const, enabled: canManageMoney },
    { path: "security", title: language === "en" ? "Security and App Lock" : language === "fa-AF" ? "امنیت و قفل برنامه" : "امنیت او د اپ قفل", copy: language === "en" ? "Two-step safeguards, trusted devices, and app-lock controls." : u("settingsDescription"), icon: "shield" as const, enabled: true },
    { path: "team", title: language === "en" ? "Team and Access" : language === "fa-AF" ? "تیم و دسترسی" : "ډله او لاسرسی", copy: canManageTeam ? (language === "en" ? "People, invitations, roles, devices, and limits." : u("teamAccess")) : u("accessRuleNote"), icon: "people" as const, enabled: canManageTeam },
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
          <button className="control-center-card" key={control.path} disabled={!control.enabled} onClick={() => onRoute(`/app/${organizationId ?? "inspection"}/control/${control.path}`)}>
            <AppIcon name={control.icon} />
            <span><strong>{control.title}</strong><small>{control.copy}</small></span>
            <span aria-hidden="true">→</span>
          </button>
        ))}
      </div>
    </section>
  );
}
