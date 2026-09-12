import { useState, type FormEvent } from "react";
import { AppIcon } from "../../AppIcon";
import { unlockAppWithPasskey, unlockAppWithPin } from "../../lib/appLock";
import type { Language } from "../../lib/i18n";
import { isPasskeyFeatureEnabled } from "../../lib/supabase";

export function AppLockGate({ language, organizationId, organizationName, userName, deviceId, onUnlocked, onSignOut }: {
  language: Language;
  organizationId: string;
  organizationName: string;
  userName: string;
  deviceId: string;
  onUnlocked: () => void;
  onSignOut: () => void;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const copy = language === "en"
    ? { title: "SARAFI is locked", intro: "Financial information is hidden. Unlock to continue.", pin: "Six-digit PIN", unlock: "Unlock", passkey: "Use passkey", signOut: "Sign out" }
    : language === "fa-AF"
      ? { title: "برنامه صرافی قفل است", intro: "معلومات مالی پنهان است. برای ادامه قفل را باز کنید.", pin: "رمز شش‌رقمی", unlock: "بازکردن", passkey: "استفاده از کلید عبور", signOut: "خروج" }
      : { title: "د سرافي اپ قفل دی", intro: "مالي معلومات پټ دي. د دوام لپاره قفل خلاص کړئ.", pin: "شپږ عددي PIN", unlock: "قفل خلاصول", passkey: "پاسکي کارول", signOut: "وتل" };
  const submitPin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pin.length !== 6) return;
    setBusy(true);
    setError("");
    const nextError = await unlockAppWithPin(organizationId, deviceId, pin);
    setBusy(false);
    if (nextError) {
      setError(nextError);
      setPin("");
      return;
    }
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
          <button className="primary-action" disabled={busy || pin.length !== 6 || !deviceId}>{copy.unlock}</button>
        </form>
        <button className="secondary-action full" type="button" disabled={busy || !deviceId || !isPasskeyFeatureEnabled()} onClick={() => void submitPasskey()}>{copy.passkey}</button>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <button className="text-button" type="button" onClick={onSignOut}>{copy.signOut}</button>
      </section>
    </main>
  );
}
