#!/usr/bin/env node
// Import GSF client hierarchy graphs from CSV seed data.
// Creates one graph per client (25 total), each showing the 3-tier structure:
//   Client/Household hub → Canonical Account nodes → Source record spokes
// Idempotent — re-running skips existing graphs.
// Usage: node scripts/importGSFHierarchy.js

const fs = require('fs');
const path = require('path');
const db = require('../server/db');

const SEED_DIR = path.resolve(__dirname, '../../GSF_Semantic_Pipeline/data/seed_v2');
const GRAPH_TYPE_NAME = 'GSF Client Hierarchy';
const CLIENT_GROUP = 8; // display_group for Client/Household (purple in NODE_COLORS)

const NODE_TYPE_NAMES = {
  1: 'Canonical Account',
  2: 'Topaz Record',
  3: 'Emerald Record',
  4: 'Ruby Record',
  [CLIENT_GROUP]: 'Client/Household',
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
    'Client/household hub with canonical account nodes and their three source-system representations'
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

function run() {
  const clients          = parseCSV(path.join(SEED_DIR, 'dw_client.csv'));
  const accounts         = parseCSV(path.join(SEED_DIR, 'dw_account.csv'));
  const topazPositions   = parseCSV(path.join(SEED_DIR, 'positions_topaz.csv'));
  const emeraldPositions = parseCSV(path.join(SEED_DIR, 'positions_emerald.csv'));
  const rubyPositions    = parseCSV(path.join(SEED_DIR, 'positions_ruby.csv'));

  const topazData   = buildSystemData(topazPositions,   'ACCT_NUM',    { mv: 'MKT_VAL',        cost_basis: 'COST_BASIS',   unrealized_gl: 'UNRLZD_GL'      });
  const emeraldData = buildSystemData(emeraldPositions, 'portfolioId', { mv: 'marketValue',     cost_basis: 'lotCostBasis', unrealized_gl: 'unrealizedPnL'  });
  const rubyData    = buildSystemData(rubyPositions,    'fund_code',   { mv: 'total_nav_value', cost_basis: 'book_cost',    unrealized_gl: null             });

  const graphTypeId = ensureGraphType();
  const nodeTypeMap = ensureNodeTypes(graphTypeId);
  const appearsAsId = ensureLinkType(graphTypeId, 'Appears As');
  const managesId   = ensureLinkType(graphTypeId, 'Manages');

  const accountsByClient = {};
  for (const account of accounts) {
    const cid = account.client_id;
    if (!accountsByClient[cid]) accountsByClient[cid] = [];
    accountsByClient[cid].push(account);
  }

  const EMPTY       = { mv: 0, cost_basis: 0, unrealized_gl: 0,    record_count: 0 };
  const EMPTY_RUBY  = { mv: 0, cost_basis: 0, unrealized_gl: null, record_count: 0 };
  const rnd = v => v !== null ? Math.round(v * 100) / 100 : null;
  const sum = (arr, fn) => arr.reduce((acc, x) => acc + (fn(x) ?? 0), 0);

  let created = 0;
  let skipped = 0;

  for (const client of clients) {
    const graphName = `GSF Hierarchy: ${client.client_name} (${client.client_id})`;
    const exists = db.prepare(
      'SELECT id FROM Graph WHERE graph_type_id = ? AND name = ?'
    ).get(graphTypeId, graphName);

    if (exists) {
      skipped++;
      continue;
    }

    const clientAccounts = accountsByClient[client.client_id] ?? [];

    db.transaction(() => {
      const { lastInsertRowid: graphId } = db.prepare(
        'INSERT INTO Graph (graph_type_id, name, status) VALUES (?, ?, ?)'
      ).run(graphTypeId, graphName, 'Active');

      // Rollup all metrics across accounts for the client hub
      const tTotals = {
        mv:           rnd(sum(clientAccounts, a => (topazData[a.custodian_account_num] ?? EMPTY).mv)),
        cost_basis:   rnd(sum(clientAccounts, a => (topazData[a.custodian_account_num] ?? EMPTY).cost_basis)),
        unrealized_gl:rnd(sum(clientAccounts, a => (topazData[a.custodian_account_num] ?? EMPTY).unrealized_gl)),
        record_count:      sum(clientAccounts, a => (topazData[a.custodian_account_num] ?? EMPTY).record_count),
      };
      const eTotals = {
        mv:           rnd(sum(clientAccounts, a => (emeraldData[a.portfolio_code] ?? EMPTY).mv)),
        cost_basis:   rnd(sum(clientAccounts, a => (emeraldData[a.portfolio_code] ?? EMPTY).cost_basis)),
        unrealized_gl:rnd(sum(clientAccounts, a => (emeraldData[a.portfolio_code] ?? EMPTY).unrealized_gl)),
        record_count:      sum(clientAccounts, a => (emeraldData[a.portfolio_code] ?? EMPTY).record_count),
      };
      const rTotals = {
        mv:           rnd(sum(clientAccounts, a => (rubyData[a.fund_code] ?? EMPTY_RUBY).mv)),
        cost_basis:   rnd(sum(clientAccounts, a => (rubyData[a.fund_code] ?? EMPTY_RUBY).cost_basis)),
        record_count:      sum(clientAccounts, a => (rubyData[a.fund_code] ?? EMPTY_RUBY).record_count),
      };

      const { lastInsertRowid: clientNodeId } = db.prepare(
        'INSERT INTO Node (graph_id, node_type_id, label, status, metadata) VALUES (?, ?, ?, ?, ?)'
      ).run(
        graphId,
        nodeTypeMap[CLIENT_GROUP],
        `${client.client_id}: ${client.client_name} (${client.client_type})`,
        'Active',
        JSON.stringify({
          account_count:          clientAccounts.length,
          total_topaz_mv:         tTotals.mv,
          total_emerald_mv:       eTotals.mv,
          total_ruby_mv:          rTotals.mv,
          mv_delta:               rnd(eTotals.mv - tTotals.mv),
          total_topaz_cost_basis:    tTotals.cost_basis,
          total_emerald_cost_basis:  eTotals.cost_basis,
          total_ruby_cost_basis:     rTotals.cost_basis,
          total_topaz_unrealized_gl:   tTotals.unrealized_gl,
          total_emerald_unrealized_gl: eTotals.unrealized_gl,
          topaz_record_count:   tTotals.record_count,
          emerald_record_count: eTotals.record_count,
          ruby_record_count:    rTotals.record_count,
        })
      );

      for (const acct of clientAccounts) {
        const t = topazData[acct.custodian_account_num] ?? EMPTY;
        const e = emeraldData[acct.portfolio_code]       ?? EMPTY;
        const r = rubyData[acct.fund_code]               ?? EMPTY_RUBY;

        const tMV = rnd(t.mv), eMV = rnd(e.mv), rMV = rnd(r.mv);

        const { lastInsertRowid: canonicalNodeId } = db.prepare(
          'INSERT INTO Node (graph_id, node_type_id, label, status, metadata) VALUES (?, ?, ?, ?, ?)'
        ).run(
          graphId,
          nodeTypeMap[1],
          `${acct.account_id}: ${acct.account_name} (${acct.account_type})`,
          'Active',
          JSON.stringify({
            topaz_mv: tMV, emerald_mv: eMV, ruby_mv: rMV,
            mv_delta: rnd(eMV - tMV),
            topaz_cost_basis:      rnd(t.cost_basis),
            emerald_cost_basis:    rnd(e.cost_basis),
            ruby_cost_basis:       rnd(r.cost_basis),
            topaz_unrealized_gl:   rnd(t.unrealized_gl),
            emerald_unrealized_gl: rnd(e.unrealized_gl),
            topaz_record_count:   t.record_count,
            emerald_record_count: e.record_count,
            ruby_record_count:    r.record_count,
            strategy_type: acct.strategy_type,
            client_id:     acct.client_id,
          })
        );

        db.prepare(
          'INSERT INTO Link (graph_id, source_node_id, target_node_id, link_type_id, status) VALUES (?, ?, ?, ?, ?)'
        ).run(graphId, clientNodeId, canonicalNodeId, managesId, 'Active');

        const spokes = [
          {
            group: 2, label: `Topaz: ${acct.custodian_account_num}`,
            metadata: { mv: tMV, system: 'Topaz',   cost_basis: rnd(t.cost_basis), unrealized_gl: rnd(t.unrealized_gl), record_count: t.record_count },
          },
          {
            group: 3, label: `Emerald: ${acct.portfolio_code}`,
            metadata: { mv: eMV, system: 'Emerald', cost_basis: rnd(e.cost_basis), unrealized_gl: rnd(e.unrealized_gl), record_count: e.record_count },
          },
          {
            group: 4, label: `Ruby: ${acct.fund_code}`,
            metadata: { mv: rMV, system: 'Ruby',    cost_basis: rnd(r.cost_basis), unrealized_gl: null,                 record_count: r.record_count },
          },
        ];

        for (const spoke of spokes) {
          const { lastInsertRowid: spokeNodeId } = db.prepare(
            'INSERT INTO Node (graph_id, node_type_id, label, status, metadata) VALUES (?, ?, ?, ?, ?)'
          ).run(graphId, nodeTypeMap[spoke.group], spoke.label, 'Active', JSON.stringify(spoke.metadata));

          db.prepare(
            'INSERT INTO Link (graph_id, source_node_id, target_node_id, link_type_id, status) VALUES (?, ?, ?, ?, ?)'
          ).run(graphId, canonicalNodeId, spokeNodeId, appearsAsId, 'Active');
        }
      }
    })();
    created++;
  }

  if (created > 0) {
    const accountsPerClient = accounts.length / clients.length;
    const nodesPerGraph = 1 + accountsPerClient * 4;
    const linksPerGraph = accountsPerClient + accountsPerClient * 3;
    console.log(`Imported: ${created} client hierarchy graphs (~${nodesPerGraph} nodes, ~${linksPerGraph} links each)`);
  }
  if (skipped > 0) console.log(`Skipped: ${skipped} graphs already in DB`);
}

run();
