-- ---------------------------------------------------------------------------
-- 0010 — Payments and subscription invoices
--
-- Defect B-24: the spec sells booking deposits and three subscription tiers,
-- and defines no table for either. These are created now, before anything is
-- live, precisely so that Phase 8 never has to add a foreign key to a
-- `bookings` table that already holds a clinic's appointment history.
--
-- Nothing here is read or written until Phase 8.
--
-- ## No gateway (docs/DECISIONS.md D-010)
--
-- Stripe cannot pay out in Bangladesh; bKash and SSLCommerz merchant accounts
-- need business registration plus setup and per-transaction fees. So money
-- moves outside the platform: the customer sends it to the tenant's own
-- bKash/Nagad number and types in the transaction id, and a receptionist
-- checks it against the statement. That is how most small businesses in
-- Bangladesh already work.
--
-- What a manual flow loses is every guard a gateway gives away for free, and
-- those have to be put back by hand. This is the one place in the product
-- where a dishonest employee can take money, so the schema carries them:
--
--   * `provider_txn_id` is unique per tenant, enforced by an index rather than
--     by a UI check, so the same bKash receipt cannot be used for two
--     deposits.
--   * `amount_expected` is stored next to `amount_claimed`, so the desk sees
--     "customer says 500, service needs 1000" instead of discovering it later.
--   * `verified_by` names a user, not a role, so "who approved this" has an
--     answer.
--   * A trigger in 0012 freezes `provider_txn_id` and `amount_claimed` after
--     insert — what the customer stated is evidence, and evidence that staff
--     can edit is not evidence.
--
-- Rows are never deleted. `authenticated` is granted no DELETE in 0015.
-- ---------------------------------------------------------------------------

SET search_path = public, extensions, pg_temp;

CREATE TABLE payments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id      UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    booking_id       UUID,
    customer_id      UUID,

    method           TEXT NOT NULL
                         CHECK (method IN ('bkash', 'nagad', 'rocket', 'bank_transfer',
                                           'cash', 'card_manual')),
    purpose          TEXT NOT NULL DEFAULT 'deposit'
                         CHECK (purpose IN ('deposit', 'balance', 'full')),

    -- NULL for cash taken at the desk: there is no receipt to quote.
    provider_txn_id  TEXT CHECK (provider_txn_id IS NULL
                                 OR length(trim(provider_txn_id)) BETWEEN 4 AND 64),
    -- The number the customer paid from, for matching against the statement.
    payer_phone      TEXT CHECK (payer_phone IS NULL OR payer_phone ~ '^\+[1-9][0-9]{7,14}$'),

    amount_expected  NUMERIC(10, 2) NOT NULL CHECK (amount_expected >= 0),
    amount_claimed   NUMERIC(10, 2) NOT NULL CHECK (amount_claimed >= 0),
    amount_verified  NUMERIC(10, 2) CHECK (amount_verified IS NULL OR amount_verified >= 0),
    currency         TEXT NOT NULL DEFAULT 'BDT' CHECK (currency ~ '^[A-Z]{3}$'),

    status           TEXT NOT NULL DEFAULT 'claimed'
                         CHECK (status IN ('claimed', 'verified', 'rejected', 'refunded')),
    verified_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    verified_at      TIMESTAMPTZ,
    rejection_reason TEXT,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A decision without a decider is not an audit trail.
    CONSTRAINT payments_decision_is_attributed
        CHECK (status IN ('claimed')
               OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)),
    CONSTRAINT payments_verified_has_amount
        CHECK (status <> 'verified' OR amount_verified IS NOT NULL),
    CONSTRAINT payments_rejected_has_reason
        CHECK (status <> 'rejected' OR length(trim(coalesce(rejection_reason, ''))) > 0),
    -- Cash has no transaction id; everything else must quote one.
    CONSTRAINT payments_digital_has_txn_id
        CHECK (method = 'cash' OR provider_txn_id IS NOT NULL),

    CONSTRAINT payments_booking_same_business
        FOREIGN KEY (business_id, booking_id) REFERENCES bookings (business_id, id)
        ON DELETE SET NULL,
    CONSTRAINT payments_customer_same_business
        FOREIGN KEY (business_id, customer_id) REFERENCES customers (business_id, id)
        ON DELETE SET NULL
);

COMMENT ON TABLE payments IS
    'Manually verified customer payments (D-010). Append-and-amend only: no DELETE grant, and 0012 freezes the customer''s claim.';
COMMENT ON COLUMN payments.amount_expected IS
    'What the service required at the time of claiming. Stored rather than derived so a later price change cannot retroactively make a verified payment look short.';

-- One bKash receipt, one payment. Per tenant, because two unrelated clinics
-- can legitimately see the same id from different wallets.
CREATE UNIQUE INDEX payments_one_txn_per_business
    ON payments (business_id, provider_txn_id)
    WHERE provider_txn_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Subscription invoices: what the tenant owes the platform.
--
-- Also manual. The platform owner reads these, confirms the transfer landed,
-- and marks them paid. Plan *enforcement* — staff caps, booking caps, feature
-- flags — is real code in Phase 8; only the money movement is by hand.
-- ---------------------------------------------------------------------------
CREATE TABLE subscription_invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    plan_id         UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    invoice_number  TEXT NOT NULL UNIQUE,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    amount_due      NUMERIC(10, 2) NOT NULL CHECK (amount_due >= 0),
    amount_paid     NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    currency        TEXT NOT NULL DEFAULT 'BDT' CHECK (currency ~ '^[A-Z]{3}$'),
    status          TEXT NOT NULL DEFAULT 'issued'
                        CHECK (status IN ('draft', 'issued', 'paid', 'overdue', 'void')),
    method          TEXT CHECK (method IS NULL
                                OR method IN ('bkash', 'nagad', 'rocket',
                                              'bank_transfer', 'cash')),
    provider_txn_id TEXT,
    verified_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    verified_at     TIMESTAMPTZ,
    due_date        DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT subscription_invoices_period_ordered CHECK (period_end > period_start),
    CONSTRAINT subscription_invoices_paid_is_attributed
        CHECK (status <> 'paid' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)),
    UNIQUE (business_id, period_start, plan_id)
);

COMMENT ON TABLE subscription_invoices IS
    'Platform billing to the tenant. The tenant may read its own; only the platform may write. There is no `sms_topups` table — the spec had one, and with no SMS channel (D-009) there is nothing to top up.';

ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;
