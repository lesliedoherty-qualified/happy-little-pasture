// The generated test pages. Edit names and copy here; colours are the matching
// html[data-page="..."] blocks in site/css/site.css. The hosted page (index.html) and the
// Booker lab are hand-written and keep their own copy.
//
// Every page is generated once per environment in site/config.js: `<file>.html` for local
// fireball and `<file>.qa.html` for QA. Each install path is covered explicitly:
//   Hosted (index.html)  Qualified serves everything.
//   Self-hosted          the customer serves the package from their own site.
//   CDN host             the package is served from a CDN origin (a mock CDN, not production).
//   GTM                  the hosted Qualified snippet runs from a (mock) Google Tag Manager tag.
//
// assets: where the page loads the package's head, CSS and widget JS from.
//   "package"    this site's qualified/ (local) or qualified-qa/ (QA) folder, the whole package.
//   "test-cdn"   the mock CDN on its own origin, http://localhost:4601/<env>/, served by
//                server.js from cdn-test/ (CSS, JS and woff2 fonts only).
//   "prod-cdn"   this site's cdn/<env>/ folder (CSS, JS and woff2 fonts only), the endpoint
//                GitHub Pages publishes.
// init: how the page sets the docking options.
//   true      the README's inline qualified.docking.init({...}) / sentinel.init() block, verbatim.
//   "params"  the same options as docking_* (and sentinel_autoInit) query parameters on the head
//             script, built from that block, as some customers install it. No inline block.
//   false     no init at all.
// head: "package" or "token" (qualified-head.js?token=).
//
// The Self-hosted menu has the four self-hosted head installs, in this order:
//   1. self-hosted-no-init     qualified-head.js, no token, no init
//   2. self-hosted-token-head  qualified-head.js?token=, no init
//   3. self-hosted-params      qualified-head.js?docking_autoInit=1&docking_..., no inline init
//   4. self-hosted             qualified-head.js, no token, + inline qualified.docking.init({...})
// kind: "gtm" pages don't use the package: the page has the Settings card's GTM install
//   (qualified-head.js?token= in <head>, before the container) and a mock GTM container whose Custom HTML
//   tag holds the standard Qualified snippet. gtmHead "gtm" also moves qualified-head.js into that tag,
//   the placement the Settings card warns against.
// twin: pages with the same nav and a twin are linked from the page's sub-menu, under
//   `heading` (CDN: Test | Prod, Docking script loaded by: HTML head | GTM).
// Pages with an inline copied init (init: true) also get sub-menu toggles for that init, applied from the
//   URL by site/js/init-overrides.js (see INIT_TOGGLES).
export const PAGES = {
  "self-hosted": {
    nav: "self-hosted",
    publish: true,
    assets: "package",
    init: true,
    head: "package",
    title: "Sparkleforce | 4. self-hosted head, no token + docking.init()",
    eyebrow: "4. Self-hosted head, no token + docking.init()",
    h1: "Sparkleforce: sparkly little pipelines, self-hosted.",
    panel: "4. Self-hosted head, no token + inline docking.init()",
  },
  "self-hosted-no-init": {
    nav: "self-hosted-no-init",
    publish: true,
    assets: "package",
    init: false,
    head: "package",
    title: "Rainbowforce | 1. self-hosted head, no token, no init",
    eyebrow: "1. Self-hosted head, no token, no init",
    h1: "Rainbowforce: every color of the funnel, no init required.",
    panel: "1. Self-hosted head: no token, no init",
  },
  "self-hosted-token-head": {
    nav: "self-hosted-token-head",
    publish: true,
    assets: "package",
    init: false,
    head: "token",
    title: "Glitterforce | 2. qualified-head.js?token=, no init",
    eyebrow: "2. qualified-head.js?token=, no init",
    h1: "Glitterforce: live settings, glittering from the server.",
    panel: "2. Head with token: qualified-head.js?token=, self-hosted widget, no init",
  },
  "self-hosted-params": {
    nav: "self-hosted-params",
    publish: true,
    assets: "package",
    init: "params",
    head: "package",
    title: "Starforce | 3. self-hosted head with docking_* params",
    eyebrow: "3. Self-hosted head + docking_* params",
    h1: "Starforce: every little setting, written in the stars (and the URL).",
    panel: "3. Self-hosted head with docking_* params, no inline init",
  },
  "cdn-host": {
    nav: "cdn-host",
    twin: { heading: "CDN:", text: "Test", title: "Mock CDN on its own origin, localhost:4601" },
    assets: "test-cdn",
    init: true,
    head: "package",
    title: "Cloudforce | CDN host, test CDN",
    eyebrow: "CDN host: test CDN on localhost:4601 + copied init",
    h1: "Cloudforce: happy little clouds, delivered from the edge.",
    panel: "CDN-hosted package, test CDN",
  },
  "cdn-host-prod": {
    nav: "cdn-host",
    publish: true,
    twin: { heading: "CDN:", text: "Prod", title: "This site's /cdn/ endpoint (what GitHub Pages publishes)" },
    assets: "prod-cdn",
    init: true,
    head: "package",
    title: "Cloudforce | CDN host, prod-like CDN",
    eyebrow: "CDN host: prod-like CDN at this site's /cdn/ + copied init",
    h1: "Cloudforce: happy little clouds, served like production.",
    panel: "CDN-hosted package, prod-like CDN (this site's /cdn/)",
  },
  gtm: {
    nav: "gtm",
    kind: "gtm",
    gtmHead: "page",
    twin: { heading: "Docking script loaded by:", text: "HTML head", title: "qualified-head.js?token= directly in <head>, before the GTM container (the documented GTM install)" },
    title: "AlpacalpyseForce | GTM, docking script in the page",
    eyebrow: "GTM: qualified-head.js?token= in <head>, Qualified snippet in a GTM tag",
    h1: "AlpacalpyseForce: every happy little tag, managed.",
    panel: "GTM install (mock GTM), docking script in the page",
  },
  "gtm-docking-in-gtm": {
    nav: "gtm",
    kind: "gtm",
    gtmHead: "gtm",
    twin: { heading: "Docking script loaded by:", text: "GTM", title: "qualified-head.js?token= inside the GTM tag too (what the Settings card warns against)" },
    title: "AlpacalpyseForce | GTM, docking script inside GTM",
    eyebrow: "GTM: qualified-head.js?token= and the Qualified snippet both in a GTM tag",
    h1: "AlpacalpyseForce: everything in the tag manager, docked a little late.",
    panel: "GTM install (mock GTM), docking script inside GTM (not recommended)",
  },
};

