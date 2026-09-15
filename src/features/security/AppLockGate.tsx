import { useState, type FormEvent } from "react";
import { AppIcon } from "../../AppIcon";
import { configureAppLockPin, unlockAppWithPasskey, unlockAppWithPin, type AppLockStatus } from "../../lib/appLock";
import type { Language } from "../../lib/i18n";
import { isPasskeyFeatureEnabled } from "../../lib/supabase";

export function AppLockGate({ language, organizationId, organizationName, userName, deviceId, requiresConfiguration, maximumTimeoutSeconds, onConfigured, onUnlocked, onSignOut }: {
  language: Language;
  organizationId: string;
  organizationName: string;
  userName: string;
  deviceId: string;
  requiresConfiguration: boolean;
  maximumTimeoutSeconds: AppLockStatus["maximumTimeoutSeconds"];
  onConfigured: () => void;
  onUnlocked: () => void;
  onSignOut: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const copy = language === "en"
    ? { title: requiresConfiguration ? "Set your App Lock" : "SARAFI is locked", intro: requiresConfiguration ? "Your role requires App Lock on this trusted device. Create your private six-digit PIN." : "Financial information is hidden. Unlock to continue.", pin: "Six-digit PIN", confirm: "Confirm six-digit PIN", unlock: requiresConfiguration ? "Set PIN and continue" : "Unlock", passkey: "Use Fingerprint / Face ID", signOut: "Sign out", mismatch: "The PINs do not match." }
    : language === "fa-AF"
      ? { title: requiresConfiguration ? "قفل برنامه خود را بسازید" : "برنامه صرافی قفل است", intro: requiresConfiguration ? "برای نقش شما قفل برنامه در این دستگاه معتبر لازم است. رمز شش‌رقمی شخصی خود را بسازید." : "معلومات مالی پنهان است. برای ادامه قفل را باز کنید.", pin: "رمز شش‌رقمی", confirm: "تکرار رمز شش‌رقمی", unlock: requiresConfiguration ? "ساختن رمز و ادامه" : "بازکردن", passkey: "استفاده از اثر انگشت / تشخیص چهره", signOut: "خروج", mismatch: "دو رمز یکسان نیست." }
      : { title: requiresConfiguration ? "د خپل اپ قفل جوړ کړئ" : "د سرافي اپ قفل دی", intro: requiresConfiguration ? "ستاسو د دندې لپاره په دې باوري وسیله کې د اپ قفل اړین دی. خپل شپږ عددي PIN جوړ کړئ." : "مالي معلومات پټ دي. د دوام لپاره قفل خلاص کړئ.", pin: "شپږ عددي PIN", confirm: "شپږ عددي PIN بیا ولیکئ", unlock: requiresConfiguration ? "PIN جوړول او دوام" : "قفل خلاصول", passkey: "د ګوتې نښه / د مخ پېژندنه کارول", signOut: "وتل", mismatch: "دواړه PIN یو شان نه دي." };
  const submitPin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pin.length !== 6) return;
    setBusy(true);
    setError("");
    if (requiresConfiguration && pin !== confirmPin) {
      setError(copy.mismatch);
      setBusy(false);
      return;
    }
    const configurationError = requiresConfiguration
      ? await configureAppLockPin(organizationId, deviceId, pin, { autoLockSeconds: maximumTimeoutSeconds, lockOnBackground: true })
      : null;
    const nextError = configurationError ?? await unlockAppWithPin(organizationId, deviceId, pin);
    setBusy(false);
    if (nextError) {
      setError(nextError);
      setPin("");
      return;
    }
    if (requiresConfiguration) onConfigured();
    onUnlocked();
  };
  const submitPasskey = async () => {
    setBusy(true);
    setError("");
    const nextError = await unlockAppWithPasskey(organizationId, deviceId);
    setBusy(false);
    if (nextError) {
      setError(nextError);
      return;
    }
    onUnlocked();
  };
  return (
    <main className="app-lock-screen">
      <section className="app-lock-card" aria-labelledby="app-lock-title">
        <div className="brand auth-brand"><span className="brand-mark">S</span><span>SARAFI</span></div>
        <span className="app-lock-shield"><AppIcon name="shield" size={30} /></span>
        <h1 id="app-lock-title">{copy.title}</h1>
        <p>{copy.intro}</p>
        <div className="app-lock-identity"><b>{organizationName}</b><small>{userName}</small></div>
        <form onSubmit={submitPin}>
          <label>{copy.pin}<input autoFocus required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
          {requiresConfiguration ? <label>{copy.confirm}<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="new-password" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label> : null}
          <button className="primary-action" disabled={busy || pin.length !== 6 || (requiresConfiguration && confirmPin.length !== 6) || !deviceId}>{copy.unlock}</button>
        </form>
        {!requiresConfiguration ? <button className="secondary-action full" type="button" disabled={busy || !deviceId || !isPasskeyFeatureEnabled()} onClick={() => void submitPasskey()}>{copy.passkey}</button> : null}
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <button className="text-button" type="button" onClick={onSignOut}>{copy.signOut}</button>
      </section>
    </main>
  );
}
