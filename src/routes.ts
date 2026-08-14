import { IncomingMessage, ServerResponse } from 'http';
import { toErrorBody, badRequest, notFound } from './errors';
import { SettlementService } from './services/settlementService';

const service = new SettlementService();

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
}

export function buildRouter() {
  return async function route(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean);

      if (
        req.method === 'GET' &&
        parts.length === 4 &&
        parts[0] === 'api' &&
        parts[1] === 'accounts' &&
        parts[3] === 'settlement-summary'
      ) {
        const accountId = Number(parts[2]);
        const from = url.searchParams.get('from') ?? '';
        const to = url.searchParams.get('to') ?? '';
        const status = url.searchParams.get('status') ?? undefined;
        const result = await service.getDailySummary({
          accountId,
          from,
          to,
          status,
        });
        sendJson(res, 200, { items: result });
        return;
      }

      if (
        req.method === 'POST' &&
        parts.length === 4 &&
        parts[0] === 'api' &&
        parts[1] === 'batches' &&
        parts[3] === 'reconcile'
      ) {
        const batchId = Number(parts[2]);
        const body = await readBody(req);
        if (!isJsonObject(body)) {
          throw badRequest('Request body must be a JSON object');
        }

        const reconciledBy =
          typeof body.reconciledBy === 'string' ? body.reconciledBy : '';
        const note = typeof body.note === 'string' ? body.note : undefined;
        const result = await service.reconcileBatch({
          batchId,
          reconciledBy,
          note,
        });
        sendJson(res, 200, result);
        return;
      }

      throw notFound('Route not found');
    } catch (err) {
      const { status, body } = toErrorBody(err);
      sendJson(res, status, body);
    }
  };
}
