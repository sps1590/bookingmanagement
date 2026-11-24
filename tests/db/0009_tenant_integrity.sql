-- ---------------------------------------------------------------------------
-- Structural integrity: the things RLS does not protect
--
-- Row-Level Security answers "may this caller touch this row". It does not
-- answer "is this row coherent". Two different questions, and the second one
-- has no policy to express it:
--
--   * A booking row with `business_id = A` and `service_id` belonging to
--     tenant B satisfies every policy in 0015 — the caller really is a member
--     of A. Nothing in RLS notices that the service is somebody else's, and
--     the result is tenant B's service name and price appearing on tenant A's
--     invoice.
--
--   * A tenant admin really is an admin of their own business, so a policy
--     guarding `UPDATE businesses` cannot stop them setting their own
--     `plan_id` to the enterprise tier. That is a column privilege question,
--     not a row one.
--
-- Hence the composite foreign keys and the column-level grant. Both are easy
-- to drop accidentally while refactoring, and neither failure is visible
-- until it costs money or leaks a name.
-- ---------------------------------------------------------------------------

-- 1. A booking cannot borrow another tenant's service. Asserted with the
-- privileged role precisely because RLS is not what is being tested: a
-- superuser bypasses policies, so only the foreign key can refuse this.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO bookings (business_id, branch_id, customer_id, service_id, staff_id,
                              start_time, end_time)
        VALUES ('aaaa0000-0000-4000-8000-000000000001', 'aaaa00b1-0000-4000-8000-000000000001',
                'aaaa00c1-0000-4000-8000-000000000001',
                'bbbb00e1-0000-4000-8000-000000000001',  -- tenant B's service
                'aaaa00f1-0000-4000-8000-000000000001',
                '2027-04-01 10:00+06', '2027-04-01 11:00+06');
    EXCEPTION WHEN foreign_key_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION
            'A booking in tenant A referenced tenant B''s service. RLS permits this; the composite foreign key is what must not.';
    END IF;
END
$$;

-- 2. Nor another tenant's provider, customer or branch.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO bookings (business_id, branch_id, customer_id, service_id, staff_id,
                              start_time, end_time)
        VALUES ('aaaa0000-0000-4000-8000-000000000001', 'aaaa00b1-0000-4000-8000-000000000001',
                'bbbb00c1-0000-4000-8000-000000000001',  -- tenant B's customer
                'aaaa00e1-0000-4000-8000-000000000001',
                'aaaa00f1-0000-4000-8000-000000000001',
                '2027-04-02 10:00+06', '2027-04-02 11:00+06');
    EXCEPTION WHEN foreign_key_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'A booking in tenant A referenced tenant B''s customer';
    END IF;
END
$$;

-- 3. The staff/service mapping cannot cross tenants either. This is the table
-- the spec declares without a `business_id` at all, as a bare pair of ids.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO staff_services (business_id, staff_id, service_id)
        VALUES ('aaaa0000-0000-4000-8000-000000000001',
                'aaaa00f1-0000-4000-8000-000000000001',
                'bbbb00e1-0000-4000-8000-000000000001');
    EXCEPTION WHEN foreign_key_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'Tenant A''s provider was mapped to tenant B''s service';
    END IF;
END
$$;

-- 4. A provider cannot be filed under another tenant's branch.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO staff_resources (business_id, branch_id, name)
        VALUES ('aaaa0000-0000-4000-8000-000000000001',
                'bbbb00b1-0000-4000-8000-000000000001', 'Misfiled Provider');
    EXCEPTION WHEN foreign_key_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'A provider was attached to another tenant''s branch';
    END IF;
END
$$;

-- === Column privileges =====================================================
SET LOCAL "request.jwt.claims" =
    '{"sub":"aaaa0001-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

-- 5. An owner edits their own business profile.
DO $$
DECLARE
    renamed TEXT;
BEGIN
    UPDATE businesses SET name = 'Dhaka Dental Care Ltd'
    WHERE id = 'aaaa0000-0000-4000-8000-000000000001';

    SELECT name INTO renamed FROM businesses
    WHERE id = 'aaaa0000-0000-4000-8000-000000000001';

    IF renamed <> 'Dhaka Dental Care Ltd' THEN
        RAISE EXCEPTION 'An owner could not rename their own business';
    END IF;
END
$$;

-- 6. But cannot award themselves a plan. There is no policy that could stop
-- this — they are a legitimate admin of the row — so the grant must.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        UPDATE businesses
        SET plan_id = (SELECT id FROM subscription_plans WHERE code = 'enterprise')
        WHERE id = 'aaaa0000-0000-4000-8000-000000000001';
    EXCEPTION WHEN insufficient_privilege THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION
            'A tenant owner upgraded themselves to the enterprise plan. plan_id must be outside the column grant on businesses.';
    END IF;
END
$$;

-- 7. Nor rewrite their own business code, nor reactivate a suspended account.
DO $$
DECLARE
    col TEXT;
    stmt TEXT;
    rejected BOOLEAN;
