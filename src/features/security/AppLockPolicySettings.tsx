import type { Language } from "../../lib/i18n";

const roleCodes = ["owner", "business_admin", "manager", "accountant", "cashier", "compliance_officer", "viewer"] as const;

const labels = {
  en: {
    title: "Organization App Lock policy",
    intro: "Choose which jobs must use App Lock and how long a fresh unlock may protect sensitive actions.",
    required: "Require App Lock for",
    maximum: "Maximum auto-lock time",
    sensitive: "Fresh unlock for payout and private documents",
    identity: "Tazkira photos required for Hawala payout",
    one: "One photo (default)",
    two: "Two photos",
    save: "Save organization policy",
    seconds: "seconds",
  },
  "fa-AF": {
    title: "پالیسی قفل برنامه صرافی",
    intro: "وظایف مشمول قفل برنامه و مدت اعتبار بازکردن تازه برای کارهای حساس را تعیین کنید.",
    required: "قفل برنامه برای این وظایف ضروری باشد",
    maximum: "بیشترین زمان قفل خودکار",
    sensitive: "بازکردن تازه برای پرداخت حواله و اسناد خصوصی",
    identity: "عکس‌های تذکره لازم برای پرداخت حواله",
    one: "یک عکس (پیش‌فرض)",
    two: "دو عکس",
    save: "ذخیره پالیسی صرافی",
    seconds: "ثانیه",
  },
  "ps-AF": {
    title: "د صرافۍ د اپ قفل پالیسي",
    intro: "هغه دندې وټاکئ چې اپ قفل ورته اړین دی او د حساسو کارونو تازه خلاصول څومره وخت اعتبار لري.",
    required: "د دې دندو لپاره اپ قفل اړین کړئ",
    maximum: "د اتومات قفل تر ټولو ډېر وخت",
    sensitive: "د حوالې تادیې او شخصي اسنادو لپاره تازه خلاصول",
    identity: "د حوالې تادیې لپاره اړین د تذکرې عکسونه",
    one: "یو عکس (اصلي)",
    two: "دوه عکسونه",
    save: "د صرافۍ پالیسي ساتل",
    seconds: "ثانیې",
  },
} as const;

const roleLabels = {
  en: { owner: "Owner", business_admin: "Business admin", manager: "Manager", accountant: "Accountant", cashier: "Cashier", compliance_officer: "Compliance officer", viewer: "Viewer" },
  "fa-AF": { owner: "مالک", business_admin: "مدیر عمومی", manager: "مدیر", accountant: "حسابدار", cashier: "صندوق‌دار", compliance_officer: "مسئول مقررات", viewer: "مشاهده‌کننده" },
  "ps-AF": { owner: "مالک", business_admin: "عمومي مدیر", manager: "مدیر", accountant: "محاسب", cashier: "صندوق‌دار", compliance_officer: "د مقرراتو مسئول", viewer: "کتونکی" },
} as const;

export function AppLockPolicySettings({ language, requiredRoles, maxTimeoutSeconds, sensitiveReunlockSeconds, hawalaTazkiraImagesRequired, busy, onRequiredRolesChange, onMaxTimeoutSecondsChange, onSensitiveReunlockSecondsChange, onHawalaTazkiraImagesRequiredChange, onSave }: {
  language: Language;
  requiredRoles: string[];
  maxTimeoutSeconds: 30 | 60 | 300 | 900;
  sensitiveReunlockSeconds: number;
  hawalaTazkiraImagesRequired: 1 | 2;
  busy: boolean;
  onRequiredRolesChange: (roles: string[]) => void;
  onMaxTimeoutSecondsChange: (seconds: 30 | 60 | 300 | 900) => void;
  onSensitiveReunlockSecondsChange: (seconds: number) => void;
  onHawalaTazkiraImagesRequiredChange: (count: 1 | 2) => void;
  onSave: () => void;
}) {
  const text = labels[language];
  const toggleRole = (role: string) => onRequiredRolesChange(requiredRoles.includes(role) ? requiredRoles.filter((item) => item !== role) : [...requiredRoles, role]);
  return (
    <section className="security-app-lock-card app-lock-policy-settings" aria-labelledby="app-lock-policy-title">
      <header><div><h2 id="app-lock-policy-title">{text.title}</h2><p>{text.intro}</p></div></header>
      <fieldset className="app-lock-policy-roles">
        <legend>{text.required}</legend>
        <div>{roleCodes.map((role) => <label key={role}><input type="checkbox" checked={requiredRoles.includes(role)} onChange={() => toggleRole(role)} /> <span>{roleLabels[language][role]}</span></label>)}</div>
      </fieldset>
      <div className="app-lock-policy-grid">
        <label>{text.maximum}<select value={maxTimeoutSeconds} onChange={(event) => onMaxTimeoutSecondsChange(Number(event.target.value) as 30 | 60 | 300 | 900)}><option value={30}>30 {text.seconds}</option><option value={60}>60 {text.seconds}</option><option value={300}>300 {text.seconds}</option><option value={900}>900 {text.seconds}</option></select></label>
        <label>{text.sensitive}<select value={sensitiveReunlockSeconds} onChange={(event) => onSensitiveReunlockSecondsChange(Number(event.target.value))}><option value={30}>30 {text.seconds}</option><option value={60}>60 {text.seconds}</option><option value={300}>300 {text.seconds}</option><option value={900}>900 {text.seconds}</option></select></label>
        <label>{text.identity}<select value={hawalaTazkiraImagesRequired} onChange={(event) => onHawalaTazkiraImagesRequiredChange(Number(event.target.value) as 1 | 2)}><option value={1}>{text.one}</option><option value={2}>{text.two}</option></select></label>
      </div>
      <button className="primary-action" type="button" disabled={busy} onClick={onSave}>{busy ? "…" : text.save}</button>
    </section>
  );
}
