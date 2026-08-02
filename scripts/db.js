const Database = require('better-sqlite3');
const path = require('path');

// Writable connection — used only by the seed scripts, which run as a separate
// process before the web server starts. The server itself uses server/db.js,
// which opens the same file read-only.
const DB_FILE = process.env.DB_PATH || path.join(__dirname, '..', 'db', 'network.db');

const db = new Database(DB_FILE);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

module.exports = db;
