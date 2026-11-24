-- ---------------------------------------------------------------------------
-- 0011 — Performance indexes
--
-- Only indexes that are not already implied by a constraint. The spec's list
-- includes `idx_bookings_token ON bookings (reschedule_token)`, which
-- duplicates the index Postgres already built for that column's UNIQUE
-- constraint — two identical B-trees to maintain on every booking write, for
-- no read benefit. It is left out here.
--
-- Likewise absent: anything on `(business_id, phone)` for customers, on
-- `(business_id, booking_code)` for bookings, or on the availability override
-- dates, all of which are served by unique constraints declared earlier.
--
-- The single most important index in the schema is one of those implied ones:
-- `business_members (business_id, user_id)`. `is_business_member()` sits inside
-- every RLS policy, so that index is consulted on essentially every query the
-- application makes.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

-- "Which businesses do I belong to", for the tenant switcher and for
-- current_business_ids(). The UNIQUE constraint indexes (business_id, user_id),
-- which cannot serve a lookup by user alone.
CREATE INDEX business_members_user ON business_members (user_id) WHERE is_active;

CREATE INDEX branches_business_active ON branches (business_id) WHERE is_active;

CREATE INDEX services_business_active
    ON services (business_id, sort_order, name) WHERE is_active;

CREATE INDEX staff_resources_business_active
    ON staff_resources (business_id, sort_order, name) WHERE is_active;

-- The PK is (staff_id, service_id); this is the other direction — "who can
-- perform this service", which is the lookup the slot generator needs once it
-- respects staff_services (defect M-01).
CREATE INDEX staff_services_by_service ON staff_services (service_id, staff_id);

CREATE INDEX availability_rules_staff_day
    ON availability_rules (staff_id, day_of_week, start_time);

-- Calendar and day-sheet reads.
CREATE INDEX bookings_business_start ON bookings (business_id, start_time DESC);

-- "Today's arrivals", "pending confirmations" — the admin dashboard's home
-- screen. Partial, because completed and cancelled history is the larger part
-- of the table and is never wanted here.
CREATE INDEX bookings_business_active_start
    ON bookings (business_id, start_time)
    WHERE status IN ('pending', 'confirmed', 'checked_in');

-- One provider's diary, ordered.
CREATE INDEX bookings_staff_start ON bookings (staff_id, start_time DESC);

-- A customer's visit history, newest first.
CREATE INDEX bookings_customer_start ON bookings (customer_id, start_time DESC);

CREATE INDEX booking_history_booking ON booking_history (booking_id, created_at DESC);

-- The Phase 5 worker's claim query: due, unclaimed, oldest first.
CREATE INDEX notification_logs_due
    ON notification_logs (scheduled_at)
    WHERE status = 'queued';

-- The reaper's query: rows a crashed worker left claimed.
CREATE INDEX notification_logs_stuck
    ON notification_logs (locked_at)
    WHERE status = 'sending';

-- Cancelling a booking has to withdraw its pending reminders.
CREATE INDEX notification_logs_booking
    ON notification_logs (booking_id)
    WHERE booking_id IS NOT NULL;

CREATE INDEX notification_logs_business_recent
    ON notification_logs (business_id, created_at DESC);

CREATE INDEX waitlist_business_date
    ON waitlist_entries (business_id, desired_date)
    WHERE status IN ('waiting', 'notified');

CREATE INDEX payments_business_status ON payments (business_id, status, created_at DESC);
CREATE INDEX payments_booking ON payments (booking_id) WHERE booking_id IS NOT NULL;

CREATE INDEX subscription_invoices_business_period
    ON subscription_invoices (business_id, period_start DESC);
CREATE INDEX subscription_invoices_outstanding
    ON subscription_invoices (due_date)
    WHERE status IN ('issued', 'overdue');
