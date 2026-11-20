const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const STATIC_DIR = path.join(__dirname, 'bhoomi-lens');

const staticOptions = {
  index: 'index.html',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  },
};

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/bhoomi-lens', express.static(STATIC_DIR, staticOptions));
app.use('/', express.static(STATIC_DIR, staticOptions));

app.get('*', (req, res, next) => {
  if (req.path.includes('.')) {
    return next();
  }
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Bhoomi Lens server listening on http://${HOST}:${PORT}`);
});
