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
import { gtmContainerId, INIT_TOGGLES, isPublished, PAGES, PROD_CDN, TEST_CDN_ORIGIN } from "./pages.mjs";

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

// --- Components page stylesheets -------------------------------------------------------------

// The Components page (site/components.html) shows the booker capture in site/booker/frame.html
// styled by a real Qualified stylesheet, chosen with ?css=. This writes site/booker/stylesheets.js
// with where each one lives:
//   selfhosted  the committed QA package's CSS (site/qualified-qa/), as a self-hosted site serves it.
//   prod        production's own Panda CSS. The hosted widget has no separate stylesheet (its CSS
//               ships inside its JavaScript), so this copies the CSS string out of the component
//               renderer js.qualified.com serves, without running it, into prod-panda.css.
//   local       the fireball capture (npm run booker:refresh), for previewing unreleased changes.
const PROD_CSS_START = "`@layer reset, base, tokens, recipes, utilities;";

function cssFromTemplateLiteral(js) {
  const start = js.indexOf(PROD_CSS_START);
  if (start < 0) throw new Error("no Panda CSS string in the component renderer");
  let css = "";
  for (let i = start + 1; i < js.length; i++) {
    const c = js[i];
    if (c === "`") return css;
    if (c === "$" && js[i + 1] === "{") throw new Error("unexpected template expression in the CSS");
    if (c !== "\\") {
      css += c;
      continue;
    }
    const n = js[++i];
    if (n === "n") css += "\n";
    else if (n === "t") css += "\t";
    else if (n === "u" || n === "x") {
      const braced = n === "u" && js[i + 1] === "{";
      const hex = braced ? js.slice(i + 2, js.indexOf("}", i)) : js.slice(i + 1, i + (n === "u" ? 5 : 3));
      css += String.fromCodePoint(parseInt(hex, 16));
      i += braced ? hex.length + 2 : hex.length;
    } else if (n !== "\n") css += n;
  }
  throw new Error("unterminated CSS string in the component renderer");
}

async function refreshProdCss(file) {
  try {
    const timeout = () => AbortSignal.timeout(20000);
    const manifest = await (await fetch(`${PROD_CDN}/packs/entrypoints.widget.json`, { signal: timeout() })).json();
    const entry = manifest.entrypoints?.["widget/preview/preact_component_renderer"];
    const path = (entry?.assets ?? entry)?.js?.[0];
    if (!path) throw new Error("the widget manifest has no component renderer");
    const url = `${PROD_CDN}${path}`;
    const css = cssFromTemplateLiteral(await (await fetch(url, { signal: timeout() })).text());
    const header = `/* Production Panda CSS, copied from ${url} (build ${manifest.builtAt}) by npm run self-hosted. Don't edit. */\n`;
    writeFileSync(file, header + css);
    return { url, builtAt: manifest.builtAt };
  } catch (error) {
    if (!existsSync(file)) {
      console.warn(`Couldn't fetch production's component CSS (${error.message}); the Components page has no Prod stylesheet.`);
      return null;
    }
    const kept = readFileSync(file, "utf8").match(/copied from (\S+) \(build ([^)]+)\)/);
    console.warn(`Couldn't fetch production's component CSS (${error.message}); keeping the last copy.`);
    return kept ? { url: kept[1], builtAt: kept[2] } : { url: "unknown", builtAt: "unknown" };
  }
}

const bookerDir = `${site}/booker`;
const prod = await refreshProdCss(`${bookerDir}/prod-panda.css`);
const stylesheets = {
  default: "selfhosted",
  selfhosted: {
    label: "Self-hosted package",
    href: `../qualified-qa/${info.css}`,
    source: `site/qualified-qa/${info.css}, exported ${info.exportedAt} (widget build ${info.build?.builtAt})`,
  },
  ...(prod && {
    prod: { label: "Prod", href: "prod-panda.css", source: `${prod.url}, production build ${prod.builtAt}` },
  }),
  local: { label: "Local fireball capture", href: "panda.css", source: "site/booker/panda.css, from npm run booker:refresh" },
};
writeFileSync(
  `${bookerDir}/stylesheets.js`,
  "// Generated by npm run self-hosted: the stylesheets the Components page can apply (?css=).\n" +
    `window.PASTURE_STYLESHEETS = ${JSON.stringify(stylesheets, null, 2)};\n`,
);
console.log(`Components page stylesheets: ${Object.keys(stylesheets).filter((k) => k !== "default").join(", ")}${prod ? ` (prod build ${prod.builtAt})` : ""}`);

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
  if (page.init) {
    // Test harness, not customer code: lets the sub-menu override the copied init from the URL.
    if (!packageHead.test(html)) fail("Couldn't find the README's head script tag.");
    html = html.replace(
      packageHead,
      (tag) =>
        tag +
        "<!-- Test harness only (not part of the customer install): applies the page's ?underNav= and\n" +
        "     ?skeleton= sub-menu choices to the copied docking.init below. -->\n" +
        '<script src="js/init-overrides.js"></script>\n',
    );
  }
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

