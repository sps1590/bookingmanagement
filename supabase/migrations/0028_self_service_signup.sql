-- ---------------------------------------------------------------------------
-- 0028 — Signup without the service-role key
--
-- 0017 put tenant creation behind `service_role`, and the API route created
-- the Auth identity with the admin client. That is defensible on paper and it
-- has one practical consequence: the entire front door of the product depends
-- on one secret being pasted correctly into the hosting provider. When it is
-- wrong — truncated, whitespaced, copied from another project — Supabase
-- answers "Invalid API key" and *nobody can sign up at all*, while every
-- public page carries on working and hides the fact.
--
-- That is a bad place to put a single point of failure, and it is avoidable:
-- signup does not actually need to bypass Row-Level Security. It needs to
-- write five tables in one transaction on behalf of somebody who is, by then,
-- a real authenticated user. SECURITY DEFINER already provides that. The
-- service key was doing nothing here that `auth.uid()` cannot do.
--
-- So this adds the same transaction, reached as the signed-in owner:
--
--   * `register_my_business` takes no owner id. It reads `auth.uid()` and
--     refuses when there is none, so the caller cannot name somebody else.
--   * EXECUTE is granted to `authenticated` and to nobody else. `anon` still
--     cannot create tenants with the publishable key, which was the point of
--     the original grant.
--   * The one-business-per-owner rule, the slug collision loop and the five
--     inserts are unchanged: this delegates to `register_business` rather
--     than restating it, so there is one definition of what a tenant is.
--
-- The API route now signs the person up with the publishable key, which the
-- Auth service hashes exactly as before, and calls this with the session that
-- comes back. Nothing in the signup path reads the service key any more.
--
-- What that gives up: the compensating delete. The old route could remove the
-- Auth identity if the transaction failed; the publishable key cannot delete
-- users, by design. The residue is an account that can sign in and owns
-- nothing — which the signup page already handles, because it has always been
-- reachable (the delete could fail too). Signing in with the same credentials
-- and calling this again finishes the job. An orphan is recoverable; a tenant
-- nobody owns is not, and that is still inside the transaction.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

CREATE FUNCTION register_my_business(
    p_name          TEXT,
    p_industry      TEXT,
    p_phone         TEXT,
    p_email         TEXT,
    p_timezone      TEXT,
    p_currency      TEXT,
    p_terminology   JSONB,
    p_templates     JSONB DEFAULT '[]'::jsonb,
    p_slug          TEXT DEFAULT NULL
)
RETURNS TABLE (business_id UUID, business_code TEXT, slug TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
-- Pinned per B-09, as every definer function in this schema is.
SET search_path = public, pg_temp
AS $$
DECLARE
    v_owner UUID := auth.uid();
BEGIN
    -- Not a formality. Without this, a definer function granted to
    -- `authenticated` would happily create a tenant owned by NULL if it were
    -- ever reached without a session.
    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'A signed-in account is required to create a business'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN QUERY
    SELECT *
    FROM register_business(v_owner, p_name, p_industry, p_phone, p_email,
                           p_timezone, p_currency, p_terminology,
                           p_templates, p_slug);
END
$$;

COMMENT ON FUNCTION register_my_business IS
    'Self-service tenant creation for the signed-in caller (0028). Owner is auth.uid() and cannot be named by the caller. authenticated only — anon still cannot create tenants.';

REVOKE EXECUTE ON FUNCTION
    register_my_business(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    register_my_business(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT)
    TO authenticated;
