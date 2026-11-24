// Installs Piper the way a customer page would, from site/config.js plus
// query-string overrides. Loaded as a plain blocking <script> in <head> so the
// scripts it writes land in the same place, and in the same order, as a
// hand-pasted install.
//
// Query parameters (all optional):
//   env=local|qa            which environment in config.js
//   host=<url>              override the environment's base URL
//   token=<token>           override the environment's token
//   install=snippet|head|head-token|recommended
//   sync=1                  load qualified.js without async (the sync snippet)
//   docking_<option>=<v>    passed through to qualified-head.js, e.g.
//                           docking_showSkeleton=0. Implies a head script with
//                           docking_autoInit=1.
//   piper=off               render the page with no Piper at all
(function () {
  "use strict";

  var RECOMMENDED = {
    docking_autoInit: "1",
    docking_defaultDocked: "1",
    docking_showSkeleton: "1",
    docking_dockUnderHeader: "1",
  };
  var INSTALLS = ["snippet", "head", "head-token", "recommended"];

  var cfg = window.PASTURE_CONFIG || { environments: {}, defaultEnv: {} };
  var params = new URLSearchParams(window.location.search);
  var hostname = window.location.hostname;
  var servedLocally = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "";

  var envName = params.get("env") || (servedLocally ? cfg.defaultEnv.localhost : cfg.defaultEnv.hosted);
  var env = cfg.environments[envName] || {};
  var baseUrl = (params.get("host") || env.baseUrl || "").replace(/\/+$/, "");
  var token = params.get("token") || env.token || "";
  var install = params.get("install") || cfg.install || "snippet";
  var sync = params.get("sync") === "1";

  var status = {
    env: envName,
    envLabel: env.label || "(unknown environment)",
    environments: Object.keys(cfg.environments),
    installs: INSTALLS,
    baseUrl: baseUrl,
    token: token,
    install: install,
    sync: sync,
    headSrc: null,
    widgetSrc: null,
    error: null,
    disabled: params.get("piper") === "off",
  };
  window.PASTURE_STATUS = status;

  function fail(message) {
    status.error = message;
    console.warn("[happy-little-pasture] " + message);
  }

  if (INSTALLS.indexOf(install) === -1) return fail('Unknown install "' + install + '". Use one of: ' + INSTALLS.join(", "));
  if (!cfg.environments[envName]) return fail('Unknown env "' + envName + '". Add it to site/config.js.');
  if (!baseUrl) return fail('No base URL for env "' + envName + '".');
  if (!token) return fail('No token for env "' + envName + '". Add it to site/config.js or pass ?token=.');
  if (status.disabled) return;

  // Docking options: the preset first, then anything on the query string.
  var docking = install === "recommended" ? Object.assign({}, RECOMMENDED) : {};
  params.forEach(function (value, key) {
    if (key.indexOf("docking_") === 0) docking[key] = value;
  });
  if (Object.keys(docking).length && !("docking_autoInit" in docking)) {
    docking = Object.assign({ docking_autoInit: "1" }, docking);
  }

  var headQuery = [];
  if (install === "head-token") headQuery.push("token=" + encodeURIComponent(token));
  Object.keys(docking).forEach(function (key) {
    headQuery.push(encodeURIComponent(key) + "=" + encodeURIComponent(docking[key]));
  });
  if (install !== "snippet" || headQuery.length) {
    status.headSrc = baseUrl + "/qualified-head.js" + (headQuery.length ? "?" + headQuery.join("&") : "");
  }
  status.widgetSrc = baseUrl + "/qualified.js?token=" + encodeURIComponent(token);

  // Test harness only, not part of the install (status.html leaves it out): with the token head,
  // record whether qualified-head.js applied the team's saved settings itself. The QAI-6672 token
  // head (piper_x_pinned_messenger_settings) ends by calling docking.init with them; a server
  // without it ignores the token and calls nothing. Nothing public reports that, and the script's
  // text can't be read cross-origin, so this watches for the head setting qualified.docking and
  // notes the first init call, with document.currentScript saying whether the head made it.
  //
  // window.qualified is made exactly as the snippet and the head's registerQualifiedObject make it
  // (both keep an existing one), so creating it a step early changes nothing. The API passes through
  // unchanged apart from init, which records its first call and then calls the real init.
  status.headInit = null;
  if (install === "head-token") {
    window.QualifiedObject = "qualified";
    window.qualified =
      window.qualified ||
      function () {
        (window.qualified.q = window.qualified.q || []).push(arguments);
      };
    var dockingApi;
    Object.defineProperty(window.qualified, "docking", {
      configurable: true,
      enumerable: true,
      get: function () {
        return dockingApi;
      },
      set: function (api) {
        dockingApi = api;
        if (!api || typeof api.init !== "function") return;
        var init = api.init;
        api.init = function (config) {
          if (!status.headInit) {
            var script = document.currentScript;
            status.headInit = {
              fromHead: !!(script && script.src && script.src.indexOf("/qualified-head.js") !== -1),
              config: config || {},
            };
          }
          return init.apply(this, arguments);
        };
      },
    });
  }

  function attr(value) {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  // document.write keeps these parser-inserted, exactly like a pasted snippet:
  // the head script blocks parsing, and the stub runs after it.
  var html = "";
  if (status.headSrc) html += '<script src="' + attr(status.headSrc) + '"><\/script>\n';
  html +=
    "<!-- Qualified -->\n<script>\n" +
    "(function(w,q){w['QualifiedObject']=q;w[q]=w[q]||function(){\n" +
    "(w[q].q=w[q].q||[]).push(arguments)};})(window,'qualified')\n" +
    "<\/script>\n" +
    "<script" + (sync ? "" : " async") + ' src="' + attr(status.widgetSrc) + '"><\/script>\n' +
    "<!-- End Qualified -->";
  status.html = html;
  document.write(html);
})();
