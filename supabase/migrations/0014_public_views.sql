-- ---------------------------------------------------------------------------
-- 0014 — Public views: the fix for defect B-05
--
-- ## What the spec does
--
--     CREATE POLICY "Public can view active businesses"
--         ON businesses FOR SELECT USING (is_active = TRUE);
--     CREATE POLICY "Public can view active staff"
--         ON staff_resources FOR SELECT USING (is_active = TRUE);
--
-- Row-Level Security filters rows. It does not filter columns. So the first
-- policy hands any anonymous caller `plan_id`, `booking_rules` and the owner's
-- email address, and the second publishes **every staff member's personal
-- phone number and email** — on a platform whose stated market is doctors and
-- dental clinics. One `curl` against PostgREST with the publishable key, which
-- ships in the browser bundle by design, returns the lot.
--
-- ## What this migration does instead
--
-- `anon` is granted nothing at all on the base tables (0015), and the public
-- portal reads these four views. Each view lists its columns explicitly, so
-- the public surface is a decision recorded in one file rather than a
-- side-effect of which columns a table happens to have. Adding a private
-- column to `businesses` next year cannot leak it.
--
-- ## security_invoker = false, deliberately
--
-- These views run with their owner's rights and therefore bypass the RLS of
-- the tables beneath them. That is the point: it is what lets `anon` hold zero
-- privilege on `staff_resources` while still seeing a provider's name and
-- photo. The alternative — `security_invoker = true` plus an anon SELECT
-- policy on the base table — would put us straight back into B-05, because
-- that policy would also permit `?select=phone,email`.
--
-- The trade is that each view body is now security-critical: a careless
-- `SELECT *` here is a PII breach. Hence the explicit column lists, the
-- comment on each view, and the database test asserting that `public_staff`
-- exposes no contact column.
--
-- Supabase's linter flags owner-rights views in `public` as
-- `security_definer_view`. That warning is about views that are definer by
-- accident; this is the documented, tested, intentional case.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

-- A tenant is publicly visible only once it is active *and* has finished
-- onboarding. Half-configured businesses with no services and no working hours
-- must not be reachable at /book/<slug> — the customer would meet an empty
-- calendar and conclude the clinic is closed.
CREATE VIEW public_businesses WITH (security_invoker = false) AS
SELECT
    b.id,
    b.slug,
    b.name,
    b.business_type,
    b.phone,
    b.address,
    b.timezone,
    b.currency,
    b.terminology_config,
    b.branding_config,
    -- Rebuilt key by key rather than passed through. The portal needs these to
    -- render the picker correctly; `auto_confirm` is an internal decision and
    -- is withheld. A key added to booking_rules later is private by default,
    -- which is the right way round.
    jsonb_build_object(
        'slot_interval_minutes', b.booking_rules -> 'slot_interval_minutes',
        'min_reschedule_hours',  b.booking_rules -> 'min_reschedule_hours',
        'min_cancel_hours',      b.booking_rules -> 'min_cancel_hours',
        'max_advance_days',      b.booking_rules -> 'max_advance_days',
        'min_lead_minutes',      b.booking_rules -> 'min_lead_minutes'
    ) AS booking_rules
FROM businesses b
WHERE b.is_active
  AND b.onboarding_completed_at IS NOT NULL;

COMMENT ON VIEW public_businesses IS
    'Anonymous-safe projection of businesses (defect B-05). Withheld: email, plan_id, business_code, onboarding state, booking_rules.auto_confirm, is_active, timestamps.';

CREATE VIEW public_branches WITH (security_invoker = false) AS
SELECT
    br.id,
    br.business_id,
    br.name,
    br.address,
    br.phone,
    br.map_url,
    br.is_default
FROM branches br
JOIN businesses b ON b.id = br.business_id
WHERE br.is_active
  AND b.is_active
  AND b.onboarding_completed_at IS NOT NULL;

COMMENT ON VIEW public_branches IS
    'A branch phone number is a published shopfront number, unlike a staff member''s personal one.';

CREATE VIEW public_services WITH (security_invoker = false) AS
SELECT
    s.id,
    s.business_id,
    s.name,
    s.category,
    s.description,
    s.duration_minutes,
    s.price,
    s.deposit_required,
    s.color_hex,
    s.sort_order
FROM services s
JOIN businesses b ON b.id = s.business_id
WHERE s.is_active
  AND b.is_active
  AND b.onboarding_completed_at IS NOT NULL;

COMMENT ON VIEW public_services IS
    'Buffer columns are withheld: they are internal scheduling policy, and the slot RPC already accounts for them. Publishing them would tell a competitor how long the clinic blocks between patients, and tell nobody anything useful.';

-- The one that matters most.
CREATE VIEW public_staff WITH (security_invoker = false) AS
SELECT
    st.id,
    st.business_id,
    st.branch_id,
    st.name,
    st.title,
    st.avatar_url,
    st.sort_order
FROM staff_resources st
JOIN businesses b ON b.id = st.business_id
WHERE st.is_active
  AND b.is_active
  AND b.onboarding_completed_at IS NOT NULL;

COMMENT ON VIEW public_staff IS
    'No phone, no email, no user_id — the regression surface for defect B-05. tests/db/0003_public_views_hide_pii.sql fails if a contact column ever reappears here.';

GRANT SELECT ON public_businesses, public_branches, public_services, public_staff
    TO anon, authenticated;
