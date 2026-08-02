# GSF Account Network

A 3D interactive visualization of the multi-source identity problem in financial data. Each canonical account from the GSF synthetic dataset is shown as a hub node connected to its three source-system representations (Topaz, Emerald, Ruby) — making the ambiguity that the [GSF Semantic Pipeline](https://github.com/lownstar/GSF_Semantic_Pipeline) resolves visible and intuitive.

The two demos tell a connected story: this visualizer poses the question ("why does Topaz report a different market value than Emerald for the same account?"), and the pipeline answers it.

---

## Live Demo

**[gsfaccountnetwork-production.up.railway.app](https://gsfaccountnetwork-production.up.railway.app)**

---

## What It Does

- 126 interactive 3D graphs: 100 individual account graphs + 25 client hierarchy graphs + 1 test graph
- Each account rendered as a 4-node star: canonical hub connected to its Topaz, Emerald, and Ruby source records
- Client hierarchy graphs show the 3-tier structure: Client → Canonical Accounts → Source Records
- Opens on a curated default view (a client hierarchy) with a guided walkthrough on first visit
- Hover panel shows market values across all three systems, delta, cost basis, unrealized G/L, and record counts
- Figures render to the cent against IBOR tolerances (> $50 material, > $5 small, a penny expected) — rounding to millions hides the very discrepancy being demonstrated
- Graph type filter: view all graphs, account graphs only, or client hierarchy only
- Layout modes: Free, Top-Down, Bottom-Up, Left-Right, Radial
- Node label toggle: None, Market Value, Cost Basis, or Unrealized G/L floating labels
- Click a node to zoom in; drag a node to pin it
- Mobile-responsive: touch support, adaptive zoom distance
- Any view is shareable as a URL; selections are written back to the query string

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | [3d-force-graph](https://github.com/vasturiano/3d-force-graph) (Three.js), D3 v5, via CDN |
| Server | Node.js 18+, Express 5 |
| Database | SQLite via better-sqlite3 |
| Hosting | [Railway](https://railway.app) with persistent volume |

---

## Running Locally

```bash
npm install
npm run seed   # initialize schema + import all graphs
npm start      # → http://localhost:3000
```

The database is not committed. `npm run seed` creates it and imports all 126 graphs automatically. It is idempotent — safe to re-run.

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `DB_PATH` | `db/network.db` | SQLite database location |
| `PORT` | `3000` | Server port |
| `NODE_ENV` | — | Set to `production` on Railway |

See [.env.example](.env.example) for reference.

---

## Project Structure

```
index.html              # Frontend — 3D visualization with top-bar controls
schema.sql              # SQLite schema definition
server/
  index.js              # Express entry point
  db.js                 # better-sqlite3 READ-ONLY connection (respects DB_PATH env var)
  routes/
    graphs.js           # Read-only graph JSON output for 3d-force-graph
    graphTypes.js       # Read-only graph type queries
db/
  network.db            # SQLite database (gitignored)
scripts/
  db.js                 # better-sqlite3 WRITABLE connection — seeders only
  seed.js               # Startup seeder — init schema + import all graphs
  importGsfTest.js      # Seeds the 5-account GSF test graph
  importGSF.js          # Seeds 100 individual account graphs
  importGSFHierarchy.js # Seeds 25 client hierarchy graphs
data/
  seed/                 # Synthetic CSV seed data (self-contained, no sibling repo needed)
json/
  gsf_test.json         # Source data for the 5-account test graph
docs/                   # Build plan and project documentation
railway.json            # Railway deployment config
```

---

## API

The API is **read-only**. The server opens SQLite in readonly mode and exposes
no route that can modify data; all writes happen in the seed scripts, which run
as a separate process before the server starts.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/graphs` | List all graphs |
| GET | `/api/graphs/:id` | Full `{nodes, links}` JSON |
| GET | `/api/graph-types` | List graph types |
| GET | `/api/graph-types/:id` | Graph type with node/link types |

Only `index.html` is served statically — the project root (database, seed CSVs,
server source) is deliberately not exposed.

---

## Relationship to GSF Semantic Pipeline

This project is the visual companion to the [GSF Semantic Pipeline](https://github.com/lownstar/GSF_Semantic_Pipeline). The pipeline governs and resolves account identity across three source systems; this visualizer makes those cross-system relationships — and the market value discrepancies they produce — visible in 3D. Together they form a single portfolio narrative about data governance in financial services.
