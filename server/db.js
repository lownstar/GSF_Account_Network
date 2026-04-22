const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'db', 'network.db'));
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

module.exports = db;
