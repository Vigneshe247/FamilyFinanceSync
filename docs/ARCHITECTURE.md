# FamilyFinanceSync — Architecture

This document describes what the code does **today**. Anything that is not built yet is listed under *Limitations*.

## 1. Frontend architecture

React 19 + TypeScript + Vite. There is no framework router; `src/router/Router.tsx` is a small history-API router.

```
src/
  app/routes.ts            one route table: router, desktop nav and mobile nav all use it
  components/              shared UI (auth pages, layout, modals, feedback: toasts + confirm dialog)
  context/
    AuthContext.tsx        authentication only (cloud session or explicit demo)
    FamilyFinanceContext.tsx  application state + mutations (cache of the repository)
    FamilyContext.tsx      usePermissions(): permission-derived UI flags
  domain/                  pure FamilyFinanceSync logic — no React, no I/O
    permissions.ts         permission vocabulary, system roles, policy engine
    finance.ts             all totals/summaries (month in Asia/Kolkata), privacy mirror
    familyEvents.ts        domain events + version-aware reducers
  data/                    persistence boundary
    repository.ts          FinanceRepository contract
    supabase/              cloud implementation (RPCs + RLS reads) and row mappers
    demo/                  demo implementation (in-browser data, same rules)
    realtime/              realtime-core ⇄ domain-event bridge
    errors.ts              RepositoryError (maps SQLSTATE → user-safe message)
  lib/
    realtime-core/         generic realtime library (no app imports) — see its README
    realtime-supabase/     Supabase Broadcast transport for realtime-core
  features/                pages
  services/                Supabase client, auth service, avatar storage boundary
```

Layering rule: `features/components → context (hooks) → data (repository) → Supabase`. Components never call Supabase. `domain/` and `lib/realtime-core/` import nothing from the app.

## 2. State architecture

`FamilyFinanceContext` owns one cache per session:

```
Auth (mode + user) → Family membership → permissions → repository → cached state → selectors → UI
```

* **Cloud mode**: state is loaded with `repository.loadWorkspace()` (the database has already filtered it by RLS) and kept current by realtime domain events. It is never written to `localStorage`.
* **Demo mode**: state *is* the demo store, persisted under `ffs_demo_v3_*`. The same privacy rules are applied in the browser (`isTransactionVisible`) so the demo behaves like the product.
* Totals are never stored. Dashboards call `summarizePeriod`, `summarizeFamilyPeriod`, `monthlyTrend` in `domain/finance.ts` on the visible transactions. Members whose data is not shared show **“Not shared”**, never ₹0.

Hooks: `useAuth()`, `useFamilyFinance()`, `usePermissions()`, `useToast()`.

## 3. Authorization architecture

One vocabulary (`domain/permissions.ts`) that is identical to the database (`permissions` table). A unit test fails if they drift.

Effective permission (same order in TypeScript and SQL `app_private.member_has_permission`):

1. family **owner** → everything (prevents lock-out)
2. **member override** (`member_permissions`)
3. **family role override** (`family_role_permissions`, used for tuned system roles and all custom roles)
4. **system role default** (`role_permissions`)

Roles are data: system roles `FAMILY_HEAD, SPOUSE, SON, DAUGHTER, GRANDPARENT, VIEWER` and per-family custom roles (`roles.family_id`). UI code checks permissions (`can('transactions.view_family')`), never role names. Relationship labels (“Son”, “Mother”) are display-only.

Frontend checks shape the UI only. **The database enforces every rule.**

## 4. Database architecture

Database migrations are maintained in `supabase/migrations/` (timestamped for Supabase CLI) and `database/migrations/` (repository history).

* **Canonical sequence**: Execute migrations 000, 003, 004, 005, 006, 007, 008, 009, 010, 011, 012, 013, 014, 015, 016, and 017. See `database/README.md` for the comprehensive sequence table and execution instructions.
* **Excluded / Deprecated**: `001_initial_schema.sql` (legacy standalone users table) and `002_profiles_and_auth_trigger.sql` (obsolete Firebase trigger). Do NOT run these.
* **Required Extensions**: `"uuid-ossp"` and `"pgcrypto"`.

Key tables: `profiles` (1:1 with `auth.users`), `families` (with unique `family_code`), `family_members` (role, relationship, `share_income`, `share_expenses`, `sharing_locked`, soft-removal), `roles`, `role_permissions`, `family_role_permissions`, `member_permissions`, `transactions` (ledger; `visibility`, `version`, `idempotency_key`, soft void), `accounts` (`opening_balance`, trigger-maintained `balance`), `requests` (typed), `family_join_requests` (join workflow), `import_batches` (bank statement import audit), `notifications`, `audit_logs`, `family_invitations`.

Money is `BIGINT` paise everywhere (`amount > 0` enforced). The UI parses rupees with `parseRupeesToPaise` (string arithmetic, no floats).

## 5. Security & Isolation model

