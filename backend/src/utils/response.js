function ok(res, data, statusCode) {
  return res.status(statusCode || 200).json({ ok: true, ...data });
}

function fail(res, message, statusCode, extras) {
  return res.status(statusCode || 400).json({
    ok: false,
    error: message || 'Request failed',
    ...(extras || {})
  });
}

module.exports = {
  ok,
  fail
};
