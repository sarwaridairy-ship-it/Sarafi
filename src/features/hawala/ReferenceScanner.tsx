import { useEffect, useRef, useState } from "react";
import type { Language } from "../../lib/i18n";

type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorInstance = { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]> };
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance;

function scannerCopy(language: Language) {
  if (language === "fa-AF") return {
    open: "اسکن رمز",
    close: "بستن دوربین",
    title: "رمز حواله را در برابر دوربین بگیرید",
    unsupported: "اسکن دوربین در این مرورگر موجود نیست. رمز را دستی وارد کنید.",
    denied: "دوربین باز نشد. اجازه دوربین را بررسی کرده یا رمز را دستی وارد کنید.",
    active: "اسکن فقط در همین دستگاه انجام می‌شود؛ هیچ تصویر فرستاده نمی‌شود.",
  };
  if (language === "ps-AF") return {
    open: "کوډ سکین کړئ",
    close: "کمره وتړئ",
    title: "د حوالې کوډ د کمرې مخې ته ونیسئ",
    unsupported: "په دې براوزر کې د کمرې سکین نشته. کوډ په لاس ولیکئ.",
    denied: "کمره پرانیستل نه شوه. د کمرې اجازه وګورئ یا کوډ په لاس ولیکئ.",
    active: "سکین یوازې په همدې وسیله کېږي؛ هېڅ انځور نه لېږل کېږي.",
  };
  return {
    open: "Scan code",
    close: "Close camera",
    title: "Hold the Hawala code in front of the camera",
    unsupported: "Camera scanning is unavailable in this browser. Enter the code manually.",
    denied: "The camera could not open. Check camera permission or enter the code manually.",
    active: "Scanning stays on this device; no image is uploaded.",
  };
}

export function ReferenceScanner({ language, onDetected }: { language: Language; onDetected: (reference: string) => void }) {
  const copy = scannerCopy(language);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  const stop = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setOpen(false);
  };

  useEffect(() => stop, []);

  const start = async () => {
    const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setMessage(copy.unsupported);
      return;
    }
    setMessage("");
    setOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play();
      const detector = new Detector({ formats: ["qr_code", "code_128"] });
      const scanFrame = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const detected = await detector.detect(videoRef.current);
          const reference = detected.find((item) => item.rawValue?.trim())?.rawValue?.trim();
          if (reference) {
            onDetected(reference);
            stop();
            return;
          }
        } catch {
          // A frame can fail while the camera is warming up; keep the task open.
        }
        frameRef.current = requestAnimationFrame(scanFrame);
      };
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch {
      stop();
      setMessage(copy.denied);
    }
  };

  return (
    <div className="reference-scanner">
      <button className="secondary-action" type="button" onClick={() => open ? stop() : void start()}>
        {open ? copy.close : copy.open}
      </button>
      {open ? (
        <section className="reference-scanner-preview" aria-label={copy.title}>
          <strong>{copy.title}</strong>
          <video ref={videoRef} muted playsInline autoPlay />
          <small>{copy.active}</small>
        </section>
      ) : null}
      {message ? <p className="form-hint" role="status">{message}</p> : null}
    </div>
  );
}
