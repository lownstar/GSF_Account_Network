# GSF Account Network

A 3D interactive visualization tool for hierarchical node networks. Originally built to map investment account relationships from a financial services database. Now evolving into a general-purpose network visualization platform backed by SQLite and a REST API, and planned as a complementary demo alongside the [GSF Semantic Pipeline](https://github.com/lownstar/GSF_Semantic_Pipeline).

---

## Live Demo

> Coming soon — deploying to Railway

---

## What It Does

- Renders any node/link graph as an interactive 3D force-directed network
- Supports multiple named graphs selectable from a top-bar dropdown
- Layout modes: Free, Top-Down, Bottom-Up, Left-Right, Radial
- Color-codes links by status (Active, Shell, Pending, Inactive, Paused, Closed)
- Click a node to zoom in; drag a node to pin it

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | [3d-force-graph](https://github.com/vasturiano/3d-force-graph) (Three.js), D3 v5 |
| Server | Node.js, Express 5 |
| Database | SQLite via better-sqlite3 |
| Hosting (planned) | Railway |

---

## Running Locally

```bash
npm install
npm start
# → http://localhost:3000
```

Requires Node.js 18+. The SQLite database (`db/network.db`) must be seeded — see **Data Seeding** below.

---

## Data Seeding

The database is not committed. Import client graph files from `json/`:

```bash
# Single file
node scripts/importJson.js json/99.json

# Bulk (bash)
for f in json/*.json; do node scripts/importJson.js "$f"; done
```

The import script is idempotent — re-running skips graphs already in the database.

---

## Project Structure

```
index.html              # Frontend — 3D visualization with top-bar controls
server/
  index.js              # Express entry point (port 3000)
  db.js                 # better-sqlite3 connection
  routes/
    graphs.js           # Graph CRUD + JSON output for 3d-force-graph
    graphTypes.js       # Graph type CRUD
db/
  schema.sql            # SQLite schema definition
  network.db            # SQLite database (gitignored)
scripts/
  importJson.js         # CLI: import json/*.json files into SQLite
  obfuscate.js          # Deterministic name/code obfuscation
  nameMap.json          # Persistent real→fake name mapping
json/                   # Legacy source data files (not committed)
```

---

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/graphs` | List all graphs |
| GET | `/api/graphs/:id` | Full `{nodes, links}` JSON |
| POST | `/api/graphs` | Create graph |
| POST | `/api/graphs/:id/nodes` | Add node |
| POST | `/api/graphs/:id/links` | Add link |
| DELETE | `/api/graphs/:id` | Delete graph + cascade |
| GET | `/api/graph-types` | List graph types |
| GET | `/api/graph-types/:id` | Graph type with node/link types |
| POST | `/api/graph-types` | Create graph type |

---

## Relationship to GSF Semantic Pipeline

This project is designed to complement the [GSF Semantic Pipeline](https://github.com/lownstar/GSF_Semantic_Pipeline) demo. Planned integration:

- **Multi-Source Identity Network**: Visualize how the same financial account appears across three source systems (Topaz/Emerald/Ruby) before semantic governance resolves them to a single canonical identity
- **Holdings Network**: Bipartite graph connecting accounts to the securities they hold, colored by asset class

Together the two demos tell a complete story: the pipeline governs and resolves the data; the network visualizes the relationships it enables.
