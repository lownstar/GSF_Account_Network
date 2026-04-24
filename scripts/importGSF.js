#!/usr/bin/env node
// Import the GSF multi-source identity network from CSV seed data.
// Reads dw_account.csv + positions from the sibling GSF_Semantic_Pipeline repo.
// Creates one individual graph per account. Idempotent — re-running skips existing graphs.
// Usage: node scripts/importGSF.js

const fs = require('fs');
const path = require('path');
const db = require('../server/db');

const SIBLING_SEED = path.resolve(__dirname, '../../GSF_Semantic_Pipeline/data/seed_v2');
const SEED_DIR = process.env.SEED_DIR
  || (fs.existsSync(SIBLING_SEED) ? SIBLING_SEED : path.resolve(__dirname, '../data/seed'));
const GRAPH_TYPE_NAME = 'GSF Multi-Source Identity';

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

function buildSystemData(positions, keyField, fields) {
  // fields: { mv, cost_basis, unrealized_gl } — map CSV column name to output key
  // unrealized_gl may be null (Ruby doesn't report it)
  const data = {};
  for (const row of positions) {
    const key = row[keyField];
    if (!data[key]) {
      data[key] = {
        mv: 0,
        cost_basis: 0,
        unrealized_gl: fields.unrealized_gl !== null ? 0 : null,
        record_count: 0,
      };
    }
    data[key].mv         += parseFloat(row[fields.mv]         || 0);
    data[key].cost_basis += parseFloat(row[fields.cost_basis] || 0);
    if (fields.unrealized_gl !== null) {
      data[key].unrealized_gl += parseFloat(row[fields.unrealized_gl] || 0);
    }
    data[key].record_count += 1;
  }
  return data;
}

function insertAccount(graphId, account, nodeTypeMap, appearsAsId, topazData, emeraldData, rubyData) {
  const { account_id, account_name, account_type, custodian_account_num, portfolio_code, fund_code } = account;

  const EMPTY = { mv: 0, cost_basis: 0, unrealized_gl: 0, record_count: 0 };
  const EMPTY_RUBY = { mv: 0, cost_basis: 0, unrealized_gl: null, record_count: 0 };
  const t = topazData[custodian_account_num] ?? EMPTY;
  const e = emeraldData[portfolio_code]       ?? EMPTY;
  const r = rubyData[fund_code]               ?? EMPTY_RUBY;

  const rnd = v => v !== null ? Math.round(v * 100) / 100 : null;

  const tMV = rnd(t.mv), eMV = rnd(e.mv), rMV = rnd(r.mv);

  const canonicalInfo = db.prepare(
    'INSERT INTO Node (graph_id, node_type_id, label, status, metadata) VALUES (?, ?, ?, ?, ?)'
  ).run(
    graphId,
    nodeTypeMap[1],
    `${account_id}: ${account_name} (${account_type})`,
    'Active',
    JSON.stringify({
      topaz_mv: tMV,
      emerald_mv: eMV,
      ruby_mv: rMV,
      mv_delta: rnd(eMV - tMV),
      topaz_cost_basis:       rnd(t.cost_basis),
      emerald_cost_basis:     rnd(e.cost_basis),
      ruby_cost_basis:        rnd(r.cost_basis),
      topaz_unrealized_gl:    rnd(t.unrealized_gl),
      emerald_unrealized_gl:  rnd(e.unrealized_gl),
      topaz_record_count:   t.record_count,
      emerald_record_count: e.record_count,
      ruby_record_count:    r.record_count,
    })
  );

  const spokes = [
    {
      group: 2, label: `Topaz: ${custodian_account_num}`,
      metadata: { mv: tMV, system: 'Topaz',   cost_basis: rnd(t.cost_basis), unrealized_gl: rnd(t.unrealized_gl), record_count: t.record_count },
    },
    {
      group: 3, label: `Emerald: ${portfolio_code}`,
      metadata: { mv: eMV, system: 'Emerald', cost_basis: rnd(e.cost_basis), unrealized_gl: rnd(e.unrealized_gl), record_count: e.record_count },
    },
    {
      group: 4, label: `Ruby: ${fund_code}`,
      metadata: { mv: rMV, system: 'Ruby',    cost_basis: rnd(r.cost_basis), unrealized_gl: null,                 record_count: r.record_count },
    },
  ];

  for (const spoke of spokes) {
    const spokeInfo = db.prepare(
      'INSERT INTO Node (graph_id, node_type_id, label, status, metadata) VALUES (?, ?, ?, ?, ?)'
    ).run(graphId, nodeTypeMap[spoke.group], spoke.label, 'Active', JSON.stringify(spoke.metadata));

    db.prepare(
      'INSERT INTO Link (graph_id, source_node_id, target_node_id, link_type_id, status) VALUES (?, ?, ?, ?, ?)'
    ).run(graphId, canonicalInfo.lastInsertRowid, spokeInfo.lastInsertRowid, appearsAsId, 'Active');
  }
}

function run() {
  const accounts         = parseCSV(path.join(SEED_DIR, 'dw_account.csv'));
  const topazPositions   = parseCSV(path.join(SEED_DIR, 'positions_topaz.csv'));
  const emeraldPositions = parseCSV(path.join(SEED_DIR, 'positions_emerald.csv'));
  const rubyPositions    = parseCSV(path.join(SEED_DIR, 'positions_ruby.csv'));

  const topazData   = buildSystemData(topazPositions,   'ACCT_NUM',    { mv: 'MKT_VAL',        cost_basis: 'COST_BASIS', unrealized_gl: 'UNRLZD_GL'      });
  const emeraldData = buildSystemData(emeraldPositions, 'portfolioId', { mv: 'marketValue',     cost_basis: 'lotCostBasis', unrealized_gl: 'unrealizedPnL' });
  const rubyData    = buildSystemData(rubyPositions,    'fund_code',   { mv: 'total_nav_value', cost_basis: 'book_cost',   unrealized_gl: null             });

  const graphTypeId  = ensureGraphType();
  const nodeTypeMap  = ensureNodeTypes(graphTypeId);
  const appearsAsId  = ensureLinkType(graphTypeId, 'Appears As');

  let created = 0;
  let skipped = 0;

  for (const account of accounts) {
    const graphName = `${account.account_id}: ${account.account_name} (${account.account_type})`;
    const exists = db.prepare(
      'SELECT id FROM Graph WHERE graph_type_id = ? AND name = ?'
    ).get(graphTypeId, graphName);

    if (exists) {
      skipped++;
      continue;
    }

    db.transaction(() => {
      const { lastInsertRowid: graphId } = db.prepare(
        'INSERT INTO Graph (graph_type_id, name, status) VALUES (?, ?, ?)'
      ).run(graphTypeId, graphName, 'Active');
      insertAccount(graphId, account, nodeTypeMap, appearsAsId, topazData, emeraldData, rubyData);
    })();
    created++;
  }

  if (created > 0) console.log(`Imported: ${created} individual account graphs (4 nodes, 3 links each)`);
  if (skipped > 0) console.log(`Skipped: ${skipped} individual graphs already in DB`);
}

if (require.main === module) run();
module.exports = { run };
