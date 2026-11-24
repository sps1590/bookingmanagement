-- ---------------------------------------------------------------------------
-- Supabase shim for a plain PostgreSQL server
--
-- The migrations in supabase/migrations depend on exactly four things that
-- Supabase provides and a bare Postgres does not:
--
--   1. an `auth` schema containing `auth.users`, which tenant tables reference
--   2. `auth.uid()`, which every RLS policy resolves the caller through
--   3. the roles `anon`, `authenticated` and `service_role`
--   4. an `extensions` schema, and Supabase's wide-open default privileges on
--      new tables in `public`
--
-- This file supplies those, so the whole schema and its RLS policies can be
-- built and tested on any Postgres 15+ — a free GitHub Actions service
-- container, or a local server — with no Docker and no Supabase CLI. See
-- docs/DECISIONS.md D-014.
--
-- It is applied only by `npm run test:db -- --fresh`. It is NOT a migration
-- and must never be applied to a real Supabase project, which already has all
-- of this and has it properly.
--
-- ## Keeping it honest
--
-- A shim is only useful while it behaves like the thing it stands in for, and
-- the way shims rot is by quietly diverging. Two things keep this one straight:
--
--   * `auth.uid()` here is a faithful copy of Supabase's own definition,
--     including the `request.jwt.claim.sub` fallback, so a policy that works
--     against one works against the other.
--   * Point 4 matters more than it looks. Supabase grants ALL on new public
--     tables to `anon` and `authenticated` by default, and migration 0015
--     exists to revoke that. If the shim did not reproduce the open default,
--     CI would be testing a database that was already closed, and the test
--     proving `anon` cannot read `customers` would pass for the wrong reason.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
END
$$;

-- Mirrors the subset of auth.users that the schema references. The three
-- NOT NULL columns are the three that are NOT NULL on Supabase, so a fixture
-- insert that works here works there.
CREATE TABLE IF NOT EXISTS auth.users (
    id            UUID PRIMARY KEY,
    email         TEXT,
    phone         TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    is_sso_user   BOOLEAN NOT NULL DEFAULT FALSE,
    is_anonymous  BOOLEAN NOT NULL DEFAULT FALSE
);

-- Verbatim from Supabase, fallback included. Tests set `request.jwt.claims`;
-- some Supabase deployments still set the older per-claim GUC, and a policy
-- must behave the same either way.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
    SELECT coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
    SELECT coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    )::text;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT SELECT ON auth.users TO service_role;

-- Reproduce Supabase's open-by-default grant. 0015 is what closes it, and that
-- is the behaviour under test — see the note at the top of this file.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
