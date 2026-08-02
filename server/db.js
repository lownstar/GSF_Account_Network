const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_FILE = process.env.DB_PATH || path.join(__dirname, '..', 'db', 'network.db');

if (!fs.existsSync(DB_FILE)) {
  console.error(
    `Database not found at ${DB_FILE}\n` +
    `The web server opens the database read-only and cannot create it.\n` +
    `Run the seeder first:  npm run seed`
  );
  process.exit(1);
}

// Read-only by design: the web server serves a static, pre-seeded dataset and
// must never be able to modify it. Writes belong to scripts/db.js, which the
// seeder uses in a separate process before the server starts.
//
// No journal_mode pragma here — setting it requires write access, and WAL is
// already persisted in the database file by the seeder.
const db = new Database(DB_FILE, { readonly: true });

module.exports = db;
