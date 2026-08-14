export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export const dbConfig: DbConfig = {
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? '5432'),
  user: process.env.PGUSER ?? 'ledgerlane',
  password: process.env.PGPASSWORD ?? 'ledgerlane_pw',
  database: process.env.PGDATABASE ?? 'ledgerlane',
};
