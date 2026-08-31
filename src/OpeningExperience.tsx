import { useEffect, useRef } from "react";
import { isRtl, type Language } from "./lib/i18n";
import { ux } from "./lib/uxCopy";

export function OpeningExperience({
  language,
  onComplete,
}: {
  language: Language;
  onComplete: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const animationTimer = useRef<number | null>(null);
  const fallbackTimer = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const handleAnimationComplete = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow ||
        event.data?.type !== "sarafi-opening-complete"
      )
        return;
      if (animationTimer.current !== null)
        window.clearTimeout(animationTimer.current);
      animationTimer.current = window.setTimeout(onComplete, 450);
    };

    window.addEventListener("message", handleAnimationComplete);
    void fetch("/sarafi-opening.html", {
      cache: "force-cache",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Opening asset unavailable");
        return response.text();
      })
      .then((markup) => {
        if (frameRef.current) frameRef.current.srcdoc = markup;
      })
      .catch(() => undefined);
    fallbackTimer.current = window.setTimeout(onComplete, 12000);
    return () => {
      controller.abort();
      window.removeEventListener("message", handleAnimationComplete);
      if (animationTimer.current !== null)
        window.clearTimeout(animationTimer.current);
      if (fallbackTimer.current !== null)
        window.clearTimeout(fallbackTimer.current);
    };
  }, [onComplete]);

  return (
    <main
      className={`opening-shell ${isRtl(language) ? "rtl" : ""}`}
      dir={isRtl(language) ? "rtl" : "ltr"}
      aria-label={ux(language, "openingLabel")}
    >
      <span className="opening-fallback-mark" aria-hidden="true">S</span>
      <iframe
        ref={frameRef}
        className="opening-animation"
        title={ux(language, "openingLabel")}
        tabIndex={-1}
        aria-hidden="true"
      />
      <div className="opening-brand-copy" aria-hidden="true">
        <strong>SARAFI</strong>
        <span>{ux(language, "sarafiTagline")}</span>
      </div>
      <button className="opening-skip" type="button" onClick={onComplete}>
        {ux(language, "skipOpening")}
      </button>
      <span className="opening-progress" aria-hidden="true" />
    </main>
  );
}