* Clients have **SELECT only** on app tables, filtered by RLS. The exceptions are column-limited: own profile fields, `notifications.read_at`, and manager-only writes to budgets/goals/categories/non-balance account fields.
* Every sensitive write is an atomic `SECURITY DEFINER` RPC with fixed `search_path = public` (or `search_path = ''`) that re-checks membership and permission, validates input, and mutates atomically: `create_family` (atomic workspace provisioning), `create_transaction`, `update_transaction`, `void_transaction`, `create_request`, `review_request`, `cancel_request`, `set_member_sharing`, `set_member_permission`, `assign_member_role`, `remove_member`, `create_invitation`, `accept_invitation`, `revoke_invitation`, `create_role`, `set_role_permissions`, `delete_role`, `update_family`, `bootstrap_family`, `reconcile_account_balance`.
* **Atomic Workspace Provisioning**: Creating a new family workspace is encapsulated inside `public.create_family(p_name, p_description, p_family_code)`. It verifies caller `auth.uid()`, provisions a profile if missing, creates the family, assigns the caller as `family_head`, provisions default categories and a 0-balance starter account, and writes an audit log in a single transaction.
* **Server-Side Email Boundary**: Browser code never handles Resend API credentials. Transactional emails and invites are dispatched via the `send-email` Supabase Edge Function (`supabase/functions/send-email/index.ts`), which validates caller JWTs, escapes HTML inputs, and accesses `RESEND_API_KEY` exclusively from server environment secrets.
* **Financial privacy**: a transaction is visible to another member only if the viewer has `transactions.view_family`, the row's `visibility = 'family'`, and the owner shares that type (`share_income` / `share_expenses`). Membership alone grants nothing.
* Guard rails: nobody reviews their own request, changes their own permissions/role permissions, grants a permission they lack, removes or re-roles the owner, or assigns Family Head unless they are the owner.
* Removal is soft: access ends immediately, history stays.
* Sensitive operations are written to `audit_logs` server-side (readable only with `audit.view`; there is no audit page in the UI).

Verified by `database/tests/02_authorization_tests.sql` (77 checks) and `03_concurrency.sh`.

## 6. Event model

Every realtime message uses one envelope (produced by `app_private.emit` in SQL and `encodeEnvelope` in TS):

```json
{ "id": "uuid", "type": "transaction.created", "occurred_at": "ISO-8601",
  "aggregate_id": "uuid|null", "version": 3, "payload": { } }
```

Types: `transaction.created|updated|deleted`, `request.created|approved|rejected|cancelled`, `notification.created`, `member.joined|removed|updated`, `permission.changed`, `visibility.changed`. `data/realtime/familyRealtime.ts` turns them into `FamilyDomainEvent`s; membership/permission/visibility events trigger a workspace refetch because their effect can't be applied from the payload alone.

## 7. Realtime architecture and channel decision

```
DB write (RPC) → app_private.emit() → realtime.send() to private topic user:{uid}
   → SupabaseBroadcastTransport → RealtimeClient (decode, dedupe, version gate)
   → toDomainEvent() → FamilyFinanceContext reducers → UI
```

**Decision: one private topic per user, recipients computed by the database at write time.** A family-wide channel (`family:{id}`) would deliver private rows to every member and rely on the client to filter them, which is not security. Per-entity-type family channels have the same problem. With per-user topics:

* the server decides the audience with the same rule as the RLS read policy (`transaction_audience`),
* each client joins exactly one channel,
* `realtime.messages` RLS only lets a user join `user:{their uid}`.

The old `postgres_changes` publication of `transactions`, `requests`, `notifications`, `audit_logs` is removed by migration 003.

## 8. Reconnection strategy

`RealtimeClient` retries with exponential backoff and full jitter (1 s → 30 s cap, 12 attempts), then enters `ERROR` and stops (no infinite loop). The UI shows “Live updates paused” with a Retry button; the browser `online` event also triggers `reconnect()`. After any re-join, subscribers get `onResync`, and the app **refetches the workspace** — missed events are never assumed to be replayed. Writes keep working while live updates are down.

## 9. Optimistic update strategy

Only transaction creation, voiding and marking notifications read are optimistic, and only in cloud mode:

* create: a `sync_state: 'pending'` row is shown, keyed by the idempotency key. On success it is replaced by the server row; on failure it is removed and the form stays open with the error and **the same idempotency key**, so “Try again” can't create a duplicate.
* void: the row is hidden and restored if the RPC fails.
* Everything else (requests, roles, permissions, members) waits for the server and then refetches.

## 10. Public package boundary

| Can become `@your-project/realtime-core` | Must stay FamilyFinanceSync-specific |
|---|---|
| `src/lib/realtime-core/*` (client, backoff, dedupe/version gate, envelope codec, memory transport, types, metrics) | `src/domain/*` (permissions, finance, family events) |
| `src/lib/realtime-supabase/*` (as `@your-project/realtime-supabase`) | `src/data/realtime/familyRealtime.ts` (topic naming, event → domain mapping) |
| `database` side: the envelope format and the `emit`/private-topic pattern (documented, not packaged) | `src/data/*` repositories, SQL policies and RPCs |

`realtime-core` imports nothing outside its folder; `realtime-supabase` depends only on `realtime-core` types and a structural Supabase client type.

## 11. How FamilyFinanceSync consumes the realtime layer

`createRealtimeClient(mode, supabase)` picks `SupabaseBroadcastTransport` (cloud) or `MemoryTransport` over `demoRealtimeHub` (demo). `subscribeFamilyRealtime({ client, userId, onEvent, onResync })` subscribes to `user:{userId}`. The provider applies events with `applyTransactionUpsert` / `applyTransactionRemoval` (version-aware, idempotent) and schedules a debounced refetch for structural events.

## Limitations (not built yet)

* Budgets, goals, accounts, bills, loans, investments, split bills and affordability are **demo-only** (tables exist for some; cloud repositories do not). They are hidden in cloud mode.
* No end-to-end test against a live Supabase project (SQL is tested on PostgreSQL 16 with a Supabase shim; RPC names are contract-tested).
* Profile images are stored as ≤256 KB data URLs on the profile row; `services/avatarStorage.ts` is the seam for object storage.
* Transactions load 300 at a time (“Load older”); requests (200) and notifications (100) are not paginated yet.
* `tsconfig.app.json` does not enable `strict` (tests do). Turning it on is recommended.
* The approval of a *permission* request is informational; the head grants the permission on the Roles & Permissions page.
