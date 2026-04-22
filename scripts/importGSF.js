#!/usr/bin/env node
// Import the GSF multi-source identity network from CSV seed data.
// Reads dw_account.csv, positions_topaz.csv, positions_emerald.csv from
// the sibling GSF_Semantic_Pipeline repo.
// Usage: node scripts/importGSF.js

const fs = require('fs');
const path = require('path');
const db = require('../server/db');

const SEED_DIR = path.resolve(__dirname, '../../GSF_Semantic_Pipeline/data/seed_v2');
const GRAPH_TYPE_NAME = 'GSF Multi-Source Identity';
const GRAPH_NAME = 'GSF Identity Network — 100 Accounts';

const NODE_TYPE_NAMES = {
  1: 'Canonical Account',
  2: 'Topaz Record',
  3: 'Emerald Record',
  4: 'Ruby Record',
};

function splitCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = splitCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  });
}

function ensureGraphType() {
  db.prepare('INSERT OR IGNORE INTO GraphType (name, description) VALUES (?, ?)').run(
    GRAPH_TYPE_NAME,
    'Canonical account hub linked to its three source-system representations (Topaz, Emerald, Ruby)'
  );
  return db.prepare('SELECT id FROM GraphType WHERE name = ?').get(GRAPH_TYPE_NAME).id;
}

function ensureNodeTypes(graphTypeId) {
  const map = {};
  for (const [group, name] of Object.entries(NODE_TYPE_NAMES)) {
    const g = parseInt(group, 10);
    let row = db.prepare(
      'SELECT id FROM NodeType WHERE graph_type_id = ? AND display_group = ?'
    ).get(graphTypeId, g);
    if (!row) {
      const info = db.prepare(
        'INSERT INTO NodeType (graph_type_id, name, display_group) VALUES (?, ?, ?)'
      ).run(graphTypeId, name, g);
      row = { id: info.lastInsertRowid };
    }
    map[g] = row.id;
  }
  return map;
}

function ensureLinkType(graphTypeId, purpose) {
  let row = db.prepare(
    'SELECT id FROM LinkType WHERE graph_type_id = ? AND name = ?'
  ).get(graphTypeId, purpose);
  if (!row) {
    const info = db.prepare(
      'INSERT INTO LinkType (graph_type_id, name) VALUES (?, ?)'
    ).run(graphTypeId, purpose);
    row = { id: info.lastInsertRowid };
  }
  return row.id;
}

function run() {
  const accounts = parseCSV(path.join(SEED_DIR, 'dw_account.csv'));
  const topazPositions = parseCSV(path.join(SEED_DIR, 'positions_topaz.csv'));
  const emeraldPositions = parseCSV(path.join(SEED_DIR, 'positions_emerald.csv'));

  // Aggregate Topaz MV by custodian account number
  const topazMV = {};
  for (const row of topazPositions) {
    const key = row['ACCT_NUM'];
    topazMV[key] = (topazMV[key] ?? 0) + parseFloat(row['MKT_VAL'] || 0);
  }

  // Aggregate Emerald MV by portfolio code
  const emeraldMV = {};
  for (const row of emeraldPositions) {
    const key = row['portfolioId'];
    emeraldMV[key] = (emeraldMV[key] ?? 0) + parseFloat(row['marketValue'] || 0);
  }

  const graphTypeId = ensureGraphType();
  const nodeTypeMap = ensureNodeTypes(graphTypeId);
  const appearsAsId = ensureLinkType(graphTypeId, 'Appears As');

  const existing = db.prepare(
    'SELECT id FROM Graph WHERE graph_type_id = ? AND name = ?'
  ).get(graphTypeId, GRAPH_NAME);
  if (existing) {
    console.log(`Already exists, skipping: "${GRAPH_NAME}"`);
    return;
  }

  const doImport = db.transaction(() => {
    const graphInfo = db.prepare(
      'INSERT INTO Graph (graph_type_id, name, status) VALUES (?, ?, ?)'
    ).run(graphTypeId, GRAPH_NAME, 'Active');
    const graphId = graphInfo.lastInsertRowid;

    let nodeCount = 0;
    let linkCount = 0;

    for (const account of accounts) {
      const { account_id, account_name, account_type, custodian_account_num, portfolio_code, fund_code } = account;

      const tMV = Math.round((topazMV[custodian_account_num] ?? 0) * 100) / 100;
      const eMV = Math.round((emeraldMV[portfolio_code] ?? 0) * 100) / 100;
      const mvDelta = Math.round((eMV - tMV) * 100) / 100;

      const canonicalInfo = db.prepare(
        'INSERT INTO Node (graph_id, node_type_id, label, status, metadata) VALUES (?, ?, ?, ?, ?)'
      ).run(
        graphId,
        nodeTypeMap[1],
        `${account_id}: ${account_name} (${account_type})`,
        'Active',
        JSON.stringify({ topaz_mv: tMV, emerald_mv: eMV, mv_delta: mvDelta })
      );
      nodeCount++;

      const spokes = [
        { group: 2, label: `Topaz: ${custodian_account_num}` },
        { group: 3, label: `Emerald: ${portfolio_code}` },
        { group: 4, label: `Ruby: ${fund_code}` },
      ];

      for (const spoke of spokes) {
        const spokeInfo = db.prepare(
          'INSERT INTO Node (graph_id, node_type_id, label, status) VALUES (?, ?, ?, ?)'
        ).run(graphId, nodeTypeMap[spoke.group], spoke.label, 'Active');
        nodeCount++;

        db.prepare(
          'INSERT INTO Link (graph_id, source_node_id, target_node_id, link_type_id, status) VALUES (?, ?, ?, ?, ?)'
        ).run(graphId, canonicalInfo.lastInsertRowid, spokeInfo.lastInsertRowid, appearsAsId, 'Active');
        linkCount++;
      }
    }

    return { nodeCount, linkCount };
  });

  const result = doImport();
  console.log(`Imported: "${GRAPH_NAME}" (${result.nodeCount} nodes, ${result.linkCount} links)`);
}

run();
