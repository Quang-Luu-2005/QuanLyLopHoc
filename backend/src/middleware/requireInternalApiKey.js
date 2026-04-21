function requireInternalApiKey(req, res, next) {
  const expected = String(process.env.INTERNAL_API_KEY || '').trim();
  if (!expected) {
    return res.status(500).json({ ok: false, error: 'INTERNAL_API_KEY is not configured' });
  }

  const incoming = String(req.headers['x-internal-api-key'] || '').trim();
  if (!incoming || incoming !== expected) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request' });
  }

  return next();
}

module.exports = requireInternalApiKey;
