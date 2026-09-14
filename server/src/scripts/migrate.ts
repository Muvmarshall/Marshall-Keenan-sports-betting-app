import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf-8');
  await pool.query(sql);
  console.log('Schema applied.');
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
