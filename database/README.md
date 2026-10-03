# FamilyFinanceSync — Database Architecture & Migrations

This directory and `supabase/migrations/` contain the database schema, security policies, stored procedures (RPCs), and authorization tests for FamilyFinanceSync.

---

## 1. Architectural Foundations

- **Authentication & User Model**: 1:1 mapping between Supabase Auth (`auth.users`) and application profiles (`public.profiles`). User creation triggers automatically synchronize profile records.
- **Financial Precision**: All monetary values are strictly stored as `BIGINT` in **integer paise** (₹1 = 100 paise). Floating-point currencies are strictly prohibited to prevent decimal rounding drifts.
- **Multi-Tenant Isolation**: Tenant boundaries are enforced at the PostgreSQL engine level using Row-Level Security (RLS) policies scoped by `family_id` and verified membership.
- **Immutable Financial Ledger**: Transactions are written to a double-entry ledger model with trigger-maintained account balances.
- **Privilege Separation & Atomic Provisioning**: Multi-table mutations (such as family creation, join request approval, and funds transfer) execute within `SECURITY DEFINER` stored procedures with explicit `search_path = public` pinning and `auth.uid()` identity validation.
- **Realtime Broadcasting**: Secure event broadcasting uses private user topics (`user:{uid}`) rather than public broadcast channels.

---

## 2. Required PostgreSQL Extensions

The following extensions must be enabled on any Supabase project:
- `"uuid-ossp"`: UUID generation utilities (`uuid_generate_v4()`).
- `"pgcrypto"`: Cryptographic functions and random UUID generation (`gen_random_uuid()`).

Both extensions are enabled in migration `000` / `013`.

---

## 3. Migration Directories & Layout

FamilyFinanceSync maintains two migration directory layouts:

1. **`supabase/migrations/` (Supabase CLI Canonical)**:
   - Standard timestamped migration files (`20260101000000_...sql` to `20260101000014_...sql`).
   - Used natively by the Supabase CLI (`supabase start`, `supabase db reset`, `supabase db push`).
   - Contains **only active, valid migrations**; obsolete/conflicting migrations are excluded.

2. **`database/migrations/` (Repository Migration History)**:
   - Numbered migration files (`000_...sql` to `016_...sql`).
   - Retained for granular inspection and traceability.

---

## 4. Authoritative Migration Sequence

When provisioning a fresh Supabase database or applying migrations in order, follow this exact sequence:

