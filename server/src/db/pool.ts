import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL ?? 'postgres://parlay:parlay@localhost:5432/parlay';

// Hosted Postgres (Neon, Vercel Postgres, Render) requires SSL and, on a serverless
// host, each function instance should hold few connections — many concurrent
// instances sharing one small pool each is what keeps the DB's connection limit
// from being exhausted. Prefer the provider's pooled ("pgbouncer") connection
// string in DATABASE_URL when running on Vercel.
const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

export const pool = new Pool({
  connectionString,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
  max: process.env.VERCEL ? 3 : 10,
  idleTimeoutMillis: process.env.VERCEL ? 10_000 : 30_000,
});
