require('dotenv').config();
const express = require('express');
const cors = require('cors');
const internalRoutes = require('./routes/internal.routes');
const webhookRoutes = require('./routes/webhook.routes');
const publicRoutes = require('./routes/public.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());

function parseRequestBody(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return next();
  }

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  const shouldParseJson = contentType.includes('application/json');
  const shouldParseForm = contentType.includes('application/x-www-form-urlencoded');

  if (!shouldParseJson && !shouldParseForm) {
    req.body = req.body || {};
    return next();
  }

  let raw = '';
  let aborted = false;
  const maxBytes = 2 * 1024 * 1024;

  req.setEncoding('utf8');

  req.on('data', (chunk) => {
    if (aborted) {
      return;
    }

    raw += chunk;
    if (raw.length > maxBytes) {
      aborted = true;
      res.status(413).json({ ok: false, error: 'Payload too large' });
    }
  });

  req.on('end', () => {
    if (aborted) {
      return;
    }

    if (!raw) {
      req.body = {};
      return next();
    }

    try {
      if (shouldParseJson) {
        req.body = JSON.parse(raw);
      } else {
        const params = new URLSearchParams(raw);
        const parsed = {};
        for (const [key, value] of params.entries()) {
          parsed[key] = value;
        }
        req.body = parsed;
      }
      return next();
    } catch (error) {
      return res.status(400).json({ ok: false, error: 'Invalid request body' });
    }
  });

  return req.on('error', next);
}

app.use(parseRequestBody);

app.use('/internal', internalRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/', publicRoutes);

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Route not found' });
});

app.use(errorHandler);

module.exports = app;
