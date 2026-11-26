-- ---------------------------------------------------------------------------
-- 0030 — Booking rules a business can actually live with, and change
--
-- 0029 removed the platform's caps. These are the other kind: the per-tenant
-- rules in `businesses.booking_rules`, which were given defaults in 0003 and
-- then never exposed anywhere. No screen could change them, so every tenant
-- on this deployment has been running on the numbers in that DEFAULT clause,
-- whether or not they suit the trade.
--
-- Three of them were too tight to be invisible:
--
--   * `max_advance_days` was 30. A dentist booking a six-month check-up, a
--     salon taking a wedding party, a clinic scheduling a follow-up course —
--     all refused, with no setting to point at. Now 180.
--   * `max_reschedules` was 2. Moving an appointment twice is ordinary
--     politeness, not abuse. Now 5.
--   * `max_active_per_customer` was never in the defaults at all, so the
--     fallback of 3 in `create_booking_atomic` decided it: one person could
--     hold three future appointments and no more. A course of weekly
--     physiotherapy is six. Now 10, and written down rather than implied by
--     a literal in a function body.
--
-- `min_lead_minutes` and the cancellation cutoffs are left alone. They are
-- not ceilings on use; they are the notice a business needs to staff a chair,
-- and the desk can override the lead time for anyone standing in front of it
-- (migration 0023).
--
-- Existing tenants are moved only where they are still on the old default.
-- Nobody has been able to choose a different value yet, so in practice that
-- is everyone — but writing it this way means the migration cannot overwrite
-- a deliberate choice if one exists, which is the behaviour this would need
-- on the day it runs against a real customer's data.
--
-- With the settings screen that lands alongside this, these stop being
-- defaults anybody is stuck with.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

ALTER TABLE businesses
    ALTER COLUMN booking_rules SET DEFAULT
        '{"min_reschedule_hours":2,"min_cancel_hours":2,"max_advance_days":180,
          "slot_interval_minutes":15,"min_lead_minutes":60,"max_reschedules":5,
          "max_active_per_customer":10,"auto_confirm":true}'::jsonb;

UPDATE businesses
SET booking_rules = booking_rules
        || CASE
               WHEN (booking_rules ->> 'max_advance_days') = '30'
               THEN jsonb_build_object('max_advance_days', 180)
               ELSE '{}'::jsonb
           END
        || CASE
               WHEN coalesce(booking_rules ->> 'max_reschedules', '2') = '2'
               THEN jsonb_build_object('max_reschedules', 5)
               ELSE '{}'::jsonb
           END
        || CASE
               WHEN booking_rules ? 'max_active_per_customer'
               THEN '{}'::jsonb
               ELSE jsonb_build_object('max_active_per_customer', 10)
           END,
    updated_at = NOW();

COMMENT ON COLUMN businesses.booking_rules IS
    'min_lead_minutes (M-03) and max_reschedules (M-04) are defined here and enforced in Phase 2. auto_confirm is internal and is not exposed by the public view. Every value here is the tenant''s own to set under Settings → Booking rules; 0030 raised the defaults, which until then nothing could change.';
