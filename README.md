# SARAFI Exchange OS

SARAFI is a production-oriented foundation for a multi-tenant, multi-currency Sarafi operating system focused on Afghanistan.

The current dashboard is a local product slice demonstrating the owner workflow and trade-entry experience. Authoritative Supabase ledger posting begins after the project environment is connected.

## Run locally

```bash
npm install
npm run dev
```

Validate with `npm run build` and `npm run lint`.

Authenticated security journeys are opt-in and never use committed credentials. Set `SARAFI_E2E_EMAIL`, `SARAFI_E2E_PASSWORD`, and `SARAFI_E2E_ORGANIZATION_ID` in the test environment alongside the public Supabase variables, then run `npx playwright test tests/e2e/authenticated-security.spec.ts`.

Copy `.env.example` to `.env.local` and add only the public Supabase URL and anon key when ready.

## Technical notes

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
