const express = require('express');
const router = express.Router();
const db = require('../db');

// List all graphs (for frontend dropdown)
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT g.id, g.name, g.status, gt.name AS graph_type
    FROM Graph g
    JOIN GraphType gt ON gt.id = g.graph_type_id
    ORDER BY g.name
  `).all();
  res.json(rows);
});

// Get full graph data as {nodes, links} — compatible with 3d-force-graph
router.get('/:id', (req, res) => {
  const graph = db.prepare('SELECT id, name, status FROM Graph WHERE id = ?').get(req.params.id);
  if (!graph) return res.status(404).json({ error: 'Graph not found' });

  // Nodes: label maps to 'id' field in 3d-force-graph, display_group maps to 'group'
  const nodes = db.prepare(`
    SELECT n.label AS id, nt.display_group AS [group], n.status
    FROM Node n
    JOIN NodeType nt ON nt.id = n.node_type_id
    WHERE n.graph_id = ?
    ORDER BY nt.display_group, n.label
  `).all(req.params.id);

  // Raw links with source/target labels and link type name
  const rawLinks = db.prepare(`
    SELECT src.label AS source, tgt.label AS target,
           lt.name AS purpose, l.status
    FROM Link l
    JOIN Node src ON src.id = l.source_node_id
    JOIN Node tgt ON tgt.id = l.target_node_id
    JOIN LinkType lt ON lt.id = l.link_type_id
    WHERE l.graph_id = ?
    ORDER BY src.label
  `).all(req.params.id);

  // Count duplicate (source, target) pairs to assign curvature and rotation
  const pairCount = {};
  for (const link of rawLinks) {
    const key = `${link.source}||${link.target}`;
    pairCount[key] = (pairCount[key] ?? 0) + 1;
  }

  const links = rawLinks.map(link => {
    const key = `${link.source}||${link.target}`;
    const isDuplicate = pairCount[key] > 1;
    return {
      source: link.source,
      target: link.target,
      purpose: link.purpose,
      status: link.status,
      curvature: isDuplicate ? 0.5 : 0,
      rotation: isDuplicate ? Math.floor(Math.random() * 16) + 1 : 0,
    };
  });

  res.json({ nodes, links });
});

// Create a new graph
router.post('/', (req, res) => {
  const { name, graph_type_id, status = 'Active' } = req.body;
  if (!name || !graph_type_id) return res.status(400).json({ error: 'name and graph_type_id are required' });

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO Graph (name, graph_type_id, status) VALUES (?, ?, ?)'
  ).run(name, graph_type_id, status);

  res.status(201).json({ id: lastInsertRowid });
});

// Add a node to a graph
router.post('/:id/nodes', (req, res) => {
  const { label, node_type_id, status = 'Active', metadata } = req.body;
  if (!label || !node_type_id) return res.status(400).json({ error: 'label and node_type_id are required' });

  const graph = db.prepare('SELECT id FROM Graph WHERE id = ?').get(req.params.id);
  if (!graph) return res.status(404).json({ error: 'Graph not found' });

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO Node (graph_id, node_type_id, label, status, metadata) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.id, node_type_id, label, status, metadata ? JSON.stringify(metadata) : null);

  res.status(201).json({ id: lastInsertRowid });
});

// Add a link between nodes in a graph
router.post('/:id/links', (req, res) => {
  const { source_node_id, target_node_id, link_type_id, status = 'Active' } = req.body;
  if (!source_node_id || !target_node_id || !link_type_id) {
    return res.status(400).json({ error: 'source_node_id, target_node_id, and link_type_id are required' });
  }

  const graph = db.prepare('SELECT id FROM Graph WHERE id = ?').get(req.params.id);
  if (!graph) return res.status(404).json({ error: 'Graph not found' });

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO Link (graph_id, source_node_id, target_node_id, link_type_id, status) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.id, source_node_id, target_node_id, link_type_id, status);

  res.status(201).json({ id: lastInsertRowid });
});

// Delete a graph (cascades to nodes and links)
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM Graph WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Graph not found' });
  res.status(204).send();
});

module.exports = router;
