-- ---------------------------------------------------------------------------
-- Schema invariants
--
-- Properties of the whole schema that no future migration may quietly break.
-- They are cheap to assert and expensive to discover the hard way: each one
-- below corresponds to a defect in the source spec that shipped because
-- nothing was checking.
--
-- Runs as the connection role (superuser), reading the catalogue. No RLS
-- involved — this is about the shape of the thing, not about who can see what.
-- ---------------------------------------------------------------------------

-- 1. Every table in `public` has Row-Level Security enabled.
--
-- Defect B-25 is this invariant failing for one table: `subscription_plans` is
-- missing from the spec's ALTER list, so PostgREST serves it whole. One
-- forgotten ALTER is all it takes, and nothing about the table looks wrong.
DO $$
DECLARE
    missing TEXT;
BEGIN
    SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO missing
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Tables in public without RLS enabled: %', missing;
    END IF;
END
$$;

-- 2. Every SECURITY DEFINER function pins its search_path.
--
-- Defect B-09. Without `SET search_path`, a role that can create objects in a
-- schema earlier in the caller's path can shadow a table or an operator and
-- have the definer — `postgres` on Supabase — execute it. The spec's two
-- helper functions both omit it.
DO $$
DECLARE
    unpinned TEXT;
BEGIN
    SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO unpinned
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
          SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
          WHERE cfg LIKE 'search_path=%'
      );

    IF unpinned IS NOT NULL THEN
        RAISE EXCEPTION
            'SECURITY DEFINER functions without a pinned search_path (defect B-09): %',
            unpinned;
    END IF;
END
$$;

-- 3. `anon` holds no privilege on any base table.
--
-- The anonymous role reads the four curated views and nothing else. Defect
-- B-05 is what happens when it can reach a base table: RLS filters rows but
-- not columns, so row access to `staff_resources` is column access to every
-- staff member's personal phone number.
--
-- `subscription_plans` is the single documented exception — a public price
-- list with no personal data in it, behind an `is_active` policy.
DO $$
DECLARE
    leaked TEXT;
BEGIN
    SELECT string_agg(DISTINCT g.table_name, ', ') INTO leaked
    FROM information_schema.role_table_grants g
    JOIN pg_class c ON c.relname = g.table_name
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE g.grantee = 'anon'
      AND g.table_schema = 'public'
      AND c.relkind = 'r'
      AND g.table_name <> 'subscription_plans';

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'anon has privileges on base tables (defect B-05): %. Expose a curated view instead.',
            leaked;
    END IF;
END
$$;

-- 4. The double-booking constraint indexes the buffered range.
--
-- Defect B-03. If this constraint is ever rebuilt against `slot_range`, the
-- database starts accepting back-to-back appointments that violate the
-- service's own preparation and cleanup gaps — and it does so silently, since
-- the slot picker will still be subtracting the buffers when it draws the grid.
DO $$
DECLARE
    definition TEXT;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO definition
    FROM pg_constraint WHERE conname = 'prevent_double_booking';

    IF definition IS NULL THEN
        RAISE EXCEPTION 'The prevent_double_booking constraint is gone.';
    END IF;

    IF definition NOT LIKE '%blocked_range WITH &&%' THEN
        RAISE EXCEPTION
            'prevent_double_booking must exclude on blocked_range, not slot_range (defect B-03). Found: %',
            definition;
    END IF;
END
$$;

-- 5. Tenant-owned child tables carry `business_id`.
--
-- Not a spec defect so much as the thing that makes every policy writable as a
-- simple equality. A child table without it — the spec's `staff_services` —
-- can only be scoped through a join, and a policy nobody can read is a policy
-- nobody maintains.
DO $$
DECLARE
    orphan TEXT;
BEGIN
    SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO orphan
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      -- `businesses` is the tenant root: its own id *is* the tenant key. The
      -- others are platform-owned and belong to no tenant.
      AND c.relname NOT IN ('businesses', 'subscription_plans', 'platform_admins',
                            'platform_heartbeat', 'booking_code_counters')
      AND NOT EXISTS (
          SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = c.oid AND a.attname = 'business_id' AND NOT a.attisdropped
      );

    IF orphan IS NOT NULL THEN
        RAISE EXCEPTION 'Tenant tables with no business_id column: %', orphan;
    END IF;
END
$$;
