// Builds the self-hosted and CDN-host test pages from site/index.html and the package that
// npm run self-hosted copied into site/qualified/.
//
// For each environment in site/config.js (local, qa) it:
//   - prepares the package: site/qualified/ is the local export as-is. site/qualified-qa/ is the
//     same build with the widget's baked-in environment (bootstrap.start({...}): API, WebSocket
//     and CDN hosts) swapped for QA's, the way a package downloaded from QA would be.
//   - copies the CSS, JS and woff2 fonts to the two mock CDNs: cdn-test/<env>/ (served by
//     server.js on its own origin, localhost:4601) and site/cdn/<env>/ (this site's /cdn/).
//   - writes every page in pages.mjs: <file>.html (local) and <file>.qa.html (QA).
//
// The install block is copied verbatim from the package README (the HTML a customer pastes);
// only the README's placeholder asset host and the team token change. That keeps View Source
// honest: each page shows exactly the tags a customer would use for that path.
//
//   node scripts/self-hosted/build-page.mjs     (usually through npm run self-hosted)
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { PAGES, TEST_CDN_ORIGIN } from "./pages.mjs";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const site = `${repo}site`;
const pkg = `${site}/qualified`;
const PLACEHOLDER_HOST = "https://assets.your-company.com/qualified/";
const ENV_SUFFIX = { local: "", qa: ".qa" };

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!existsSync(`${pkg}/README.md`)) fail(`No package at ${pkg}. Run npm run self-hosted first.`);

// Environments (base URL and team token) come from the same config.js the hosted page uses.
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(`${site}/config.js`, "utf8"), sandbox);
const environments = sandbox.window.PASTURE_CONFIG.environments;
for (const env of Object.keys(ENV_SUFFIX)) if (!environments[env]?.token) fail(`config.js has no ${env} token.`);

const readme = readFileSync(`${pkg}/README.md`, "utf8");
const intro = readme.indexOf("Add these tags to your HTML `<head>`");
const fenceStart = intro >= 0 ? readme.indexOf("```html\n", intro) : -1;
const fenceEnd = fenceStart >= 0 ? readme.indexOf("\n```", fenceStart + 8) : -1;
if (fenceEnd < 0) fail("Couldn't find the install HTML block in the package README.");
const install = readme.slice(fenceStart + 8, fenceEnd);
if (!install.includes(PLACEHOLDER_HOST)) fail(`The README install block no longer uses ${PLACEHOLDER_HOST}; update this script.`);

const info = existsSync(`${pkg}/package-info.json`) ? JSON.parse(readFileSync(`${pkg}/package-info.json`, "utf8")) : {};
if (!info.token || !info.js || !info.css || !info.head) fail("package-info.json is incomplete. Run npm run self-hosted -- --export.");
const flagOn = /### Saved messenger setup/.test(readme);
const settings = info.savedSettings ? JSON.stringify(info.savedSettings) : "none (flag off or nothing saved)";

// --- Packages per environment -------------------------------------------------------------

const BOOTSTRAP = /bootstrap\.start\((\{[^\n]*?\})\);/;
const ENV_OBJECT = /\{"version":\d+,"host":"[^"]+"[^{}]*"staleThresholdSeconds":\d+\}/;

