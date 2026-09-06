import { useEffect, type ReactNode } from "react";
import { isRtl, type Language } from "./lib/i18n";
import { ux } from "./lib/uxCopy";

export function OpeningExperience({
  language,
  onComplete,
  children,
}: {
  language: Language;
  onComplete: () => void;
  children?: ReactNode;
}) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onComplete();
      return;
    }
    const timer = window.setTimeout(onComplete, 3200);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <main
      className={`opening-shell ${isRtl(language) ? "rtl" : ""}`}
      dir={isRtl(language) ? "rtl" : "ltr"}
      aria-label={ux(language, "openingLabel")}
    >
      <div className="opening-auth-underlay">{children}</div>
      <div className="opening-brand-layer" aria-hidden="true">
        <span className="opening-fallback-mark">S</span>
        <strong>SARAFI</strong>
      </div>
      <button className="opening-skip" type="button" onClick={onComplete}>
        {ux(language, "skipOpening")}
      </button>
    </main>
  );
}
