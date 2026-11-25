-- ---------------------------------------------------------------------------
-- 0022 — What the admin console needs the database to enforce
--
-- Two things, both of which the spec assumes and neither of which exists.
--
-- ## Defect M-07 — nothing ever writes `customers.no_show_count`
--
-- The column is in the spec's DDL, the CRM screen displays it, and no code
-- path increments it. A counter that is always zero is worse than no counter:
-- the receptionist reads "0 no-shows" off the screen and treats a serial
-- no-show as a reliable patient.
--
-- It becomes a trigger rather than a line in `set_booking_status`, because the
-- status also changes from the booking list, from a future admin override, and
-- from whatever Phase 7's staff portal does. A rule that lives in one function
-- is a rule the next caller forgets. The increment that was in
-- `set_booking_status` is removed here so the count is maintained once.
--
-- It also decrements. Marking someone a no-show by mistake and correcting it
-- must not leave a permanent mark against them — this number decides whether a
-- clinic asks for a deposit.
--
-- ## Branch scoping (Phase 4 exit criterion)
--
-- "A manager of Branch A cannot see Branch B's bookings" is one of the MVP
-- gates, and nothing in the schema could express it: `business_members` has a
-- role and no branch, so every member of a two-branch business sees both.
--
-- `branch_id IS NULL` keeps meaning "the whole business", which is what every
-- existing row means and what a single-branch tenant always wants. A member
-- pinned to a branch sees that branch's bookings and the ones with no branch
-- at all — a booking whose branch was deleted must not become invisible to
-- everyone, or it silently disappears from the day it was supposed to happen.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

-- --- M-07: the no-show counter --------------------------------------------

CREATE FUNCTION sync_customer_no_shows()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.status = 'no_show' AND OLD.status IS DISTINCT FROM 'no_show' THEN
        UPDATE customers
        SET no_show_count = no_show_count + 1, updated_at = NOW()
        WHERE id = NEW.customer_id;
    ELSIF OLD.status = 'no_show' AND NEW.status IS DISTINCT FROM 'no_show' THEN
        -- greatest(0, …) rather than a CHECK violation: the column has a
        -- non-negative constraint, and a correction should not be able to
        -- fail the update it is correcting.
        UPDATE customers
        SET no_show_count = greatest(0, no_show_count - 1), updated_at = NOW()
        WHERE id = NEW.customer_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_sync_no_shows
    AFTER UPDATE OF status ON bookings
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION sync_customer_no_shows();

COMMENT ON FUNCTION sync_customer_no_shows() IS
    'Defect M-07. The column existed, the CRM displayed it, and nothing wrote it — so a serial no-show read as reliable. A trigger rather than a line in set_booking_status, because the status changes from several places and only one of them would have remembered.';

