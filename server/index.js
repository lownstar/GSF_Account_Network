const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static files (index.html, src/) from project root
app.use(express.static(path.join(__dirname, '..')));

// API routes
app.use('/api/graph-types', require('./routes/graphTypes'));
app.use('/api/graphs', require('./routes/graphs'));

app.listen(PORT, () => {
  console.log(`Account Network server running at http://localhost:${PORT}`);
});