async function qaEnvironment() {
  const file = `${repo}scripts/self-hosted/qa-environment.json`;
  const { baseUrl, token } = environments.qa;
  try {
    const response = await fetch(`${baseUrl}/qualified.js?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15000) });
    const found = response.ok && (await response.text()).match(ENV_OBJECT);
    if (found) {
      const environment = JSON.parse(found[0]);
      const saved = JSON.parse(readFileSync(file, "utf8"));
      if (JSON.stringify(saved.environment) !== JSON.stringify(environment)) {
        writeFileSync(file, JSON.stringify({ ...saved, environment }, null, 2) + "\n");
        console.log("Updated scripts/self-hosted/qa-environment.json from QA");
      }
      return environment;
    }
    console.warn(`QA qualified.js had no environment config; using the saved one.`);
  } catch (error) {
    console.warn(`Couldn't reach QA (${error.message}); using the saved environment config.`);
  }
  return JSON.parse(readFileSync(file, "utf8")).environment;
}

const qaPkg = `${site}/qualified-qa`;
rmSync(qaPkg, { recursive: true, force: true });
cpSync(pkg, qaPkg, { recursive: true });
const qaEnv = await qaEnvironment();
for (const name of [info.js, info.js.replace(/\.js$/, ".unminified.js")]) {
  const path = `${qaPkg}/${name}`;
  if (!existsSync(path)) continue;
  const js = readFileSync(path, "utf8");
  if (!BOOTSTRAP.test(js)) fail(`${name} has no bootstrap.start({...}); the package wrapper changed.`);
  writeFileSync(path, js.replace(BOOTSTRAP, () => `bootstrap.start(${JSON.stringify(qaEnv)});`));
}
const packageDir = { local: pkg, qa: qaPkg };
const bakedEnv = {
  local: JSON.parse(readFileSync(`${pkg}/${info.js}`, "utf8").match(BOOTSTRAP)[1]),
  qa: qaEnv,
};

// Mock CDNs: only what the CSS and JS need at runtime (no README, unminified files or daily/).
for (const env of Object.keys(ENV_SUFFIX)) {
  for (const dest of [`${repo}cdn-test/${env}`, `${site}/cdn/${env}`]) {
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(`${dest}/fonts`, { recursive: true });
    for (const name of [info.head, info.js, info.css]) cpSync(`${packageDir[env]}/${name}`, `${dest}/${name}`);
    for (const font of readdirSync(`${packageDir[env]}/fonts`).filter((f) => f.endsWith(".woff2"))) {
      cpSync(`${packageDir[env]}/fonts/${font}`, `${dest}/fonts/${font}`);
    }
  }
}

// --- Pages ----------------------------------------------------------------------------------

const escape = (value) =>
  String(value ?? "unknown").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const indent = (text, spaces) =>
  text
    .split("\n")
    .map((line) => (line ? " ".repeat(spaces) + line : line))
    .join("\n");
const fileFor = (id, env) => `${id}${ENV_SUFFIX[env]}.html`;

const assetBase = (page, env) =>
  ({
    package: env === "qa" ? "qualified-qa/" : "qualified/",
    "test-cdn": `${TEST_CDN_ORIGIN}/${env}/`,
    "prod-cdn": `cdn/${env}/`,
  })[page.assets];

const inlineInit = /\n[ ]*<script type="text\/javascript">\n(?:(?!<\/script>)[\s\S])*?qualified\.sentinel\.init\(\);\n[ ]*<\/script>\n/;
const packageHead = /[ ]*<script src="[^"]*qualified-head-[^"]+\.js" type="text\/javascript"><\/script>\n/;

function installFor(page, env) {
  const { baseUrl, token } = environments[env];
  // The token appears in qualified('initialize', ...) and in the init's stateCookieName.
  let html = install.replaceAll(PLACEHOLDER_HOST, assetBase(page, env)).replaceAll(info.token, token);
  if (!page.init) {
    if (!inlineInit.test(html)) fail("Couldn't find the README's inline init block.");
    html = html.replace(
      inlineInit,
      page.head === "token" ? "\n" : "\n<!-- No inline docking/sentinel init: Settings reach the page only through runtime configuration. -->\n",
    );
  }
  if (page.head === "token") {
    if (!packageHead.test(html)) fail("Couldn't find the README's head script tag.");
    html = html.replace(
      packageHead,
      `<script src="${baseUrl}/docking.js?token=${encodeURIComponent(token)}"></script>\n` +
        "<!-- Head from Qualified (saved settings embedded); widget assets below are self-hosted. -->\n",
    );
  }
  return html;
}

const base = readFileSync(`${site}/index.html`, "utf8");
const loader = /    <!-- Piper goes first[^\n]*\n    <script src="config\.js"><\/script>\n    <script src="js\/piper-loader\.js"><\/script>\n/;
const harness = '<section id="harness" class="harness" aria-label="Test harness"></section>';
const envSwitch = /        <div class="env-switch" role="group" aria-label="Piper environment" data-env-switch>[\s\S]*?<\/div>\n/;
for (const [pattern, what] of [
  [loader, "Piper loader lines"],
  [envSwitch, "environment switch"],
  [/<html lang="en" data-page="hosted">/, "<html> tag"],
  [/<p class="eyebrow">[^<]*<\/p>\s*<h1>[^<]*<\/h1>/, "hero eyebrow and H1"],
  [/ data-nav="hosted" aria-current="page"/, "Hosted menu link"],
]) {
  if (!pattern.test(base)) fail(`index.html's ${what} changed; update build-page.mjs.`);
}
if (!base.includes(harness)) fail("index.html's harness section changed; update build-page.mjs.");

const row = (label, value) =>
  `          <div class="harness__row"><span class="harness__label">${label}</span><span class="harness__value">${value}</span></div>`;

function switchLinks(label, attr, options, prefix) {
  return [
    `        <div class="env-switch" role="group" aria-label="${label}" ${attr}>`,
    ...(prefix ? [`          <span class="env-switch__label" aria-hidden="true">${prefix}</span>`] : []),
    ...options.map(({ text, href, current, title }) =>
      `          <a href="${href}"${current ? ' aria-current="true"' : ""} title="${escape(title)}">${text}</a>`,
    ),
    "        </div>",
  ].join("\n");
}

function buildPage(id, env) {
  const page = PAGES[id];
  const environment = environments[env];
  let html = base.replace(
    loader,
    () =>
      `    <!-- ${page.panel} (${env}). Install copied verbatim from site/qualified/README.md.\n` +
      "         Generated by npm run self-hosted; don't edit by hand. -->\n" +
      indent(installFor(page, env), 4) +
      "\n    <!-- End of the Qualified install. -->\n",
  );

  html = html
    .replace('<html lang="en" data-page="hosted">', `<html lang="en" data-page="${id}" data-env="${env}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${page.title}${env === "qa" ? " (QA)" : ""}</title>`)
    .replace(/<p class="eyebrow">[^<]*<\/p>(\s*)<h1>[^<]*<\/h1>/, `<p class="eyebrow">${page.eyebrow} · ${env === "qa" ? "QA" : "local"}</p>$1<h1>${page.h1}</h1>`)
    .replace(' data-nav="hosted" aria-current="page"', ' data-nav="hosted"')
    // Menu links stay in this page's environment.
    .replace(/href="([a-z-]+)\.html" data-nav="([a-z-]+)" data-local-only/g, (_m, file, nav) =>
      `href="${fileFor(file, env)}" data-nav="${nav}" data-local-only${nav === page.nav ? ' aria-current="page"' : ""}`,
    )
    .replace(/href="\.\/" data-nav="hosted"/, `href="./?env=${env}" data-nav="hosted"`);

  // Environment switch: links to this page's twin. CDN pages also get a test/prod CDN switch.
  let switches = switchLinks(
    "Piper environment",
    "data-env-switch",
    Object.keys(ENV_SUFFIX).map((name) => ({
      text: name === "qa" ? "QA" : "Local",
      href: fileFor(id, name),
      current: name === env,
      title: `${environments[name].label}`,
    })),
  );
  if (page.cdn) {
    const twins = Object.entries(PAGES).filter(([, other]) => other.nav === page.nav);
    switches +=
      "\n" +
      switchLinks(
        "CDN",
        "data-cdn-switch",
        twins.map(([otherId, other]) => ({
          text: other.cdn === "test" ? "Test" : "Prod",
          href: fileFor(otherId, env),
          current: other.cdn === page.cdn,
          title: other.cdn === "test" ? `Mock CDN on ${TEST_CDN_ORIGIN}` : "This site's /cdn/ endpoint (what GitHub Pages publishes)",
        })),
        "CDN",
      );
  }
  html = html.replace(envSwitch, () => switches + "\n");

  const assets = assetBase(page, env);
  html = html.replace(
    harness,
    [
      `<section id="harness" class="harness" aria-label="${escape(page.panel)}">`,
      `          <p class="harness__title">${page.panel}</p>`,
      row("Environment", `${escape(environment.label)}`),
      row("Token", `<code>${escape(environment.token)}</code>`),
      row("Assets from", `<code>${escape(assets)}</code>`),
      row("Head", page.head === "token" ? `<code>${escape(environment.baseUrl)}/docking.js?token=</code>` : `<code>${escape(info.head)}</code>`),
      row("Widget talks to", `<code>${escape(bakedEnv[env].host)}</code>, <code>${escape(bakedEnv[env].wsHost)}</code>`),
      row("Inline init", page.init ? `copied snapshot: <code>${escape(settings)}</code>` : "none"),
      row("README", flagOn ? "Saved messenger setup (flag on)" : "Legacy, no saved setup (flag off)"),
      row("Exported / built", `${escape(info.exportedAt)} / ${escape(info.build?.builtAt)}`),
      '          <p class="harness__note">Reset between rows with a fresh incognito window: Piper remembers dock choices. ' +
        `<a href="${packageDir[env] === pkg ? "qualified" : "qualified-qa"}/README.md">Package README</a></p>`,
      "        </section>",
    ].join("\n"),
  );
  html = html.replace('    <script src="js/harness.js" defer></script>\n', "");

  writeFileSync(`${site}/${fileFor(id, env)}`, html);
  return fileFor(id, env);
}

const written = [];
for (const env of Object.keys(ENV_SUFFIX)) for (const id of Object.keys(PAGES)) written.push(buildPage(id, env));
console.log(`Package: ${flagOn ? "flag on" : "flag off"} README, inline init snapshot ${settings}`);
console.log(`QA bundle talks to ${qaEnv.host} (${qaEnv.wsHost})`);
console.log(`Wrote ${written.length} pages: ${written.join(", ")}`);
