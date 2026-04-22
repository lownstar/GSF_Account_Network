# Account Network — Project Guide

## What This Is
A 3D interactive visualization of the multi-source identity problem in financial data. Canonical accounts from the GSF synthetic dataset are shown as hub nodes connected to their three source-system representations (Topaz, Emerald, Ruby). The visualizer is the setup half of a two-demo portfolio narrative — it poses the ambiguity question that the GSF Semantic Pipeline demo resolves.

---

## Current Architecture

```
Browser (index.html)
    ↓ /api/graphs/:id
Express Server (server/index.js, port 3000)
    ├── Static: serves project root (index.html, src/)
    └── API: /api/graph-types, /api/graphs
         ↓
    SQLite (db/network.db)  ←  schema: db/schema.sql
```

### Start the Server
```bash
npm start
# → http://localhost:3000
```

---

## Key Directories & Files

| Path | Purpose |
|------|---------|
| `index.html` | Main frontend — 3d-force-graph visualization with top-bar graph selector |
| `server/index.js` | Express entry point |
| `server/db.js` | better-sqlite3 connection (WAL mode, FK enforced) |
| `server/routes/graphs.js` | Graph CRUD + graph JSON output for frontend |
| `server/routes/graphTypes.js` | Graph type CRUD (node types, link types) |
| `db/schema.sql` | SQLite schema definition |
| `db/network.db` | SQLite database (gitignored via `*.db`) |
| `scripts/importGsfTest.js` | Seeds the 5-account GSF test graph into SQLite |
| `scripts/importGSF.js` | Seeds the full 100-account GSF identity network (planned — see docs/) |
| `json/gsf_test.json` | Synthetic GSF test graph source data |
| `docs/` | Build plans and project documentation |

---

## Database Schema

```
GraphType  ──< NodeType    (defines node groups/colors per graph type)
           ──< LinkType    (defines relationship categories per graph type)
           ──< Graph       (named instances)
                ──< Node   (entities; label → 'id' in frontend JSON)
                ──< Link   (edges; curvature/rotation computed at query time)
```

**Key mapping to 3d-force-graph JSON format:**
- `Node.label` → `id`
- `NodeType.display_group` → `group` (drives color coding)
- `LinkType.name` → `purpose`
- Curvature (0.5) + random rotation applied when duplicate source→target links exist
- `Node.metadata` — optional JSON blob for extra attributes (e.g. market values)

---

## GSF Graph Type

**Graph type:** `GSF Multi-Source Identity`

Node groups:
- Group 1 → `Canonical Account` (hub)
- Group 2 → `Topaz Record` (custodian system)
- Group 3 → `Emerald Record` (front-office system)
- Group 4 → `Ruby Record` (fund accounting system)

Link purpose: `Appears As` (canonical → each source spoke)

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/graphs` | List all graphs (id, name, status, graph_type) |
| GET | `/api/graphs/:id` | Full `{nodes, links}` JSON for 3d-force-graph |
| POST | `/api/graphs` | Create graph (`name`, `graph_type_id`) |
| POST | `/api/graphs/:id/nodes` | Add node (`label`, `node_type_id`, `status?`) |
| POST | `/api/graphs/:id/links` | Add link (`source_node_id`, `target_node_id`, `link_type_id`) |
| DELETE | `/api/graphs/:id` | Delete graph + cascade nodes/links |
| GET | `/api/graph-types` | List graph types with counts |
| GET | `/api/graph-types/:id` | Graph type with node_types[] and link_types[] |
| POST | `/api/graph-types` | Create with `node_types[]` and `link_types[]` in body |
| DELETE | `/api/graph-types/:id` | Delete graph type |

---

## Frontend (index.html)

- Loads `3d-force-graph` (1.79.1) and `d3` (5.5.0) from local `src/` copies
- Fixed top bar: app title | graph `<select>` | layout `<select>` | graph-type + status pills
- Graph selector fetches `/api/graphs` on load; switching calls `Graph.jsonUrl('/api/graphs/:id')`
- Layout selector toggles `dagMode` — options: Free (null), Top-Down, Bottom-Up, Left-Right, Radial
- `dagLevelDistance(65)` applied when any DAG mode is active; `onDagError(() => false)` suppresses cycle warnings
- Link color by `status`: Active=green, Closed/Terminated=red, default=white
- Click node → camera zooms to it (3s transition, distance 200)
- Node drag → pins node in place

---

## Decisions Made

- **Database**: SQLite (lightweight, file-based, no server required)
- **API**: Node.js + Express + better-sqlite3
- **All data is synthetic**: Only GSF synthetic data is used; no real client data is in this repo
- **Local libraries**: `src/` holds local copies of all frontend dependencies for offline development
- **dat.GUI**: Removed — replaced with native HTML top bar
- **D3 pinned to v5**: Do not upgrade to v7+ without testing (breaking API changes)

---

## What's Next

See [`docs/gsf-identity-network-plan.md`](docs/gsf-identity-network-plan.md) for the full cross-functional build plan.

### Phase 1 — Unblocked (this project)
- Write `scripts/importGSF.js` — reads GSF CSV files, builds 100-account identity graph in SQLite with per-account Topaz/Emerald MV stored in node metadata
- Update `server/routes/graphs.js` to return `metadata` on nodes
- Update `index.html` to surface MV discrepancy in node tooltip

### Phase 2 — Blocked on GSF_Semantic_Pipeline
- GSF_Semantic_Pipeline adds client/household tier to seed generator
- This project then builds `scripts/importGSFHierarchy.js` for client-level graphs

### Phase 3 — Deployment
- Switch `index.html` to CDN libs before deploying to Railway
- Write `scripts/seed.js` — startup seeder that runs `importGSF.js` if DB is empty
- Create Railway project, attach persistent volume at `/app/db`, set `NODE_ENV=production`

---

## Hosting Plan

| Platform | Projects | Cost |
|---|---|---|
| **Railway** | GSF_Account_Network, WCIR, dtp_demo | ~$5/mo |
| **Vercel** | data-lineage-viz, etf-comparison, options-dashboard | Free |
| **Streamlit Community Cloud** | GSF_Semantic_Pipeline | Free (already live) |

### CDN vs Local Libraries
`index.html` currently loads from local `src/` for offline development. Switch to CDN before deploying:
```html
<script src="//unpkg.com/3d-force-graph@1.79.1/dist/3d-force-graph.min.js"></script>
<script src="//unpkg.com/d3@5/dist/d3.min.js"></script>
```

---

## Relationship to GSF Semantic Pipeline

This project is the visual companion to the [GSF Semantic Pipeline](https://github.com/lownstar/GSF_Semantic_Pipeline). The pipeline governs and resolves account identity across three source systems; this visualizer makes those cross-system relationships — and the market value discrepancies they produce — visible in 3D. Together they form a single portfolio narrative about data governance in financial services.
