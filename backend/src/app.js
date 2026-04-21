require('dotenv').config();
const express = require('express');
const cors = require('cors');
const internalRoutes = require('./routes/internal.routes');
const webhookRoutes = require('./routes/webhook.routes');
const publicRoutes = require('./routes/public.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

app.use('/internal', internalRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/', publicRoutes);

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Route not found' });
});

app.use(errorHandler);

module.exports = app;
