// The "Test harness" panel in the footer: shows how Piper was installed on
// this load and links to the other combinations. It lives in normal page
// flow (not fixed), so it never competes with a docked messenger for space.
(function () {
  "use strict";

  var status = window.PASTURE_STATUS || {};
  var root = document.getElementById("harness");
  if (!root) return;

  function withParams(changes) {
    var url = new URL(window.location.href);
    Object.keys(changes).forEach(function (key) {
      if (changes[key] === null) url.searchParams.delete(key);
      else url.searchParams.set(key, changes[key]);
    });
    return url.pathname + url.search;
  }

  function el(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      if (key === "text") node.textContent = props[key];
      else node.setAttribute(key, props[key]);
    });
    (children || []).forEach(function (child) {
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function choices(label, key, values, current) {
    return el("div", { class: "harness__row" }, [
      el("span", { class: "harness__label", text: label }),
      el(
        "span",
        { class: "harness__choices" },
        values.map(function (value) {
          var change = {};
          change[key] = value;
          return value === current
            ? el("strong", { class: "harness__chip harness__chip--on", text: value })
            : el("a", { class: "harness__chip", href: withParams(change), text: value });
        })
      ),
    ]);
  }

  function fact(label, value) {
    return el("div", { class: "harness__row" }, [
      el("span", { class: "harness__label", text: label }),
      el("code", { class: "harness__value", text: value || "(none)" }),
    ]);
  }

  var panel = [el("h2", { class: "harness__title", text: "Test harness" })];

  if (status.error) panel.push(el("p", { class: "harness__error", text: status.error }));
  else if (status.disabled) panel.push(el("p", { class: "harness__note", text: "Piper is off for this load (piper=off)." }));

  panel.push(
    choices("Environment", "env", status.environments || [], status.env),
    choices("Install", "install", status.installs || [], status.install),
    choices("Piper", "piper", ["on", "off"], status.disabled ? "off" : "on"),
    fact("Environment", status.envLabel),
    fact("Base URL", status.baseUrl),
    fact("Token", status.token),
    fact("Head script", status.headSrc),
    fact("Widget", status.widgetSrc)
  );

  var reset = el("button", { type: "button", class: "harness__button", text: "Reset visitor and reload" });
  reset.addEventListener("click", function () {
    // Piper remembers open/closed and docked state per visitor. Clearing
    // this site's cookies and storage gives the next load a fresh visitor.
    document.cookie.split(";").forEach(function (cookie) {
      var name = cookie.split("=")[0].trim();
      if (!name) return;
      var expire = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
      document.cookie = expire;
      document.cookie = expire + "; domain=" + window.location.hostname;
    });
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch (e) {
      /* storage blocked: nothing to clear */
    }
    window.location.reload();
  });

  var copy = el("button", { type: "button", class: "harness__button harness__button--ghost", text: "Copy install HTML" });
  copy.addEventListener("click", function () {
    if (!status.html || !navigator.clipboard) return;
    navigator.clipboard.writeText(status.html).then(function () {
      copy.textContent = "Copied";
      setTimeout(function () {
        copy.textContent = "Copy install HTML";
      }, 1500);
    });
  });

  panel.push(el("div", { class: "harness__actions" }, [reset, copy]));
  panel.forEach(function (node) {
    root.appendChild(node);
  });
})();
