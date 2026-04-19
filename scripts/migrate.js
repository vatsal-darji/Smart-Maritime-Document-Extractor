#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config();

const migrationsDir = path.join(__dirname, "..", "src", "db", "migrations");
const direction = process.argv[2] || "up";

if (!["up", "down"].includes(direction)) {
  console.error('Usage: node scripts/migrate.js [up|down]');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const isSSL = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "uat";

const pool = new Pool({
  connectionString,
  ssl: isSSL ? { rejectUnauthorized: false } : false,
});

function getMigrationFiles(suffix) {
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(suffix))
    .sort();
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function migrateUp(client) {
  const files = getMigrationFiles(".up.sql");
  const applied = await client.query("SELECT name FROM schema_migrations");
  const appliedNames = new Set(applied.rows.map((row) => row.name));

  for (const file of files) {
    if (appliedNames.has(file)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}

async function migrateDown(client) {
  const result = await client.query(
    "SELECT name FROM schema_migrations ORDER BY applied_at DESC, id DESC LIMIT 1",
  );

  if (result.rows.length === 0) {
    console.log("No applied migrations found");
    return;
  }

  const upFile = result.rows[0].name;
  const downFile = upFile.replace(/\.up\.sql$/, ".down.sql");
  const downPath = path.join(migrationsDir, downFile);

  if (!fs.existsSync(downPath)) {
    throw new Error(`Missing down migration for ${upFile}`);
  }

  const sql = fs.readFileSync(downPath, "utf8");
  console.log(`Reverting ${upFile}`);

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("DELETE FROM schema_migrations WHERE name = $1", [upFile]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);

    if (direction === "up") {
      await migrateUp(client);
    } else {
      await migrateDown(client);
    }

    console.log(`Migration ${direction} completed`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
