// Test-page menu behaviour. The menu itself is static HTML in each page, so nothing is inserted
// after load; this only sets attributes, which change colours, never sizes.
//
// - Hosted page: marks the environment Piper loaded from (?env=, or the localhost/hosted default
//   in config.js), and keeps the page's other query parameters (install=, docking_*=) when you
//   switch environment.
// - Generated pages: links are static, one file per environment; copied-init toggles are marked here.
// - Booker lab: no Piper, so the switch is disabled.
// - Off localhost (GitHub Pages): the self-hosted pages don't exist, so their links are disabled.
(function () {
  "use strict";

  var page = document.documentElement.getAttribute("data-page") || "";
  var servedLocally = /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(window.location.hostname);
  var envSwitch = document.querySelector("[data-env-switch]");
  var envLinks = envSwitch ? envSwitch.querySelectorAll("[data-env]") : [];

  function disable(node, reason) {
    node.setAttribute("aria-disabled", "true");
    node.setAttribute("title", reason);
    node.removeAttribute("href");
  }

  // Off localhost (GitHub Pages) only the published QA pages exist: send a link to its published
  // page when it has one, and disable the rest (local twins, the test CDN and mock GTM pages).
  if (!servedLocally) {
    document.querySelectorAll("[data-local-only]").forEach(function (link) {
      var published = link.getAttribute("data-published");
      if (published) link.setAttribute("href", published);
      else disable(link, "Local only: this page needs local fireball, the test CDN or the mock GTM on localhost.");
    });
  }

  // Visitor state (every test page): point Keep and Reset on load at this URL with only q_state
  // changed, and mark the one in effect. reset-state.js did the reset before Qualified loaded.
  var here = new URLSearchParams(window.location.search);
  var resetting = here.get("q_state") === "false";
  document.querySelectorAll("[data-state-toggle]").forEach(function (link) {
    var reset = link.getAttribute("data-state-toggle") === "reset";
    var next = new URLSearchParams(here);
    if (reset) next.set("q_state", "false");
    else next.delete("q_state");
    link.setAttribute("href", "?" + next.toString());
    if (reset === resetting) link.setAttribute("aria-current", "true");
  });

  // Links to a twin page (environment, CDN, docking-script variant) keep this page's options
  // (?q_state=, ?underNav=, ...) so switching pages doesn't lose them.
  if (window.location.search) {
    document.querySelectorAll("[data-keep-query][href]").forEach(function (link) {
      var href = link.getAttribute("href");
      if (href.indexOf("?") === -1) link.setAttribute("href", href + window.location.search);
    });
  }

  // Generated pages write their menu, environment and variant links statically, one file per
  // environment. Their copied-init toggles depend on the URL, so mark those here: point each at
  // this URL with just that parameter changed, and mark the choice in effect (the URL's override,
  // or the copied init's own value). init-overrides.js applied it before first paint.
  if (document.documentElement.hasAttribute("data-env")) {
    var init = window.__PASTURE_INIT__;
    var current = new URLSearchParams(window.location.search);
    document.querySelectorAll("[data-init-param]").forEach(function (link) {
      var param = link.getAttribute("data-init-param");
      var value = link.getAttribute("data-init-value");
      var next = new URLSearchParams(current);
      next.set(param, value);
      link.setAttribute("href", "?" + next.toString());
      var applied = init && init.applied ? init.applied[init.options[param]] : undefined;
      if (String(applied) === value) link.setAttribute("aria-current", "true");
    });
    var reset = document.querySelector("[data-init-reset]");
    if (reset) {
      var cleared = new URLSearchParams(current);
      Object.keys((init && init.options) || {}).forEach(function (param) { cleared.delete(param); });
      reset.setAttribute("href", "?" + cleared.toString());
      if (init && init.overrides && !Object.keys(init.overrides).length) reset.setAttribute("aria-current", "true");
    }
    return;
  }

  if (page === "hosted") {
    var status = window.PASTURE_STATUS || {};
    var params = new URLSearchParams(window.location.search);
    envLinks.forEach(function (link) {
      var env = link.getAttribute("data-env");
      var next = new URLSearchParams(params);
      next.set("env", env);
      link.setAttribute("href", "./?" + next.toString());
      if (env === status.env) link.setAttribute("aria-current", "true");
      link.setAttribute("title", "Load Piper from " + env + (env === status.env ? " (current)" : ""));
    });
    // Keep the other test pages in the same environment: page.html (local) or page.qa.html (QA).
    if (status.env === "qa" && servedLocally) {
      document.querySelectorAll("[data-local-only][href]").forEach(function (link) {
        link.setAttribute("href", link.getAttribute("href").replace(/(?<!\.qa)\.html$/, ".qa.html"));
      });
    }
    // Local fireball isn't reachable from a published page.
    if (!servedLocally) {
      envLinks.forEach(function (link) {
        if (link.getAttribute("data-env") === "local") disable(link, "Local fireball only works from localhost.");
      });
    }
    return;
  }

  envLinks.forEach(function (link) {
    disable(link, "No Piper on this page. Switch environment on the Hosted page.");
  });
})();
