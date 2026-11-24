-- ---------------------------------------------------------------------------
-- Shared fixture, prepended inside every test's transaction by
-- scripts/run-db-tests.ts and rolled back afterwards.
--
-- Two tenants, because every interesting question in a multi-tenant schema is
-- "can A see B". They are deliberately different industries and different
-- timezones: a dentist in Dhaka and a salon in New York. The second zone is
-- not decoration — the spec hardcodes 'Asia/Dhaka' in its RPC message
-- formatting (defect B-20) and the booking-code date depends on the tenant's
-- zone, and a fixture that only ever uses Dhaka cannot catch either.
--
-- Runs as the connection's own role, which is a superuser and therefore
-- bypasses RLS. Tests then drop to `authenticated` with a JWT claim, which is
-- how Supabase presents a signed-in user to Postgres.
--
-- The UUIDs are mnemonic but must stay valid hex: tenant A is a…, tenant B is
-- b…, and the last byte says what kind of thing it is (b1 branch, e1 service,
-- f1/f2 provider, c1 customer, d1/d2 booking). A failure message then points
-- at something recognisable. The cost is that two runs against the *same*
-- database at the same moment would collide on these keys; CI uses a throwaway
-- container, so that only matters if you point this at a shared staging
-- project and run two copies at once.
-- ---------------------------------------------------------------------------

-- Identities ----------------------------------------------------------------
-- aaaa0001 owner of tenant A      aaaa0002 provider at A
-- aaaa0003 second provider at A   bbbb0001 owner of tenant B
-- cccc0001 platform operator      dddd0001 signed in, member of nothing
INSERT INTO auth.users (id, email) VALUES
    ('aaaa0001-0000-4000-8000-000000000001', 'owner-a@example.com'),
    ('aaaa0002-0000-4000-8000-000000000002', 'provider-a@example.com'),
    ('aaaa0003-0000-4000-8000-000000000003', 'provider-a2@example.com'),
    ('bbbb0001-0000-4000-8000-000000000001', 'owner-b@example.com'),
    ('cccc0001-0000-4000-8000-000000000001', 'operator@example.com'),
    ('dddd0001-0000-4000-8000-000000000001', 'outsider@example.com');

INSERT INTO platform_admins (user_id, note)
VALUES ('cccc0001-0000-4000-8000-000000000001', 'fixture operator');

-- Tenants -------------------------------------------------------------------
INSERT INTO businesses
    (id, slug, name, business_type, phone, email, timezone, currency,
     plan_id, onboarding_step, onboarding_completed_at, terminology_config)
VALUES
    ('aaaa0000-0000-4000-8000-000000000001', 'dhaka-dental-care', 'Dhaka Dental Care',
     'dentist', '+8801711000001', 'owner-a@example.com', 'Asia/Dhaka', 'BDT',
     (SELECT id FROM subscription_plans WHERE code = 'pro'),
     'complete', NOW(),
     '{"customer":"Patient","staff":"Dentist","booking":"Dental Appointment","resource":"Dental Chair"}'::jsonb),
    ('bbbb0000-0000-4000-8000-000000000001', 'northside-salon', 'Northside Salon',
     'salon', '+12125550002', 'owner-b@example.com', 'America/New_York', 'USD',
     (SELECT id FROM subscription_plans WHERE code = 'free'),
     'complete', NOW(),
     '{"customer":"Client","staff":"Stylist","booking":"Service Booking","resource":"Styling Chair"}'::jsonb);

INSERT INTO business_members (business_id, user_id, role) VALUES
    ('aaaa0000-0000-4000-8000-000000000001', 'aaaa0001-0000-4000-8000-000000000001', 'owner'),
    ('aaaa0000-0000-4000-8000-000000000001', 'aaaa0002-0000-4000-8000-000000000002', 'staff'),
    ('aaaa0000-0000-4000-8000-000000000001', 'aaaa0003-0000-4000-8000-000000000003', 'staff'),
    ('bbbb0000-0000-4000-8000-000000000001', 'bbbb0001-0000-4000-8000-000000000001', 'owner');

