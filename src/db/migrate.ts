/**
 * PIKABOO — Database migration runner
 * Usage: npm run db:migrate
 */
import fs from 'fs';
import path from 'path';
import { pool } from './pool';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  console.log('🗃  Connecting to database…');
  const client = await pool.connect();

  try {
    console.log('📋  Running schema migration…');
    await client.query(sql);
    console.log('✅  Migration complete.');
  } catch (err) {
    console.error('❌  Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
