import { useEffect } from "react";
import { isRtl, type Language } from "./lib/i18n";
import { ux } from "./lib/uxCopy";

export function OpeningExperience({
  language,
  onComplete,
}: {
  language: Language;
  onComplete: () => void;
}) {
  useEffect(() => {
    const returnUrl = new URL(window.location.href);
    const requestedSpeed = returnUrl.searchParams.get("openingSpeed");
    returnUrl.searchParams.delete("opening");
    returnUrl.searchParams.delete("openingSpeed");

    const openingUrl = new URL("/sarafi-opening.html", window.location.origin);
    openingUrl.searchParams.set("language", language);
    if (requestedSpeed === "fast") openingUrl.searchParams.set("speed", "fast");
    openingUrl.searchParams.set(
      "return",
      `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`,
    );
    window.location.replace(openingUrl);
  }, [language]);

  return (
    <main
      className={`opening-shell ${isRtl(language) ? "rtl" : ""}`}
      dir={isRtl(language) ? "rtl" : "ltr"}
      aria-label={ux(language, "openingLabel")}
    >
      <span className="opening-fallback-mark" aria-hidden="true">S</span>
      <button className="opening-skip" type="button" onClick={onComplete}>
        {ux(language, "skipOpening")}
      </button>
    </main>
  );
}