| Step | Canonical CLI File (`supabase/migrations/`) | History File (`database/migrations/`) | Purpose | Status |
| :--- | :--- | :--- | :--- | :--- |
| **01** | `20260101000000_production_schema.sql` | `000_production_schema.sql` | Core schema: profiles, families, family_members, categories, accounts, transactions, budgets, audit_logs. | **Canonical** |
| — | *Excluded* | `001_initial_schema.sql` | Prototype schema with standalone `users` table. Incompatible with Supabase Auth. | **DEPRECATED — DO NOT RUN** |
| — | *Excluded* | `002_profiles_and_auth_trigger.sql` | Obsolete trigger referencing `firebase_uid`. Superseded by 003 and 012. | **DEPRECATED — DO NOT RUN** |
| **02** | `20260101000001_authorization_privacy_ledger.sql` | `003_authorization_privacy_ledger.sql` | Double-entry ledger balance triggers, financial privacy policies, and realtime broadcast functions. | **Canonical** |
| **03** | `20260101000002_authentication_family_membership.sql` | `004_authentication_family_membership.sql` | Core membership roles, hierarchy, and invitation base structures. | **Canonical** |
| **04** | `20260101000003_family_invitations_and_roles.sql` | `005_family_invitations_and_roles.sql` | `family_invitations` table, invite codes, role assignments, and expiry handling. | **Canonical** |
| **05** | `20260101000004_create_family_rpc.sql` | `006_create_family_rpc.sql` | Initial `create_family` stored procedure (superseded by 015). | **Superseded by 015** |
| **06** | `20260101000005_storage_receipts_and_exports.sql` | `007_storage_receipts_and_exports.sql` | Storage bucket definitions (`receipts`, `exports`) and storage RLS policies. | **Canonical** |
| **07** | `20260101000006_exact_schema_integration.sql` | `008_exact_schema_integration.sql` | Alignment for categories, budgets, and savings goals foreign keys. | **Canonical** |
| **08** | `20260101000007_family_code_approval_and_email.sql` | `009_family_code_approval_and_email.sql` | Adds unique `family_code` to `families` and base join requests mechanism. | **Canonical** |
| **09** | `20260101000008_complete_family_architecture_and_requests.sql` | `010_complete_family_architecture_and_requests.sql` | `family_join_requests` table, approval/rejection RPCs, realtime publication. | **Canonical** |
| **10** | `20260101000009_family_files_import_and_complete_architecture.sql` | `011_family_files_import_and_complete_architecture.sql` | `import_batches` table for bank statement CSV/Excel imports and audit logging. | **Canonical** |
| **11** | `20260101000010_resilient_family_members_sync.sql` | `012_resilient_family_members_sync.sql` | Resilient profile sync triggers on `auth.users` with conflict recovery. | **Canonical** |
| **12** | `20260101000011_complete_production_schema.sql` | `013_complete_production_schema.sql` | Comprehensive idempotent schema consolidation and column backfills. | **Canonical** |
| **13** | `20260101000012_fix_membership_roles_and_sync.sql` | `014_fix_membership_roles_and_sync.sql` | Fixes membership role mapping and join request synchronization. | **Canonical** |
| **14** | `20260101000013_atomic_workspace_provisioning.sql` | `015_atomic_workspace_provisioning.sql` | Atomic `create_family` RPC: provisions profile, family, owner, default categories, and starter account in a single transaction. | **Canonical** |
| **15** | `20260101000014_complete_rls_and_permissions.sql` | `016_complete_rls_and_permissions.sql` | Non-recursive RLS helper functions (`is_family_member`, `is_family_admin`), policies for `import_batches`, `spending_limits`, and `transactions`. | **Canonical** |
| **16** | `20260101000015_secure_family_join_approval_workflow.sql` | `017_secure_family_join_approval_workflow.sql` | Secure family join approval workflow: decision metadata, strict pending isolation, atomic approval/rejection RPCs, role assignment, and audit logs. | **Canonical** |

---

## 5. Security Definer & Authorization Rules

1. **Explicit Search Path**: All `SECURITY DEFINER` functions MUST declare `SET search_path = public` (or `SET search_path = ''`) to eliminate search-path hijacking vulnerabilities.
2. **Caller Identity Verification**: Functions performing sensitive writes must verify `auth.uid() IS NOT NULL` and ensure the caller is authorized for the target family.
3. **No RLS Recursion**: Policy evaluation on `family_members` and `families` uses security definer helper functions (`public.is_family_member`, `public.is_family_admin`) to avoid infinite recursion when querying memberships.

---

## 6. How to Run Migrations

### Local Development (Supabase CLI)

1. Start the local Supabase stack:
   ```bash
   npx supabase start
   ```
2. Reset or run migrations against the local database:
   ```bash
   npx supabase db reset
   ```
   *This automatically executes all files in `supabase/migrations/` in sequential order and applies seed data if configured.*

3. Generating a new migration:
   ```bash
   npx supabase migration new <migration_name>
   ```

### Staging & Production Environments

1. **Dry Run / Diff Check**:
   Always compare schema changes against the remote database before applying:
   ```bash
   npx supabase db diff --linked
   ```
2. **Apply Migrations**:
   Execute migrations through your deployment pipeline:
   ```bash
   npx supabase db push
   ```
3. **Emergency Manual Application**:
   If applying via the Supabase Dashboard SQL Editor, run the canonical files in order (000, 003, 004, ..., 016). Never run 001 or 002.

---

## 7. Realtime Configuration in Supabase Dashboard

1. Navigate to **Database → Publications** or **Project Settings → Realtime**.
2. Verify that **Private channels only** is enabled if public broadcast is not required.
3. Ensure the `supabase_realtime` publication includes:
   - `public.transactions`
   - `public.accounts`
   - `public.requests`
   - `public.family_join_requests`
   - `public.notifications`
