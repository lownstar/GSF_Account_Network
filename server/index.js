const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');

// The project root is deliberately NOT served statically — it contains the
// SQLite database, the seed CSVs, and all server source. Only the single-page
// frontend is public.
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

// Offline dev fallback for the vendored 3D libraries. src/ is gitignored and
// absent in production, where index.html loads them from the CDN instead.
if (process.env.NODE_ENV !== 'production') {
  app.use('/src', express.static(path.join(ROOT, 'src')));
}

// API routes — GET only; see routes/graphs.js
app.use('/api/graph-types', require('./routes/graphTypes'));
app.use('/api/graphs', require('./routes/graphs'));

app.listen(PORT, () => {
  console.log(`Account Network server running at http://localhost:${PORT}`);
});
