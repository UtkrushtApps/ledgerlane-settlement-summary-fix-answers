import http from 'http';
import { pool, closePool } from './db';
import { buildRouter } from './routes';

const PORT = 3000;

async function main(): Promise<void> {
  const router = buildRouter();

  const server = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    void router(req, res);
  });

  server.listen(PORT, () => {
    console.log(`LedgerLane settlement service listening on port ${PORT}`);
  });

  const shutdown = async (): Promise<void> => {
    server.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

pool
  .query('SELECT 1')
  .then(() => main())
  .catch((err) => {
    console.error('Failed to start service', err);
    process.exit(1);
  });
