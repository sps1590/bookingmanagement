-- ---------------------------------------------------------------------------
-- 0012 — Triggers: timestamps, booking codes, and two integrity guards
--
-- Covers defects M-06 and B-15, plus the two guards that docs/DECISIONS.md
-- D-010 requires of a manual payment flow.
--
-- Every SECURITY DEFINER function here pins `SET search_path` (defect B-09).
-- Without it, a tenant able to create objects in a schema earlier in the
-- search path can shadow a table or operator name and have their own code run
-- with the definer's privileges. It is not optional, and it is easy to leave
-- out, so each one says why it is there.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

-- ---------------------------------------------------------------------------
-- M-06 — `updated_at` columns that nothing maintains
--
-- The spec defines the column on seven tables and never writes it, so every
-- row claims to have been last modified when it was created. That breaks
-- "what changed today" for support, and breaks any future incremental export.
-- ---------------------------------------------------------------------------
CREATE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END
$$;

-- Driven off the catalogue rather than a hand-written list, so this migration
-- cannot disagree with the schema it was written against. A table added in a
-- later migration must create its own trigger — this loop runs once.
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND a.attname = 'updated_at'
          AND NOT a.attisdropped
        ORDER BY c.relname
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
            'FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            rec.table_name || '_set_updated_at', rec.table_name);
    END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- B-15 — booking codes collide, and the customer sees the collision
--
-- The spec mints `'BK-' || YYMMDD || 4 hex` against `UNIQUE (business_id,
-- booking_code)` with no retry. Four hex characters is 65,536 values, so by
-- the birthday bound a busy clinic starts colliding at a few hundred bookings
-- a day — and because the RPC does not catch `unique_violation`, the customer
-- gets a 500 at the moment of confirming an appointment.
--
-- A per-business, per-day counter cannot collide at all, so there is nothing
-- to retry. The upsert takes a row lock on (business_id, code_date), which
-- serialises concurrent bookings for one business on one day for the
-- microseconds it takes to increment an integer. Gaps appear when a booking
-- transaction rolls back; a gap in a human-facing reference is unremarkable,
-- a duplicate is not.
--
-- The date is the business's *local* date, read from `businesses.timezone`.
-- Using UTC here would put the evening appointments of a Dhaka clinic on
-- tomorrow's sheet, which is the same class of error as defect B-20.
-- ---------------------------------------------------------------------------
CREATE TABLE booking_code_counters (
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    code_date   DATE NOT NULL,
    last_value  INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (business_id, code_date)
);

COMMENT ON TABLE booking_code_counters IS
    'Per-business daily counter behind booking_code (defect B-15). No grants to anon or authenticated: reached only through the SECURITY DEFINER trigger below.';

-- Belt as well as braces. The table has no grants (0015), so RLS is not what
-- keeps it private — but "every table in public has RLS enabled" is an
-- invariant a test can assert, and an invariant with one documented exception
-- is an invariant nobody checks.
ALTER TABLE booking_code_counters ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION assign_booking_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
-- Reads businesses and writes booking_code_counters, neither of which the
-- calling role may touch directly. Pinned search_path per B-09.
SET search_path = public, pg_temp
AS $$
DECLARE
    v_timezone TEXT;
    v_date     DATE;
    v_seq      INT;
BEGIN
    IF NEW.booking_code IS NOT NULL AND length(trim(NEW.booking_code)) > 0 THEN
        RETURN NEW;
    END IF;

    SELECT timezone INTO v_timezone FROM businesses WHERE id = NEW.business_id;
    v_date := (NEW.start_time AT TIME ZONE coalesce(v_timezone, 'UTC'))::date;

    INSERT INTO booking_code_counters AS c (business_id, code_date, last_value)
    VALUES (NEW.business_id, v_date, 1)
    ON CONFLICT (business_id, code_date)
        DO UPDATE SET last_value = c.last_value + 1
    RETURNING c.last_value INTO v_seq;

    NEW.booking_code := 'BK-' || to_char(v_date, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
    RETURN NEW;
END
$$;

CREATE TRIGGER bookings_assign_booking_code
    BEFORE INSERT ON bookings
    FOR EACH ROW EXECUTE FUNCTION assign_booking_code();

-- ---------------------------------------------------------------------------
-- A business must keep at least one active owner
--
-- Not in the spec. It is here because the failure has no self-service
-- recovery: a manager who deactivates the last owner, or an owner who removes
-- themselves while tidying up the member list, locks the tenant out of its own
-- account — nobody left can invite anyone, change the plan, or edit the
-- business. The only fix is the platform operator reaching in with the service
-- key, which is a support ticket for something the database can simply refuse.
-- ---------------------------------------------------------------------------
CREATE FUNCTION guard_last_active_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
-- Counts rows across the whole tenant, which RLS would otherwise filter to
-- the caller's own membership. Pinned search_path per B-09.
SET search_path = public, pg_temp
AS $$
DECLARE
    v_other_owners INT;
BEGIN
    -- Nothing to protect unless this row *was* the active ownership.
    IF NOT (OLD.role = 'owner' AND OLD.is_active) THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Still an active owner after the update: fine.
    IF TG_OP = 'UPDATE' AND NEW.role = 'owner' AND NEW.is_active THEN
        RETURN NEW;
    END IF;

    -- The tenant itself is being deleted and this row is going with it by
    -- cascade. Refusing here would make a business undeletable.
    IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = OLD.business_id) THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT count(*) INTO v_other_owners
    FROM business_members
    WHERE business_id = OLD.business_id
      AND role = 'owner'
      AND is_active
      AND id <> OLD.id;

    IF v_other_owners = 0 THEN
        RAISE EXCEPTION
            'This is the last active owner of the business; promote another member to owner first'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN COALESCE(NEW, OLD);
END
$$;

CREATE TRIGGER business_members_guard_last_owner
    BEFORE UPDATE OR DELETE ON business_members
    FOR EACH ROW EXECUTE FUNCTION guard_last_active_owner();

-- ---------------------------------------------------------------------------
-- A customer's payment claim is evidence
--
-- Required by D-010. With no gateway, the transaction id and the amount the
-- customer stated are the entire basis for believing money arrived. If a
-- receptionist can edit them after the fact, they can quietly reconcile a
-- short payment, or point a verified row at a different receipt. Amending the
-- claim means opening a new payment row, which leaves both versions visible.
--
-- `amount_verified`, `status`, `verified_by` and `rejection_reason` stay
-- editable — that is the verification workflow Phase 8 implements.
-- ---------------------------------------------------------------------------
CREATE FUNCTION guard_payment_claim_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.business_id     IS DISTINCT FROM OLD.business_id
       OR NEW.provider_txn_id IS DISTINCT FROM OLD.provider_txn_id
       OR NEW.amount_claimed  IS DISTINCT FROM OLD.amount_claimed
       OR NEW.amount_expected IS DISTINCT FROM OLD.amount_expected
       OR NEW.method          IS DISTINCT FROM OLD.method
    THEN
        RAISE EXCEPTION
            'A payment claim cannot be edited after it is recorded; record a new payment instead'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER payments_guard_claim_immutable
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION guard_payment_claim_immutable();