// Mock GTM container IDs, one per environment and docking placement.
export const gtmContainerId = (env, gtmHead) => `GTM-PASTURE-${env.toUpperCase()}${gtmHead === "gtm" ? "-ALL" : ""}`;

// publish: the QA version (<file>.qa.html) is committed and served by GitHub Pages. Only pages
//   whose files come from this site can work there; the test CDN and mock GTM run on localhost.
export const isPublished = (id, env) => env === "qa" && PAGES[id]?.publish === true;

// The page each menu item opens on GitHub Pages, where only published QA pages exist.
export const PUBLISHED_LANDING = {
  "self-hosted": "self-hosted.qa.html",
  "self-hosted-no-init": "self-hosted-no-init.qa.html",
  "self-hosted-token-head": "self-hosted-token-head.qa.html",
  "self-hosted-params": "self-hosted-params.qa.html",
  "cdn-host": "cdn-host-prod.qa.html",
};

// Sub-menu toggles for the copied docking init. `param` is the URL parameter
// site/js/init-overrides.js reads; `option` is the docking.init option it sets.
export const INIT_TOGGLES = [
  { param: "underNav", option: "dockUnderHeader", heading: "Pin beneath header:" },
  { param: "skeleton", option: "showSkeleton", heading: "Loading skeleton:" },
];

// Production Qualified's CDN. The Components page's "Prod" stylesheet is the Panda CSS inside the
// component renderer this host serves (see build-page.mjs).
export const PROD_CDN = "https://js.qualified.com";

// The mock test CDN's origin, served by server.js.
export const TEST_CDN_ORIGIN = "http://localhost:4601";