INSERT INTO branches (id, business_id, name, is_default) VALUES
    ('aaaa00b1-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001',
     'Gulshan Chamber', TRUE),
    ('bbbb00b1-0000-4000-8000-000000000001', 'bbbb0000-0000-4000-8000-000000000001',
     'Main Street', TRUE);

-- Catalogue -----------------------------------------------------------------
-- Tenant A's service carries buffers: 10 minutes to prepare, 15 to sterilise.
-- That is what makes the B-03 regression test meaningful.
INSERT INTO services
    (id, business_id, name, duration_minutes,
     buffer_before_minutes, buffer_after_minutes, price, deposit_required)
VALUES
    ('aaaa00e1-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001',
     'Root Canal', 60, 10, 15, 8000, 2000),
    ('bbbb00e1-0000-4000-8000-000000000001', 'bbbb0000-0000-4000-8000-000000000001',
     'Cut and Finish', 45, 0, 0, 60, 0);

-- Providers. The two at tenant A are each linked to a login, which is what
-- `current_staff_id()` resolves and therefore what "own schedule only" means.
INSERT INTO staff_resources
    (id, business_id, branch_id, user_id, name, title, phone, email)
VALUES
    ('aaaa00f1-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001',
     'aaaa00b1-0000-4000-8000-000000000001', 'aaaa0002-0000-4000-8000-000000000002',
     'Dr Rahman', 'BDS, FCPS', '+8801711000011', 'rahman@example.com'),
    ('aaaa00f2-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001',
     'aaaa00b1-0000-4000-8000-000000000001', 'aaaa0003-0000-4000-8000-000000000003',
     'Dr Chowdhury', 'BDS', '+8801711000012', 'chowdhury@example.com'),
    ('bbbb00f1-0000-4000-8000-000000000001', 'bbbb0000-0000-4000-8000-000000000001',
     'bbbb00b1-0000-4000-8000-000000000001', NULL,
     'Alex', 'Senior Stylist', '+12125550011', 'alex@example.com');

INSERT INTO staff_services (business_id, staff_id, service_id) VALUES
    ('aaaa0000-0000-4000-8000-000000000001', 'aaaa00f1-0000-4000-8000-000000000001',
     'aaaa00e1-0000-4000-8000-000000000001'),
    ('aaaa0000-0000-4000-8000-000000000001', 'aaaa00f2-0000-4000-8000-000000000001',
     'aaaa00e1-0000-4000-8000-000000000001'),
    ('bbbb0000-0000-4000-8000-000000000001', 'bbbb00f1-0000-4000-8000-000000000001',
     'bbbb00e1-0000-4000-8000-000000000001');

-- Sunday to Thursday, 10:00-18:00, with a 13:00-14:00 break.
-- The casts are not decoration: inside a UNION, Postgres resolves an
-- unadorned quoted literal to `text` rather than leaving it unknown for the
-- target column to coerce, and the insert then fails on uuid vs text.
INSERT INTO availability_rules (business_id, staff_id, day_of_week, start_time, end_time, is_break)
SELECT 'aaaa0000-0000-4000-8000-000000000001'::uuid,
       'aaaa00f1-0000-4000-8000-000000000001'::uuid,
       d::smallint, TIME '10:00', TIME '18:00', FALSE
FROM generate_series(0, 4) AS d
UNION ALL
SELECT 'aaaa0000-0000-4000-8000-000000000001'::uuid,
       'aaaa00f1-0000-4000-8000-000000000001'::uuid,
       d::smallint, TIME '13:00', TIME '14:00', TRUE
FROM generate_series(0, 4) AS d;

-- A business-wide closure: staff_id IS NULL. The composite foreign key is
-- MATCH SIMPLE, so a NULL in the pair leaves it unenforced, which is what
-- lets "the whole clinic is shut" be expressible.
INSERT INTO availability_overrides (business_id, staff_id, override_date, is_closed, reason)
VALUES ('aaaa0000-0000-4000-8000-000000000001', NULL, DATE '2027-02-21', TRUE,
        'Shaheed Dibosh');

