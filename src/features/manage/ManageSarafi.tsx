import { AppIcon } from "../../AppIcon";
import { translate, type Language } from "../../lib/i18n";
import { ux } from "../../lib/uxCopy";

type ManageSarafiProps = {
  language: Language;
  roleLabel: string;
  canManageTeam: boolean;
  canManageMoney: boolean;
  onNavigate: (section: string) => void;
};

export function ManageSarafi({ language, roleLabel, canManageTeam, canManageMoney, onNavigate }: ManageSarafiProps) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const u = (key: Parameters<typeof ux>[1]) => ux(language, key);
  const controls = [
    { id: "Business Settings", title: language === "en" ? "Business & branches" : language === "fa-AF" ? "صرافی و شعبه‌ها" : "صرافي او څانګې", copy: canManageMoney ? (language === "en" ? "Configured · review identity, currency, and branch setup." : u("settingsDescription")) : (language === "en" ? "View only · ask an authorized administrator to change setup." : u("businessWideAccess")), icon: "settings" as const, enabled: canManageMoney },
    { id: "Team & Devices", title: language === "en" ? "Team & access" : language === "fa-AF" ? "تیم و دسترسی" : "ډله او لاسرسی", copy: canManageTeam ? (language === "en" ? "Protected · people, invitations, requests, devices, roles, and limits." : u("teamAccess")) : (language === "en" ? "View only · access changes require authorization." : u("accessRuleNote")), icon: "people" as const, enabled: canManageTeam },
    { id: "Rates", title: language === "en" ? "Rates & cashboxes" : language === "fa-AF" ? "نرخ‌ها و صندوق‌ها" : "نرخونه او صندوقونه", copy: canManageMoney ? (language === "en" ? "Operational · manage shop rates and money locations." : u("ratesDescription")) : (language === "en" ? "Current settings are available in read-only mode." : u("ratesDescription")), icon: "rates" as const, enabled: true },
    { id: "Security", title: language === "en" ? "Security & plan" : language === "fa-AF" ? "امنیت و طرح" : "امنیت او پلان", copy: language === "en" ? "Review two-step safeguards, trusted devices, and plan status." : u("settingsDescription"), icon: "shield" as const, enabled: true },
  ];

  return (
    <section className="panel control-center-panel">
      <div className="panel-header">
        <div>
          <p className="kicker">{t("workspace")}</p>
          <h1>{language === "en" ? "Manage SARAFI" : language === "fa-AF" ? "مدیریت سرافی" : "سرافي اداره کړئ"}</h1>
          <p>{roleLabel} · {language === "en" ? "Four calm status areas for business administration." : u("settingsDescription")}</p>
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
