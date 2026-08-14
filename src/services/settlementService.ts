import { query, withClient } from '../db';
import {
  AuditInsertRow,
  BatchStatus,
  BatchStatusRow,
  DailySummaryItem,
  DailySummaryRow,
  ReconcileRequest,
  ReconcileResult,
  SummaryQuery,
} from '../types';
import { badRequest, conflict, notFound } from '../errors';

const VALID_BATCH_STATUSES: ReadonlySet<BatchStatus> = new Set([
  'open',
  'reconciled',
]);

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function parseStatusFilter(status: string | undefined): BatchStatus | null {
  if (status === undefined || status.trim() === '') {
    return null;
  }

  if (VALID_BATCH_STATUSES.has(status as BatchStatus)) {
    return status as BatchStatus;
  }

  throw badRequest("status must be one of: open, reconciled");
}

function centsToNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('Database returned an unsafe cents value');
  }
  return parsed;
}

export class SettlementService {
  async getDailySummary(input: SummaryQuery): Promise<DailySummaryItem[]> {
    if (!Number.isInteger(input.accountId) || input.accountId <= 0) {
      throw badRequest('accountId must be a positive integer');
    }
    if (!isValidIsoDate(input.from)) {
      throw badRequest('from must be a valid date in YYYY-MM-DD format');
    }
    if (!isValidIsoDate(input.to)) {
      throw badRequest('to must be a valid date in YYYY-MM-DD format');
    }
    if (input.from > input.to) {
      throw badRequest('from must be on or before to');
    }

    const status = parseStatusFilter(input.status);

    const sql = `
      WITH ledger_totals AS (
        SELECT le.batch_id,
               COALESCE(SUM(le.amount_cents) FILTER (WHERE le.entry_status = 'settled'), 0) AS settled_cents,
               COALESCE(SUM(le.amount_cents) FILTER (WHERE le.entry_status = 'pending'), 0) AS pending_cents
        FROM ledger_entries le
        GROUP BY le.batch_id
      ),
      fee_totals AS (
        SELECT bf.batch_id,
               COALESCE(SUM(bf.amount_cents), 0) AS fee_cents
        FROM batch_fees bf
        GROUP BY bf.batch_id
      )
      SELECT b.business_date::text AS business_date,
             COALESCE(SUM(COALESCE(lt.settled_cents, 0)), 0)::text AS settled_cents,
             COALESCE(SUM(COALESCE(lt.pending_cents, 0)), 0)::text AS pending_cents,
             COALESCE(SUM(COALESCE(ft.fee_cents, 0)), 0)::text AS fee_cents
      FROM settlement_batches b
      LEFT JOIN ledger_totals lt ON lt.batch_id = b.id
      LEFT JOIN fee_totals ft ON ft.batch_id = b.id
      WHERE b.account_id = $1
        AND b.business_date >= $2::date
        AND b.business_date <= $3::date
        AND ($4::text IS NULL OR b.status = $4::text)
      GROUP BY b.business_date
      ORDER BY b.business_date ASC
    `;

    const rows = await query<DailySummaryRow>(sql, [
      input.accountId,
      input.from,
      input.to,
      status,
    ]);

    return rows.map((r) => {
      const settled = centsToNumber(r.settled_cents);
      const pending = centsToNumber(r.pending_cents);
      const fee = centsToNumber(r.fee_cents);
      return {
        businessDate: r.business_date,
        settledCents: settled,
        pendingCents: pending,
        feeCents: fee,
        netCents: settled - fee,
      };
    });
  }

  async reconcileBatch(input: ReconcileRequest): Promise<ReconcileResult> {
    if (!Number.isInteger(input.batchId) || input.batchId <= 0) {
      throw badRequest('batchId must be a positive integer');
    }

    const reconciledBy = input.reconciledBy.trim();
    if (reconciledBy.length === 0) {
      throw badRequest('reconciledBy is required');
    }

    const note = input.note?.trim() === '' ? null : input.note ?? null;

    return withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const existing = await client.query<BatchStatusRow>(
          `SELECT id::text AS id, status
             FROM settlement_batches
            WHERE id = $1
            FOR UPDATE`,
          [input.batchId],
        );

        if (existing.rowCount === 0) {
          throw notFound('Batch not found');
        }

        const batch = existing.rows[0];
        if (batch.status === 'reconciled') {
          throw conflict('Batch is already reconciled');
        }

        await client.query(
          `UPDATE settlement_batches
              SET status = 'reconciled'
            WHERE id = $1
              AND status = 'open'`,
          [input.batchId],
        );

        const auditRows = await client.query<AuditInsertRow>(
          `INSERT INTO reconciliation_audit (batch_id, reconciled_by, note)
           VALUES ($1, $2, $3)
           RETURNING id::text AS id`,
          [input.batchId, reconciledBy, note],
        );

        await client.query('COMMIT');

        return {
          batchId: input.batchId,
          status: 'reconciled',
          auditId: Number(auditRows.rows[0].id),
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
  }
}
