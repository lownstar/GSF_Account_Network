#!/usr/bin/env node
// Startup seeder — initializes schema if needed, then imports all graph data.
// Idempotent: safe to run on every deploy; all importers skip existing records.
// Usage: node scripts/seed.js

const fs   = require('fs');
const path = require('path');
const db   = require('../server/db');

function initSchema() {
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='Graph'"
  ).get();
  if (tableExists) return;

  console.log('Initializing schema...');
  const sql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  db.exec(sql);
  console.log('Schema ready.');
}

function run() {
  initSchema();
  require('./importGsfTest').run();
  require('./importGSF').run();
  require('./importGSFHierarchy').run();
}

run();
