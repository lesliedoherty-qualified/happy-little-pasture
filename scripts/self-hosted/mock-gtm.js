// Mock Google Tag Manager container for happy-little-pasture. Not Google's code: a small runtime
// that copies what GTM does to a page, so a Qualified install "in GTM" can be tested without a
// real GTM account.
//
// build-page.mjs writes one container per ID to cdn-test/gtm/<ID>.js, filling in the container
// object at the bottom with { id, tags: [{ name, trigger, html }] }. server.js serves it from the mock CDN origin as
// http://localhost:4601/gtm.js?id=<ID>, the way googletagmanager.com serves gtm.js?id=GTM-XXXX.
//
// Like GTM:
//   - The page's container snippet pushes { event: "gtm.js" } and loads this file async.
//   - Built-in events fire triggers: "gtm.js" (Page View / All Pages, as soon as the container
//     runs), "gtm.dom" (DOM Ready) and "gtm.load" (Window Loaded).
//   - A Custom HTML tag's HTML is parsed and its nodes are appended to <body>. Scripts are
//     re-created so they run: inline ones at once, external ones load async, after parsing.
//     That's why anything in GTM can't reserve space before first paint.
(function (container) {
  "use strict";

  var w = window;
  var d = document;
  var dataLayer = (w.dataLayer = w.dataLayer || []);
  var fired = [];
  var start = performance.now();

  function injectCustomHtml(tag) {
    var holder = d.createElement("div");
    holder.innerHTML = tag.html;
    var target = d.body || d.head;
    Array.prototype.slice.call(holder.childNodes).forEach(function (node) {
      if (node.nodeName !== "SCRIPT") {
        target.appendChild(node);
        return;
      }
      var script = d.createElement("script");
      Array.prototype.forEach.call(node.attributes, function (attr) {
        script.setAttribute(attr.name, attr.value);
      });
      if (!node.src) script.text = node.text;
      target.appendChild(script);
    });
    fired.push({ tag: tag.name, trigger: tag.trigger, atMs: Math.round(performance.now()) });
  }

  function fire(event) {
    container.tags.forEach(function (tag) {
      if (tag.trigger === event) injectCustomHtml(tag);
    });
  }

  w.__PASTURE_GTM__ = { id: container.id, tags: container.tags.map(function (t) { return t.name; }), fired: fired, loadedAtMs: Math.round(start) };

  fire("gtm.js");

  function domReady() {
    dataLayer.push({ event: "gtm.dom" });
    fire("gtm.dom");
  }
  function windowLoaded() {
    dataLayer.push({ event: "gtm.load" });
    fire("gtm.load");
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", domReady);
  else domReady();
  if (d.readyState !== "complete") w.addEventListener("load", windowLoaded);
  else windowLoaded();
})(/* container */ __PASTURE_GTM_CONTAINER__);
