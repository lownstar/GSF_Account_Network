# Cleanup Plan — Safe for Public Repo

## Problem
The current git history contains real institutional client data that cannot be made public:
- **2,870 `json/*.json` files** — real client names (e.g. "1199 SEIU Greater New York Pension Fund"), real account codes (e.g. `221700`, `157-68253`, `047-789136`), real custodian codes
- **`scripts/nameMap.json`** — the real→fake name mapping, i.e. real client names in plain text
- **`.vs/` directory** — Visual Studio workspace files with local IIS config and paths
- **`.claude/settings.local.json`** — local Claude Code permission settings

Simply deleting these files and committing does not remove them — deleted files are fully recoverable from `git log`. The entire history must be replaced.

---

## Approach: Fresh Repo (Recommended)
The repo has only 9 commits. A clean start is simpler and safer than history rewriting (`git filter-repo`). The backup copy preserves the old history if ever needed.

---

## Files to KEEP in New Repo

### Application code (safe — no real data)
- `.gitignore`
- `CLAUDE.md`
- `README.md`
- `package.json`
- `package-lock.json`
- `index.html`
- `server/index.js`
- `server/db.js`
- `server/routes/graphs.js`
- `server/routes/graphTypes.js`
- `db/schema.sql`
- `src/` (local library copies)

### Scripts (safe — generic, no client data)
- `scripts/importJson.js`
- `scripts/obfuscate.js`
- `scripts/importGsfTest.js`

### GSF synthetic data (safe — fully synthetic)
- `json/gsf_test.json`
- `docs/gsf-identity-network-plan.md`
- `docs/cleanup-plan.md`

---

## Files to EXCLUDE from New Repo

| File / Path | Reason |
|---|---|
| `json/*.json` (all except `gsf_test.json`) | Real client names + account codes |
| `scripts/nameMap.json` | Real→fake client name mapping; contains real names |
| `.vs/` | VS workspace files with local paths + IIS config |
| `.claude/settings.local.json` | Local tool permissions; not repo-appropriate |

---

## Steps

### Step 1 — Verify backup exists
Confirm the backup copy of this project is in place before touching the repo.

### Step 2 — Update `.gitignore` in the clean copy
Add these patterns before re-init:
```
# Real client data — never commit
json/*.json
!json/gsf_test.json
scripts/nameMap.json

# IDE / local tooling
.vs/
.claude/settings.local.json
```

### Step 3 — Delete the current `.git/` folder
This drops the entire commit history, including all real data. The working files are untouched.

### Step 4 — Remove excluded files from working tree
Delete `json/*.json` (except `gsf_test.json`), `scripts/nameMap.json`, `.vs/`, `.claude/settings.local.json` from the working directory.

### Step 5 — `git init` and first commit
```bash
git init
git add .
git commit -m "Initialize GSF Account Network — clean public repo"
```

### Step 6 — Connect to GitHub remote
If the GitHub remote already exists (from `lownstar/GSF_Account_Network`), force-push the new history:
```bash
git remote add origin <remote-url>
git push --force origin main
```
> Note: force-push replaces all remote history. Confirm with user before executing.

### Step 7 — Verify on GitHub
After push, browse the repo on GitHub and confirm:
- No `json/*.json` files (except `gsf_test.json`)
- No `scripts/nameMap.json`
- No `.vs/` directory
- No commit history containing the old files

---

## After Cleanup: What the Repo Contains
A focused Node.js + Express + SQLite visualization app with:
- The generic account network infrastructure (server, schema, frontend)
- The GSF multi-source identity import script (`importGsfTest.js`) and test graph
- The Phase 1 build plan (`docs/gsf-identity-network-plan.md`)
- No real client data anywhere in files or history
