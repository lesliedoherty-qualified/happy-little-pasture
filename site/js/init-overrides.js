// Test harness, not part of a customer install. Lets the page's sub-menu change the copied
// docking init on self-hosted and CDN pages without editing the HTML, so the same static page
// (locally or on GitHub Pages) can test each option:
//
//   ?underNav=true|false   dockUnderHeader
//   ?skeleton=true|false   showSkeleton
//
// The page loads this right after the Qualified head script and before the README's inline
// `qualified.docking.init({...})`. It wraps that one call and merges the overrides into the
// copied options, so the change happens synchronously in <head>, before first paint, exactly as if
// the copied init had said it. Without a query parameter the copied init runs unchanged.
// window.__PASTURE_INIT__ records the copied, override and applied options for the sub-menu and
// the console.
(function () {
  "use strict";

  var OPTIONS = { underNav: "dockUnderHeader", skeleton: "showSkeleton" };
  var params = new URLSearchParams(window.location.search);
  var overrides = {};
  Object.keys(OPTIONS).forEach(function (param) {
    var value = params.get(param);
    if (value === "true" || value === "false") overrides[OPTIONS[param]] = value === "true";
  });

  var state = (window.__PASTURE_INIT__ = { options: OPTIONS, overrides: overrides, copied: null, applied: null });

  var docking = window.qualified && window.qualified.docking;
  if (!docking || typeof docking.init !== "function") {
    console.warn("[happy-little-pasture] init-overrides.js loaded before the Qualified head script; overrides ignored.");
    return;
  }
  var init = docking.init;
  docking.init = function (config) {
    // Only the page's first init (the copied one) takes overrides; later calls pass through.
    if (state.copied === null) {
      state.copied = Object.assign({}, config);
      state.applied = Object.assign({}, config, overrides);
      return init.call(this, state.applied);
    }
    return init.apply(this, arguments);
  };
})();
