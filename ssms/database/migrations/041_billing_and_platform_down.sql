-- =============================================================================
-- SSMS — UNDO of migration 041 (subscriptions, billing, platform owner)
-- Deletes all plans, subscriptions, invoices and payment records.
-- Back up first: pg_dump "$DATABASE_URL" -Fc -f before_041_down.dump
-- Receipts in the billing-proofs bucket are left in place (delete the bucket
-- from the Storage page if they are no longer needed).
-- =============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_quota ON persons;
DROP TRIGGER IF EXISTS trg_quota ON students;
DROP TRIGGER IF EXISTS trg_quota ON system_users;

DROP TABLE IF EXISTS rate_limits;
DROP TABLE IF EXISTS platform_audit_logs;
DROP TABLE IF EXISTS usage_snapshots;
DROP TABLE IF EXISTS payment_webhook_events;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS subscription_events;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS platform_modules;
DROP TABLE IF EXISTS platform_settings;
DROP TABLE IF EXISTS platform_admins;

DROP FUNCTION IF EXISTS hit_rate_limit(TEXT, INT, INT);
DROP FUNCTION IF EXISTS enforce_quota();
DROP FUNCTION IF EXISTS tenant_limit(UUID, TEXT);
DROP FUNCTION IF EXISTS tenant_usage(UUID);
DROP FUNCTION IF EXISTS forbid_history_change();
DROP FUNCTION IF EXISTS forbid_platform_audit_change();
DROP FUNCTION IF EXISTS generate_invoice_no();
DROP SEQUENCE IF EXISTS invoice_no_seq;

DROP TYPE IF EXISTS payment_status;
DROP TYPE IF EXISTS invoice_status;
DROP TYPE IF EXISTS billing_cycle;
DROP TYPE IF EXISTS subscription_status;

COMMIT;

NOTIFY pgrst, 'reload schema';
