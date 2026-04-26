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

## Outstanding

- **`seed.js --reset` flag** — needed when GSF_Semantic_Pipeline regenerates data. Currently requires a manual DB wipe before re-seeding; a `--reset` flag would do it in one command.

---

## Node Groups Reference

| Group | Label | Color |
|---|---|---|
| 1 | Canonical Account | Gold |
| 2 | Topaz Record | Deep Blue |
| 3 | Emerald Record | Deep Green |
| 4 | Ruby Record | Deep Red |
| 8 | Client/Household | Purple |
