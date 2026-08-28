# Step 18: Performance and PWA Evidence

Run `npm run performance:step18` after a production build. The executable gate checks
that the initial `index` JavaScript stays under 500 KB and that report exports are
split into a separate chunk. PDF and export code is loaded only when a report action
is used.

The service worker uses network-only behavior for navigations, Supabase/auth paths,
and financial requests. It can fall back to cached static assets only, so an offline
or stale cache cannot display a cached financial success response or authorize a post.

The repository remains web/PWA-first. There is no native accounting engine; any future
native shell must call the same authenticated Supabase RPCs and must not duplicate
ledger or inventory logic.

The configured Chromium, Firefox, and WebKit public browser matrix has been executed;
Firefox accessibility required a 60-second axe timeout because of slow teardown. The
remaining acceptance work is device/network measurement on representative Afghan
Android hardware, 50k+ transaction UI tests, and browser automation for offline and
reconnect behavior.

The synthetic 50k accounting benchmark now passes in `src/domain/performance.test.ts`;
this is database/domain-scale evidence, not a substitute for a real low-memory device
or 3G browser run.