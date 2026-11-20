// Test-page menu behaviour. The menu itself is static HTML in each page, so nothing is inserted
// after load; this only sets attributes, which change colours, never sizes.
//
// - Hosted page: marks the environment Piper loaded from (?env=, or the localhost/hosted default
//   in config.js), and keeps the page's other query parameters (install=, docking_*=) when you
//   switch environment.
// - Generated pages (self-hosted, CDN host): their links are static, one file per environment.
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

  if (!servedLocally) {
    document.querySelectorAll("[data-local-only]").forEach(function (link) {
      disable(link, "Local only: npm run self-hosted builds this page from a fireball export.");
    });
  }

  // Generated pages (self-hosted, CDN host) write their own menu, environment and CDN links
  // statically, one file per environment, so there's nothing to do here.
  if (document.documentElement.hasAttribute("data-env")) return;

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
    if (status.env === "qa") {
      document.querySelectorAll("[data-local-only][href]").forEach(function (link) {
        link.setAttribute("href", link.getAttribute("href").replace(/\.html$/, ".qa.html"));
      });
    }
    return;
  }

  envLinks.forEach(function (link) {
    disable(link, "No Piper on this page. Switch environment on the Hosted page.");
  });
})();
