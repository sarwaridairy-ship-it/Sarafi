import type { FormEvent } from "react";
import { AppIcon } from "../../AppIcon";
import type { AppLockStatus } from "../../lib/appLock";
import { isPasskeyFeatureEnabled } from "../../lib/supabase";

export type AppLockSettingsLabels = {
  title: string;
  intro: string;
  pin: string;
  confirmPin: string;
  savePin: string;
  passkey: string;
  enabled: string;
  disabled: string;
  autoLock: string;
  seconds30: string;
  minute1: string;
  minutes5: string;
  minutes15: string;
  background: string;
  save: string;
  lockNow: string;
  reset: string;
  recovery: string;
};

export function AppLockSettings({ status, labels, pin, confirmPin, autoLockSeconds, lockOnBackground, canManage, deviceId, busy, onPinChange, onConfirmPinChange, onAutoLockSecondsChange, onLockOnBackgroundChange, onSavePin, onRegisterPasskey, onSaveSettings, onLockNow, onReset }: {
  status: AppLockStatus;
  labels: AppLockSettingsLabels;
  pin: string;
  confirmPin: string;
  autoLockSeconds: AppLockStatus["autoLockSeconds"];
  lockOnBackground: boolean;
  canManage: boolean;
  deviceId: string;
  busy: boolean;
  onPinChange: (value: string) => void;
  onConfirmPinChange: (value: string) => void;
  onAutoLockSecondsChange: (value: AppLockStatus["autoLockSeconds"]) => void;
  onLockOnBackgroundChange: (value: boolean) => void;
  onSavePin: (event: FormEvent<HTMLFormElement>) => void;
  onRegisterPasskey: () => void;
  onSaveSettings: () => void;
  onLockNow: () => void;
  onReset: () => void;
}) {
  return (
    <section className="security-app-lock-card">
      <div>
        <span className="security-overview-shield"><AppIcon name="shield" size={22} /></span>
        <div>
          <h2>{labels.title}</h2>
          <p>{labels.intro}</p>
          <span className={`status-pill ${status.configured ? "status-completed" : "status-draft"}`}>● {status.configured ? labels.enabled : labels.disabled}</span>
          <small className="app-lock-recovery">{labels.recovery}</small>
        </div>
      </div>
      <div className="app-lock-control-stack">
        <form onSubmit={onSavePin}>
          <label>{labels.pin}<input required pattern="[0-9]{6}" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(event) => onPinChange(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
          <label>{labels.confirmPin}<input required pattern="[0-9]{6}" inputMode="numeric" autoComplete="new-password" maxLength={6} value={confirmPin} onChange={(event) => onConfirmPinChange(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
          <button className="primary-action" disabled={!canManage || !deviceId || busy || pin.length !== 6 || confirmPin.length !== 6}>{labels.savePin}</button>
          <button className="secondary-action" type="button" disabled={busy || !deviceId || !isPasskeyFeatureEnabled()} onClick={onRegisterPasskey}>{labels.passkey}</button>
        </form>
        <div className="app-lock-preferences">
          <label>{labels.autoLock}
            <select value={autoLockSeconds} disabled={!status.configured || busy} onChange={(event) => onAutoLockSecondsChange(Number(event.target.value) as AppLockStatus["autoLockSeconds"])}>
              <option value={30}>{labels.seconds30}</option>
              <option value={60}>{labels.minute1}</option>
              <option value={300}>{labels.minutes5}</option>
              <option value={900}>{labels.minutes15}</option>
            </select>
          </label>
          <label className="inline-check"><input type="checkbox" checked={lockOnBackground} disabled={!status.configured || busy} onChange={(event) => onLockOnBackgroundChange(event.target.checked)} />{labels.background}</label>
          <div className="inline-actions">
            <button className="secondary-action" type="button" disabled={!canManage || !status.configured || busy} onClick={onSaveSettings}>{labels.save}</button>
            <button className="primary-action" type="button" disabled={!status.configured || busy} onClick={onLockNow}>{labels.lockNow}</button>
            <button className="text-button danger" type="button" disabled={!canManage || !status.configured || busy} onClick={onReset}>{labels.reset}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
