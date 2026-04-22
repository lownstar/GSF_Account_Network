# GSF Account Network

A 3D interactive visualization of the multi-source identity problem in financial data. Each canonical account from the GSF synthetic dataset is shown as a hub node connected to its three source-system representations (Topaz, Emerald, Ruby) — making the ambiguity that the [GSF Semantic Pipeline](https://github.com/lownstar/GSF_Semantic_Pipeline) resolves visible and intuitive.

The two demos tell a connected story: this visualizer poses the question ("why does Topaz report a different market value than Emerald for the same account?"), and the pipeline answers it.

---

## Live Demo

> Coming soon — deploying to Railway

---

## What It Does

- Renders node/link graphs as an interactive 3D force-directed network
- Supports multiple named graphs selectable from a top-bar dropdown
- Layout modes: Free, Top-Down, Bottom-Up, Left-Right, Radial
- Color-codes links by status (Active=green, Closed/Terminated=red)
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

Requires Node.js 18+. The SQLite database (`db/network.db`) is not committed — seed it before use.

---

## Data Seeding

All data is synthetic. Seed the database from the GSF test graph:

```bash
node scripts/importGsfTest.js
```

For the full 100-account GSF identity network (requires the [GSF Semantic Pipeline](https://github.com/lownstar/GSF_Semantic_Pipeline) repo cloned as a sibling directory):

```bash
node scripts/importGSF.js
```

Both scripts are idempotent — re-running skips data already in the database.

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
  importGsfTest.js      # Seed the 5-account GSF test graph
  importGSF.js          # Seed the full 100-account GSF identity network (planned)
json/
  gsf_test.json         # Synthetic GSF test graph source data
src/                    # Local library copies (3d-force-graph, D3 v5)
docs/                   # Build plans and project documentation
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

This project is the visual companion to the [GSF Semantic Pipeline](https://github.com/lownstar/GSF_Semantic_Pipeline). The pipeline governs and resolves account identity across three source systems; this visualizer makes those cross-system relationships — and the market value discrepancies they produce — visible in 3D.
