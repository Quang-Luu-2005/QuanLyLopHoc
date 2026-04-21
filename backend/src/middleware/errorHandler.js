function errorHandler(err, req, res, next) {
  const status = Number(err && err.statusCode) || 500;
  const message = (err && err.message) ? err.message : 'Internal server error';

  // eslint-disable-next-line no-console
  console.error('[error]', {
    path: req.path,
    method: req.method,
    status,
    message,
    stack: err && err.stack ? err.stack : undefined
  });

  if (res.headersSent) {
    return next(err);
  }

  return res.status(status).json({ ok: false, error: message });
}

module.exports = errorHandler;
