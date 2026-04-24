-- Account Network: General-Purpose Node Mapping Schema
-- SQLite

PRAGMA foreign_keys = ON;

-- A class/template for a type of network (e.g., "Account Network", "Org Chart")
CREATE TABLE IF NOT EXISTS GraphType (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    description TEXT
);

-- Node categories within a graph type (maps to 'group' in 3d-force-graph frontend)
CREATE TABLE IF NOT EXISTS NodeType (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    graph_type_id  INTEGER NOT NULL REFERENCES GraphType(id),
    name           TEXT NOT NULL,       -- e.g., "Root", "Branch", "Leaf"
    display_group  INTEGER NOT NULL,    -- 1, 2, 3... drives color coding in visualization
    color          TEXT                 -- optional hex color override
);

-- Link/relationship categories within a graph type
CREATE TABLE IF NOT EXISTS LinkType (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    graph_type_id  INTEGER NOT NULL REFERENCES GraphType(id),
    name           TEXT NOT NULL,       -- e.g., "Parent", "Custodian", "Reports To"
    color          TEXT
);

-- Individual named graph instances
CREATE TABLE IF NOT EXISTS Graph (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    graph_type_id  INTEGER NOT NULL REFERENCES GraphType(id),
    name           TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'Active',
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Nodes within a graph
CREATE TABLE IF NOT EXISTS Node (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    graph_id      INTEGER NOT NULL REFERENCES Graph(id) ON DELETE CASCADE,
    node_type_id  INTEGER NOT NULL REFERENCES NodeType(id),
    label         TEXT NOT NULL,   -- display name; maps to 'id' field in 3d-force-graph JSON
    status        TEXT NOT NULL DEFAULT 'Active',
    metadata      TEXT            -- optional JSON blob for extra attributes
);

-- Links (edges) between nodes
-- curvature and rotation are NOT stored here; computed at query time by the API
-- (duplicate source→target pairs get curvature=0.5 and random rotation)
CREATE TABLE IF NOT EXISTS Link (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    graph_id        INTEGER NOT NULL REFERENCES Graph(id) ON DELETE CASCADE,
    source_node_id  INTEGER NOT NULL REFERENCES Node(id) ON DELETE CASCADE,
    target_node_id  INTEGER NOT NULL REFERENCES Node(id) ON DELETE CASCADE,
    link_type_id    INTEGER NOT NULL REFERENCES LinkType(id),
    status          TEXT NOT NULL DEFAULT 'Active'
);
