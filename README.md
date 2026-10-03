# Family Finance Sync — Architecture & Product Documentation

> **"One family, one shared financial workspace, controlled by the Family Head with role-based permissions."**

Family Finance Sync is a production-grade family financial management platform. It gives families complete visibility and control over shared wealth while maintaining role-appropriate boundaries for adults, children, and co-managers.

---

## Architecture Highlights

1. **Frontend-First Reactive Workspace**
   - Built with React, TypeScript, and a high-performance Vanilla CSS Design System inspired by classic bound leather ledgers, deep ink greens (`#132A22`), warm parchment paper (`#FBFAF5`), and brass hardware accents.
   - Operates with an in-memory/localStorage reactive state store pre-seeded with the **"Demo Family"** (Arun, Priya, Rahul, Anu).
   - Zero hard dependencies on external databases for the UI, enabling instant local development and validation.

2. **Realtime Application Menubar**
   - Top sticky workspace status bar showing active sync status (`● Realtime Synced`).
   - Dynamic **Role Switcher**: toggle on-the-fly between **Arun (Family Head)**, **Priya (Co-Manager)**, **Rahul (Adult Member)**, and **Anu (Child)** to immediately inspect how each role views the platform.
   - Interactive notification drawer with live badges.
   - Quick action dropdown: `+ Expense/Income`, `+ Request`, `Can I Afford This?`, and `Scan Receipt (OCR)`.
   - Dark mode toggle between **Ledger Classic Paper** and **Midnight Forest Ink**.

3. **Mobile-First Layout**
   - Fixed desktop sidebar for large screens.
   - Mobile bottom navigation bar (`Home`, `Activity`, `Budget`, `Requests`, `More`) with pending approval notification badge.
   - Slide-over mobile drawer sheet for quick access to all governance, planning, and future innovation hubs.

4. **Granular RBAC & Approval Rule Engine**
   - Fine-grained permission keys (`transactions.*`, `budgets.*`, `requests.*`, `goals.*`, `reports.*`, `audit.*`).
   - Family Head permission overrides per member.
   - Multi-tier approval thresholds:
     - Outlays under ₹500: auto-approved (for adult members).
     - ₹500 – ₹2,000: approvable by Co-Manager or Family Head.
     - Above ₹2,000: mandates Family Head authorization.
     - Child expenses: always mandate parental review.
   - Approving an expense request automatically creates a cleared transaction in the ledger, logs the audit event, and notifies the requester.

5. **Financial Math & Security**
   - Strict **integer paise arithmetic** (₹1 = 100 paise) preventing JavaScript floating-point rounding errors.
   - **Zero Plain-Text Credentials policy**: never captures or persists bank passwords, card PINs, UPI PINs, CVVs, or OTPs.

6. **Future Innovation Hubs**
   - **Smart Receipt OCR Scanner**: interactive drag-and-drop receipt upload simulation extracting merchant, date, amount, and category directly into a transaction draft.
   - **Open Banking Aggregator Hub**: demonstration of consent-based account linking via RBI Account Aggregator protocol with zero credential risk.
   - **AI Financial Insights Advisor**: anomaly detection on spending velocity, subscription audits, and goal acceleration tips.

---

## Directory Structure

```
Fam - finance/
├── database/
│   ├── migrations/
│   │   └── 001_initial_schema.sql       # PostgreSQL DDL with Row-Level Security
│   └── seeds/
│       └── 001_demo_family_seed.sql     # Seed script for roles & permissions
├── public/
│   └── favicon.svg                      # Custom Family Finance Sync crest
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── TopMenubar.tsx           # Sticky realtime menubar & role switcher
│   │   │   ├── DesktopSidebar.tsx       # Desktop navigation sidebar
│   │   │   └── MobileBottomNav.tsx      # Mobile bottom navigation & "More" sheet
│   │   └── modals/
│   │       ├── NewTransactionModal.tsx  # Add income / expense modal
│   │       └── NewRequestModal.tsx      # Submit spending request modal
│   ├── context/
│   │   └── FamilyFinanceContext.tsx     # Reactive state store & RBAC engine
│   ├── data/
│   │   └── seedData.ts                  # Demo family seed data (Section 40)
│   ├── features/
│   │   ├── affordability/               # "Can I Afford This?" decision tool
│   │   ├── audit/                       # Immutable audit trail viewer
│   │   ├── budgets/                     # Category budgets & threshold alerts
│   │   ├── dashboard/                   # Role-aware dashboard (Head vs Child)
│   │   ├── family/                      # Control Center, Members, Permissions
│   │   ├── futures/                     # Receipt OCR, Bank Sync, AI Advisor
│   │   ├── goals/                       # Savings goals with confetti milestone
│   │   ├── recurring/                   # Recurring bills & calendar
│   │   ├── reports/                     # Cashflow & member spending reports
│   │   ├── requests/                    # Approval workflow & decision dialogs
│   │   ├── security/                    # Device sessions & security checklist
│   │   └── transactions/                # Master shared ledger
│   ├── services/
│   │   └── api.ts                       # Typed API client contracts for backend
│   ├── types/
│   │   └── index.ts                     # TypeScript domain models
│   ├── utils/
│   │   └── currency.ts                  # Safe paise math & date formatters
│   ├── App.tsx                          # App shell & routing
│   ├── index.css                        # Ledger design tokens & CSS system
│   └── main.tsx
├── .env.example                         # Environment configuration template
├── index.html
├── package.json
└── vite.config.ts
```

---

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Start local development server
npm run dev
```

---

## Production Setup & Deployment Checklist

### 1. Database Provisioning & Migrations
1. Canonical migrations are maintained in `supabase/migrations/` and documented in `database/README.md`.
2. For local Supabase CLI development:
   ```bash
   npx supabase start
   npx supabase db reset
   ```
3. For remote staging/production:
   ```bash
   npx supabase db push
   ```
   *Never execute legacy migrations `001` or `002`.*

### 2. Transactional Email Edge Function
Email invitations and notifications are executed via a secure Supabase Edge Function:
1. Deploy the `send-email` edge function:
   ```bash
   npx supabase functions deploy send-email
   ```
2. Set the Resend server secrets in Supabase (never expose in client code):
   ```bash
   npx supabase secrets set RESEND_API_KEY="re_your_api_key_here" RESEND_FROM_EMAIL="FamilyFinanceSync <notifications@yourdomain.com>"
   ```

### 3. Supabase Auth & Realtime Configuration
1. **Email Confirmation**: In the Supabase Dashboard under **Authentication → Email Templates**, verify your site URL and confirmation redirect paths (`https://your-domain.com/verify-email`).
2. **Realtime Channels**: Under **Database → Publications**, ensure private user channels are enabled (`user:{uid}`) and the following tables are published to `supabase_realtime`: `transactions`, `accounts`, `requests`, `family_join_requests`, and `notifications`.
3. **Storage Buckets**: Run migration `007` (or `supabase db push`) to provision the `receipts` and `exports` private storage buckets with strict RLS policies.