-- Customers and bookings ----------------------------------------------------
INSERT INTO customers (id, business_id, full_name, phone, email, notes) VALUES
    ('aaaa00c1-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001',
     'Nusrat Jahan', '+8801811000001', 'nusrat@example.com', 'Penicillin allergy'),
    ('bbbb00c1-0000-4000-8000-000000000001', 'bbbb0000-0000-4000-8000-000000000001',
     'Jordan Lee', '+12125559001', 'jordan@example.com', 'Prefers morning');

INSERT INTO bookings
    (id, business_id, branch_id, customer_id, service_id, staff_id,
     start_time, end_time, buffer_before_minutes, buffer_after_minutes,
     status, total_price)
VALUES
    -- Tenant A, Dr Rahman: 2027-01-11 10:00-11:00 Dhaka. Buffered 09:50-11:15.
    ('aaaa00d1-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001',
     'aaaa00b1-0000-4000-8000-000000000001', 'aaaa00c1-0000-4000-8000-000000000001',
     'aaaa00e1-0000-4000-8000-000000000001', 'aaaa00f1-0000-4000-8000-000000000001',
     '2027-01-11 10:00+06', '2027-01-11 11:00+06', 10, 15, 'confirmed', 8000),
    -- Tenant A, Dr Chowdhury, the same hour. Legal: a different provider.
    ('aaaa00d2-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001',
     'aaaa00b1-0000-4000-8000-000000000001', 'aaaa00c1-0000-4000-8000-000000000001',
     'aaaa00e1-0000-4000-8000-000000000001', 'aaaa00f2-0000-4000-8000-000000000001',
     '2027-01-11 10:00+06', '2027-01-11 11:00+06', 10, 15, 'confirmed', 8000),
    -- Tenant B.
    ('bbbb00d1-0000-4000-8000-000000000001', 'bbbb0000-0000-4000-8000-000000000001',
     'bbbb00b1-0000-4000-8000-000000000001', 'bbbb00c1-0000-4000-8000-000000000001',
     'bbbb00e1-0000-4000-8000-000000000001', 'bbbb00f1-0000-4000-8000-000000000001',
     '2027-01-11 09:00-05', '2027-01-11 09:45-05', 0, 0, 'confirmed', 60);

INSERT INTO booking_history
    (business_id, booking_id, action, actor_type, actor_user_id, new_status)
VALUES
    ('aaaa0000-0000-4000-8000-000000000001', 'aaaa00d1-0000-4000-8000-000000000001',
     'created', 'admin', 'aaaa0001-0000-4000-8000-000000000001', 'confirmed'),
    ('bbbb0000-0000-4000-8000-000000000001', 'bbbb00d1-0000-4000-8000-000000000001',
     'created', 'admin', 'bbbb0001-0000-4000-8000-000000000001', 'confirmed');

INSERT INTO notification_logs
    (business_id, booking_id, recipient_type, recipient_contact, channel,
     event_type, message_body, scheduled_at)
VALUES
    ('aaaa0000-0000-4000-8000-000000000001', 'aaaa00d1-0000-4000-8000-000000000001',
     'customer', 'nusrat@example.com', 'email', 'reminder_24h',
     'Your appointment is tomorrow at 10:00.', '2027-01-10 10:00+06'),
    ('bbbb0000-0000-4000-8000-000000000001', 'bbbb00d1-0000-4000-8000-000000000001',
     'customer', 'jordan@example.com', 'email', 'reminder_24h',
     'See you tomorrow at 9am.', '2027-01-10 09:00-05');

INSERT INTO payments
    (business_id, booking_id, customer_id, method, provider_txn_id, payer_phone,
     amount_expected, amount_claimed)
VALUES
    ('aaaa0000-0000-4000-8000-000000000001', 'aaaa00d1-0000-4000-8000-000000000001',
     'aaaa00c1-0000-4000-8000-000000000001', 'bkash', 'TRX100200300',
     '+8801811000001', 2000, 2000);
