// Test harness, not part of a customer install. With ?q_state=false in the URL, every load of the
// page starts as a brand-new Qualified visitor: it clears the widget's visitor state before any
// Qualified script runs, so docking's early layout (which reads the state cookie in <head>) and the
// messenger both see no history.
//
// Clears:
//   - the __q_state_* cookies: the visitor ID and docking's saved docked state (d)
//   - the widget's sessionStorage entries: __qualified_ui_state_* (the saved messenger UI state)
//     and __qualified_redirect_dismissed_ui_state
//
// Load it first in <head>, before the Qualified head script. The parameter stays in the URL, so a
// reload resets again. window.__PASTURE_STATE_RESET__ lists what was cleared.
(function () {
  "use strict";

  if (new URLSearchParams(window.location.search).get("q_state") !== "false") return;

  var cleared = { cookies: [], sessionStorage: [] };

  // Cookies can be host-only or set for the hostname or a parent domain, so expire each one for
  // every domain it could have been written with.
  // "" is host-only; then www.example.com, example.com, com (the browser ignores invalid ones).
  var parts = window.location.hostname.split(".");
  var domains = [""];
  for (var i = 0; i < parts.length; i++) domains.push(parts.slice(i).join("."));
  document.cookie.split(";").forEach(function (cookie) {
    var name = cookie.split("=")[0].trim();
    if (name.indexOf("__q_state") !== 0) return;
    domains.forEach(function (domain) {
      document.cookie =
        name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + (domain ? "; domain=" + domain : "");
    });
    cleared.cookies.push(name);
  });

  try {
    for (var k = window.sessionStorage.length - 1; k >= 0; k--) {
      var key = window.sessionStorage.key(k);
      if (key && (key.indexOf("__qualified_ui_state_") === 0 || key === "__qualified_redirect_dismissed_ui_state")) {
        window.sessionStorage.removeItem(key);
        cleared.sessionStorage.push(key);
      }
    }
  } catch (error) {
    // sessionStorage can be unavailable (privacy modes); the cookie reset still applies.
  }

  window.__PASTURE_STATE_RESET__ = cleared;
  if (cleared.cookies.length || cleared.sessionStorage.length) {
    console.info("[happy-little-pasture] ?q_state=false cleared Qualified visitor state", cleared);
  }
})();
