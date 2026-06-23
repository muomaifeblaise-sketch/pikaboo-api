/**
 * Production startup — runs migrations then starts the server.
 * Render calls: npm start → node dist/start.js
 */
import { pool } from './db/pool';
import fs from 'fs';
import path from 'path';

async function boot() {
  console.log('🔄  Running migrations…');
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf-8');
    await pool.query(sql);
    console.log('✅  Migrations done');
  } catch (err: unknown) {
    // If tables already exist Postgres throws "already exists" — that's fine
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already exists')) {
      console.log('ℹ️   Schema already up to date');
    } else {
      console.error('❌  Migration error:', msg);
      process.exit(1);
    }
  }

  // Now start the Express server
  await import('./index');
}

boot();