// --- GTM -------------------------------------------------------------------------------------

// Qualified's standard install snippet (Settings > Setup), as the GTM Custom HTML tag holds it.
const standardSnippet = (baseUrl, token) =>
  "<!-- Qualified -->\n<script>\n(function(w,q){w['QualifiedObject']=q;w[q]=w[q]||function(){\n" +
  "(w[q].q=w[q].q||[]).push(arguments)};})(window,'qualified')\n\n</script>\n" +
  `<script async src="${baseUrl}/qualified.js?token=${encodeURIComponent(token)}"></script>\n<!-- End Qualified -->`;
const dockingHead = (baseUrl, token) => `<script src="${baseUrl}/docking.js?token=${encodeURIComponent(token)}"></script>`;

// Google's container snippet, pointed at the mock GTM on the test CDN origin.
const gtmSnippet = (id) =>
  `<!-- Google Tag Manager (mock: ${TEST_CDN_ORIGIN}/gtm.js, served by server.js) -->\n` +
  "<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n" +
  "new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n" +
  "j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n" +
  `'${TEST_CDN_ORIGIN}/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n` +
  `})(window,document,'script','dataLayer','${id}');</script>\n<!-- End Google Tag Manager -->`;

function gtmInstall(page, env) {
  const { baseUrl, token } = environments[env];
  const id = gtmContainerId(env, page.gtmHead);
  if (page.gtmHead === "gtm") return gtmSnippet(id);
  // The Settings card's GTM guidance: docking directly in <head>, before any GTM container.
  return (
    "<!-- Qualified docking: install directly inside <head>, BEFORE any GTM container. NOT in GTM. -->\n" +
    dockingHead(baseUrl, token) +
    "\n<!-- End Qualified docking -->\n" +
    gtmSnippet(id)
  );
}

// One mock container per environment and docking placement, in cdn-test/gtm/<ID>.js.
const gtmRuntime = readFileSync(`${repo}scripts/self-hosted/mock-gtm.js`, "utf8");
if (gtmRuntime.split("__PASTURE_GTM_CONTAINER__").length !== 2) fail("mock-gtm.js must contain __PASTURE_GTM_CONTAINER__ exactly once.");
const gtmDir = `${repo}cdn-test/gtm`;
rmSync(gtmDir, { recursive: true, force: true });
mkdirSync(gtmDir, { recursive: true });
for (const env of Object.keys(ENV_SUFFIX)) {
  const { baseUrl, token } = environments[env];
  for (const gtmHead of ["page", "gtm"]) {
    const id = gtmContainerId(env, gtmHead);
    const tags = [];
    if (gtmHead === "gtm") tags.push({ name: "Qualified docking (in GTM)", trigger: "gtm.js", html: dockingHead(baseUrl, token) });
    tags.push({ name: "Qualified", trigger: "gtm.js", html: standardSnippet(baseUrl, token) });
    writeFileSync(`${gtmDir}/${id}.js`, gtmRuntime.replace("__PASTURE_GTM_CONTAINER__", () => JSON.stringify({ id, tags }, null, 2)));
  }
}

// --- Themed images ---------------------------------------------------------------------------

// Each generated page has its own art (site/img/themes/<theme>/), chosen here at build time so
// the page never swaps an image after load: this is a layout-shift test site. The map comes with
// the assets; the hosted page and the Booker lab keep the original Llamalytics images.
const themeMap = JSON.parse(readFileSync(`${site}/img/themes/asset-map.json`, "utf8"));
const themeForPage = Object.fromEntries(
  Object.entries(themeMap).flatMap(([theme, entry]) => entry.data_page.map((pageId) => [pageId, theme])),
);