BEGIN
    FOREACH col IN ARRAY ARRAY['business_code', 'is_active']
    LOOP
        rejected := FALSE;
        stmt := format(
            'UPDATE businesses SET %I = %L WHERE id = %L',
            col,
            CASE col WHEN 'is_active' THEN 'true' ELSE 'BIZ-9999' END,
            'aaaa0000-0000-4000-8000-000000000001');
        BEGIN
            EXECUTE stmt;
        EXCEPTION WHEN insufficient_privilege THEN
            rejected := TRUE;
        END;

        IF NOT rejected THEN
            RAISE EXCEPTION 'A tenant owner was able to write businesses.%', col;
        END IF;
    END LOOP;
END
$$;

-- 8. And cannot create a second business. Signup goes through the service
-- role, which also has to create the owner membership in the same breath;
-- a self-service INSERT here would make orphaned tenants possible.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO businesses (slug, name, business_type, phone)
        VALUES ('a-second-clinic', 'A Second Clinic', 'doctor', '+8801711000888');
    EXCEPTION WHEN insufficient_privilege THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'A tenant owner created a business directly';
    END IF;
END
$$;

-- === Data shape ============================================================
RESET ROLE;

-- 9. Defect M-15: an override cannot say "open, with no hours". The spec
-- permits it, and the slot generator then reads the day as either closed or a
-- crash, depending on which branch it takes.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO availability_overrides (business_id, staff_id, override_date, is_closed)
        VALUES ('aaaa0000-0000-4000-8000-000000000001',
                'aaaa00f1-0000-4000-8000-000000000001', DATE '2027-05-01', FALSE);
    EXCEPTION WHEN check_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'An override was accepted as open with no hours (defect M-15)';
    END IF;
END
$$;

-- 10. Two overlapping working blocks on one day would make the slot generator
-- emit the same slot twice.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO availability_rules (business_id, staff_id, day_of_week,
                                        start_time, end_time, is_break)
        VALUES ('aaaa0000-0000-4000-8000-000000000001',
                'aaaa00f1-0000-4000-8000-000000000001', 1,
                TIME '17:00', TIME '20:00', FALSE);
    EXCEPTION WHEN exclusion_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'Overlapping working hours were accepted for one provider on one day';
    END IF;
END
$$;

-- 11. One default branch per tenant. Two would make "where is this walk-in"
-- ambiguous for every booking taken at the desk.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO branches (business_id, name, is_default)
        VALUES ('aaaa0000-0000-4000-8000-000000000001', 'Second Default', TRUE);
    EXCEPTION WHEN unique_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'A tenant was given a second default branch';
    END IF;
END
$$;

-- 12. Phone numbers are E.164. Without the format constraint,
-- `UNIQUE (business_id, phone)` is decorative: 01811000001 and +8801811000001
-- are the same patient and two rows, with two visit histories.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO customers (business_id, full_name, phone)
        VALUES ('aaaa0000-0000-4000-8000-000000000001', 'Unnormalised', '01811000002');
    EXCEPTION WHEN check_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'A local-format phone number was stored, defeating the uniqueness constraint';
    END IF;
END
$$;

-- === Money =================================================================

-- 13. One bKash receipt, one payment — per tenant. Decision D-010 requires
-- this to be a constraint rather than a check in the admin UI, because the UI
-- is exactly what someone taking money would be able to work around.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO payments (business_id, booking_id, method, provider_txn_id,
                              amount_expected, amount_claimed)
        VALUES ('aaaa0000-0000-4000-8000-000000000001',
                'aaaa00d2-0000-4000-8000-000000000001', 'bkash', 'TRX100200300',
                2000, 2000);
    EXCEPTION WHEN unique_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'The same transaction id was used for two deposits in one tenant (D-010)';
    END IF;
END
$$;

-- 14. The same id in a different tenant is fine: two unrelated clinics can see
-- the same reference from different wallets, and refusing it would make one
-- tenant's history interfere with another's.
DO $$
BEGIN
    INSERT INTO payments (business_id, booking_id, method, provider_txn_id,
                          amount_expected, amount_claimed)
    VALUES ('bbbb0000-0000-4000-8000-000000000001',
            'bbbb00d1-0000-4000-8000-000000000001', 'bkash', 'TRX100200300', 60, 60);
END
$$;

-- 15. A recorded claim is evidence and cannot be edited. The amount and the
-- transaction id are the entire basis for believing money arrived; staff who
-- can revise them can quietly reconcile a short payment.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        UPDATE payments SET amount_claimed = 1
        WHERE provider_txn_id = 'TRX100200300'
          AND business_id = 'aaaa0000-0000-4000-8000-000000000001';
    EXCEPTION WHEN check_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'A payment claim was edited after the fact (D-010)';
    END IF;
END
$$;

-- 16. Verifying one, though, is the whole workflow — and it must name who did
-- it. A decision with no decider is not an audit trail.
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
BEGIN
    BEGIN
        UPDATE payments SET status = 'verified', amount_verified = 2000
        WHERE provider_txn_id = 'TRX100200300'
          AND business_id = 'aaaa0000-0000-4000-8000-000000000001';
    EXCEPTION WHEN check_violation THEN
        rejected := TRUE;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'A payment was verified with no verified_by recorded (D-010)';
    END IF;

    UPDATE payments
    SET status = 'verified', amount_verified = 2000,
        verified_by = 'aaaa0001-0000-4000-8000-000000000001', verified_at = NOW()
    WHERE provider_txn_id = 'TRX100200300'
      AND business_id = 'aaaa0000-0000-4000-8000-000000000001';
END
$$;
