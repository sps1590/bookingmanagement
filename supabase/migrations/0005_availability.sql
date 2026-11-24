-- ---------------------------------------------------------------------------
-- 0005 — Availability: weekly rules and dated overrides
--
-- `availability_rules` holds the repeating week (working hours and breaks).
-- `availability_overrides` holds exceptions for a specific date: a holiday, a
-- provider's leave, or shortened hours.
--
-- Times are stored as `TIME`, interpreted in the tenant's own
-- `businesses.timezone`. They are therefore wall-clock times, not instants,
-- which is correct: a clinic that opens at 10:00 opens at 10:00 on both sides
-- of a DST change. The conversion to `timestamptz` happens in the slot
-- generator (Phase 2), once, in one place.
--
-- Changes from the spec's DDL:
--
--   * M-15 — `availability_overrides` lets `is_closed = false` coexist with
--     NULL custom times, which says "open on this date, but with no hours".
--     The slot generator reads that as a closed day or as a crash depending on
--     the branch taken. A CHECK makes the row impossible.
--
--   * Overlap and duplicate protection. The spec allows the same rule to be
--     inserted repeatedly, and allows two working blocks that overlap, both of
--     which make the slot generator emit duplicate slots.
--
--   * Composite FKs to keep a rule's staff member inside the rule's tenant.
--
--   * N-01 is an RLS defect, not a DDL one, and is fixed in 0015: the spec's
--     `FOR SELECT USING (TRUE)` on this table publishes every tenant's staff
--     roster and working hours to anyone with an API key.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

-- Postgres ships no range type over `time`, and the overlap constraint below
-- needs one. Declared here rather than in 0001 because this is its only use.
CREATE TYPE timerange AS RANGE (subtype = time);

CREATE TABLE availability_rules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    staff_id    UUID NOT NULL,
    -- 0 = Sunday, matching Postgres `EXTRACT(DOW)` and JavaScript `getDay()`,
    -- so no off-by-one translation is needed at either boundary.
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time  TIME NOT NULL,
    end_time    TIME NOT NULL,
    is_break    BOOLEAN NOT NULL DEFAULT FALSE,
    work_range  TIMERANGE GENERATED ALWAYS AS (timerange(start_time, end_time, '[)')) STORED,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT availability_rules_end_after_start CHECK (end_time > start_time),
    CONSTRAINT availability_rules_staff_same_business
        FOREIGN KEY (business_id, staff_id) REFERENCES staff_resources (business_id, id)
        ON DELETE CASCADE,
    -- Two overlapping working blocks on one day make the slot generator emit
    -- the same slot twice; two overlapping breaks are merely meaningless. A
    -- block and a break are *expected* to overlap — that is what a break is —
    -- so the exclusion is partitioned by `is_break` rather than applied across
    -- the whole day.
    CONSTRAINT availability_rules_no_overlap EXCLUDE USING GIST (
        staff_id    WITH =,
        day_of_week WITH =,
        is_break    WITH =,
        work_range  WITH &&
    )
);

COMMENT ON COLUMN availability_rules.is_break IS
    'A break subtracts from the working block that contains it. Breaks are stored as rows rather than as a nested structure so an admin can add a second break without a schema change.';

CREATE TABLE availability_overrides (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    -- NULL means the whole business is affected, not one provider.
    staff_id          UUID,
    override_date     DATE NOT NULL,
    is_closed         BOOLEAN NOT NULL DEFAULT TRUE,
    custom_start_time TIME,
    custom_end_time   TIME,
    reason            TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Defect M-15. Either the date is closed, or it has a usable window.
    CONSTRAINT availability_overrides_open_needs_hours
        CHECK (is_closed
               OR (custom_start_time IS NOT NULL
                   AND custom_end_time IS NOT NULL
                   AND custom_end_time > custom_start_time)),
    CONSTRAINT availability_overrides_closed_has_no_hours
        CHECK (NOT is_closed OR (custom_start_time IS NULL AND custom_end_time IS NULL)),
    CONSTRAINT availability_overrides_staff_same_business
        FOREIGN KEY (business_id, staff_id) REFERENCES staff_resources (business_id, id)
        ON DELETE CASCADE
);

COMMENT ON TABLE availability_overrides IS
    'Dated exceptions to the weekly rules. A business-wide row (staff_id IS NULL) wins over a per-provider row for the same date; Phase 2 implements that precedence. M-14 (leave needing approval) is Phase 7.';

-- One statement per provider per date, and one business-wide statement per
-- date. Expressed as two partial indexes because a plain UNIQUE treats every
-- NULL staff_id as distinct, which would let a tenant declare the same holiday
-- fifty times.
CREATE UNIQUE INDEX availability_overrides_one_per_staff_date
    ON availability_overrides (business_id, staff_id, override_date)
    WHERE staff_id IS NOT NULL;

CREATE UNIQUE INDEX availability_overrides_one_per_business_date
    ON availability_overrides (business_id, override_date)
    WHERE staff_id IS NULL;

ALTER TABLE availability_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_overrides ENABLE ROW LEVEL SECURITY;
