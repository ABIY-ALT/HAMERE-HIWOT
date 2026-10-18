-- =============================================================================
-- SSMS — Migration 029: A dues payment reported in the bot can cover months
-- of two years
-- Depends on: 028 (dues_claims)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- A member who pays several months pays the oldest unpaid ones first — which
-- can be last year's (e.g. Hamle and Nehase 2018) together with this year's
-- (Meskerem 2019). `periods` lists every month as year × 100 + month
-- (201811 = Hamle 2018, 201901 = Meskerem 2019). `year` / `months` keep the
-- first year's months, as before. Approving records one receipt per year.
-- =============================================================================

ALTER TABLE dues_claims ADD COLUMN IF NOT EXISTS periods INT[];

UPDATE dues_claims
SET periods = ARRAY(SELECT year * 100 + m FROM unnest(months) AS m ORDER BY m)
WHERE periods IS NULL;
