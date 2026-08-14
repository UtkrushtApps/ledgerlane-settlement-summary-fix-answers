# Solution Steps

1. Add strict request validation before any SQL executes: verify numeric path IDs are positive integers, `from` and `to` are real `YYYY-MM-DD` dates, `from <= to`, and any optional `status` filter is either `open` or `reconciled`. Throw `badRequest(...)` so these failures consistently serialize as typed 400 responses.

2. Fix the daily summary query by never joining raw ledger rows directly to raw fee rows. Aggregate ledger entries per batch in one CTE and fees per batch in another CTE, then join those one-row-per-batch totals to `settlement_batches` and sum by `business_date`. This prevents multiple fee lines from multiplying settled/pending ledger amounts.

3. Keep the summary SQL parameterized with `$1`, `$2`, `$3`, and `$4`, cast date parameters to `date`, use deterministic `ORDER BY b.business_date ASC`, and map PostgreSQL bigint text values to TypeScript numbers in one place.

4. Make reconcile validation stable by rejecting invalid batch IDs and blank `reconciledBy` values with typed 400 errors before starting business logic.

5. Make reconciliation atomic by using one database client and an explicit transaction: `BEGIN`, read the target batch with `SELECT ... FOR UPDATE`, update the batch, insert the audit row, then `COMMIT`; on any error, `ROLLBACK` and rethrow.

6. Make reconciliation idempotent under concurrent requests by checking the locked batch status. The first caller locks an open batch and reconciles it; a concurrent/repeated caller waits, then sees `status = 'reconciled'` and receives a typed 409 conflict without inserting another audit row.

7. Optionally enforce the invariant at the database level for fresh environments by adding a unique index on `reconciliation_audit(batch_id)`, while still relying on the transaction and row lock for clean conflict behavior.

8. Update routing to pass the optional `status` query parameter into the service and to ensure reconcile request bodies are JSON objects, preventing malformed bodies from becoming generic 500 errors.

9. Run `npm run typecheck` or `npm run build`, start the stack, verify summaries against separate per-batch ledger/fee aggregates, then reconcile the same open batch twice to confirm the first succeeds and the second returns a typed conflict with no duplicate audit rows.

