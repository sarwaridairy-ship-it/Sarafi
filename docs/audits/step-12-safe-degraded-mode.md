# Step 12: Network Resilience and Safe Degraded Mode

## Product Status

**PASS for the redefined launch scope:** SARAFI remains understandable during connectivity
loss without allowing disconnected clients to mutate authoritative accounting state.

## Controls

- Application shell and translations remain cacheable.
- Offline workspace shows an explicit offline state and says financial posting is unavailable.
- Local operation records are encrypted, tenant/user/device bound, and represented as drafts.
- Drafts are marked `DRAFT - NOT POSTED` and never affect authoritative totals.
- Reconnect listeners do not submit financial commands.
- Legacy encrypted outbox records are converted to `legacy_review_required`; they are never
  automatically replayed.
- The old `sync_offline_fx_command` and `accept_offline_command` RPCs were retired.
- Official receipts are generated only by successful server-side postings.
- Online command IDs and server idempotency remain in place for timeout-after-commit retries.
- The service worker handles GET shell fallback only and does not background-sync mutations.

## Evidence

- Offline unit suite: 6 passed.
- Full browser matrix reached `65 passed`, `1 failed`, and `9 skipped`; the single failure
  was an unrelated WebKit modal-close timeout. The three new degraded-mode checks passed
  across Chromium, Firefox, and WebKit, and the interrupted WebKit FX-form case passed when
  rerun independently.
- Browser degraded-mode test: encrypted draft, reload persistence, explicit non-posted copy,
  and corruption fail-closed behavior passed.
- `public/sw.js` ignores non-GET requests.
- No production code calls the retired offline sync RPC.
- Remote migration records the retirement in `202608270012_retire_offline_financial_sync.sql`.

## Required Step 15 Reclassification

The former offline revocation certifications are replaced by:

- `OFFLINE_FINANCIAL_POSTING_DISABLED`
- `LEGACY_OFFLINE_COMMAND_AUTO_REPLAY_DENIED`

These are satisfied by the absence of a reconnect submission path, the retired sync RPCs,
server-side online-only posting, and the encrypted legacy-record conversion behavior.

## Remaining Product QA

Human terminology review for the new English, Dari, and Pashto degraded-mode copy remains part
of the external localization acceptance gate. Cached financial data must continue to be shown
as stale/read-only wherever it is added to offline UI.
