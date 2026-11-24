-- ---------------------------------------------------------------------------
-- 0015 — Grants and Row-Level Security policies
--
-- Grants and policies live in one file on purpose. They are two halves of one
-- question — who can touch what — and splitting them across twelve migrations
-- is how a table ends up with a careful policy and a forgotten `GRANT ALL`.
--
-- ## Grants are the first line, not RLS
--
-- Supabase sets `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
-- TO anon, authenticated`, so every table created above arrived world-granted,
-- with RLS as the only thing standing in the way. RLS filters rows but never
-- columns, which is precisely the gap defect B-05 falls through. So each table
-- below is revoked to nothing and then granted the narrowest set that its
-- screens actually need:
--
--   * `anon` receives nothing on any base table. The public portal reads the
--     four views in 0014.
--   * `bookings` and `payments` grant no DELETE. An appointment is cancelled
--     by changing its status, and a payment record is never destroyed; both
--     are evidence.
--   * `businesses` grants UPDATE on a *column list*, not the table. Without
--     that, a tenant admin could `UPDATE businesses SET plan_id = <enterprise>`
--     and award themselves the top tier — the policy would allow it, because
--     they really are an admin of their own business. A column grant is the
--     declarative fix; no trigger needed.
--
-- The default privilege is then flipped for future tables, so the next
-- migration's table starts closed instead of open.
--
-- ## Deviation from B-22: platform admin is read-only, and not everywhere
--
-- The defect register says "every RLS policy gains `OR is_platform_admin()`".
-- That is not what happens here. `is_platform_admin()` appears only on SELECT
-- policies, and only for configuration tables — never on `customers`,
-- `bookings`, `booking_history`, `waitlist_entries` or `notification_logs`.
-- Rationale in docs/DECISIONS.md D-012: a support engineer debugging a
-- tenant's plan or working hours does not need a standing, ambient read of
-- every clinic's patient list, and the console that genuinely needs it already
-- goes through the service role, where the access is deliberate and logged.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

-- ===========================================================================
-- Grants
-- ===========================================================================

REVOKE ALL ON businesses, business_members, branches, services, staff_resources,
              staff_services, availability_rules, availability_overrides,
              customers, bookings, booking_history, waitlist_entries,
              notification_templates, notification_logs, payments,
              subscription_invoices, platform_admins, booking_code_counters
    FROM anon, authenticated;

-- Tenant profile: readable by members, editable by admins — but only these
-- columns. `plan_id`, `business_code` and `is_active` are the platform's.
GRANT SELECT ON businesses TO authenticated;
GRANT UPDATE (name, phone, email, address, timezone, currency, slug,
              terminology_config, booking_rules, branding_config,
              onboarding_step, onboarding_completed_at)
    ON businesses TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON business_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON branches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON availability_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON availability_overrides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON waitlist_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_templates TO authenticated;

-- No DELETE: cancellation is a status change, so the slot is freed without
-- losing the record of who had booked it.
GRANT SELECT, INSERT, UPDATE ON bookings TO authenticated;

-- No DELETE, no UPDATE: the money trail is amended by adding rows.
GRANT SELECT, INSERT, UPDATE ON payments TO authenticated;

-- Read-only to tenants. Rows arrive from the Phase 2 RPCs and the Phase 5
-- worker, both of which run as definer or service role.
GRANT SELECT ON booking_history TO authenticated;
GRANT SELECT ON notification_logs TO authenticated;
GRANT SELECT ON subscription_invoices TO authenticated;

-- `platform_admins` and `booking_code_counters` stay revoked: no role but the
-- service role, and the SECURITY DEFINER functions, ever touch them.

-- Close the door for future tables. A table added by a later migration now has
-- no grants until someone writes them down, which is the right default for a
-- schema holding medical appointments — see CONTRIBUTING.md.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON TABLES FROM anon, authenticated;

-- ===========================================================================
-- businesses
-- ===========================================================================

CREATE POLICY "Members read their business"
    ON businesses FOR SELECT
    USING (is_business_member(id) OR is_platform_admin());

CREATE POLICY "Admins update their business"
    ON businesses FOR UPDATE
    USING (is_business_admin(id))
    WITH CHECK (is_business_admin(id));

-- No INSERT policy: a business is created by the signup route through the
-- service-role client, which also has to create the owner membership in the
-- same transaction. A tenant cannot conjure a second tenant.
-- No DELETE policy: closing an account is a platform operation.

-- ===========================================================================
-- business_members — defect B-21
--
-- The spec gives this table a SELECT policy and nothing else, so an owner
-- cannot invite a receptionist: the product's own staff-management screen
-- cannot work. Write policies are added here, with one extra rule the spec
-- does not imply — a manager may not create or alter an owner. Otherwise
-- "manager" is a synonym for "owner", since a manager could simply promote
-- themselves.
-- ===========================================================================

