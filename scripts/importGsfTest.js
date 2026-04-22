#!/usr/bin/env node
// One-off import of json/gsf_test.json into SQLite as a GSF graph type.
// No obfuscation — data is already synthetic.
// Usage: node scripts/importGsfTest.js

const fs = require('fs');
const path = require('path');
const db = require('../server/db');

const GRAPH_TYPE_NAME = 'GSF Multi-Source Identity';
const GRAPH_NAME = 'GSF Test — 5 Accounts';

const NODE_TYPE_NAMES = {
  1: 'Canonical Account',
  2: 'Topaz Record',
  3: 'Emerald Record',
  4: 'Ruby Record',
};

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

function ensureLinkTypes(graphTypeId, purposes) {
  const map = {};
  for (const purpose of purposes) {
    let row = db.prepare(
      'SELECT id FROM LinkType WHERE graph_type_id = ? AND name = ?'
    ).get(graphTypeId, purpose);
    if (!row) {
      const info = db.prepare(
        'INSERT INTO LinkType (graph_type_id, name) VALUES (?, ?)'
      ).run(graphTypeId, purpose);
      row = { id: info.lastInsertRowid };
    }
    map[purpose] = row.id;
  }
  return map;
}

function run() {
  const filePath = path.resolve(__dirname, '../json/gsf_test.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  const purposes = [...new Set(data.links.map(l => l.purpose))];
  const graphTypeId = ensureGraphType();
  const nodeTypeMap = ensureNodeTypes(graphTypeId);
  const linkTypeMap = ensureLinkTypes(graphTypeId, purposes);

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

    const nodeIdMap = {};
    for (const node of data.nodes) {
      const nodeTypeId = nodeTypeMap[node.group];
      if (!nodeTypeId) {
        console.warn(`  Unknown group ${node.group} for node "${node.id}", skipping.`);
        continue;
      }
      const info = db.prepare(
        'INSERT INTO Node (graph_id, node_type_id, label, status) VALUES (?, ?, ?, ?)'
      ).run(graphId, nodeTypeId, node.id, node.status ?? 'Active');
      nodeIdMap[node.id] = info.lastInsertRowid;
    }

    let skipped = 0;
    for (const link of data.links) {
      const sourceId = nodeIdMap[link.source];
      const targetId = nodeIdMap[link.target];
      const linkTypeId = linkTypeMap[link.purpose];
      if (!sourceId || !targetId) {
        console.warn(`  Skipping link — node not found: "${link.source}" → "${link.target}"`);
        skipped++;
        continue;
      }
      db.prepare(
        'INSERT INTO Link (graph_id, source_node_id, target_node_id, link_type_id, status) VALUES (?, ?, ?, ?, ?)'
      ).run(graphId, sourceId, targetId, linkTypeId, link.status ?? 'Active');
    }

    return { graphId, nodeCount: Object.keys(nodeIdMap).length, linkCount: data.links.length - skipped, skipped };
  });

  const result = doImport();
  console.log(
    `Imported: "${GRAPH_NAME}" ` +
    `(${result.nodeCount} nodes, ${result.linkCount} links` +
    (result.skipped ? `, ${result.skipped} links skipped` : '') +
    `)`
  );
}

run();
