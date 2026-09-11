# SARAFI v7 Dari and Pashto review record

Date: 2026-09-12

## Engineering review completed

- Transaction families use operational concepts rather than ledger language.
- Receive/Pay/Debt/Hawala labels are kept distinct.
- Currency codes and monetary values remain LTR inside RTL pages.
- Long labels wrap and required 390 px screens have no horizontal page overflow.
- Identity consent, app-lock recovery, receipts, and report templates remain localized through the application message layer.
- The removed rate-explanation phrase `این نرخ چگونه حساب شده؟` is not present in the compact rate component.

## Human-language status

No native-speaker acceptance session was conducted as part of this implementation. Professional Afghan Dari and Pashto sign-off remains required for daily transaction wording, debt direction, Hawala identity consent, recovery/security language, receipt text, and A4/PDF reports. Iranian terminology must be rejected during that review. This record is an engineering checklist, not a human-language approval.
