-- ---------------------------------------------------------------------------
-- 0013 — RLS helper functions
--
-- Every policy in 0015 is written in terms of these six functions, so that
-- "what does a receptionist see" is answered in one place rather than
-- re-derived in thirty policy expressions.
--
-- ## Why all of them are SECURITY DEFINER
--
-- Not for convenience. `business_members` has RLS of its own, and its policies
-- call `is_business_admin()`, which reads `business_members`. A SECURITY
-- INVOKER function would re-enter the policy that called it and Postgres would
-- raise "infinite recursion detected in policy". Running as the definer reads
-- the table directly, outside RLS, which breaks the cycle.
--
-- ## Why every one pins search_path (defect B-09)
--
-- The spec's two helpers are SECURITY DEFINER with no `SET search_path`. That
-- is a privilege-escalation hole: any role that can create objects in a schema
-- appearing earlier in the caller's search path can define its own
-- `business_members` — or its own `=` operator — and have the function resolve
-- to it while running with the definer's rights. On Supabase the definer is
-- `postgres`. The fix is one line per function and there is no reason to omit
-- it.
--
-- `auth.uid()` is schema-qualified throughout, because `auth` is deliberately
-- not in the pinned path.
--
-- ## Note on `is_platform_admin()`
--
-- It is kept out of the membership helpers on purpose. Policies add it only
-- where cross-tenant *reading* is intended, and never to a write policy — see
-- docs/DECISIONS.md D-012 for why a Super Admin's ambient JWT grant stops
-- short of patient data, and why platform writes go through the service role
-- instead.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

CREATE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM platform_admins WHERE user_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION is_platform_admin() IS
    'Platform operator, not tenant staff. Grants cross-tenant SELECT on configuration tables only (D-012). Never appears in a write policy. No tenant can grant it to themselves: platform_admins has no grants outside the service role.';

CREATE FUNCTION is_business_member(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM business_members
        WHERE business_id = p_business_id
          AND user_id = auth.uid()
          AND is_active
    );
$$;

CREATE FUNCTION has_role(p_business_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM business_members
        WHERE business_id = p_business_id
          AND user_id = auth.uid()
          AND is_active
          AND role = ANY (p_roles)
    );
$$;

COMMENT ON FUNCTION has_role(UUID, TEXT[]) IS
    'The basis of the RBAC matrix. Defect B-23: the spec gives every member FOR ALL on bookings, contradicting its own "Service Provider / Staff — Own Schedule Only" rule. Policies use this instead.';

CREATE FUNCTION is_business_admin(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT has_role(p_business_id, ARRAY['owner', 'manager']);
$$;

CREATE FUNCTION current_business_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT business_id FROM business_members
    WHERE user_id = auth.uid() AND is_active;
$$;

COMMENT ON FUNCTION current_business_ids() IS
    'For the tenant switcher and for server code that needs the caller''s tenants without naming one. Not used in policies — a per-row IN (...) is slower than the equality check is_business_member() compiles to.';

-- Which provider record *is* the caller, inside one tenant. This is what makes
-- "own schedule only" expressible: a staff member's booking policy compares
-- `bookings.staff_id` against this. NULL for an admin who is not also a
-- provider, which is why the policies test the role first.
CREATE FUNCTION current_staff_id(p_business_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT id FROM staff_resources
    WHERE business_id = p_business_id
      AND user_id = auth.uid()
      AND is_active;
$$;

-- These functions are the RLS decision path, so `authenticated` must be able to
-- call them. `anon` deliberately cannot: it holds no privilege on any table
-- whose policies use them, and reads public data through the views in 0014.
REVOKE EXECUTE ON FUNCTION
    is_platform_admin(), is_business_member(UUID), has_role(UUID, TEXT[]),
    is_business_admin(UUID), current_business_ids(), current_staff_id(UUID)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    is_platform_admin(), is_business_member(UUID), has_role(UUID, TEXT[]),
    is_business_admin(UUID), current_business_ids(), current_staff_id(UUID)
    TO authenticated, service_role;
