// Piper data inspector, early part (test harness only, not part of any install). Loaded in <head>
// before Piper's scripts; does nothing unless the URL has ?inspect=1.
//
// With it, records what the browser receives, by layer, for js/inspector.js to show:
// - every resource the page loads (scripts, stylesheets, fonts, images, fetches), from the
//   browser's Resource Timing entries: URL, type, size where the server allows it;
// - the bodies of fetch and XMLHttpRequest responses, read from a clone or after load;
// - each frame received over WebSocket (ActionCable), through an extra message listener.
//
// Observe-only. fetch, XMLHttpRequest and WebSocket are wrapped so the recorder sees what comes
// back, but the page and Piper get the original promise, request and socket, unchanged: a fetch
// body is read from response.clone(), an XHR's after its load event, a socket's frames from a
// listener added beside Piper's. Nothing is sent, stored or changed. What's kept is redacted first:
// emails, phone numbers, IP addresses, identifiers, cookies and secrets never reach the recorder's
// memory, and long values are cut short. Only requests that leave this site, and this site's
// self-hosted Qualified packages (/qualified*, /cdn/), are recorded.
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  if (params.get("inspect") !== "1") return;

  // --- Redaction (shared with inspector.js) --------------------------------------------------

  var SECRET_KEY = /(email|phone|mobile|^ip$|ip_?address|uuid|visitor_?id|session_?id|conversation_?id|cookie|secret|password|passwd|authorization|auth_?token|_token$|api_?key|jwt|signature|credit|ssn)/i;
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

  // A body as data: JSON parsed (nested JSON strings too, as ActionCable sends identifiers),
  // anything else as text, then redacted.
  function parseBody(text) {
    if (typeof text !== "string") return redact(text);
    if (text.length > 200000) return "[" + text.length + " chars, not kept]";
    try {
      var data = JSON.parse(text);
      if (data && typeof data.identifier === "string") {
        try {
          data.identifier = JSON.parse(data.identifier);
        } catch (e) {
          /* not JSON: leave it */
        }
      }
      return redact(data);
    } catch (e) {
      return redactString(text);
    }
  }

  // --- Recorder ------------------------------------------------------------------------------

  var started = performance.now();
  var entries = [];
  var listeners = [];
  var pings = 0;

  function seconds() {
    return ((performance.now() - started) / 1000).toFixed(2) + "s";
  }

  function hostOf(url) {
    try {
      return new URL(url, window.location.href).host;
    } catch (e) {
      return "";
    }
  }

  // Requests that leave this site, and this site's self-hosted Qualified packages.
  function recorded(url) {
    try {
      var parsed = new URL(url, window.location.href);
      if (parsed.protocol === "data:" || parsed.protocol === "blob:") return false;
      if (parsed.host !== window.location.host) return true;
      return /^\/(qualified[^/]*|cdn)\//.test(parsed.pathname);
    } catch (e) {
      return false;
    }
  }

  function add(entry) {
    entry.t = entry.t || seconds();
    entry.host = entry.host || hostOf(entry.url);
    entries.push(entry);
    listeners.forEach(function (listener) {
      try {
        listener(entry);
      } catch (e) {
        /* a broken listener mustn't affect the page */
      }
    });
  }

  var SAFE_QUERY = /^(token|docking_\w+|wv|pv|bv|fv|bis|iml|ic|lc|bl|tz|v|version|locale|lang|env|install|mode|state|layout|theme)$/;

  function shortUrl(url) {
    try {
      var parsed = new URL(url, window.location.href);
      // Query values can carry identifiers under short names (the cable's vu and wu are visitor and
      // window UUIDs), so every value is redacted except known-harmless ones: the public widget
      // token, docking options, versions, locale and time zone.
      var query = [];
      parsed.searchParams.forEach(function (value, key) {
        query.push(key + "=" + (SAFE_QUERY.test(key) ? redactString(value) : "[redacted]"));
      });
      return parsed.origin + parsed.pathname + (query.length ? "?" + query.join("&") : "");
    } catch (e) {
      return String(url);
    }
  }

  // Resource Timing: every resource the page loaded, including <script> and <link> loads the
  // wrappers below never see. Sizes are 0 for cross-origin responses without Timing-Allow-Origin.
  var LAYER = {
    script: "Script",
    link: "Stylesheet or preload",
    css: "Loaded by CSS (fonts, images)",
    img: "Image",
    fetch: "HTTP (fetch)",
    xmlhttprequest: "HTTP (XHR)",
    iframe: "Frame",
    video: "Video",
    audio: "Audio",
    beacon: "Beacon",
    other: "Other",
  };
  function onResource(entry) {
    if (!recorded(entry.name)) return;
    // fetch and XHR get their own entries, with bodies, from the wrappers.
    if (entry.initiatorType === "fetch" || entry.initiatorType === "xmlhttprequest") return;
    add({
      layer: LAYER[entry.initiatorType] || entry.initiatorType,
      kind: "resource",
      url: shortUrl(entry.name),
      t: (entry.startTime / 1000).toFixed(2) + "s",
      size: entry.encodedBodySize || entry.transferSize || null,
      durationMs: Math.round(entry.duration),
      status: entry.responseStatus || null,
    });
  }
  try {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(onResource);
    }).observe({ type: "resource", buffered: true });
  } catch (e) {
    /* no Resource Timing: the HTTP and WebSocket layers still record */
  }

  // fetch: the page gets the original promise; the recorder reads a clone of the response.
  var nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function (input, init) {
      var promise = nativeFetch.apply(this, arguments);
      try {
        var url = typeof input === "string" ? input : input && input.url;
        var method = (init && init.method) || (input && input.method) || "GET";
        if (url && recorded(url)) {
          promise.then(
            function (response) {
              var type = response.headers.get("content-type") || "";
              var entry = { layer: "HTTP (fetch)", kind: "http", method: method, url: shortUrl(url), status: response.status, contentType: type };
              if (/event-stream/.test(type)) return add(Object.assign(entry, { body: "[stream, not read]" }));
              response
                .clone()
                .text()
                .then(
                  function (text) {
                    entry.size = text.length;
                    entry.body = parseBody(text);
                    add(entry);
                  },
                  function () {
                    add(Object.assign(entry, { body: "[body not readable]" }));
                  },
                );
            },
            function (error) {
              add({ layer: "HTTP (fetch)", kind: "http", method: method, url: shortUrl(url), status: "failed", body: redactString(String(error && error.message)) });
            },
          );
        }
      } catch (e) {
        /* recording mustn't affect the request */
      }
      return promise;
    };
  }

  // XMLHttpRequest: open and send are called through unchanged; the body is read after load.
  var XHR = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (XHR) {
    var nativeOpen = XHR.open;
    var nativeSend = XHR.send;
    XHR.open = function (method, url) {
      try {
        this.__pastureRequest = { method: method, url: String(url) };
      } catch (e) {
        /* ignore */
      }
      return nativeOpen.apply(this, arguments);
    };
    XHR.send = function () {
      var request = this.__pastureRequest;
      var xhr = this;
      if (request && recorded(request.url)) {
        xhr.addEventListener("loadend", function () {
          try {
            var type = xhr.getResponseHeader("content-type") || "";
            var readable = xhr.responseType === "" || xhr.responseType === "text";
            add({
              layer: "HTTP (XHR)",
              kind: "http",
              method: request.method,
              url: shortUrl(request.url),
              status: xhr.status,
              contentType: type,
              size: readable ? xhr.responseText.length : null,
              body: readable ? parseBody(xhr.responseText) : xhr.responseType === "json" ? redact(xhr.response) : "[" + xhr.responseType + " body]",
            });
          } catch (e) {
            /* ignore */
          }
        });
      }
      return nativeSend.apply(this, arguments);
    };
  }

  // WebSocket: the page gets the real socket; the recorder adds its own message listener.
  // ActionCable pings arrive every few seconds, so they're counted, not listed.
  var NativeSocket = window.WebSocket;
  if (typeof NativeSocket === "function") {
    var Socket = function (url, protocols) {
      var socket = protocols === undefined ? new NativeSocket(url) : new NativeSocket(url, protocols);
      try {
        if (recorded(url)) {
          add({ layer: "WebSocket", kind: "socket", event: "open requested", url: shortUrl(url) });
          socket.addEventListener("message", function (message) {
            var data = message.data;
            if (typeof data === "string" && data.indexOf('"type":"ping"') !== -1) {
              pings++;
              return;
            }
            var body = parseBody(data);
            // Name a frame by what it carries: ActionCable control frames have a type; channel
            // messages are one {event, payload} or a batch of them (initState, initOffers, …).
            var message = body && body.message;
            var batch = Array.isArray(message) ? message : message ? [message] : [];
            var names = batch
              .map(function (item) {
                return item && typeof item.event === "string" ? item.event : null;
              })
              .filter(Boolean);
            var event = names.length ? names.join(", ") : (body && body.type) || (message ? "message" : "frame");
            var channel = body && body.identifier && body.identifier.channel;
            add({ layer: "WebSocket", kind: "frame", event: event, channel: channel || null, url: shortUrl(url), size: typeof data === "string" ? data.length : null, body: body });
          });
          socket.addEventListener("close", function (close) {
            add({ layer: "WebSocket", kind: "socket", event: "closed (" + close.code + ")", url: shortUrl(url) });
          });
        }
      } catch (e) {
        /* recording mustn't affect the socket */
      }
      return socket;
    };
    Socket.prototype = NativeSocket.prototype;
    ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach(function (name) {
      Socket[name] = NativeSocket[name];
    });
    window.WebSocket = Socket;
  }

  window.__pastureInspect = {
    redact: redact,
    redactString: redactString,
    entries: entries,
    pings: function () {
      return pings;
    },
    onEntry: function (listener) {
      listeners.push(listener);
    },
  };
})();