function themeImages(html, id) {
  const theme = themeForPage[id];
  if (!theme) fail(`site/img/themes/asset-map.json has no theme for page ${id}.`);
  const assets = themeMap[theme].assets;
  const used = new Set();
  html = html.replace(/<img\b[^>]*>/g, (tag) => {
    const name = tag.match(/\ssrc="img\/(?:team\/)?([^"/]+)"/)?.[1];
    if (!name) return tag;
    const asset = assets[name];
    if (!asset) fail(`${theme} has no replacement for img/${name}.`);
    used.add(name);
    const width = Number(tag.match(/\swidth="(\d+)"/)?.[1]);
    const height = Number(tag.match(/\sheight="(\d+)"/)?.[1]);
    let themed = tag.replace(/\ssrc="[^"]+"/, ` src="img/themes/${asset.path}"`);
    if (!width || !height) {
      // Explicit dimensions so the browser reserves the box before the image loads.
      themed = themed.replace(/^<img\b/, `<img width="${asset.width}" height="${asset.height}"`);
    } else if (width * asset.height !== height * asset.width) {
      // A different aspect ratio would change the layout; keep existing display sizes otherwise
      // (the logo shows at 40px and 32px).
      fail(`img/${name} is ${width}x${height} on the page but ${asset.width}x${asset.height} in ${theme}.`);
    }
    return themed;
  });
  const icon = '<link rel="icon" href="img/logo.svg"';
  if (html.includes(icon)) html = html.replace(icon, `<link rel="icon" href="img/themes/${assets["logo.svg"].path}"`);
  const unused = Object.keys(assets).filter((name) => !used.has(name));
  if (unused.length) fail(`index.html no longer uses ${unused.join(", ")}; update the ${theme} assets or build-page.mjs.`);
  return html;
}

// --- Page template ---------------------------------------------------------------------------

const base = readFileSync(`${site}/index.html`, "utf8");
const loader = /    <!-- Piper goes first[^\n]*\n    <script src="config\.js"><\/script>\n    <script src="js\/piper-loader\.js"><\/script>\n/;
const harness = '<section id="harness" class="harness" aria-label="Test harness"></section>';
const envSwitch = /          <div class="sub-nav__group" role="group" aria-label="Piper environment" data-env-switch>[\s\S]*?<\/div>\n/;
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

function subNavGroup(heading, options) {
  return [
    `          <div class="sub-nav__group" role="group" aria-label="${escape(heading.replace(/:$/, ""))}">`,
    `            <span class="sub-nav__heading">${escape(heading)}</span>`,
    ...options.map(({ text, href, current, title, attrs = "" }) =>
      `            <a href="${href}"${current ? ' aria-current="page"' : ""} title="${escape(title)}"${attrs}>${escape(text)}</a>`,
    ),
    "          </div>",
  ].join("\n");
}

