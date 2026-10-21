# Multi-tenancy and subscriptions

One deployment serves many Sunday schools (tenants). Each has its own people, records, settings, Telegram bot and public website (`/` for the default one, `/s/<slug>` for the others), and its own subscription plan. Hamere Hiwot is the **default tenant** (`a0000000-0000-4000-8000-000000000001`): it owns all data from before the change, keeps the site root and has a complimentary Enterprise plan.

## Rolling it out (in this order)

1. **Commit or stash** unrelated work and make sure migrations 001–039 are applied (`040` refuses to run otherwise).
2. **Back up the database**: `pg_dump "$DATABASE_URL" -Fc -f before_040.dump` (or Supabase → Database → Backups).
3. **Rehearse on a copy** (a Supabase branch or a restored dump): apply `040_multi_tenancy.sql` and `041_billing_and_platform.sql`, then run `database/tests/tenant_isolation_test.sql` with psql — every line must say `PASS`.
4. **Apply 040 then 041 to production** (Supabase → SQL Editor, one file at a time). Each runs in one transaction: it either applies completely or not at all.
5. **Add `TENANT_SECRETS_KEY`** to the server environment (Render → Environment): `openssl rand -base64 32`. Keep a copy somewhere safe.
6. **Deploy the code.** The new code needs 040 + 041; the old code does not work with them, so deploy right after step 4.
7. **Create the platform owner**: `npm run create-platform-admin -- 09XXXXXXXX "<12+ char password>" "Full Name"`, then sign in → you land on `/platform`.
8. In `/platform/plans` set real prices, and in `/platform/settings` the bank / telebirr accounts and the trial length. The seeded prices are placeholders.
9. Hamere Hiwot's Telegram bot keeps working unchanged (it still uses `TELEGRAM_BOT_TOKEN` and `/api/telegram`). Other Sunday schools paste their own bot token under Administration → Telegram bot.

**Undo:** `041_billing_and_platform_down.sql`, then `040_multi_tenancy_down.sql` — possible only while Hamere Hiwot is the only Sunday school with data (the script checks), and with the previous code deployed again.

## How a request is held to one tenant

| Layer | What it does | Where |
|---|---|---|
| Session | The tenant comes from the signed-in login's own accounts (`system_users.tenant_id`). The `ssms_tenant` cookie only chooses among them. | `lib/auth/session.ts` |
| Scoped client | `authorize()` returns a client that adds `tenant_id = …` to every select/update/delete, stamps inserts, refuses non-tenant tables, keeps storage inside `<tenant id>/…`, and refuses password changes on logins shared with another tenant. | `lib/tenant/db.ts` |
| Database | The client sends `x-ssms-tenant`; a trigger on every tenant table refuses writes to another tenant's rows and any change of `tenant_id`; every foreign key also matches `tenant_id`; `anon`/`authenticated` have no table access. | migration 040 |
| Lint | Importing the unrestricted client (`createAdminClient`, `platformClient`) outside the allowed files is an error. | `eslint.config.mjs` |

Reads are filtered by the scoped client. Writes are checked both by the client and by the database.

## Plans, limits and read-only

- Plans, prices, modules and limits live in the database (`plans`) and are edited on `/platform/plans`.
- **Modules**: each permission belongs to a module (`lib/billing/modules.ts`). A module missing from the plan removes its permissions when the session loads, so every existing `authorize()`, page guard and menu item follows the plan. Actions whose pages share permissions use `authorizeIn(module, …)`.
- **Limits** (staff logins, people, active students, storage): checked by database triggers on insert, so nothing can get around them. The error `QUOTA_EXCEEDED:<metric>:<limit>` becomes a readable message in `errorMessage()`.
- **Access** (`lib/billing/access.ts`): `full`, `read_only` (trial ended unpaid, unpaid after the grace days, canceled, expired, suspended subscription: data stays visible and exportable, nothing can change) or `blocked` (the Sunday school itself is suspended, deactivated or waiting for approval). It is computed from the dates on every request, so it never waits for the daily job. **No data is ever deleted.**
- **Daily job** (`/api/cron`): billing first (`runBillingDaily`: trials and periods that ended, renewal invoices, usage snapshots), then each paid-up Sunday school's automation in its own scope.

## Branding

Each Sunday school sets its own look under Administration → **Branding** (`SYSTEM_CONFIGURE`), after approval: logo and main colour (every plan) and the website's front-page photo (website module). Stored in `system_settings` key `branding`; pictures in the public `site-media` bucket under `<tenant id>/brand/`. Used in the menu, dashboard, receipts, report cards, results, the exam page and the public website (`lib/branding.ts`, `components/branding/TenantLogo.tsx`). Hamere Hiwot keeps its own logo, photo and colour unless it sets others. Platform admins see it on `/platform/tenants/<id>` and can remove an unsuitable picture (audit-logged).

## Payments

For now payments are **manual**: the Sunday school chooses a plan → an invoice (price from the plan) → it pays by bank or mobile money and reports the reference and receipt on Billing & plan → a platform admin checks the account and confirms on `/platform/payments` → the plan applies. A payment is applied exactly once (`PENDING → SUCCEEDED` in one conditional update), and the same reference cannot be claimed twice.

To add a provider later (Chapa, telebirr), record events in `payment_webhook_events` (unique per provider event), verify the provider's signature **and** re-check the transaction with the provider's API, then call the same `markInvoicePaid` path. Never activate a plan from a browser redirect.

## Adding a table later

1. Add `tenant_id UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id)`, an index on it, a foreign key to tenant parents as `(tenant_id, parent_id) → parent(tenant_id, id)`, and the guard trigger `trg_tenant_guard`.
2. `REVOKE ALL … FROM anon, authenticated`.
3. Add the table to `_mt_tenant_tables()` (SQL) and `TENANT_TABLES` (`lib/tenant/tables.ts`).
4. Run `database/tests/tenant_isolation_test.sql` — it fails if a table lacks the guard.

## Platform owner

`/platform` is only for rows in `platform_admins` (no Sunday-school role leads there). From there: Sunday schools (approve, suspend, deactivate, edit subscriptions, custom limits), payments, plans, settings (trial, grace, sign-ups, payment accounts, modules), the permanent platform audit log, and administrators.
