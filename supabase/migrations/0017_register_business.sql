-- ---------------------------------------------------------------------------
-- 0017 — Tenant signup, in one transaction
--
-- Creating a tenant means five writes that must all happen or none:
--
--   1. the business, with a generated code and a unique slug
--   2. the owner membership — without it, nobody can administer the business
--   3. a default branch, so the first booking has somewhere to be
--   4. the industry terminology
--   5. the default notification templates
--
-- Doing that from the application over PostgREST means five round trips with
-- no transaction around them. Fail at step 2 and the result is a business
-- nobody owns: it occupies the slug, no one can log in to it, and the person
-- who just signed up cannot retry because their chosen URL is taken. That is a
-- support ticket for every interrupted signup, and plan §3.3 asks for this to
-- be transactional, so it belongs in the database.
--
-- The Supabase Auth identity is created first, by the API route, because only
-- the Auth service can hash a password and send a confirmation. If this
-- function then fails, the route deletes that identity again — the one
-- compensating step that cannot be folded into the transaction.
--
-- SECURITY DEFINER and granted to `service_role` alone. Signup is necessarily
-- unauthenticated, so this is the only function in the schema an anonymous
-- request can reach, and it reaches it through a server route that holds the
-- service key — never from the browser. `anon` has no EXECUTE here, so the
-- publishable key cannot create tenants.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

-- Slug candidate from a business name. Immutable, so it can be used in an
-- index later if slug lookups ever need one.
CREATE FUNCTION slugify(p_text TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT
SET search_path = public, pg_temp
AS $$
    SELECT left(
        trim(both '-' from regexp_replace(lower(p_text), '[^a-z0-9]+', '-', 'g')),
        80);
$$;

COMMENT ON FUNCTION slugify(TEXT) IS
    'Business name to URL slug. Output satisfies the slug CHECK on businesses, except for the minimum length, which register_business handles.';

CREATE FUNCTION register_business(
    p_owner_user_id UUID,
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
-- Writes five tables that the calling role has no policy for. Pinned per B-09.
SET search_path = public, pg_temp
AS $$
-- The RETURNS TABLE names (business_id, business_code, slug) are also real
-- column names, and plpgsql resolves an ambiguous reference to the variable by
-- default — so `ON CONFLICT (business_id, ...)` below fails with
-- "column reference business_id is ambiguous". Columns win here. Every local
-- is v_-prefixed and every argument p_-prefixed, so nothing else in this body
-- relies on the other resolution.
#variable_conflict use_column
DECLARE
    v_base      TEXT;
    v_candidate TEXT;
    v_attempt   INT := 0;
    v_business  businesses;
    v_free_plan UUID;
BEGIN
    IF p_owner_user_id IS NULL THEN
        RAISE EXCEPTION 'An owner identity is required' USING ERRCODE = 'null_value_not_allowed';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_owner_user_id) THEN
        RAISE EXCEPTION 'No such user: %', p_owner_user_id USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- One person, one business, for now. Multi-business owners are a real
    -- case (a chain with separate legal entities) but they need a tenant
    -- switcher and a plan that prices it, so the limit is explicit rather
    -- than accidental.
    IF EXISTS (
        SELECT 1 FROM business_members
        WHERE user_id = p_owner_user_id AND role = 'owner'
    ) THEN
        RAISE EXCEPTION 'This account already owns a business'
            USING ERRCODE = 'unique_violation';
    END IF;

    -- Slug. The caller may propose one; otherwise it comes from the name.
    v_base := slugify(coalesce(nullif(trim(coalesce(p_slug, '')), ''), p_name));
    IF v_base IS NULL OR length(v_base) < 3 THEN
        v_base := 'booking';
    END IF;

    -- Collision-safe by construction rather than by hoping. A name like
    -- "Dental Care" is going to be taken.
    LOOP
        v_candidate := CASE WHEN v_attempt = 0
                            THEN v_base
                            ELSE left(v_base, 76) || '-' || v_attempt::text END;

        EXIT WHEN NOT EXISTS (SELECT 1 FROM businesses b WHERE b.slug = v_candidate);

        v_attempt := v_attempt + 1;
        IF v_attempt > 200 THEN
            -- Fall back to something that cannot collide at all.
            v_candidate := v_base || '-' || replace(gen_random_uuid()::text, '-', '')
                           ;
            v_candidate := left(v_candidate, 90);
            EXIT;
        END IF;
    END LOOP;

    SELECT id INTO v_free_plan FROM subscription_plans WHERE code = 'free';

    INSERT INTO businesses (slug, name, business_type, phone, email,
                            timezone, currency, plan_id, terminology_config,
                            onboarding_step)
    VALUES (v_candidate, p_name, p_industry, p_phone, nullif(p_email, ''),
            coalesce(nullif(p_timezone, ''), 'Asia/Dhaka'),
            coalesce(nullif(p_currency, ''), 'BDT'),
            v_free_plan,
            coalesce(p_terminology, '{}'::jsonb),
            'details')
    RETURNING * INTO v_business;

    INSERT INTO business_members (business_id, user_id, role)
    VALUES (v_business.id, p_owner_user_id, 'owner');

    -- Named after the business rather than "Main Branch", because a
    -- single-location clinic should never have to think about branches at all,
    -- and a label it recognises is less confusing than a generic one.
    INSERT INTO branches (business_id, name, address, phone, is_default)
    VALUES (v_business.id, p_name, NULL, p_phone, TRUE);

    IF p_templates IS NOT NULL AND jsonb_array_length(p_templates) > 0 THEN
        INSERT INTO notification_templates
            (business_id, event_type, channel, subject, body_template)
        SELECT v_business.id, t.event_type, t.channel, t.subject, t.body_template
        FROM jsonb_to_recordset(p_templates)
             AS t(event_type TEXT, channel TEXT, subject TEXT, body_template TEXT)
        ON CONFLICT (business_id, event_type, channel) DO NOTHING;
    END IF;

    RETURN QUERY SELECT v_business.id, v_business.business_code, v_business.slug;
END
$$;

COMMENT ON FUNCTION register_business IS
    'Atomic tenant creation (plan §3.3). The Auth identity is created first by the API route; if this fails, that route deletes it. service_role only — anon must not be able to create tenants with the publishable key.';

REVOKE EXECUTE ON FUNCTION
    register_business(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    register_business(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT)
    TO service_role;

REVOKE EXECUTE ON FUNCTION slugify(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION slugify(TEXT) TO authenticated, service_role;
