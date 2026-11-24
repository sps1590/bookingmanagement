-- ---------------------------------------------------------------------------
-- 0016 — Platform operations
--
-- One table, and it exists only because of the hosting constraint
-- (docs/FREE_STACK.md). A free Supabase project is paused after seven days
-- with no activity, and a paused project is a total outage that your tenant
-- discovers before you do — on a Monday morning, when a clinic's front desk
-- cannot open the day sheet.
--
-- The keep-alive workflow writes here every three days. A write rather than a
-- read, for two reasons: it proves the database is actually reachable and
-- writable rather than merely answering, and `last_seen_at` is then a value
-- you can look at to know whether the schedule has been running — which a
-- `SELECT 1` never gives you. One row updated twice a week is nothing against
-- the 500 MB ceiling.
--
-- Not reachable by tenants: no grants to `anon` or `authenticated`, and from
-- this migration onward that is also the default (0015).
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

CREATE TABLE platform_heartbeat (
    id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source       TEXT,
    note         TEXT
);

COMMENT ON TABLE platform_heartbeat IS
    'Single-row liveness marker written by the keep-alive job, so a paused free-tier project is caught by a schedule rather than by a tenant. CHECK (id = 1) keeps it single-row.';

INSERT INTO platform_heartbeat (id, source, note)
VALUES (1, 'migration', 'created in 0016')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE platform_heartbeat ENABLE ROW LEVEL SECURITY;

-- RLS on, no policy, no grants: service role only.
