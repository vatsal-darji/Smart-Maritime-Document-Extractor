import * as fs from 'node:fs';
import * as path from 'node:path';
import { pool } from './index';

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); //to run migrations in order

  const client = await pool.connect();

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`Running migration: ${file}`);
      await client.query(sql);
      console.log(`Done: ${file}`);
    }
    console.log('All migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();