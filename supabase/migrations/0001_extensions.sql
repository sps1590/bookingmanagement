-- ---------------------------------------------------------------------------
-- 0001 — Extensions
--
-- Only what the schema genuinely needs:
--
--   btree_gist  required. The `prevent_double_booking` exclusion constraint in
--               0007 indexes `business_id WITH =, staff_id WITH =` alongside a
--               range operator, and plain GiST has no equality operator class
--               for uuid. Without this extension that constraint cannot be
--               created, and double-booking prevention becomes application
--               logic — which is exactly the failure mode the spec set out to
--               avoid.
--
--   pgcrypto    required for `gen_random_bytes`, used to mint the 48-character
--               reschedule token that authenticates a customer who has no
--               account.
--
-- Deliberately unused (deviation from the spec's list, see docs/DECISIONS.md
-- D-011). Supabase preinstalls both, so this is a choice not to call them
-- rather than a choice not to install them:
--
--   uuid-ossp   `gen_random_uuid()` has been in core Postgres since 13 and this
--               project targets 17. Reaching into an extension for a function
--               the server already has would put a schema qualification
--               problem into every column default for no gain.
--
--   citext      slugs are constrained to lowercase by a CHECK, so their UNIQUE
--               constraint is already case-insensitive, and nothing else needs
--               a case-insensitive comparison type. Case-insensitive email
--               lookups use an expression index instead.
--
-- Both extensions go in `extensions`, not `public`, which is where Supabase
-- keeps them and keeps the tenant schema readable. Nothing below may assume
-- that location: `IF NOT EXISTS` means an extension already installed
-- elsewhere stays there, so functions reaching into one pin their own
-- search_path, and every migration pins the session search_path so DDL
-- resolution is deterministic rather than dependent on whichever role runs it.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
