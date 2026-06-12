// ─────────────────────────────────────────────────────────────
// db/migrations/run.js
// Database migration runner
//
// Reads the migration SQL file and executes it using the pg pool
// if DATABASE_URL is set. Safe to run repeatedly (idempotent).
// ─────────────────────────────────────────────────────────────

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigration() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('⚠️  DATABASE_URL not set. Skipping migration execution (using mock mode).');
    return;
  }

  console.log('🔌 Connecting to PostgreSQL to run migrations...');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('supabase') ? { rejectUnauthorized: false } : false,
  });

  try {
    const files = fs.readdirSync(__dirname)
      .filter(f => f.endsWith('.sql') && /^\d+_.+/.test(f))
      .sort();

    for (const file of files) {
      const migrationSqlPath = path.join(__dirname, file);
      const sql = fs.readFileSync(migrationSqlPath, 'utf8');

      console.log(`🚀 Running migration SQL from ${file}...`);
      await pool.query(sql);
      console.log(`✅ Migration ${file} successfully completed!`);
    }
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
