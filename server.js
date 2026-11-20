// Serves site/ for local testing: npm start, then http://localhost:4600
//
// The same files deploy unchanged to GitHub Pages. Caching is off so a
// reload always picks up an edit.
//
// It also runs the mock "test CDN" on its own origin (http://localhost:4601), serving cdn-test/
// the way a CDN would serve a customer's copy of the Qualified package: CSS, JS and fonts only,
// cross-origin. npm run self-hosted fills cdn-test/. Set CDN_PORT to move it, or CDN_PORT=0 to
// turn it off.
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
  cdn.use(express.static(cdnRoot, { etag: false, index: false, fallthrough: false }));
  cdn.listen(cdnPort, () => {
    console.log(`  Test CDN:    http://localhost:${cdnPort}/<local|qa>/ (cdn-test/)`);
  });
}
