-- LedgerLane settlement reconciliation schema and seed data.
-- Business context: merchants receive settlements in batches; each batch
-- contains ledger entries (settled or pending) and one or more fee lines
-- charged by the payment processor. Reconciliation marks a batch as matched
-- against the bank deposit and records an audit trail.

SET client_min_messages = WARNING;

CREATE TABLE accounts (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    merchant_name TEXT NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'USD',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settlement_batches (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id    BIGINT NOT NULL REFERENCES accounts(id),
    business_date DATE NOT NULL,
    status        TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'reconciled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_batches_account_date ON settlement_batches(account_id, business_date);

CREATE TABLE ledger_entries (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id     BIGINT NOT NULL REFERENCES settlement_batches(id),
    amount_cents BIGINT NOT NULL,
    entry_status TEXT NOT NULL
        CHECK (entry_status IN ('settled', 'pending')),
    posted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_batch ON ledger_entries(batch_id);

CREATE TABLE batch_fees (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id     BIGINT NOT NULL REFERENCES settlement_batches(id),
    fee_type     TEXT NOT NULL
        CHECK (fee_type IN ('processing', 'chargeback_reserve', 'interchange')),
    amount_cents BIGINT NOT NULL,
    charged_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fees_batch ON batch_fees(batch_id);

CREATE TABLE reconciliation_audit (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id      BIGINT NOT NULL REFERENCES settlement_batches(id),
    reconciled_by TEXT NOT NULL,
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    note          TEXT
);

-- Exactly one successful reconciliation audit record is allowed per batch.
-- The service also uses row locks/transactions so callers receive typed
-- conflicts instead of depending on this constraint for normal control flow.
CREATE UNIQUE INDEX ux_audit_batch ON reconciliation_audit(batch_id);

-- Seed accounts
INSERT INTO accounts (merchant_name, currency)
VALUES
    ('Northwind Coffee Co', 'USD'),
    ('Baltic Apparel Ltd', 'EUR'),
    ('Cascade Outdoor Supply', 'USD');

-- Seed batches across several business days for each account.
INSERT INTO settlement_batches (account_id, business_date, status)
SELECT a.id,
       (DATE '2024-05-01' + (g % 12)),
       CASE WHEN g % 7 = 0 THEN 'reconciled' ELSE 'open' END
FROM accounts a
CROSS JOIN generate_series(0, 40) AS g;

-- Seed ledger entries: each batch gets several settled and pending entries.
INSERT INTO ledger_entries (batch_id, amount_cents, entry_status, posted_at)
SELECT b.id,
       ((b.id * 13 + s * 97) % 90000) + 500,
       CASE WHEN s % 3 = 0 THEN 'pending' ELSE 'settled' END,
       now() - (s || ' hours')::interval
FROM settlement_batches b
CROSS JOIN generate_series(1, 6) AS s;

-- Seed fee lines: many batches carry MULTIPLE fee lines of different types.
INSERT INTO batch_fees (batch_id, fee_type, amount_cents, charged_at)
SELECT b.id, 'processing', ((b.id * 7) % 1500) + 100, now()
FROM settlement_batches b;

INSERT INTO batch_fees (batch_id, fee_type, amount_cents, charged_at)
SELECT b.id, 'interchange', ((b.id * 11) % 900) + 50, now()
FROM settlement_batches b
WHERE b.id % 2 = 0;

INSERT INTO batch_fees (batch_id, fee_type, amount_cents, charged_at)
SELECT b.id, 'chargeback_reserve', ((b.id * 5) % 600) + 25, now()
FROM settlement_batches b
WHERE b.id % 3 = 0;

-- Seed a small amount of prior audit history for already-reconciled batches.
INSERT INTO reconciliation_audit (batch_id, reconciled_by, note)
SELECT b.id, 'system_backfill', 'initial reconciliation'
FROM settlement_batches b
WHERE b.status = 'reconciled';
