import * as dashboardServiceNs from "./services/dashboard.service.js";
import * as submissionServiceNs from "./services/submission.service.js";
import * as paymentServiceNs from "./services/payment.service.js";
import * as playerRepoNs from "./repositories/player.repo.js";

function cjs(mod) {
  return mod && mod.default ? mod.default : mod;
}

const dashboardService = cjs(dashboardServiceNs);
const submissionService = cjs(submissionServiceNs);
const paymentService = cjs(paymentServiceNs);
const playerRepo = cjs(playerRepoNs);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-internal-api-key",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

function withCors(extra = {}) {
  return { ...CORS_HEADERS, ...extra };
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: withCors({ "Content-Type": "application/json; charset=utf-8" })
  });
}

function applyEnvBindings(env) {
  if (!env || typeof env !== "object") {
    return;
  }

  const keys = [
    "MONGO_URI",
    "INTERNAL_API_KEY",
    "APP_TIMEZONE",
    "PAYOS_CLIENT_ID",
    "PAYOS_API_KEY",
    "PAYOS_CHECKSUM_KEY",
    "PAYOS_API_BASE",
    "PAYOS_RETURN_URL",
    "PAYOS_CANCEL_URL",
    "PAYMENT_CODE_PREFIX",
    "PORT"
  ];

  for (const key of keys) {
    if (env[key] !== undefined && env[key] !== null) {
      process.env[key] = String(env[key]);
    }
  }
}

function validateInternalApiKey(request) {
  const expected = String(process.env.INTERNAL_API_KEY || "").trim();
  if (!expected) {
    return jsonResponse(500, { ok: false, error: "INTERNAL_API_KEY is not configured" });
  }

  const incoming = String(request.headers.get("x-internal-api-key") || "").trim();
  if (!incoming || incoming !== expected) {
    return jsonResponse(401, { ok: false, error: "Unauthorized internal request" });
  }

  return null;
}

async function parseBody(request) {
  const method = String(request.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") {
    return {};
  }

  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    try {
      return await request.json();
    } catch {
      const err = new Error("Invalid request body");
      err.statusCode = 400;
      throw err;
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    const body = {};
    for (const [key, value] of params.entries()) {
      body[key] = value;
    }
    return body;
  }

  return {};
}

function handleError(error, request) {
  const status = Number(error && error.statusCode) || 500;
  const message = error && error.message ? error.message : "Internal server error";

  // eslint-disable-next-line no-console
  console.error("[worker:error]", {
    path: new URL(request.url).pathname,
    method: request.method,
    status,
    message,
    stack: error && error.stack ? error.stack : undefined
  });

  return jsonResponse(status, { ok: false, error: message });
}

async function handlePublicRoute(method, path, url) {
  if (method === "GET" && path === "/health") {
    return jsonResponse(200, { ok: true, status: "healthy", time: new Date().toISOString() });
  }

  if (method === "GET" && path === "/api/weeks") {
    const weeks = await dashboardService.getWeeks();
    return jsonResponse(200, { ok: true, weeks });
  }

  if (method === "GET" && path === "/api/players") {
    const players = await playerRepo.listPlayers({
      email: url.searchParams.get("email")
    });
    return jsonResponse(200, { ok: true, players });
  }

  if (method === "GET" && path === "/api/submissions") {
    const weekKey = String(url.searchParams.get("weekKey") || "").trim();
    if (!weekKey) {
      const weeks = await dashboardService.getWeeks();
      return jsonResponse(200, { ok: true, weekKey: "", submissions: [], weeks });
    }

    const submissions = await dashboardService.getWeekRequests(weekKey);
    return jsonResponse(200, { ok: true, weekKey, submissions });
  }

  if (method === "GET" && path === "/api/payments") {
    const payments = await paymentService.listPayments({
      status: url.searchParams.get("status"),
      email: url.searchParams.get("email"),
      date: url.searchParams.get("date")
    });
    return jsonResponse(200, { ok: true, payments });
  }

  if (method === "GET") {
    const match = path.match(/^\/api\/payments\/([^/]+)$/);
    if (match) {
      const payment = await paymentService.getPaymentByOrderCode(match[1]);
      if (!payment) {
        return jsonResponse(404, { ok: false, error: "Payment not found" });
      }
      return jsonResponse(200, { ok: true, payment });
    }
  }

  return null;
}

