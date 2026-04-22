# Account Network — Project Guide

## What This Is
A 3D interactive visualization tool for hierarchical node networks. Originally built to map investment account relationships from a financial services database (CliftonIMS). Now evolving into a general-purpose node mapping system backed by SQLite and a REST API.

---

## Current Architecture

```
Browser (index.html)
    ↓ static files OR /api/graphs/:id
Express Server (server/index.js, port 3000)
    ├── Static: serves entire project root (index.html, json/, src/)
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
| `scripts/importJson.js` | CLI migration tool — imports a single `json/*.json` file into SQLite with obfuscation |
| `scripts/obfuscate.js` | Obfuscation module — deterministic code scrambling + fake institutional name generation |
| `scripts/nameMap.json` | Persistent real→fake client name mapping (committed; keeps fake names stable across runs) |
| `json/*.json` | Legacy pre-generated static JSON files (still served, still work) |

---

## Database Schema

```
GraphType  ──< NodeType    (defines node groups/colors per hierarchy type)
           ──< LinkType    (defines relationship categories per hierarchy type)
           ──< Graph       (named instances of a hierarchy)
                ──< Node   (entities; label → 'id' in frontend JSON)
                ──< Link   (edges; curvature/rotation computed at query time)
```

**Key mapping to 3d-force-graph JSON format:**
- `Node.label` → `id`
- `NodeType.display_group` → `group` (drives color coding)
- `LinkType.name` → `purpose`
- Curvature (0.5) + random rotation applied when duplicate source→target links exist

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/graphs` | List all graphs (id, name, status, graph_type) |
| GET | `/api/graphs/:id` | Full `{nodes, links}` JSON — same shape as static `json/*.json` |
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

- Loads `3d-force-graph` (1.79.1) and `d3` (5.5.0) from local `src/` copies (dat.GUI removed)
- Fixed top bar (`#top-bar`): app title | graph `<select>` | layout `<select>` | graph-type + status pills
- Graph selector fetches `/api/graphs` on load; switching calls `Graph.jsonUrl('/api/graphs/:id')`
- Layout selector toggles `dagMode` on the live graph — options: Free (null), Top-Down, Bottom-Up, Left-Right, Radial
- `dagLevelDistance(65)` applied when any DAG mode is active; `onDagError(() => false)` suppresses cycle warnings
- Color-codes links by `status`: Active=green, Shell=yellow, Pending=blue, Inactive=gray, Paused=pink, Closed/Terminated=red
- Click node → camera zooms to it (3s transition, distance 200)
- Node drag → pins node in place

---

## Decisions Made

- **Database**: SQLite (lightweight, file-based, no server required)
- **API**: Node.js + Express + better-sqlite3
- **Data entry**: `scripts/importJson.js` for bulk migration (with obfuscation); API/manual for new data
- **Obfuscation**: Applied at import time — DB contains only fake names/codes; real data stays in `json/` (not committed)
- **Static JSON files**: Kept as-is, served by Express alongside the API. Being replaced gradually via `scripts/importJson.js`.
- **CliftonIMS**: Out of scope — no dependency going forward
- **`pyAccountNetworks/`**: Deleted — legacy Python ETL pipeline, no longer needed
- **dat.GUI**: Removed — replaced with a native HTML top bar
- **Local libraries**: `src/` holds local copies of all frontend dependencies for offline use (see Deployment Notes)

---

## Migration: JSON → SQLite

```bash
# Import a single file
node scripts/importJson.js json/99.json

# Bulk import all files (bash)
for f in json/*.json; do node scripts/importJson.js "$f"; done
```

`scripts/importJson.js` is idempotent — re-running skips graphs already in the DB.

**What it creates on first run:**
- `GraphType "Account Network"` (shared, created once)
- `NodeType` rows: group 1 → Client, group 2 → Account, group 3 → Sub-Account
- `LinkType` rows for each unique `purpose` found in links (auto-added as new ones appear)

**Per file:**
- One `Graph` row (named with the obfuscated client name)
- `Node` rows with obfuscated labels and status preserved
- `Link` rows with status preserved (curvature/rotation computed at query time by the API)

---

## Obfuscation (`scripts/obfuscate.js`)

All imported data is obfuscated on the way into the DB. The JSON source files are never modified.

### Account code scrambling
Fixed bijective substitution cipher applied character-by-character; structure characters (dashes, spaces, colons) are preserved:
- Digits: `0→7 1→4 2→9 3→2 4→6 5→1 6→8 7→3 8→5 9→0`
- Letters: fixed A–Z permutation (e.g. `A→K B→P C→R ...`), case-preserving

### Client name replacement
- `scripts/nameMap.json` maps each real base client name → fake institutional name (persisted to disk)
- Fake names are generated from a word bank: `[place] [type] [suffix]` (e.g. "Bridgeport Metro Benefit Plan")
- Generation is deterministic (hash-based), so the same real name always produces the same fake name
- Abbreviations in parentheses (e.g. `(MPERS)`) are replaced with initials of the fake name
- Labels with abbreviated client name variants are handled via progressive prefix matching (tries longest match first, minimum 2 words)

### Label structure handled
- `"Client Name (ABBREV)"` → root node, full name replaced
- `"424000: Client Name description"` → code scrambled, name replaced in description

---

## What's Next (Planned)

### Phase 1 — Deploy to Railway
- Decide on scope of client list (significantly reduced from 2,869)
- Write `scripts/seed.js` — startup seeder that imports a curated list of JSON files if DB is empty
- Switch `index.html` to CDN libs for production deployment
- Create Railway project from GitHub, attach persistent volume at `/app/db`

### Phase 2 — GSF Data Bridge
Add a second graph type derived from `GSF_Semantic_Pipeline` data, making the two portfolio demos explicitly complementary.

**Option A (build first): Multi-Source Identity Network**
Each canonical account (from `DW_ACCOUNT`) is a hub node. Its three source-system representations — Topaz (`custodian_account_num`), Emerald (`portfolio_code`), Ruby (`fund_code`) — are spoke nodes. Links labeled "Appears As". This directly visualizes what the semantic layer resolves.
- Node groups: Canonical Account (1), Topaz Record (2), Emerald Record (3), Ruby Record (4)
- Script: `scripts/importGSF.js` — reads GSF CSV files, creates graph type + nodes + links

**Option B (follow-on): Holdings Network**
Bipartite graph — accounts connected to securities they hold, link weight by market value, security nodes colored by asset class.

**GSF source data** (from `GSF_Semantic_Pipeline/generator_v2/`):
- `dw_account.csv` — 100 accounts with type and three source keys
- `dw_security.csv` — 200 securities with asset_class
- `dw_position.csv` — 4,886 account × security positions with market_value

### Phase 3 — UI Controls
- Explore additional top-bar controls (link visibility, node label toggle, physics tuning)

---

## Hosting Plan

### Platform Assignments

| Platform | Projects | Cost |
|---|---|---|
| **Railway** | GSF_Account_Network, WCIR, dtp_demo | ~$5/mo |
| **Vercel** | data-lineage-viz, etf-comparison, options-dashboard (React) | Free |
| **Streamlit Community Cloud** | GSF_Semantic_Pipeline | Free (already live) |

### Railway Deployment Steps
1. Create Railway account → New Project → Deploy from GitHub (`lownstar/GSF_Account_Network`)
2. Railway auto-detects Node.js and runs `npm start`
3. Add persistent volume mounted at `/app/db` (keeps SQLite across redeploys)
4. Set `NODE_ENV=production`
5. Public URL auto-assigned (e.g., `gsf-account-network.up.railway.app`)

### CDN vs Local Libraries
`index.html` currently loads from local `src/` for offline development:
```html
<script src="src/3d-force-graph.min.js"></script>
<script src="src/d3v5/d3.min.js"></script>
```

**Switch to CDN before deploying:**
```html
<script src="//unpkg.com/3d-force-graph@1.79.1/dist/3d-force-graph.min.js"></script>
<script src="//unpkg.com/d3@5/dist/d3.min.js"></script>
```

Note: D3 is pinned to v5 — do not upgrade to v7+ without testing (breaking changes).

---

## Relationship to GSF Semantic Pipeline

This project is a planned visual companion to the [GSF Semantic Pipeline](https://github.com/lownstar/GSF_Semantic_Pipeline) demo. The pipeline governs and resolves account data across three source systems; GSF_Account_Network visualizes the relationships that governance enables. Together they tell a complete data architecture story.
