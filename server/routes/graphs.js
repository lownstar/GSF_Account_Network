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
  const rawNodes = db.prepare(`
    SELECT n.label AS id, nt.display_group AS [group], n.status, n.metadata
    FROM Node n
    JOIN NodeType nt ON nt.id = n.node_type_id
    WHERE n.graph_id = ?
    ORDER BY nt.display_group, n.label
  `).all(req.params.id);

  const nodes = rawNodes.map(n => ({
    ...n,
    metadata: n.metadata ? JSON.parse(n.metadata) : undefined,
  }));

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

// Read-only API by design. Graph, node, and link creation/deletion happen only
// in the seed scripts (scripts/), which run out-of-process against a writable
// connection. The deployed server has no route that can modify the database.

module.exports = router;
