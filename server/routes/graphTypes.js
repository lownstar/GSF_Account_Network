const express = require('express');
const router = express.Router();
const db = require('../db');

// List all graph types
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT gt.id, gt.name, gt.description,
           COUNT(DISTINCT nt.id) AS node_type_count,
           COUNT(DISTINCT lt.id) AS link_type_count
    FROM GraphType gt
    LEFT JOIN NodeType nt ON nt.graph_type_id = gt.id
    LEFT JOIN LinkType lt ON lt.graph_type_id = gt.id
    GROUP BY gt.id
    ORDER BY gt.name
  `).all();
  res.json(rows);
});

// Get a single graph type with its node types and link types
router.get('/:id', (req, res) => {
  const graphType = db.prepare('SELECT * FROM GraphType WHERE id = ?').get(req.params.id);
  if (!graphType) return res.status(404).json({ error: 'Graph type not found' });

  graphType.node_types = db.prepare(
    'SELECT * FROM NodeType WHERE graph_type_id = ? ORDER BY display_group'
  ).all(req.params.id);

  graphType.link_types = db.prepare(
    'SELECT * FROM LinkType WHERE graph_type_id = ? ORDER BY name'
  ).all(req.params.id);

  res.json(graphType);
});

// Create a new graph type (with optional node types and link types)
router.post('/', (req, res) => {
  const { name, description, node_types = [], link_types = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const insertGraphType = db.prepare('INSERT INTO GraphType (name, description) VALUES (?, ?)');
  const insertNodeType = db.prepare(
    'INSERT INTO NodeType (graph_type_id, name, display_group, color) VALUES (?, ?, ?, ?)'
  );
  const insertLinkType = db.prepare(
    'INSERT INTO LinkType (graph_type_id, name, color) VALUES (?, ?, ?)'
  );

  const result = db.transaction(() => {
    const { lastInsertRowid: gtId } = insertGraphType.run(name, description ?? null);
    for (const nt of node_types) {
      insertNodeType.run(gtId, nt.name, nt.display_group, nt.color ?? null);
    }
    for (const lt of link_types) {
      insertLinkType.run(gtId, lt.name, lt.color ?? null);
    }
    return gtId;
  })();

  res.status(201).json({ id: result });
});

// Delete a graph type
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM GraphType WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Graph type not found' });
  res.status(204).send();
});

module.exports = router;
