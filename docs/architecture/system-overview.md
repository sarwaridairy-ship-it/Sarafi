# SARAFI System Overview

## Current foundation

SARAFI is a multi-tenant currency-exchange operating system for Afghanistan. The current web slice is a Vite + React + TypeScript owner dashboard with a local interaction model for validating the core workflow and visual language.

## Target architecture

- `apps/web`: owner and cashier web/PWA experience.
- `apps/mobile`: Expo Android-first experience with iOS compatibility.
- `packages/domain`: shared currency, decimal, validation, and permission rules.
- Supabase Postgres/Auth/Realtime/Storage: server authority, tenant isolation, and audited commands.

The client will submit commands to server-side functions/RPCs. It must never calculate or directly mutate authoritative ledger balances.

## Environment boundary

Local, test, staging, and production Supabase projects must remain separate. Browser and mobile clients may only receive public project URL and anon key; service-role credentials remain server-side.
