// The generated test pages. Edit names and copy here; colours are the matching
// html[data-page="..."] blocks in site/css/site.css. The hosted page (index.html) and the
// Booker lab are hand-written and keep their own copy.
//
// Every page is generated once per environment in site/config.js: `<file>.html` for local
// fireball and `<file>.qa.html` for QA. Each install path is covered explicitly:
//   Hosted (index.html)  Qualified serves everything.
//   Self-hosted          the customer serves the package from their own site.
//   CDN host             the package is served from a CDN origin (a mock CDN, not production).
//
// assets: where the page loads the package's head, CSS and widget JS from.
//   "package"    this site's qualified/ (local) or qualified-qa/ (QA) folder, the whole package.
//   "test-cdn"   the mock CDN on its own origin, http://localhost:4601/<env>/, served by
//                server.js from cdn-test/ (CSS, JS and woff2 fonts only).
//   "prod-cdn"   this site's cdn/<env>/ folder (CSS, JS and woff2 fonts only), the endpoint
//                GitHub Pages publishes.
// init: keep the README's inline docking/sentinel init. head: "package" or "token" (docking.js?token=).
export const PAGES = {
  "self-hosted": {
    nav: "self-hosted",
    assets: "package",
    init: true,
    head: "package",
    title: "Sparkleforce | self-hosted, copied init",
    eyebrow: "Self-hosted head + the README's copied init",
    h1: "Sparkleforce: sparkly little pipelines, self-hosted.",
    panel: "Self-hosted package",
  },
  "self-hosted-no-init": {
    nav: "self-hosted-no-init",
    assets: "package",
    init: false,
    head: "package",
    title: "Rainbowforce | self-hosted, head script only",
    eyebrow: "Self-hosted head, no inline init",
    h1: "Rainbowforce: every color of the funnel, no init required.",
    panel: "Self-hosted package, head script only (no inline init)",
  },
  "self-hosted-token-head": {
    nav: "self-hosted-token-head",
    assets: "package",
    init: false,
    head: "token",
    title: "Glitterforce | docking.js?token= head, self-hosted widget",
    eyebrow: "Qualified docking.js?token= head + self-hosted widget",
    h1: "Glitterforce: live settings, glittering from the server.",
    panel: "Self-hosted widget, head from docking.js?token=",
  },
  "cdn-host": {
    nav: "cdn-host",
    cdn: "test",
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
    cdn: "prod",
    assets: "prod-cdn",
    init: true,
    head: "package",
    title: "Cloudforce | CDN host, prod-like CDN",
    eyebrow: "CDN host: prod-like CDN at this site's /cdn/ + copied init",
    h1: "Cloudforce: happy little clouds, served like production.",
    panel: "CDN-hosted package, prod-like CDN (this site's /cdn/)",
  },
};

// The mock test CDN's origin, served by server.js.
export const TEST_CDN_ORIGIN = "http://localhost:4601";
