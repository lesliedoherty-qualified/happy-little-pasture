// Serves site/ for local testing: npm start, then http://localhost:4600
//
// The same files deploy unchanged to GitHub Pages. Caching is off so a
// reload always picks up an edit.
import express from "express";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT) || 4600;
const root = fileURLToPath(new URL("./site", import.meta.url));
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
