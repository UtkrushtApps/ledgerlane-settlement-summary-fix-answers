export type BatchStatus = 'open' | 'reconciled';

export interface DailySummaryRow {
  business_date: string;
  settled_cents: string;
  pending_cents: string;
  fee_cents: string;
}

export interface DailySummaryItem {
  businessDate: string;
  settledCents: number;
  pendingCents: number;
  feeCents: number;
  netCents: number;
}

export interface SummaryQuery {
  accountId: number;
  from: string;
  to: string;
  status?: string;
}

export interface ReconcileRequest {
  batchId: number;
  reconciledBy: string;
  note?: string;
}

export interface ReconcileResult {
  batchId: number;
  status: BatchStatus;
  auditId: number;
}

export interface BatchStatusRow {
  id: string;
  status: BatchStatus;
}

export interface AuditInsertRow {
  id: string;
}
