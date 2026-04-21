function ensureApiConfig_() {
  var baseUrl = String((CONFIG.API && CONFIG.API.BASE_URL) || '').trim();
  if (!baseUrl) {
    throw new Error('Chua cau hinh API_BASE_URL (Script Properties hoac Env.gs).');
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    internalApiKey: String((CONFIG.API && CONFIG.API.INTERNAL_API_KEY) || '').trim(),
    timeoutMs: Number((CONFIG.API && CONFIG.API.TIMEOUT_MS) || 20000)
  };
}

function buildApiUrl_(path, query) {
  var cfg = ensureApiConfig_();
  var normalizedPath = String(path || '').trim();
  if (!normalizedPath) {
    throw new Error('API path is required');
  }
  if (normalizedPath.charAt(0) !== '/') {
    normalizedPath = '/' + normalizedPath;
  }

  var url = cfg.baseUrl + normalizedPath;
  var params = query || {};
  var keys = Object.keys(params);
  var pairs = [];

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var value = params[key];
    if (value === null || value === undefined || String(value).trim() === '') {
      continue;
    }
    pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }

  if (pairs.length) {
    url += (url.indexOf('?') === -1 ? '?' : '&') + pairs.join('&');
  }

  return url;
}

function parseJsonSafe_(text) {
  try {
    return JSON.parse(String(text || '{}'));
  } catch (err) {
    return {};
  }
}

function apiRequest_(method, path, payload, query, options) {
  var cfg = ensureApiConfig_();
  var requestOptions = options || {};
  var url = buildApiUrl_(path, query);

  var headers = {
    Accept: 'application/json'
  };

  var useInternalKey = requestOptions.useInternalKey !== false;
  if (useInternalKey && cfg.internalApiKey) {
    headers['x-internal-api-key'] = cfg.internalApiKey;
  }

  var fetchOptions = {
    method: String(method || 'get').toLowerCase(),
    muteHttpExceptions: true,
    headers: headers,
    contentType: 'application/json',
    followRedirects: true
  };

  if (payload !== null && payload !== undefined) {
    fetchOptions.payload = JSON.stringify(payload);
  }

  var response = UrlFetchApp.fetch(url, fetchOptions);
  var status = Number(response.getResponseCode() || 0);
  var bodyText = response.getContentText();
  var body = parseJsonSafe_(bodyText);

  if (status < 200 || status >= 300 || body.ok === false) {
    var message = String(body.error || body.message || ('HTTP ' + status));
    throw new Error('API request failed: ' + message);
  }

  return body;
}

function apiGet_(path, query, options) {
  return apiRequest_('get', path, null, query, options);
}

function apiPost_(path, payload, query, options) {
  return apiRequest_('post', path, payload, query, options);
}