async function handleInternalRoute(method, path, url, body) {
  if (method === "POST" && path === "/internal/sync-submission") {
    const result = await submissionService.syncSubmission(body || {});
    return jsonResponse(200, { ok: true, ...result });
  }

  if (method === "POST" && path === "/internal/sync-submissions-batch") {
    const result = await submissionService.syncSubmissionsBatch(body && body.items ? body.items : []);
    return jsonResponse(200, { ok: true, ...result });
  }

  if (method === "GET" && path === "/internal/weeks") {
    const weeks = await dashboardService.getWeeks();
    return jsonResponse(200, { ok: true, weeks });
  }

  if (method === "GET" && path === "/internal/week-requests") {
    const weekKey = String(url.searchParams.get("weekKey") || "").trim();
    const requests = await dashboardService.getWeekRequests(weekKey);
    return jsonResponse(200, { ok: true, weekKey, requests });
  }

  if (method === "POST" && path === "/internal/save-priorities") {
    const result = await dashboardService.savePriorities(body && body.weekKey, body && body.items);
    return jsonResponse(200, { ok: true, ...result });
  }

  if (method === "POST" && path === "/internal/increment-selection-counts") {
    const payload = body || {};
    const result = await dashboardService.incrementSelectionCounts({
      weekKey: payload.weekKey,
      eventDate: payload.eventDate,
      selectedItems: payload.selectedItems,
      source: payload.source
    });
    return jsonResponse(200, { ok: true, ...result });
  }

  if (method === "POST" && path === "/internal/create-payment") {
    const result = await paymentService.createPayment(body || {});
    return jsonResponse(200, { ok: true, ...result });
  }

  if (method === "POST" && path === "/internal/mark-payments-paid-manual") {
    const result = await paymentService.markPaymentsPaidManual(body || {});
    return jsonResponse(200, { ok: true, ...result });
  }

  if (method === "GET" && path === "/internal/payment-status-map") {
    const weekKey = String(url.searchParams.get("weekKey") || "").trim();
    const map = await paymentService.getPaymentStatusMapForWeek(weekKey);
    return jsonResponse(200, { ok: true, weekKey, map });
  }

  if (method === "GET" && path === "/internal/ready-group-mails") {
    const cooldownMinutes = Number(url.searchParams.get("cooldownMinutes") || url.searchParams.get("cooldown") || 0);
    const rows = await paymentService.getReadyGroupMails(cooldownMinutes);
    return jsonResponse(200, { ok: true, rows });
  }

  if (method === "POST" && path === "/internal/mark-mail-sent") {
    const result = await paymentService.markMailSent(body || {});
    return jsonResponse(200, { ok: true, ...result });
  }

  return null;
}

async function handleWebhookRoute(method, path, body) {
  if (method === "GET" && path === "/webhooks/payos") {
    return jsonResponse(200, { ok: true, message: "PayOS webhook endpoint is ready" });
  }

  if (method === "POST" && path === "/webhooks/payos") {
    const result = await paymentService.processPayosWebhook(body || {});
    return jsonResponse(200, { ok: true, ...result });
  }

  return null;
}

async function handleRequest(request, env) {
  applyEnvBindings(env);

  const method = String(request.method || "GET").toUpperCase();
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: withCors() });
  }

  const url = new URL(request.url);
  const path = url.pathname;
  const body = await parseBody(request);

  const publicResponse = await handlePublicRoute(method, path, url);
  if (publicResponse) {
    return publicResponse;
  }

  if (path.startsWith("/internal/")) {
    const authError = validateInternalApiKey(request);
    if (authError) {
      return authError;
    }

    const internalResponse = await handleInternalRoute(method, path, url, body);
    if (internalResponse) {
      return internalResponse;
    }
  }

  const webhookResponse = await handleWebhookRoute(method, path, body);
  if (webhookResponse) {
    return webhookResponse;
  }

  return jsonResponse(404, { ok: false, error: "Route not found" });
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      return handleError(error, request);
    }
  }
};
