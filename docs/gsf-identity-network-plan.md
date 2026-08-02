# GSF Identity Network — Build Plan (Completed)

All phases are complete. This document is retained as a record of what was built and why.

---

## Narrative Goal

> "Here's a canonical account. It appears as three different records across three source systems — and each system reports a different market value. Which number is right? That's the question the semantic pipeline answers."

The visualizer poses the question. The [GSF Semantic Pipeline](https://github.com/lownstar/GSF_Semantic_Pipeline) resolves it.

---

## Phase 1 — Account Identity Graphs ✅

**`scripts/importGSF.js`** — reads 5 CSVs from `data/seed/`:
- `dw_account.csv` → 100 canonical accounts
- `positions_topaz.csv` → Topaz MV aggregated by `ACCT_NUM`
- `positions_emerald.csv` → Emerald MV aggregated by `portfolioId`
- `positions_ruby.csv` → Ruby MV aggregated by `fund_code`

Creates 100 individual account graphs (one per account, named `ACC-XXXX: name (type)`):
- 4 nodes each: canonical hub (group 1) + Topaz/Emerald/Ruby spokes (groups 2/3/4)
- 3 links each: canonical → each source spoke (`"Appears As"`)
- Canonical node metadata: `{ topaz_mv, emerald_mv, ruby_mv, mv_delta, topaz_cost_basis, emerald_cost_basis, ruby_cost_basis, topaz_unrealized_gl, emerald_unrealized_gl, topaz_record_count, emerald_record_count, ruby_record_count }`
- Spoke node metadata: `{ mv, system, cost_basis, unrealized_gl, record_count }`

**`server/routes/graphs.js`** — returns metadata parsed from JSON on each node.

**`index.html`** — hover panel, floating MV labels, graph type filter, color legend, mobile support.

---

## Phase 2 — Client Hierarchy Graphs ✅

**`scripts/importGSFHierarchy.js`** — reads same CSVs + `dw_client.csv`:
- Creates 25 client hierarchy graphs (one per client, named `GSF Hierarchy: name (CLT-XXX)`)
- 3-tier structure: Client hub (group 8) → Canonical Account nodes (group 1) → Source spokes (groups 2/3/4)
- Client node metadata: per-system MV rollups across all accounts
- ~17 nodes and ~16 links per graph (varies by accounts-per-client)

---

## Phase 3 — Deployment ✅

- Frontend libs switched from local `src/` to CDN (three@0.136.0, three-spritetext@1.10.0, 3d-force-graph@1.79.1, d3@5)
- `server/db.js` accepts `DB_PATH` env var for Railway persistent volume
- `scripts/seed.js` — startup seeder: initializes schema if empty, then runs all three importers (idempotent)
- `data/seed/` — 5 synthetic CSVs committed for self-contained deployment
- `railway.json` — start command: `node scripts/seed.js && npm start`
- Live at: [gsfaccountnetwork-production.up.railway.app](https://gsfaccountnetwork-production.up.railway.app)

---

## Post-Deployment — Hardening & Onboarding (2026-08-02) ✅

**Read-only deployment** (`b11ab90`, `4363d4a`)

The server had been serving the entire project root as static files, so
`/db/network.db` returned the full SQLite database to any caller, alongside
server source, `schema.sql` and the seed CSVs. It also carried POST/DELETE
routes that neither the frontend nor the seeders used.

- Only `index.html` is served; `src/` is mounted for local dev alone
- All write routes deleted from both routers
- `server/db.js` opens SQLite `{ readonly: true }` — the web process cannot
  write even if a write path were reintroduced
- `scripts/db.js` added as the writable handle for the seeders, which run
  out-of-process before the server starts
- `x-powered-by` disabled

**Onboarding** (`db93235`)

- Default landing view: opens on client hierarchy `CLT-005` rather than an
  empty canvas, matched by name so it resolves across environments
- 8-step guided tour with a spotlight cut-out; first-visit auto-run stored in
  `localStorage`, reopened via the `?` button or `?tour=1`

**Reconciliation display** (`db93235`)

The narrative had been undermined by its own formatting: every figure was
rounded to millions, so three systems reporting $77,787,621.62 / $77,829,481.94
/ $77,756,482.90 all displayed as `$77.79M`, and a $41,860 break displayed as
`$0.04M`. The delta thresholds ($1M red, $100k orange) never fired once against
this dataset.

Rebuilt around IBOR tolerances, which are absolute rather than proportional —
`> $50` material, `> $5` small, `> $0.01` sub-dollar, else reconciled. Money now
renders to the cent in a monospace column. Against the current data **98 of 100
accounts break by more than $50 and none reconciles to the penny**; the worst is
$41,860.32 on ACC-0078.

**Incidental fix:** `#3d-graph` is an invalid CSS selector (identifiers cannot
start with a digit), so that rule had never applied — including the
`touch-action: none` added in `a7b7e46` for mobile gesture handling. Now
`[id="3d-graph"]`.

---

## Outstanding

- **`seed.js --reset` flag** — needed when GSF_Semantic_Pipeline regenerates data. Currently requires a manual DB wipe before re-seeding; a `--reset` flag would do it in one command. `scripts/db.js` is now the natural home for it.

---

## Node Groups Reference

| Group | Label | Color |
|---|---|---|
| 1 | Canonical Account | Gold |
| 2 | Topaz Record | Deep Blue |
| 3 | Emerald Record | Deep Green |
| 4 | Ruby Record | Deep Red |
| 8 | Client/Household | Purple |
