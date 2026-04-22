#!/usr/bin/env node
// Import a single JSON file from json/ into the SQLite database.
// Usage: node scripts/importJson.js json/99.json

const fs = require('fs');
const path = require('path');
const db = require('../server/db');
const { loadNameMap, saveNameMap, getOrCreateFakeName, obfuscateLabel, extractBaseName } = require('./obfuscate');

const GRAPH_TYPE_NAME = 'Account Network';

const NODE_TYPE_NAMES = {
  1: 'Client',
  2: 'Account',
  3: 'Sub-Account',
};

// Ensure GraphType exists; return its id.
function ensureGraphType() {
  db.prepare('INSERT OR IGNORE INTO GraphType (name) VALUES (?)').run(GRAPH_TYPE_NAME);
  return db.prepare('SELECT id FROM GraphType WHERE name = ?').get(GRAPH_TYPE_NAME).id;
}

// Ensure NodeType rows exist for groups 1, 2, 3; return { group -> nodeTypeId }.
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

// Ensure LinkType rows exist for each purpose; return { purpose -> linkTypeId }.
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

function importFile(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Extract the root client node (group 1) and its base name for obfuscation.
  const rootNode = data.nodes.find(n => n.group === 1);
  const realBaseName = rootNode ? extractBaseName(rootNode.id) : path.basename(filePath, '.json');
  const graphStatus = rootNode?.status ?? 'Active';

  // Load persistent name map and ensure a fake name exists for this client.
  const nameMap = loadNameMap();
  getOrCreateFakeName(realBaseName, nameMap);
  saveNameMap(nameMap);

  // Derive obfuscated graph name from the fake client name.
  const graphName = obfuscateLabel(rootNode ? rootNode.id : realBaseName, realBaseName, nameMap);

  // Collect unique link purposes up front.
  const purposes = [...new Set(data.links.map(l => l.purpose))];

  // Ensure shared schema types.
  const graphTypeId = ensureGraphType();
  const nodeTypeMap = ensureNodeTypes(graphTypeId);
  const linkTypeMap = ensureLinkTypes(graphTypeId, purposes);

  // Skip if already imported (check by obfuscated graph name).
  const existing = db.prepare(
    'SELECT id FROM Graph WHERE graph_type_id = ? AND name = ?'
  ).get(graphTypeId, graphName);
  if (existing) {
    console.log(`Already exists, skipping: "${graphName}"`);
    return;
  }

  // Import graph, nodes, and links in a single transaction.
  const doImport = db.transaction(() => {
    const graphInfo = db.prepare(
      'INSERT INTO Graph (graph_type_id, name, status) VALUES (?, ?, ?)'
    ).run(graphTypeId, graphName, graphStatus);
    const graphId = graphInfo.lastInsertRowid;

    // Insert nodes with obfuscated labels; build original label → DB id map for link resolution.
    const nodeIdMap = {};
    for (const node of data.nodes) {
      const nodeTypeId = nodeTypeMap[node.group];
      if (!nodeTypeId) {
        console.warn(`  Unknown group ${node.group} for node "${node.id}", skipping.`);
        continue;
      }
      const fakeLabel = obfuscateLabel(node.id, realBaseName, nameMap);
      const nodeInfo = db.prepare(
        'INSERT INTO Node (graph_id, node_type_id, label, status) VALUES (?, ?, ?, ?)'
      ).run(graphId, nodeTypeId, fakeLabel, node.status ?? 'Active');
      // Key by original label so link source/target refs (which use original labels) still resolve.
      nodeIdMap[node.id] = nodeInfo.lastInsertRowid;
    }

    // Insert links.
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
    `Imported: "${graphName}" ` +
    `(${result.nodeCount} nodes, ${result.linkCount} links` +
    (result.skipped ? `, ${result.skipped} links skipped` : '') +
    `)`
  );
}

// Main
const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/importJson.js <path/to/file.json>');
  process.exit(1);
}

importFile(path.resolve(filePath));
