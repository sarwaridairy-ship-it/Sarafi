# Compliance Regulatory Mapping

**Review date:** 2026-08-25  
**Status:** Engineering foundation only; legal/compliance sign-off required before production.

## Official sources attempted

| Authority | Source | Review result | Implementation status |
| --- | --- | --- | --- |
| Da Afghanistan Bank | https://dab.gov.af/ | Retrieval returned HTTP 429 on 2026-08-25; current FX/MSP circulars and forms could not be verified by this build process. | Awaiting official document review |
| FinTRACA | https://fintraca.gov.af/ | Page extraction returned no meaningful content on 2026-08-25; current AML/CFT, STR, sanctions, and reporting materials could not be verified. | Awaiting official document review |

## Engineering mapping awaiting verification

The system has configurable fields and versioned records for license details, KYC, identity documents, source/purpose of funds, risk status, large-transaction alerts, EDD, screening, supporting documents, retention, and regulatory report drafts. Thresholds are not hard-coded as legal facts. The initial rule-set status is `awaiting_legal_signoff`.

Before activation, a qualified Afghan compliance/legal reviewer must provide current sources, circular dates, effective dates, thresholds, required fields, report schemas, retention obligations, and submission workflow. Load those values as a new rule-set version rather than changing historical alerts.

The application never auto-files an STR from an algorithm. It creates evidence-backed alerts for human review and records any external submission reference supplied by the organization.
