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

// Read-only API by design — see the note in routes/graphs.js.

module.exports = router;