-- `set_booking_status` was doing this itself. Leaving both would count every
-- no-show twice, which is a harder bug to see than counting none.
CREATE OR REPLACE FUNCTION set_booking_status(
    p_booking_id UUID,
    p_new_status TEXT,
    p_reason     TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_business UUID;
    v_staff    UUID;
    v_old      TEXT;
BEGIN
    SELECT bk.business_id, bk.staff_id, bk.status
    INTO v_business, v_staff, v_old
    FROM bookings bk
    WHERE bk.id = p_booking_id;

    IF NOT FOUND THEN
        PERFORM booking_error('NOT_FOUND', 'No such booking.');
    END IF;

    IF NOT (has_role(v_business, ARRAY['owner', 'manager', 'receptionist'])
            OR (has_role(v_business, ARRAY['staff']) AND v_staff = current_staff_id(v_business))) THEN
        PERFORM booking_error('FORBIDDEN', 'You cannot change this booking.');
    END IF;

    IF v_old = p_new_status THEN
        RETURN v_old;
    END IF;

    IF NOT booking_status_transition_allowed(v_old, p_new_status) THEN
        PERFORM booking_error('INVALID_STATUS_TRANSITION',
            format('A booking cannot go from %s to %s.', v_old, p_new_status));
    END IF;

    -- The no-show count is maintained by bookings_sync_no_shows, not here.
    UPDATE bookings bk
    SET status = p_new_status, updated_at = NOW()
    WHERE bk.id = p_booking_id;

    INSERT INTO booking_history
        (business_id, booking_id, action, old_status, new_status,
         actor_type, actor_user_id, reason)
    VALUES (v_business, p_booking_id, 'status_changed', v_old, p_new_status,
            'staff', auth.uid(), p_reason);

    PERFORM queue_booking_notifications(p_booking_id);

    RETURN p_new_status;
END;
$$;

-- --- Branch scoping --------------------------------------------------------

ALTER TABLE business_members
    ADD COLUMN branch_id UUID;

COMMENT ON COLUMN business_members.branch_id IS
    'NULL means the whole business, which is what every single-branch tenant wants and what every row meant before this column existed. A non-NULL value pins the member to one branch.';

ALTER TABLE business_members
    ADD CONSTRAINT business_members_branch_same_business
        FOREIGN KEY (business_id, branch_id) REFERENCES branches (business_id, id)
        ON DELETE SET NULL;

-- Only admins may pin a member to a branch; letting a member set their own
-- would make the restriction advisory.
GRANT UPDATE (role, is_active, branch_id) ON business_members TO authenticated;

CREATE FUNCTION member_branch_id(p_business_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT branch_id FROM business_members
    WHERE business_id = p_business_id
      AND user_id = auth.uid()
      AND is_active;
$$;

COMMENT ON FUNCTION member_branch_id(UUID) IS
    'The branch this member is pinned to, or NULL for the whole business. NULL is the common case and the policies below read it as "no restriction".';

/**
 * Does this member's branch scope admit a booking at `p_branch_id`?
 *
 * Unpinned members see everything. A pinned member sees their branch, and
 * also bookings with no branch at all: `bookings.branch_id` is ON DELETE SET
 * NULL, so a closed branch would otherwise make its remaining appointments
 * invisible to every member of the business on the morning they are due.
 */
CREATE FUNCTION branch_in_scope(p_business_id UUID, p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT member_branch_id(p_business_id) IS NULL
        OR p_branch_id IS NULL
        OR p_branch_id = member_branch_id(p_business_id);
$$;

-- The booking policies gain the branch test. Everything else about them is
-- unchanged: front desk and management see the diary, a provider sees their
-- own column of it (defect B-23).
DROP POLICY "Desk sees all bookings, providers see their own" ON bookings;
CREATE POLICY "Desk sees all bookings, providers see their own"
    ON bookings FOR SELECT
    USING (is_business_member(business_id)
           AND branch_in_scope(business_id, branch_id)
           AND (has_role(business_id, ARRAY['owner', 'manager', 'receptionist'])
                OR staff_id = current_staff_id(business_id)));

DROP POLICY "Desk books for anyone, providers only for themselves" ON bookings;
CREATE POLICY "Desk books for anyone, providers only for themselves"
    ON bookings FOR INSERT
    WITH CHECK (is_business_member(business_id)
                AND branch_in_scope(business_id, branch_id)
                AND (has_role(business_id, ARRAY['owner', 'manager', 'receptionist'])
                     OR staff_id = current_staff_id(business_id)));

DROP POLICY "Desk edits all bookings, providers only their own" ON bookings;
CREATE POLICY "Desk edits all bookings, providers only their own"
    ON bookings FOR UPDATE
    USING (is_business_member(business_id)
           AND branch_in_scope(business_id, branch_id)
           AND (has_role(business_id, ARRAY['owner', 'manager', 'receptionist'])
                OR staff_id = current_staff_id(business_id)))
    WITH CHECK (is_business_member(business_id)
                AND branch_in_scope(business_id, branch_id)
                AND (has_role(business_id, ARRAY['owner', 'manager', 'receptionist'])
                     OR staff_id = current_staff_id(business_id)));

-- --- Grants ----------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION
    sync_customer_no_shows(),
    member_branch_id(UUID),
    branch_in_scope(UUID, UUID)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    member_branch_id(UUID),
    branch_in_scope(UUID, UUID)
    TO authenticated, service_role;