CREATE POLICY "Members read own membership, admins read all"
    ON business_members FOR SELECT
    USING (user_id = auth.uid()
           OR is_business_admin(business_id)
           OR is_platform_admin());

CREATE POLICY "Admins add members, only owners add owners"
    ON business_members FOR INSERT
    WITH CHECK (is_business_admin(business_id)
                AND (role <> 'owner' OR has_role(business_id, ARRAY['owner'])));

CREATE POLICY "Admins edit members, only owners touch owners"
    ON business_members FOR UPDATE
    USING (is_business_admin(business_id)
           AND (role <> 'owner' OR has_role(business_id, ARRAY['owner'])))
    WITH CHECK (is_business_admin(business_id)
                AND (role <> 'owner' OR has_role(business_id, ARRAY['owner'])));

CREATE POLICY "Admins remove members, only owners remove owners"
    ON business_members FOR DELETE
    USING (is_business_admin(business_id)
           AND (role <> 'owner' OR has_role(business_id, ARRAY['owner'])));

-- ===========================================================================
-- Catalogue and availability
--
-- Readable by any member, writable by admins. Defect N-01: the spec's
-- `availability_rules` policy is `FOR SELECT USING (TRUE)`, which publishes
-- every tenant's staff roster and working hours to anyone holding the
-- publishable key. Membership is required here instead.
-- ===========================================================================

CREATE POLICY "Members read branches"
    ON branches FOR SELECT
    USING (is_business_member(business_id) OR is_platform_admin());
CREATE POLICY "Admins write branches"
    ON branches FOR ALL
    USING (is_business_admin(business_id))
    WITH CHECK (is_business_admin(business_id));

CREATE POLICY "Members read services"
    ON services FOR SELECT
    USING (is_business_member(business_id) OR is_platform_admin());
CREATE POLICY "Admins write services"
    ON services FOR ALL
    USING (is_business_admin(business_id))
    WITH CHECK (is_business_admin(business_id));

CREATE POLICY "Members read staff"
    ON staff_resources FOR SELECT
    USING (is_business_member(business_id) OR is_platform_admin());
CREATE POLICY "Admins write staff"
    ON staff_resources FOR ALL
    USING (is_business_admin(business_id))
    WITH CHECK (is_business_admin(business_id));

CREATE POLICY "Members read staff services"
    ON staff_services FOR SELECT
    USING (is_business_member(business_id) OR is_platform_admin());
CREATE POLICY "Admins write staff services"
    ON staff_services FOR ALL
    USING (is_business_admin(business_id))
    WITH CHECK (is_business_admin(business_id));

CREATE POLICY "Members read availability rules"
    ON availability_rules FOR SELECT
    USING (is_business_member(business_id) OR is_platform_admin());
CREATE POLICY "Admins write availability rules"
    ON availability_rules FOR ALL
    USING (is_business_admin(business_id))
    WITH CHECK (is_business_admin(business_id));

CREATE POLICY "Members read availability overrides"
    ON availability_overrides FOR SELECT
    USING (is_business_member(business_id) OR is_platform_admin());
CREATE POLICY "Admins write availability overrides"
    ON availability_overrides FOR ALL
    USING (is_business_admin(business_id))
    WITH CHECK (is_business_admin(business_id));

-- ===========================================================================
-- customers
--
-- No platform-admin clause (D-012): this table holds patient names, phone
-- numbers and free-text clinical notes.
--
-- Known remaining gap, by design: a `staff` member can currently read the
-- whole tenant customer list, not only the people they are treating.
-- Narrowing it needs an EXISTS against `bookings` on every row, which is
-- Phase 7's job alongside the rest of the RBAC split. It is recorded here
-- rather than left to be discovered.
-- ===========================================================================

CREATE POLICY "Members read tenant customers"
    ON customers FOR SELECT
    USING (is_business_member(business_id));

CREATE POLICY "Members create customers"
    ON customers FOR INSERT
    WITH CHECK (is_business_member(business_id));

CREATE POLICY "Members update customers"
    ON customers FOR UPDATE
    USING (is_business_member(business_id))
    WITH CHECK (is_business_member(business_id));

CREATE POLICY "Admins delete customers"
    ON customers FOR DELETE
    USING (is_business_admin(business_id));

