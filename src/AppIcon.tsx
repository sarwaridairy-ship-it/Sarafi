import type { ReactNode } from "react";

export type AppIconName =
  | "home"
  | "trade"
  | "wallet"
  | "people"
  | "transactions"
  | "eye"
  | "eyeOff"
  | "shield"
  | "settings"
  | "check"
  | "print"
  | "close"
  | "receive"
  | "pay"
  | "debt"
  | "transfer"
  | "expense"
  | "capital"
  | "bank"
  | "hawala"
  | "report"
  | "rates"
  | "cashbox"
  | "search"
  | "menu";

const iconPaths: Record<AppIconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,
  trade: <><path d="M4 7h14"/><path d="m14 3 4 4-4 4"/><path d="M20 17H6"/><path d="m10 13-4 4 4 4"/></>,
  wallet: <><path d="M4 6.5h14a2 2 0 0 1 2 2V19H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12"/><path d="M15 11h5v5h-5a2.5 2.5 0 0 1 0-5Z"/></>,
  people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  transactions: <><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><circle cx="3.5" cy="6" r=".8"/><circle cx="3.5" cy="12" r=".8"/><circle cx="3.5" cy="18" r=".8"/></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  eyeOff: <><path d="m3 3 18 18"/><path d="M10.6 6.2A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-2 2.7"/><path d="M6.6 6.6C3.6 8.3 2 12 2 12s3.5 6 10 6a10 10 0 0 0 4.1-.8"/></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  print: <><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></>,
  close: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
  receive: <><path d="M12 3v13"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></>,
  pay: <><path d="M12 21V8"/><path d="m7 13 5-5 5 5"/><path d="M5 3h14"/></>,
  debt: <><circle cx="8" cy="8" r="3"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0"/><path d="M15 8h7"/><path d="M18.5 4.5v7"/></>,
  transfer: <><path d="M4 7h15"/><path d="m15 3 4 4-4 4"/><path d="M20 17H5"/><path d="m9 13-4 4 4 4"/></>,
  expense: <><path d="M4 7h16v12H4z"/><path d="M4 11h16"/><path d="M8 15h3"/><path d="m15 5 2-2 2 2"/></>,
  capital: <><path d="M4 20h16"/><path d="M6 17V9"/><path d="M10 17V5"/><path d="M14 17v-7"/><path d="M18 17V3"/></>,
  bank: <><path d="m3 9 9-6 9 6"/><path d="M5 10h14"/><path d="M6 10v8"/><path d="M10 10v8"/><path d="M14 10v8"/><path d="M18 10v8"/><path d="M3 21h18"/></>,
  hawala: <><circle cx="8" cy="12" r="5"/><circle cx="16" cy="12" r="5"/><path d="M8 9h8"/><path d="M8 15h8"/></>,
  report: <><path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5"/><path d="M9 12h6"/><path d="M9 16h6"/></>,
  rates: <><path d="M4 18 9 13l3 3 8-9"/><path d="M15 7h5v5"/></>,
  cashbox: <><path d="M3 7h18v13H3z"/><path d="M3 11h18"/><circle cx="12" cy="15.5" r="2"/><path d="M7 4h10v3"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  menu: <><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></>,
};

export function AppIcon({ name, size = 20 }: { name: AppIconName; size?: number }) {
  return (
    <svg aria-hidden="true" className="app-icon" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">{iconPaths[name]}</g>
    </svg>
  );
}
