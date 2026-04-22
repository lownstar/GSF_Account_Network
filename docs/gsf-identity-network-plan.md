# GSF Identity Network — Cross-Functional Build Plan

## Project Focus
This project's defined purpose is now: **visualize the GSF multi-source identity ambiguity problem** as the setup half of a two-demo portfolio narrative. The GSF Semantic Pipeline demo is the resolution half. Legacy client account graphs (the `json/` files) are retained infrastructure — they are not the focus.

---

## Narrative Goal
> "Here's a canonical account. It appears as three different records across three source systems — and each system reports a different market value. Which number is right? That's the question the semantic pipeline answers."

The visualizer poses the question. The pipeline resolves it.

---

## Phase 1 — Can Start Now (unblocked)
The GSF position CSVs already exist with the MV discrepancy data needed.

---

### [GSF_Account_Network] Task 1 — `scripts/importGSF.js` (new file, ~130 lines)

Reads three CSVs from `../GSF_Semantic_Pipeline/data/seed_v2/`:
- `dw_account.csv` → 100 canonical accounts (`account_id, account_name, account_type, custodian_account_num, portfolio_code, fund_code`)
- `positions_topaz.csv` → aggregate `MKT_VAL` by `ACCT_NUM` → per-account Topaz MV
- `positions_emerald.csv` → aggregate `marketValue` by `portfolioId` → per-account Emerald MV

Creates one graph: **"GSF Identity Network — 100 Accounts"**
- 400 nodes: 100 canonical hubs (group 1) + 300 source spokes (groups 2/3/4)
- 300 links: each canonical → its Topaz, Emerald, Ruby spokes (`"Appears As"`)
- Canonical node `metadata` JSON: `{ topaz_mv, emerald_mv, mv_delta }`

Reuses the idempotent DB pattern from `scripts/importGsfTest.js`. No new npm dependencies (manual CSV split). CSV path is relative to script: `../../GSF_Semantic_Pipeline/data/seed_v2/`.

Node types:
```
1 → Canonical Account
2 → Topaz Record
3 → Emerald Record
4 → Ruby Record
```

---

### [GSF_Account_Network] Task 2 — `server/routes/graphs.js` (edit)

Confirm or add `metadata` to the node SELECT query. Parse the JSON string before returning in the route response:
```sql
SELECT n.label AS id, nt.display_group AS group, n.status,
       n.metadata AS metadata
FROM Node n ...
```

---

### [GSF_Account_Network] Task 3 — `index.html` (edit)

Add a `nodeLabel` callback that surfaces MV discrepancy on hover for canonical nodes:
```js
Graph.nodeLabel(node => {
  if (node.metadata) {
    const m = node.metadata;
    const fmt = v => '$' + (v / 1e6).toFixed(2) + 'M';
    return `${node.id}<br>` +
           `Topaz MV: ${fmt(m.topaz_mv)}<br>` +
           `Emerald MV: ${fmt(m.emerald_mv)}<br>` +
           `Δ ${fmt(Math.abs(m.mv_delta))}`;
  }
  return node.id;
});
```

---

## Phase 2 — Blocked on GSF_Semantic_Pipeline
This project cannot build the account hierarchy view until the pipeline project delivers the items below.

---

### [GSF_Semantic_Pipeline] Required: Add client/household tier to seed generator

In `generator_v2/models/canonical.py`:
1. Add `generate_dw_client()` — produce ~20–25 synthetic clients, each owning 3–5 accounts
2. Add `client_id` foreign key to `dw_account.csv`
3. Regenerate all seed CSVs: `python -m generator_v2.generator`

No changes to `positions_topaz.csv` or `positions_emerald.csv` structure needed — client-level MV rollup is derivable via the `dw_account.client_id` join once it exists.

---

### [GSF_Account_Network] Unblocked by above: `scripts/importGSFHierarchy.js` (new file)

Imports client → account → source record three-tier graphs (one graph per client). Shows how a client's accounts roll up differently in Topaz vs Emerald. Extends node groups to add group 5 (Client/Household) as root tier.

---

## Verification (Phase 1)
1. `node scripts/importGSF.js` → reports "Imported: GSF Identity Network — 100 Accounts (400 nodes, 300 links)"
2. `npm start` → select "GSF Identity Network — 100 Accounts" from dropdown
3. Hover a canonical node → tooltip shows Topaz MV / Emerald MV / delta
4. Graph type pill shows "GSF Multi-Source Identity"
5. Three source spokes visible per canonical hub
