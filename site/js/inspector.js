// Piper data inspector (test harness only, not part of any install).
//
// Shows what this page received from Qualified and where each piece came from, without opening
// devtools, in two parts:
// - What the browser received: the calls and WebSocket frames that decide what Piper shows, with
//   the headers this page may read, recorded from the start of the page load by
//   js/inspect-early.js (in <head> before Piper's scripts). Reporting calls and conversation
//   traffic are counted, not listed. Full headers need the local report: npm run inspect.
// - What Piper made of it: the install (the head script's URL), what qualified-head.js applied,
//   the team config qualified.js was initialized with, what the messenger store holds after
//   processing, the channel messages Piper handled, and the events the public handleEvents API
//   reports.
//
// Off unless the URL has ?inspect=1; then it adds a panel at the end of <main>. When off it only
// adds a link to turn it on, and touches nothing else.
//
// Safe by construction:
// - Read-only. This file reads values and adds listeners through the widget's own channel.on()
//   and the public qualified("handleEvents") command, and calls nothing that changes Piper's
//   state. The observe-only wrappers around fetch, XMLHttpRequest and WebSocket are in
//   js/inspect-early.js, and only with ?inspect=1.
// - Nothing leaves the page: no requests, no storage. Copy puts the redacted view on the clipboard.
// - Data is shown as text (textContent), never parsed as HTML, so a payload can't run anything.
// - Emails, phone numbers, IP addresses, visitor/session/conversation identifiers, cookies and
//   secrets are redacted; long strings and arrays are cut short.
//
// window.qualified.widget is an internal Qualified exposes for debugging (Widget#exposeDebugging),
// not a supported API, so every read is guarded and reports "not available" when it's missing.
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var on = params.get("inspect") === "1";
  var main = document.querySelector("main") || document.body;

  function urlWith(value) {
    var next = new URLSearchParams(params);
    if (value) next.set("inspect", "1");
    else next.delete("inspect");
    var query = next.toString();
    return window.location.pathname + (query ? "?" + query : "") + window.location.hash;
  }

  if (!on) {
    // A quiet link at the very end of the page, below everything else, so it moves nothing.
    var offer = document.createElement("p");
    offer.className = "inspector-link";
    var link = document.createElement("a");
    link.href = urlWith(true).replace(/#.*$/, "") + "#inspector";
    link.textContent = "Inspect what Piper received on this page";
    offer.appendChild(link);
    main.appendChild(offer);
    return;
  }

  // --- Redaction ----------------------------------------------------------------------------

  var SECRET_KEY = /(email|phone|mobile|^ip$|ip_?address|uuid|visitor_?id|session_?id|conversation_?id|^cookies?$|set_?cookie|secret|password|passwd|authorization|auth_?token|_token$|api_?key|jwt|signature|credit|ssn)/i;
  var EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  // Phone numbers as people write them (+1 415 555 0100, (415) 555-0100), not timestamps or IDs.
  var PHONE = /(?<![\w:-])(?:\+\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?![\w:-])/g;
  // UUIDs identify visitors, sessions and messages; none of them is needed to read the data.
  var UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
  var MAX_STRING = 400;
  var MAX_ITEMS = 50;

  function redactString(value) {
    var text = value.replace(EMAIL, "[email]").replace(PHONE, "[phone]").replace(UUID, "[id]");
    return text.length > MAX_STRING ? text.slice(0, MAX_STRING) + "… (" + text.length + " chars)" : text;
  }

  // A plain, redacted copy: functions and DOM nodes dropped, signals read, cycles cut.
  function redact(value, depth, seen) {
    depth = depth || 0;
    seen = seen || new WeakSet();
    if (value == null || typeof value === "boolean" || typeof value === "number") return value;
    if (typeof value === "string") return redactString(value);
    if (typeof value === "function") return undefined;
    if (typeof value !== "object") return String(value);
    if (typeof Node !== "undefined" && value instanceof Node) return "[DOM node]";
    if (seen.has(value)) return "[circular]";
    if (depth > 8) return "[deeper than 8 levels]";
    seen.add(value);
    if (Array.isArray(value)) {
      var items = value.slice(0, MAX_ITEMS).map(function (item) {
        return redact(item, depth + 1, seen);
      });
      if (value.length > MAX_ITEMS) items.push("… " + (value.length - MAX_ITEMS) + " more");
      return items;
    }
    if (value instanceof Map) return redact(Object.fromEntries(value), depth, seen);
    if (value instanceof Set) return redact(Array.from(value), depth, seen);
    var out = {};
    Object.keys(value).forEach(function (key) {
      if (SECRET_KEY.test(key)) {
        out[key] = value[key] == null ? value[key] : "[redacted]";
        return;
      }
      var next = redact(value[key], depth + 1, seen);
      if (next !== undefined) out[key] = next;
    });
    return out;
  }

  // Reads a signal's value (anything with a value and subscribe), or the plain property.
  function read(owner, key) {
    try {
      var item = owner && owner[key];
      if (item && typeof item === "object" && "value" in item && typeof item.subscribe === "function") return item.value;
      return item;
    } catch (e) {
      return "[could not read: " + e.message + "]";
    }
  }

  // --- Panel --------------------------------------------------------------------------------

  var started = Date.now();
  var sections = {};
  var log = [];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  var panel = el("section", "inspector");
  panel.id = "inspector";
  panel.setAttribute("aria-label", "Piper data inspector");
  var wrap = el("div", "wrap");
  panel.appendChild(wrap);
  var head = el("div", "inspector__head");
  head.appendChild(el("h2", "inspector__title", "What the browser and Piper received"));
  var actions = el("div", "inspector__actions");
  var copy = el("button", "button button--small button--ghost", "Copy as JSON");
  copy.type = "button";
  var refresh = el("button", "button button--small button--ghost", "Refresh snapshots");
  refresh.type = "button";
  var close = el("a", "inspector__close", "Close inspector");
  close.href = urlWith(false);
  actions.appendChild(refresh);
  actions.appendChild(copy);
  actions.appendChild(close);
  head.appendChild(actions);
  wrap.appendChild(head);
  wrap.appendChild(
    el(
      "p",
      "inspector__note",
      "Read-only and redacted: emails, phone numbers, identifiers, cookies and secrets are hidden, and nothing leaves this page. " +
        "Each section says where its data came from.",
    ),
  );
  main.appendChild(panel);

  // A section: a source badge, a title, a one-line summary and the redacted JSON underneath.
  function section(id, source, title) {
    var box = el("details", "inspector__section");
    box.open = id === "summary";
    var summary = el("summary");
    summary.appendChild(el("span", "inspector__source", source));
    summary.appendChild(el("span", "inspector__name", title));
    var line = el("span", "inspector__line");
    summary.appendChild(line);
    box.appendChild(summary);
    var body = el("div", "inspector__body");
    box.appendChild(body);
    wrap.appendChild(box);
    sections[id] = { box: box, line: line, body: body, data: null };
    return sections[id];
  }

  function show(id, line, data) {
    var s = sections[id];
    s.line.textContent = line;
    s.data = data === undefined ? null : redact(data);
    s.body.replaceChildren();
    if (data === undefined) return;
    var pre = el("pre", "inspector__json");
    pre.textContent = JSON.stringify(s.data, null, 2);
    s.body.appendChild(pre);
  }

  // --- What the browser received (recorded by js/inspect-early.js) ------------------------

  var early = window.__pastureInspect;
  wrap.appendChild(el("h3", "inspector__group", "What the browser received"));
  wrap.appendChild(
    el(
      "p",
      "inspector__note",
      early
        ? "The calls and WebSocket frames that decide what Piper shows, from the start of the page load, with the response headers this page is allowed to read. " +
            "Qualified exposes no extra headers to other sites, so that's only content-type, cache-control and the like, and none for script loads. " +
            "For every header: npm run inspect -- <this page> (a local report)."
        : "Not recorded on this page: js/inspect-early.js isn't in its <head>, before Piper's scripts.",
    ),
  );
  var layersBox = el("div", "inspector__layers");
  wrap.appendChild(layersBox);
  var openLayers = {};

  // What Piper left in this site's cookies and storage: names and sizes only, never values.
  function storageNames() {
    var out = { cookies: [], localStorage: [], sessionStorage: [] };
    try {
      out.cookies = document.cookie
        .split(";")
        .map(function (c) {
          return c.split("=")[0].trim();
        })
        .filter(Boolean);
    } catch (e) {
      /* blocked */
    }
    ["localStorage", "sessionStorage"].forEach(function (store) {
      try {
        var s = window[store];
        for (var i = 0; i < s.length; i++) {
          var key = s.key(i);
          out[store].push(key + " (" + (s.getItem(key) || "").length + " chars)");
        }
      } catch (e) {
        /* blocked */
      }
    });
    return out;
  }

  function entryTitle(entry) {
    return [
      entry.t,
      entry.kind === "http" ? entry.method : entry.event || "",
      entry.status != null ? String(entry.status) : "",
      // A frame's URL is the socket's, the same on every frame; its channel says more.
      entry.kind === "frame" ? entry.channel || "" : entry.url,
      entry.size ? "(" + (entry.size > 2048 ? Math.round(entry.size / 1024) + " KB" : entry.size + " B") + ")" : "",
    ]
      .filter(Boolean)
      .join("  ");
  }

  function layerBox(name, hosts, line, items, open) {
    var box = el("details", "inspector__section");
    box.open = !!open;
    box.addEventListener("toggle", function () {
      openLayers[name] = box.open;
    });
    var summary = el("summary");
    summary.appendChild(el("span", "inspector__source", name));
    summary.appendChild(el("span", "inspector__name", hosts));
    summary.appendChild(el("span", "inspector__line", line));
    box.appendChild(summary);
    var body = el("div", "inspector__body");
    items.forEach(function (item) {
      if (!item.detail) {
        body.appendChild(el("p", "inspector__entry-line", item.title));
        return;
      }
      var one = el("details", "inspector__entry");
      one.appendChild(el("summary", null, item.title));
      var pre = el("pre", "inspector__json");
      pre.textContent = JSON.stringify(item.detail, null, 2);
      one.appendChild(pre);
      body.appendChild(one);
    });
    box.appendChild(body);
    layersBox.appendChild(box);
  }

  function counted(list, key) {
    var counts = {};
    list.forEach(function (entry) {
      var name = key(entry);
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.keys(counts)
      .map(function (name) {
        return name + (counts[name] > 1 ? " ×" + counts[name] : "");
      })
      .join(", ");
  }

  function hostsOf(list) {
    return (
      list
        .map(function (e) {
          return e.host;
        })
        .filter(function (h, i, all) {
          return h && all.indexOf(h) === i;
        })
        .join(", ") || "this site"
    );
  }

  function asItem(entry) {
    var detail = entry.kind === "http" ? { headers: entry.headers, sent: entry.sent, body: entry.body } : entry.body !== undefined ? entry.body : null;
    return { title: entryTitle(entry), detail: detail };
  }

  function renderBrowser() {
    layersBox.replaceChildren();
    if (!early) return;
    var http = [], sockets = [], reporting = [], conversation = [];
    early.entries.forEach(function (entry) {
      if (entry.role === "reporting") reporting.push(entry);
      else if (entry.role === "conversation") conversation.push(entry);
      else if (entry.kind === "http") http.push(entry);
      else if (entry.layer === "WebSocket") sockets.push(entry);
    });
    if (!http.length && !sockets.length) layersBox.appendChild(el("p", "inspector__line", "Nothing from Qualified yet."));
    if (http.length)
      layerBox("Decision calls", hostsOf(http), http.length + (http.length === 1 ? " call" : " calls") + ": " + counted(http, function (e) {
        return e.url.split("?")[0].split("/").pop();
      }), http.map(asItem), openLayers["Decision calls"] !== false);
    if (sockets.length)
      layerBox("WebSocket", hostsOf(sockets), counted(sockets.filter(function (e) {
        return e.kind === "frame";
      }), function (e) {
        return e.event;
      }) || "socket events only", sockets.map(asItem), openLayers.WebSocket !== false);
    var quiet = [];
    if (reporting.length)
      quiet.push({ title: "Reporting: " + reporting.length + " call(s) to " + counted(reporting, function (e) {
        return e.url.split("?")[0].split("/").slice(-2).join("/") + " " + e.status;
      }), detail: reporting.map(asItem) });
    if (conversation.length || early.pings())
      quiet.push({ title: "Conversation traffic: " + conversation.length + " frame(s)" + (conversation.length ? " (" + counted(conversation, function (e) {
        return e.event;
      }) + ")" : "") + ", " + early.pings() + " ping(s)", detail: conversation.map(asItem) });
    if (quiet.length) layerBox("Counted, not decisions", hostsOf(reporting.concat(conversation)), quiet.map(function (q) {
      return q.title.split(":")[0];
    }).join(" · "), quiet, openLayers["Counted, not decisions"]);
    var storage = storageNames();
    layerBox(
      "Cookies and storage",
      "this site, after Piper ran",
      storage.cookies.length + " cookies, " + storage.localStorage.length + " localStorage, " + storage.sessionStorage.length + " sessionStorage (names only)",
      [{ title: "Names and sizes; values are never shown", detail: storage }],
      openLayers["Cookies and storage"],
    );
  }

  var renderQueued = false;
  if (early) {
    early.onEntry(function (entry) {
      if (offersItem(entry)) {
        setTimeout(function () {
          readOffers();
        }, 0);
      }
      if (renderQueued) return;
      renderQueued = true;
      setTimeout(function () {
        renderQueued = false;
        renderBrowser();
      }, 250);
    });
  }

  // --- What Piper made of it ---------------------------------------------------------------

  wrap.appendChild(el("h3", "inspector__group", "What Piper made of it"));
  wrap.appendChild(
    el("p", "inspector__note", "What Piper's own objects hold, read once it has started: the install, its config, its store and the events it reports."),
  );

  section("install", "page HTML", "Install");
  section("head", "qualified-head.js", "Saved settings the head applied");
  section("config", "qualified.js", "Team config (initialize)");
  section("store", "messenger store", "Messenger state after processing");
  section("offers", "WebSocket: initOffers", "Offers");
  section("cable", "WebSocket", "Messages from the server");
  section("events", "handleEvents API", "Conversation and page-view events");

  // --- Sources ------------------------------------------------------------------------------

  // The install, from the page itself: the head script and the widget script, and the docking
  // options the head reads from its own URL.
  function readInstall() {
    var scripts = Array.prototype.slice.call(document.querySelectorAll("script[src]"));
    var headScript = scripts.filter(function (s) {
      return /\/(qualified-head|docking)\.js/.test(s.src);
    })[0];
    var widgetScript = scripts.filter(function (s) {
      return /\/qualified\.js/.test(s.src);
    })[0];
    var docking = {};
    var token = null;
    if (headScript) {
      new URL(headScript.src).searchParams.forEach(function (value, key) {
        if (key === "token") token = value;
        else docking[key] = value;
      });
    }
    var status = window.PASTURE_STATUS || {};
    show(
      "install",
      (headScript ? (token ? "token head" : "head") + " + " : "no head + ") + (widgetScript ? "qualified.js" : "no qualified.js"),
      {
        headScript: headScript ? headScript.src.split("?")[0] : null,
        headToken: token ? "yes (the public widget token)" : "no",
        dockingOptionsInHeadUrl: docking,
        widgetScript: widgetScript ? widgetScript.src.split("?")[0] : null,
        harnessInstall: status.install || null,
        environment: status.env || null,
      },
    );
  }

  // What qualified-head.js applied: piper-loader.js records the head's own docking.init call on
  // the Hosted page with install=head-token. Elsewhere it isn't recorded.
  function readHead() {
    var status = window.PASTURE_STATUS || {};
    var headInit = status.headInit;
    if (!headInit) {
      show(
        "head",
        status.install === "head-token" ? "none: the server ignored the token" : "not recorded on this page (Hosted, install=head-token only)",
        undefined,
      );
    } else {
      show("head", headInit.fromHead ? "applied by qualified-head.js" : "first docking.init came from the page, not the head", headInit.config);
    }
    var docking = window.qualified && window.qualified.docking;
    if (docking && typeof docking.isDocked === "function") {
      sections.head.line.textContent += " · docked now: " + (docking.isDocked() ? "yes" : "no");
    }
  }

  function widget() {
    return window.qualified && window.qualified.widget;
  }

  function readConfig() {
    var w = widget();
    if (!w || !w.config) return show("config", "not available yet", undefined);
    var c = w.config;
    var flags = c.featureFlags ? Object.keys(c.featureFlags).filter(function (k) { return c.featureFlags[k]; }).length : 0;
    show("config", (c.isComplete === false ? "partial: fetched /configuration too" : "inlined in qualified.js") + " · " + flags + " feature flags on", c);
  }

  var STORE_KEYS = [
    "companyName",
    "agentsAvailable",
    "conversations",
    "coldStartQuestions",
    "coldStartVisibleLimit",
    "inputPlaceholder",
    "privacyDisclosures",
    "orbConfig",
    "modalityPreference",
    "displayMode",
    "conversationMode",
  ];
  function readStore() {
    var w = widget();
    var store = w && (w.multimodal || w._multimodal) && (w.multimodal || w._multimodal).rootStore;
    if (!store) return show("store", "not available (no PiperX messenger on this page yet)", undefined);
    var data = {};
    STORE_KEYS.forEach(function (key) {
      var value = read(store, key);
      if (value !== undefined) data[key] = value;
    });
    var messages = read(store, "messages") || [];
    data.messages = messages.map(function (m) {
      return { type: m.type, eventType: m.eventType, isOwn: m.isOwn, isRead: m.isRead, source: m.source, createdAt: m.createdAt };
    });
    var theme = store.uiStore && read(store.uiStore, "previewVideoConfig");
    if (theme !== undefined) data.previewVideoConfig = theme;
    if (store.featureFlags) data.featureFlags = store.featureFlags;
    show("store", (data.conversations ? data.conversations.length : 0) + " conversation(s), " + messages.length + " message(s)", data);
  }

  // The initOffers frame the early recorder kept, if any (it sees frames from the socket's start).
  function recordedOffers() {
    var early = window.__pastureInspect;
    if (!early) return undefined;
    var found;
    early.entries.forEach(function (entry) {
      var item = found === undefined && offersItem(entry);
      if (item) found = item.payload;
    });
    return found;
  }

  // A frame's message is one {event, payload} or a batch of them; this finds initOffers in it.
  function offersItem(entry) {
    var message = entry.kind === "frame" && entry.body && entry.body.message;
    var batch = Array.isArray(message) ? message : message ? [message] : [];
    return batch.filter(function (item) {
      return item && item.event === "initOffers";
    })[0];
  }

  function readOffers(offers) {
    var fromFrame = false;
    if (offers === undefined && !sections.offers.data) {
      offers = recordedOffers();
      fromFrame = offers !== undefined;
    }
    if (offers === undefined) {
      if (!sections.offers.data)
        show(
          "offers",
          "none since the inspector attached" + (attachedAt ? " at " + attachedAt : "") +
            ". The server sends initOffers as the page loads, usually before Piper lets the inspector in, so offers sent then aren't shown; any it sends later are.",
          undefined,
        );
      return;
    }
    var list = Array.isArray(offers) ? offers : offers && Array.isArray(offers.offers) ? offers.offers : [];
    show(
      "offers",
      list.length + " offer(s) for this page view" + (list.length ? ": " + list.map(function (o) { return o.name || o.id; }).join(", ") : "") +
        (fromFrame ? " (from the initOffers frame under What the browser received)" : ""),
      offers,
    );
  }

  function showLog() {
    var counts = {};
    log.forEach(function (entry) {
      counts[entry.event] = (counts[entry.event] || 0) + 1;
    });
    show(
      "cable",
      log.length
        ? log.length + " message(s): " + Object.keys(counts).map(function (k) { return k + (counts[k] > 1 ? " ×" + counts[k] : ""); }).join(", ")
        : "none since the inspector attached" + (attachedAt ? " at " + attachedAt : "") +
          ". initState usually arrives before that; what it delivered is in the messenger state above.",
      log.length ? log : undefined,
    );
  }

  var events = [];
  function showEvents() {
    show("events", events.length ? events.length + " event(s)" : "none yet", events.length ? events : undefined);
  }

  function snapshot() {
    renderBrowser();
    readInstall();
    readHead();
    readConfig();
    readStore();
    readOffers();
    showLog();
    showEvents();
  }

  // --- Listening ----------------------------------------------------------------------------

  var attached = false;
  var attachedAt = null;
  function attach(w) {
    if (attached || !w || !w.channel || typeof w.channel.on !== "function") return;
    attached = true;
    var at = ((Date.now() - started) / 1000).toFixed(1);
    attachedAt = at + "s";
    try {
      // Every server message for the PiperX messenger ({ event, payload }): initState, stateUpdate,
      // messages, ... and, without the messenger, the same through "received" (event, payload).
      w.channel.on("multimodal", function (message) {
        log.push({ t: ((Date.now() - started) / 1000).toFixed(1) + "s", source: "WebSocket", event: message && message.event, payload: message && message.payload });
        showLog();
        if (message && (message.event === "initState" || message.event === "stateUpdate")) readStore();
      });
      w.channel.on("received", function (event, payload) {
        log.push({ t: ((Date.now() - started) / 1000).toFixed(1) + "s", source: "WebSocket", event: event, payload: payload });
        showLog();
      });
      w.channel.on("initOffers", function (offers) {
        readOffers(offers);
      });
    } catch (e) {
      show("cable", "could not listen: " + e.message, undefined);
    }
    sections.cable.box.setAttribute("data-attached-at", at + "s");
    snapshot();
  }

  // The public API: conversation and page-view events.
  try {
    if (typeof window.qualified === "function") {
      window.qualified("handleEvents", function (name, data) {
        events.push({ t: ((Date.now() - started) / 1000).toFixed(1) + "s", source: "handleEvents", name: name, data: data });
        showEvents();
      });
    }
  } catch (e) {
    /* the queue stub is missing: Piper isn't on this page */
  }

  // Attach as soon as the widget exposes itself. If it already has, attach now; otherwise watch
  // for Widget#exposeDebugging setting window.qualified.widget (a pass-through setter: the value is
  // stored and returned unchanged), with a poll as a backstop if window.qualified is replaced.
  if (widget()) attach(widget());
  else if (window.qualified && Object.isExtensible(window.qualified)) {
    try {
      var value;
      Object.defineProperty(window.qualified, "widget", {
        configurable: true,
        enumerable: true,
        get: function () {
          return value;
        },
        set: function (next) {
          value = next;
          setTimeout(function () {
            attach(next);
          }, 0);
        },
      });
    } catch (e) {
      /* fall back to the poll */
    }
  }
  var polls = 0;
  var poll = setInterval(function () {
    polls++;
    if (widget()) attach(widget());
    if (attached || polls > 300) clearInterval(poll);
    if (!attached && polls > 300) snapshot();
  }, 100);

  refresh.addEventListener("click", snapshot);
  copy.addEventListener("click", function () {
    // Both parts, redacted: the browser's entries were redacted as they were recorded.
    var all = { browser: early ? { entries: early.entries, websocketPings: early.pings(), storage: storageNames() } : null, piper: {} };
    Object.keys(sections).forEach(function (id) {
      all.piper[id] = { summary: sections[id].line.textContent, data: sections[id].data };
    });
    if (navigator.clipboard) {
      navigator.clipboard.writeText(JSON.stringify(all, null, 2)).then(function () {
        copy.textContent = "Copied";
        setTimeout(function () {
          copy.textContent = "Copy as JSON";
        }, 1500);
      });
    }
  });

  snapshot();
})();
