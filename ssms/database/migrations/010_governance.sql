-- =============================================================================
-- SSMS — Migration 010: Governance bodies & appointment rules
-- Depends on: 002 (governance tables), 004 (seed: bodies, positions, rules)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • Adds governance bodies for units that have a page but no body yet
--   (Management Secretariat, Advisory Council, Executive Secretariat).
-- • Enforces, for ACTIVE memberships:
--     - the EXACT_MEMBER_COUNT seat limit of a body (e.g. Board = 9), and
--     - one holder per body for Chairperson, Vice Chair, Secretary, Treasurer.
--   The app checks the same rules first to give friendly messages; this
--   trigger is the safety net for any other writer.
-- =============================================================================

INSERT INTO governance_bodies (organization_unit_id, name_en, name_am, description_en, description_am, is_active)
SELECT u.id, u.name_en, COALESCE(u.name_am, u.name_en), u.description_en, u.description_am, TRUE
FROM organization_units u
WHERE u.code IN ('MANAGEMENT_SECRETARIAT', 'ADVISORY_COUNCIL', 'EXECUTIVE_SECRETARIAT')
  AND NOT EXISTS (SELECT 1 FROM governance_bodies b WHERE b.organization_unit_id = u.id);

CREATE OR REPLACE FUNCTION enforce_governance_membership_rules()
RETURNS TRIGGER AS $$
DECLARE
  v_limit     INTEGER;
  v_active    INTEGER;
  v_position  TEXT;
BEGIN
  IF NEW.status <> 'ACTIVE' THEN
    RETURN NEW;
  END IF;

  -- Seat limit (EXACT_MEMBER_COUNT is the number of seats)
  SELECT NULLIF(rule_value, '')::INTEGER INTO v_limit
  FROM governance_body_rules
  WHERE body_id = NEW.body_id AND rule_code = 'EXACT_MEMBER_COUNT' AND is_enforced;

  IF v_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_active
    FROM governance_memberships
    WHERE body_id = NEW.body_id AND status = 'ACTIVE' AND id <> NEW.id;
    IF v_active >= v_limit THEN
      RAISE EXCEPTION 'GOVERNANCE_SEAT_LIMIT: this body already has its % members', v_limit;
    END IF;
  END IF;

  -- One holder per body for the officer positions
  SELECT code INTO v_position FROM governance_positions WHERE id = NEW.position_id;
  IF v_position IN ('CHAIRPERSON', 'VICE_CHAIR', 'SECRETARY', 'TREASURER') AND EXISTS (
    SELECT 1 FROM governance_memberships
    WHERE body_id = NEW.body_id AND position_id = NEW.position_id AND status = 'ACTIVE' AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'GOVERNANCE_POSITION_TAKEN: this body already has an active %', v_position;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gov_membership_rules ON governance_memberships;
CREATE TRIGGER trg_gov_membership_rules
  BEFORE INSERT OR UPDATE OF status, position_id, body_id ON governance_memberships
  FOR EACH ROW EXECUTE FUNCTION enforce_governance_membership_rules();