function buildPage(id, env) {
  const page = PAGES[id];
  const environment = environments[env];
  let html = base.replace(
    loader,
    () =>
      (page.kind === "gtm"
        ? `    <!-- ${page.panel} (${env}). Qualified's GTM install; the snippet runs from the mock GTM container.\n`
        : `    <!-- ${page.panel} (${env}). Install copied verbatim from site/qualified/README.md.\n`) +
      "         Generated by npm run self-hosted; don't edit by hand. -->\n" +
      indent(page.kind === "gtm" ? gtmInstall(page, env) : installFor(page, env), 4) +
      "\n    <!-- End of the Qualified install. -->\n",
  );

  html = html
    .replace('<html lang="en" data-page="hosted">', `<html lang="en" data-page="${id}" data-env="${env}">`)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escape(page.title)}${env === "qa" ? " (QA)" : ""}</title>`)
    .replace(/<p class="eyebrow">[^<]*<\/p>(\s*)<h1>[^<]*<\/h1>/, (_m, space) => `<p class="eyebrow">${escape(page.eyebrow)} · ${env === "qa" ? "QA" : "local"}</p>${space}<h1>${escape(page.h1)}</h1>`)
    .replace(' data-nav="hosted" aria-current="page"', ' data-nav="hosted"')
    // Menu links stay in this page's environment.
    .replace(/href="([a-z-]+)\.html" data-nav="([a-z-]+)" data-local-only/g, (_m, file, nav) =>
      `href="${fileFor(file, env)}" data-nav="${nav}" data-local-only${nav === page.nav ? ' aria-current="page"' : ""}`,
    )
    .replace(/href="\.\/" data-nav="hosted"/, `href="./?env=${env}" data-nav="hosted"`);

  // Sub-menu: the environment option, linking to this page's local/QA twin. Only published QA
  // pages exist on GitHub Pages; nav.js disables the rest there.
  const environmentGroup = subNavGroup(
    "Environment:",
    Object.keys(ENV_SUFFIX).map((name) => ({
      text: name === "qa" ? "QA" : "Local",
      href: fileFor(id, name),
      current: name === env,
      title: `${environments[name].label}`,
      attrs: (isPublished(id, name) ? "" : " data-local-only") + " data-keep-query",
    })),
  );
  html = html.replace(envSwitch, () => environmentGroup + "\n");

  // Sub-menu, the first thing in <main>: this page's options. Variant pages (CDN, GTM) link to
  // their twins; pages with a copied init get toggles that site/js/nav.js points at the current
  // URL and site/js/init-overrides.js applies.
  const groups = [];
  if (page.twin) {
    const twins = Object.entries(PAGES).filter(([, other]) => other.nav === page.nav && other.twin);
    groups.push(
      subNavGroup(
        page.twin.heading,
        twins.map(([otherId, other]) => ({
          text: other.twin.text,
          href: fileFor(otherId, env),
          current: otherId === id,
          title: other.twin.title,
          attrs: (isPublished(otherId, env) ? "" : " data-local-only") + " data-keep-query",
        })),
      ),
    );
  }
  if (page.init) {
    for (const toggle of INIT_TOGGLES) {
      groups.push(
        subNavGroup(
          toggle.heading,
          ["true", "false"].map((value) => ({
            text: value,
            href: `?${toggle.param}=${value}`,
            title: `${toggle.option}: ${value} in this page's docking.init (?${toggle.param}=${value})`,
            attrs: ` data-init-param="${toggle.param}" data-init-value="${value}"`,
          })),
        ),
      );
    }
    groups.push(
      '          <div class="sub-nav__group"><a href="?" data-init-reset title="Run the copied init exactly as downloaded">Use the copied init</a></div>',
    );
  }
  // index.html's sub-menu already holds the shared Visitor state option; this page's own options
  // go in front of it.
  const pageOptions = "          <!-- page options -->\n";
  if (!html.includes(pageOptions)) fail("index.html's sub-menu changed; update build-page.mjs.");
  html = html.replace(pageOptions, () => (groups.length ? groups.join("\n") + "\n" : ""));

  const assets = assetBase(page, env);
  const gtmRows =
    page.kind === "gtm"
      ? [
          row("Environment", `${escape(environment.label)}`),
          row("Token", `<code>${escape(environment.token)}</code>`),
          row("GTM container", `<code>${escape(TEST_CDN_ORIGIN)}/gtm.js?id=${gtmContainerId(env, page.gtmHead)}</code>`),
          row("In &lt;head&gt;", page.gtmHead === "page" ? `<code>${escape(environment.baseUrl)}/docking.js?token=</code>, then the GTM snippet` : "the GTM snippet only"),
          row("In the GTM tag", page.gtmHead === "page" ? "the standard Qualified snippet" : "docking.js?token= and the standard Qualified snippet"),
          row("Trigger", "All Pages (gtm.js), as soon as the container loads"),
          row("Timing", "Start the site with <code>GTM_DELAY_MS=800 npm start</code> to mimic a slow GTM container"),
        ]
      : null;
  html = html.replace(
    harness,
    [
      `<section id="harness" class="harness" aria-label="${escape(page.panel)}">`,
      `          <p class="harness__title">${escape(page.panel)}</p>`,
      ...(gtmRows ?? [
      row("Environment", `${escape(environment.label)}`),
      row("Token", `<code>${escape(environment.token)}</code>`),
      row("Assets from", `<code>${escape(assets)}</code>`),
      row("Head", page.head === "token" ? `<code>${escape(environment.baseUrl)}/docking.js?token=</code>` : `<code>${escape(info.head)}</code>`),
      row("Widget talks to", `<code>${escape(bakedEnv[env].host)}</code>, <code>${escape(bakedEnv[env].wsHost)}</code>`),
      row("Inline init", page.init ? `copied snapshot: <code>${escape(settings)}</code>` : "none"),
      row("README", flagOn ? "Saved messenger setup (flag on)" : "Legacy, no saved setup (flag off)"),
      row("Exported / built", `${escape(info.exportedAt)} / ${escape(info.build?.builtAt)}`),
      ]),
      '          <p class="harness__note">Reset between rows with a fresh incognito window: Piper remembers dock choices.' +
        (page.kind === "gtm" ? "</p>" : ` <a href="${packageDir[env] === pkg ? "qualified" : "qualified-qa"}/README.md">Package README</a></p>`),
      "        </section>",
    ].join("\n"),
  );
  html = html.replace('    <script src="js/harness.js" defer></script>\n', "");

  html = themeImages(html, id);
  writeFileSync(`${site}/${fileFor(id, env)}`, html);
  return fileFor(id, env);
}

const written = [];
for (const env of Object.keys(ENV_SUFFIX)) for (const id of Object.keys(PAGES)) written.push(buildPage(id, env));
console.log(`Package: ${flagOn ? "flag on" : "flag off"} README, inline init snapshot ${settings}`);
console.log(`QA bundle talks to ${qaEnv.host} (${qaEnv.wsHost})`);
console.log(`Wrote ${written.length} pages: ${written.join(", ")}`);