-- ===========================================================================
-- bookings — defect B-23
--
-- The spec writes `ON bookings FOR ALL USING (is_business_member(business_id))`,
-- which contradicts its own RBAC matrix two sections earlier ("Service
-- Provider / Staff — Own Schedule Only"). As written, a part-time stylist can
-- read and rewrite every appointment in the salon.
--
-- The shape below is the plan's Phase 1 commitment: front desk and management
-- see the whole diary, a provider sees their own column of it. Phase 7 extends
-- the same expression to `booking_history` detail and the staff portal.
-- ===========================================================================

CREATE POLICY "Desk sees all bookings, providers see their own"
    ON bookings FOR SELECT
    USING (is_business_member(business_id)
           AND (has_role(business_id, ARRAY['owner', 'manager', 'receptionist'])
                OR staff_id = current_staff_id(business_id)));

CREATE POLICY "Desk books for anyone, providers only for themselves"
    ON bookings FOR INSERT
    WITH CHECK (is_business_member(business_id)
                AND (has_role(business_id, ARRAY['owner', 'manager', 'receptionist'])
                     OR staff_id = current_staff_id(business_id)));

-- USING gates which rows may be touched; WITH CHECK gates the result, so a
-- provider cannot hand their own appointment to a colleague and thereby edit a
-- row they could not have selected.
CREATE POLICY "Desk edits all bookings, providers only their own"
    ON bookings FOR UPDATE
    USING (is_business_member(business_id)
           AND (has_role(business_id, ARRAY['owner', 'manager', 'receptionist'])
                OR staff_id = current_staff_id(business_id)))
    WITH CHECK (is_business_member(business_id)
                AND (has_role(business_id, ARRAY['owner', 'manager', 'receptionist'])
                     OR staff_id = current_staff_id(business_id)));

CREATE POLICY "Booking history follows booking visibility"
    ON booking_history FOR SELECT
    USING (is_business_member(business_id)
           AND (has_role(business_id, ARRAY['owner', 'manager', 'receptionist'])
                OR EXISTS (SELECT 1 FROM bookings b
                           WHERE b.id = booking_history.booking_id
                             AND b.staff_id = current_staff_id(business_id))));

-- ===========================================================================
-- Waitlist, templates, logs
-- ===========================================================================

CREATE POLICY "Members read waitlist"
    ON waitlist_entries FOR SELECT
    USING (is_business_member(business_id));

CREATE POLICY "Desk writes waitlist"
    ON waitlist_entries FOR INSERT
    WITH CHECK (has_role(business_id, ARRAY['owner', 'manager', 'receptionist']));

CREATE POLICY "Desk updates waitlist"
    ON waitlist_entries FOR UPDATE
    USING (has_role(business_id, ARRAY['owner', 'manager', 'receptionist']))
    WITH CHECK (has_role(business_id, ARRAY['owner', 'manager', 'receptionist']));

CREATE POLICY "Admins delete waitlist entries"
    ON waitlist_entries FOR DELETE
    USING (is_business_admin(business_id));

CREATE POLICY "Members read notification templates"
    ON notification_templates FOR SELECT
    USING (is_business_member(business_id) OR is_platform_admin());

CREATE POLICY "Admins write notification templates"
    ON notification_templates FOR ALL
    USING (is_business_admin(business_id))
    WITH CHECK (is_business_admin(business_id));

-- Every row carries a customer's email address or push endpoint, so this is
-- desk-and-above rather than any member, and carries no platform-admin clause.
CREATE POLICY "Desk reads notification logs"
    ON notification_logs FOR SELECT
    USING (has_role(business_id, ARRAY['owner', 'manager', 'receptionist']));

-- ===========================================================================
-- Money
--
-- D-010 puts verification at the front desk, so receptionists both record and
-- verify. The control on theft is therefore not the role split but the audit
-- trail: `verified_by` names a user, and 0012 freezes the customer's claim so
-- a short payment cannot be quietly reconciled. A tenant that wants genuine
-- separation of duties — the person who takes the claim is not the person who
-- approves it — gets it in Phase 8 by narrowing this UPDATE to admins.
-- ===========================================================================

CREATE POLICY "Desk reads payments"
    ON payments FOR SELECT
    USING (has_role(business_id, ARRAY['owner', 'manager', 'receptionist'])
           OR is_platform_admin());

CREATE POLICY "Desk records payments"
    ON payments FOR INSERT
    WITH CHECK (has_role(business_id, ARRAY['owner', 'manager', 'receptionist']));

CREATE POLICY "Desk verifies payments"
    ON payments FOR UPDATE
    USING (has_role(business_id, ARRAY['owner', 'manager', 'receptionist']))
    WITH CHECK (has_role(business_id, ARRAY['owner', 'manager', 'receptionist']));

-- The tenant may read its own bill; only the platform issues or settles one.
CREATE POLICY "Admins read their invoices"
    ON subscription_invoices FOR SELECT
    USING (is_business_admin(business_id) OR is_platform_admin());

-- `platform_admins` has RLS enabled and deliberately no policy at all: with no
-- grant to anon or authenticated either, it is reachable only by the service
-- role and by is_platform_admin(), which runs as definer. A tenant cannot read
-- who the platform operators are, and cannot add themselves to the list.
