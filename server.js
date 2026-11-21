// Serves site/ for local testing: npm start, then http://localhost:4600
//
// The same files deploy unchanged to GitHub Pages. Caching is off so a
// reload always picks up an edit.
//
// It also runs the mock "test CDN" on its own origin (http://localhost:4601), serving cdn-test/
// the way a CDN would serve a customer's copy of the Qualified package: CSS, JS and fonts only,
// cross-origin, plus a mock Google Tag Manager at /gtm.js?id=. npm run self-hosted fills cdn-test/.
// Set CDN_PORT to move it, or CDN_PORT=0 to turn it off. ?delay=<ms> slows any mock-CDN response;
// GTM_DELAY_MS slows the mock GTM container by default.
import express from "express";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT) || 4600;
const cdnPort = process.env.CDN_PORT === undefined ? 4601 : Number(process.env.CDN_PORT);
const root = fileURLToPath(new URL("./site", import.meta.url));
const cdnRoot = fileURLToPath(new URL("./cdn-test", import.meta.url));
const app = express();

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.static(root, { etag: false, extensions: ["html"] }));

app.listen(port, () => {
  console.log(`Happy little pasture: http://localhost:${port}`);
  console.log(`  local Piper: http://localhost:${port}/?env=local`);
  console.log(`  QA Piper:    http://localhost:${port}/?env=qa`);
});

if (cdnPort) {
  const cdn = express();
  cdn.use((req, res, next) => {
    // Cross-origin like a real CDN: fonts and timing need CORS headers. No caching, so a new
    // export shows up on reload.
    res.set({
      "Access-Control-Allow-Origin": "*",
      "Timing-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
    next();
  });
  // Timing: ?delay=<ms> holds any mock-CDN response, so a test can slow one script on purpose.
  // GTM_DELAY_MS sets a default delay for the mock GTM container (gtm.js) only.
  const gtmDelay = Number(process.env.GTM_DELAY_MS) || 0;
  cdn.use((req, res, next) => {
    const delay = Number(req.query.delay ?? (req.path === "/gtm.js" ? gtmDelay : 0)) || 0;
    if (delay > 0) setTimeout(next, Math.min(delay, 60000));
    else next();
  });
  // Mock Google Tag Manager: gtm.js?id=<ID> serves the container npm run self-hosted wrote to
  // cdn-test/gtm/<ID>.js, the way googletagmanager.com serves gtm.js?id=GTM-XXXX.
  cdn.get("/gtm.js", (req, res) => {
    const id = String(req.query.id || "");
    if (!/^GTM-[A-Z0-9-]+$/.test(id)) return res.status(400).type("text/plain").send("Missing or invalid ?id=");
    res.type("application/javascript").sendFile(`${cdnRoot}/gtm/${id}.js`, (error) => {
      if (error && !res.headersSent) res.status(404).type("text/plain").send(`No mock container ${id}. Run npm run self-hosted.`);
    });
  });
  cdn.use(express.static(cdnRoot, { etag: false, index: false, fallthrough: false }));
  cdn.listen(cdnPort, () => {
    console.log(`  Test CDN:    http://localhost:${cdnPort}/<local|qa>/ (cdn-test/), mock GTM at /gtm.js?id=`);
  });
}
