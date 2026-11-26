// What the browser received from Qualified, with every header: a local report.
//
//   npm run inspect -- <page or URL> [--wait=12] [--base=http://localhost:4600/]
//   npm run inspect -- self-hosted-token-head.qa.html
//   npm run inspect -- https://lesliedoherty-qualified.github.io/happy-little-pasture/
//
// Opens the page in headless Chrome with a fresh profile and records, through the DevTools
// Protocol, each request to Qualified (anything off the page's host, and the site's /qualified*
// and /cdn/ packages): request and response headers, status, cache, timing, the bodies of the
// calls that decide what Piper shows, the cable handshake and its frames. It then reads what Piper
// made of it (the head's saved settings, the initialize config) from the page.
//
// A page can't read most of these headers itself (Qualified's responses expose none to other
// origins), which is why this runs outside the page. The ?inspect=1 panel shows the rest.
//
// Safe: it only loads the page, like a visitor would. The report is redacted with the same rules
// as the panel (the shared block in site/js/inspect-early.js), cookies show names only, and it's
// written to inspect-reports/ (git-ignored), never published. Pages opened from the local server
// talk to whichever Qualified environment they install, so a QA page creates a QA visitor.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const target = args.find((a) => !a.startsWith("--"));
if (!target) {
  console.error("Usage: npm run inspect -- <page or URL> [--wait=12] [--base=http://localhost:4600/]");
  process.exit(1);
}
const waitMs = Number(option("wait", "12")) * 1000;
const base = option("base", "http://localhost:4600/");
const pageUrl = new URL(/^https?:/.test(target) ? target : target.replace(/^\//, ""), base).href;

// Never hang: give up a while after the wait, whatever Chrome is doing.
const step = (text) => process.env.DEBUG && console.error(`[inspect] ${text}`);
setTimeout(() => {
  console.error("Timed out talking to Chrome.");
  process.exit(2);
}, waitMs + 30000);

// --- The shared redaction rules, from the browser recorder --------------------------------------

const early = fs.readFileSync(path.join(root, "site/js/inspect-early.js"), "utf8");
const shared = early.slice(early.indexOf("// BEGIN SHARED"), early.indexOf("// END SHARED"));
if (!shared.includes("function redact(")) throw new Error("No shared block in site/js/inspect-early.js");
const rules = vm.runInNewContext(
  `${shared}; ({ redact, redactString, parseBody, shortUrl, redactHeaders, roleOf, DECISION_EVENTS })`,
  { URL, WeakSet, Map, Set, Object, Array, JSON, String },
);

// --- Chrome --------------------------------------------------------------------------------------

// Playwright's browsers come first. A managed Google Chrome (Chrome Enterprise cloud policy, as on
// Salesforce Macs) closes its DevTools port about five seconds after it starts, once the policy
// arrives, so it's only the last resort. Playwright's browsers don't read that policy.
function findChrome() {
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  // Newest Playwright build first.
  const playwright = (prefix, binary) =>
    fs.existsSync(cache)
      ? fs
          .readdirSync(cache)
          .filter((d) => d.startsWith(`${prefix}-`))
          .sort((a, b) => Number(b.split("-").pop()) - Number(a.split("-").pop()))
          .map((d) => path.join(cache, d, binary))
      : [];
  const candidates = [
    process.env.CHROME,
    ...playwright("chromium_headless_shell", "chrome-headless-shell-mac-arm64/chrome-headless-shell"),
    ...playwright("chromium", "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) throw new Error("No Chrome found. Run `npx playwright install chromium-headless-shell`, or set CHROME=/path/to/chrome.");
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pasture-inspect-"));
const port = 9400 + Math.floor(Math.random() * 400);
const chromePath = findChrome();
const chrome = spawn(
  chromePath,
  [
    ...(chromePath.includes("headless-shell") ? [] : ["--headless=new"]),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--disable-gpu",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const removeProfile = () => {
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* the OS clears its temp folder */
  }
};
const chromeExited = new Promise((resolve) => chrome.on("exit", resolve));
// Stop Chrome, wait for it to let go of its profile, then remove the profile.
const cleanup = async () => {
  chrome.kill();
  await Promise.race([chromeExited, sleep(3000)]);
  removeProfile();
};
process.on("exit", () => {
  chrome.kill();
  removeProfile();
});

step(`chrome ${chromePath} on port ${port}`);
let targets;
for (let i = 0; i < 75 && !targets; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  } catch {
    await sleep(200);
  }
}
const pageTarget = targets && targets.find((t) => t.type === "page");
if (!pageTarget) throw new Error("Chrome didn't start");
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
const handlers = {};
ws.onmessage = (m) => {
  const data = JSON.parse(m.data);
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)(data);
    pending.delete(data.id);
  } else if (data.method && handlers[data.method]) handlers[data.method](data.params);
};
let closed = false;
const send = (method, params = {}) =>
  new Promise((resolve) => {
    if (closed) return resolve({ error: { message: "DevTools connection closed" } });
    pending.set(++nextId, resolve);
    ws.send(JSON.stringify({ id: nextId, method, params }));
  });
await new Promise((r) => (ws.onopen = r));
// If Chrome drops the connection (a managed Chrome does, see findChrome), say so and stop now
// instead of waiting for the watchdog.
ws.onclose = () => {
  if (closed) return;
  closed = true;
  console.error(
    `Chrome closed the DevTools connection (${chromePath}).` +
      (chromePath.includes("/Applications/Google Chrome.app")
        ? " This Google Chrome is managed and turns remote debugging off a few seconds after it starts." +
          " Run `npx playwright install chromium-headless-shell`, or set CHROME= to another browser."
        : ""),
  );
  process.exit(2);
};
step("connected");

// --- Recording -----------------------------------------------------------------------------------

const pageHost = new URL(pageUrl).host;
const recorded = (url) => {
  try {
    const u = new URL(url);
    if (!/^(https?|wss?):$/.test(u.protocol)) return false;
    if (u.host !== pageHost) return true;
    return /^\/(qualified[^/]*|cdn)\//.test(u.pathname);
  } catch {
    return false;
  }
};

const requests = new Map();
const sockets = new Map();
let start = null;
const at = (timestamp) => (start == null ? 0 : timestamp - start).toFixed(2) + "s";

handlers["Network.requestWillBeSent"] = (p) => {
  if (start == null) start = p.timestamp;
  if (!recorded(p.request.url)) return;
  const prior = requests.get(p.requestId);
  if (prior && p.redirectResponse) {
    prior.redirects = (prior.redirects || []).concat({ status: p.redirectResponse.status, to: rules.shortUrl(p.request.url, pageUrl) });
  }
  requests.set(p.requestId, {
    ...(prior || {}),
    url: p.request.url,
    method: p.request.method,
    type: p.type,
    t: at(p.timestamp),
    requestHeaders: { ...(prior?.requestHeaders || {}), ...p.request.headers },
    postData: p.request.postData,
  });
};
handlers["Network.requestWillBeSentExtraInfo"] = (p) => {
  const r = requests.get(p.requestId);
  if (r) r.requestHeaders = { ...r.requestHeaders, ...p.headers };
};
handlers["Network.responseReceived"] = (p) => {
  const r = requests.get(p.requestId);
  if (!r) return;
  const res = p.response;
  r.status = res.status;
  r.mimeType = res.mimeType;
  r.protocol = res.protocol;
  r.fromCache = res.fromDiskCache ? "disk cache" : res.fromPrefetchCache ? "prefetch cache" : res.fromServiceWorker ? "service worker" : null;
  r.responseHeaders = { ...res.headers, ...(r.responseHeaders || {}) };
  if (res.timing) r.waitMs = Math.round(res.timing.receiveHeadersEnd - res.timing.sendEnd);
};
handlers["Network.responseReceivedExtraInfo"] = (p) => {
  const r = requests.get(p.requestId);
  // Raw headers, including set-cookie (redacted to names below). May arrive before or after.
  if (r) r.responseHeaders = { ...(r.responseHeaders || {}), ...p.headers };
  else requests.set(p.requestId, { responseHeaders: p.headers, pendingExtra: true });
};
handlers["Network.loadingFinished"] = (p) => {
  const r = requests.get(p.requestId);
  if (!r || r.pendingExtra) return;
  r.size = p.encodedDataLength;
  const role = rules.roleOf(r.url);
  if (role === "decision" || role === "reporting") {
    send("Network.getResponseBody", { requestId: p.requestId }).then((res) => {
      if (res.result) r.body = res.result.base64Encoded ? "[binary body]" : rules.parseBody(res.result.body);
    });
  }
};
handlers["Network.loadingFailed"] = (p) => {
  const r = requests.get(p.requestId);
  if (r) r.failed = p.errorText + (p.blockedReason ? ` (${p.blockedReason})` : "");
};

handlers["Network.webSocketCreated"] = (p) => {
  if (!recorded(p.url)) return;
  sockets.set(p.requestId, { url: p.url, frames: [], sent: [], pings: 0 });
};
handlers["Network.webSocketWillSendHandshakeRequest"] = (p) => {
  const s = sockets.get(p.requestId);
  if (s) {
    s.t = at(p.timestamp);
    s.requestHeaders = p.request.headers;
  }
};
handlers["Network.webSocketHandshakeResponseReceived"] = (p) => {
  const s = sockets.get(p.requestId);
  if (s) {
    s.status = p.response.status;
    s.responseHeaders = p.response.headers;
  }
};
const frameNames = (body) => {
  const message = body && body.message;
  const batch = Array.isArray(message) ? message : message ? [message] : [];
  const names = batch.map((item) => (item && typeof item.event === "string" ? item.event : null)).filter(Boolean);
  return names.length ? names : [(body && body.type) || (message ? "message" : "frame")];
};
handlers["Network.webSocketFrameReceived"] = (p) => {
  const s = sockets.get(p.requestId);
  if (!s) return;
  const data = p.response.payloadData;
  if (data.includes('"type":"ping"')) return void s.pings++;
  const body = rules.parseBody(data);
  const names = frameNames(body);
  s.frames.push({ t: at(p.timestamp), names, channel: body?.identifier?.channel || null, decision: names.some((n) => rules.DECISION_EVENTS.test(n)), size: data.length, body });
};
handlers["Network.webSocketFrameSent"] = (p) => {
  const s = sockets.get(p.requestId);
  if (!s) return;
  const body = rules.parseBody(p.response.payloadData);
  const data = body && typeof body.data === "string" ? rules.parseBody(body.data) : body?.data;
  s.sent.push({ t: at(p.timestamp), command: body?.command, channel: body?.identifier?.channel || null, action: data?.action || null });
};
handlers["Network.webSocketClosed"] = (p) => {
  const s = sockets.get(p.requestId);
  if (s) s.closed = at(p.timestamp);
};

await send("Network.enable", { maxPostDataSize: 65536 });
await send("Page.enable");
await send("Network.setCacheDisabled", { cacheDisabled: false });
console.error(`Opening ${pageUrl} for ${waitMs / 1000}s …`);
await send("Page.navigate", { url: pageUrl });
await sleep(waitMs);
step("reading the page");

// --- What Piper made of it, read from the page ---------------------------------------------------

const evaluated = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    const q = window.qualified, w = q && q.widget, c = w && w.config;
    const status = window.PASTURE_STATUS || {};
    const flags = c && c.featureFlags ? Object.keys(c.featureFlags).filter((k) => c.featureFlags[k]) : [];
    return {
      install: status.install || null,
      environment: status.env || null,
      headInit: status.headInit || null,
      docked: q && q.docking && typeof q.docking.isDocked === "function" ? q.docking.isDocked() : null,
      widget: !!w,
      config: c ? { keys: Object.keys(c).length, isComplete: c.isComplete, featureFlagsOn: flags.length, featureFlags: flags } : null,
    };
  })()`,
});
const piper = rules.redact(evaluated.result?.result?.value || {});
closed = true;
ws.close();
await cleanup();

// --- Report --------------------------------------------------------------------------------------

const ROLE_LABEL = { head: "Head script", widget: "Widget script", decision: "Decision call", reporting: "Reporting", asset: "Asset" };
const calls = [...requests.values()]
  .filter((r) => r.url && !r.pendingExtra)
  .map((r) => ({
    t: r.t,
    role: rules.roleOf(r.url),
    method: r.method,
    url: rules.shortUrl(r.url, pageUrl),
    type: r.type,
    status: r.failed ? `failed: ${r.failed}` : r.status,
    fromCache: r.fromCache,
    protocol: r.protocol,
    waitMs: r.waitMs,
    size: r.size,
    redirects: r.redirects,
    requestHeaders: rules.redactHeaders(r.requestHeaders),
    responseHeaders: rules.redactHeaders(r.responseHeaders),
    sent: r.postData ? rules.parseBody(r.postData) : undefined,
    body: r.body,
  }));

// What each call decided, in a line.
function decided(call) {
  const name = call.url.split("?")[0].split("/").pop();
  if (call.role === "head") {
    const head = piper.headInit;
    return head ? `${head.fromHead ? "applied" : "page called docking.init first;"} saved settings: ${JSON.stringify(head.config)}` : "no saved settings recorded (static pack, or not the Hosted head-token install)";
  }
  if (call.role === "widget" && piper.config)
    return `initialize config inline: ${piper.config.keys} keys, ${piper.config.featureFlagsOn} feature flags on${piper.config.isComplete === false ? ", incomplete (fetches /configuration)" : ""}`;
  if (call.role === "decision" && call.body && typeof call.body === "object") return `${name}: ${JSON.stringify(call.body).slice(0, 200)}`;
  return "";
}

const socketList = [...sockets.values()].map((s) => ({
  t: s.t,
  url: rules.shortUrl(s.url, pageUrl),
  status: s.status,
  closed: s.closed || null,
  requestHeaders: rules.redactHeaders(s.requestHeaders),
  responseHeaders: rules.redactHeaders(s.responseHeaders),
  decisions: s.frames.filter((f) => f.decision),
  conversation: s.frames.filter((f) => !f.decision).map((f) => ({ t: f.t, names: f.names, channel: f.channel })),
  sent: s.sent,
  pings: s.pings,
}));

const report = { page: pageUrl, recordedAt: new Date().toISOString(), waitSeconds: waitMs / 1000, piper, calls, sockets: socketList };

// Terminal summary.
const order = ["head", "widget", "decision", "reporting", "asset"];
const lines = [`\n${pageUrl}`, `Piper: install ${piper.install || "?"}, env ${piper.environment || "?"}, widget ${piper.widget ? "connected" : "not connected"}${piper.docked != null ? `, docked ${piper.docked ? "yes" : "no"}` : ""}\n`];
for (const role of order) {
  const list = calls.filter((c) => c.role === role);
  if (!list.length) continue;
  if (role === "asset" || role === "reporting") {
    lines.push(`${ROLE_LABEL[role]}: ${list.length} request(s) (in the report)`);
    continue;
  }
  for (const call of list) {
    const h = call.responseHeaders;
    lines.push(`${ROLE_LABEL[role]}  ${call.method} ${call.status}  ${call.t}  ${call.url}`);
    const keep = ["cache-control", "cache-tag", "etag", "age", "cf-cache-status", "x-cache", "x-request-id", "x-runtime", "vary", "content-type", "server-timing"];
    const shown = keep.filter((k) => h[k]).map((k) => `${k}: ${h[k]}`);
    if (call.fromCache) shown.unshift(`from ${call.fromCache}`);
    if (shown.length) lines.push("    " + shown.join("\n    "));
    const d = decided(call);
    if (d) lines.push(`    decided: ${d}`);
  }
}
for (const s of socketList) {
  lines.push(`Cable  ${s.status || "?"}  ${s.t || ""}  ${s.url}`);
  const h = s.responseHeaders;
  ["server", "sec-websocket-protocol", "x-request-id"].filter((k) => h[k]).forEach((k) => lines.push(`    ${k}: ${h[k]}`));
  s.decisions.forEach((f) => lines.push(`    ${f.t}  ${f.names.join(", ")}${f.channel ? `  (${f.channel})` : ""}`));
  lines.push(`    + ${s.conversation.length} conversation frame(s), ${s.pings} ping(s), ${s.sent.length} sent`);
}

const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const json = (value) => `<pre>${escape(JSON.stringify(value, null, 2))}</pre>`;
const section = (title, inner, open) => `<details${open ? " open" : ""}><summary>${escape(title)}</summary>${inner}</details>`;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>What the browser received: ${escape(pageUrl)}</title>
<style>
body{font:15px/1.45 system-ui,sans-serif;margin:32px auto;max-width:1100px;padding:0 24px;color:#1a1a2e}
h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:28px}
details{border:1px solid #d8dde6;border-radius:8px;margin:8px 0;padding:6px 12px;background:#fff}
summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12.5px;background:#f6f8fb;padding:10px;border-radius:6px}
.decided{color:#066afe;font-weight:400}.muted{color:#5c6470}
</style></head><body>
<h1>What the browser received</h1>
<p class="muted">${escape(pageUrl)} · recorded ${escape(report.recordedAt)} for ${report.waitSeconds}s in headless Chrome with a fresh profile. Redacted: cookies by name only, identifiers, emails and phone numbers hidden. Local only; don't publish.</p>
<h2>What Piper made of it</h2>${json(piper)}
<h2>Calls</h2>
${order
  .map((role) => {
    const list = calls.filter((c) => c.role === role);
    if (!list.length) return "";
    return `<h3>${escape(ROLE_LABEL[role])} (${list.length})</h3>` + list.map((c) => section(`${c.t}  ${c.method} ${c.status}  ${c.url}`, (decided(c) ? `<p class="decided">decided: ${escape(decided(c))}</p>` : "") + json({ responseHeaders: c.responseHeaders, requestHeaders: c.requestHeaders, fromCache: c.fromCache, protocol: c.protocol, waitMs: c.waitMs, size: c.size, redirects: c.redirects, sent: c.sent, body: c.body }), role !== "asset" && role !== "reporting")).join("");
  })
  .join("")}
<h2>Cable</h2>
${socketList
  .map((s) =>
    section(`${s.t || ""}  ${s.status || "?"}  ${s.url}`, json({ responseHeaders: s.responseHeaders, requestHeaders: s.requestHeaders, closed: s.closed }) +
      s.decisions.map((f) => section(`${f.t}  ${f.names.join(", ")}${f.channel ? `  (${f.channel})` : ""}`, json(f.body))).join("") +
      section(`${s.conversation.length} conversation frame(s), ${s.pings} ping(s), ${s.sent.length} sent`, json({ conversation: s.conversation, sent: s.sent })), true),
  )
  .join("")}
</body></html>
`;

const dir = path.join(root, "inspect-reports");
fs.mkdirSync(dir, { recursive: true });
const stamp = report.recordedAt.replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
const slug = (new URL(pageUrl).pathname.split("/").pop() || "index").replace(/\.html$/, "") || "index";
const file = path.join(dir, `${stamp}-${slug}`);
fs.writeFileSync(`${file}.html`, html);
fs.writeFileSync(`${file}.json`, JSON.stringify(report, null, 2));
console.log(lines.join("\n"));
console.log(`\nReport: ${path.relative(process.cwd(), file)}.html (and .json)`);
process.exit(0);
