-- ---------------------------------------------------------------------------
-- 0025 — Reading a booking with nothing but its link
--
-- `/manage/[token]` is the only page a guest customer has. They have no
-- account and no password; the 192-bit token in the URL is the whole
-- credential. Phase 2 gave them functions to *change* a booking by token and
-- no way to *see* it, so the page had nothing to render.
--
-- What this deliberately does not do:
--
--   * It returns one booking, never a list. Looking up by phone number — the
--     obvious convenience — would make one leaked link a window onto every
--     appointment that person has ever had with the business.
--   * It returns no internal notes, no other customer's details, and no
--     provider contact details. The provider's name and title are what a
--     customer needs to recognise who they are seeing; their mobile number is
--     not (defect B-05).
--   * It does not say whether a token *nearly* matched. An unknown token and
--     a cancelled booking are the same empty result, because a response that
--     distinguishes them is an oracle for guessing.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

CREATE FUNCTION get_booking_by_token(p_token TEXT)
RETURNS TABLE (
    booking_id        UUID,
    booking_code      TEXT,
    status            TEXT,
    start_time        TIMESTAMPTZ,
    end_time          TIMESTAMPTZ,
    customer_name     TEXT,
    service_name      TEXT,
    service_id        UUID,
    staff_name        TEXT,
    staff_id          UUID,
    business_name     TEXT,
    business_slug     TEXT,
    business_address  TEXT,
    business_phone    TEXT,
    timezone          TEXT,
    terminology       JSONB,
    reschedule_count  INT,
    max_reschedules   INT,
    min_reschedule_hours INT,
    min_cancel_hours  INT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT bk.id,
           bk.booking_code,
           bk.status,
           bk.start_time,
           bk.end_time,
           c.full_name,
           s.name,
           s.id,
           sr.name,
           sr.id,
           b.name,
           b.slug,
           b.address,
           b.phone,
           b.timezone,
           b.terminology_config,
           bk.reschedule_count,
           booking_rule_int(b.booking_rules, 'max_reschedules', 2),
           booking_rule_int(b.booking_rules, 'min_reschedule_hours', 2),
           booking_rule_int(b.booking_rules, 'min_cancel_hours', 2)
    FROM bookings bk
    JOIN businesses b      ON b.id = bk.business_id
    JOIN customers c       ON c.id = bk.customer_id
    JOIN services s        ON s.id = bk.service_id
    JOIN staff_resources sr ON sr.id = bk.staff_id
    -- Length-checked before the comparison so a malformed token costs an index
    -- probe rather than a scan, and so the shape of the credential is enforced
    -- in one place.
    WHERE length(p_token) = 48
      AND bk.reschedule_token = p_token;
$$;

COMMENT ON FUNCTION get_booking_by_token(TEXT) IS
    'One booking, by its link. Never a list: looking up by phone would make a single forwarded link a window onto every appointment that person ever had.';

REVOKE EXECUTE ON FUNCTION get_booking_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_booking_by_token(TEXT) TO anon, authenticated, service_role;
