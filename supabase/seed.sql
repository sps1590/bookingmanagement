-- ---------------------------------------------------------------------------
-- Local / CI seed data.
--
-- Runs automatically after `supabase db reset`. Every phase's tests assert
-- against this fixture, so keep it small, deterministic and realistic:
--   - two tenants of different industries, to catch anything hardcoded to one
--     terminology set or timezone
--   - one tenant outside Asia/Dhaka, because the spec's RPCs hardcode
--     'Asia/Dhaka' and that defect (B-20) needs a standing regression fixture
--   - a week of availability including a break and a closed day
--
-- Phase 1 fills this in once the schema exists. Deliberately empty for now so
-- `db:reset` succeeds against an empty migration chain.
-- ---------------------------------------------------------------------------

-- Phase 1: tenants
--   BIZ-1001  dhaka-dental-care    dentist    Asia/Dhaka
--   BIZ-1002  glamour-salon        salon      Asia/Dhaka
--   BIZ-1003  northside-clinic     doctor     America/New_York  (timezone guard)

-- Phase 1: staff, services, staff_services mapping
-- Phase 1: availability_rules (Sun-Thu 10:00-18:00, 13:00-14:00 break)
-- Phase 1: availability_overrides (one closed date)
-- Phase 2: no bookings — concurrency tests create their own

SELECT 1;
