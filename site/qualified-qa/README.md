# Qualified Widget — Self-Hosted Distribution Package

> **UNOFFICIAL BUILD.** This is not a reviewed Qualified snippet release and has no release
> notes. It was assembled from what Qualified production runs today, for an urgent fix.
> Replace it with the next reviewed release when Qualified sends one.

Generated: 2026-11-26
Team token: BCGYZamYC46SGX4H

This package contains everything you need to self-host the Qualified widget without
depending on the Qualified CDN. Host all files on your own infrastructure, then
reference them from your page using the `<link>` and `<script>` tags below.

This one package serves all of your Qualified orgs. It is not tied to a team: the page that loads it
says which team it is for, by passing that org's own token in `qualified('initialize', '<token>')`
(step 2 below), and the widget fetches that team's settings, including its WebSocket host, from
Qualified when the page loads. The token above is only an example for the first org; host this
package once and give each org's page its own token.

---

## What's in This Package

```
LOCAL-UNRELEASED-qai-6672.zip
├── qualified-6e882fe9.js       ← Qualified widget JS bundle
├── qualified-938256af.css      ← Widget CSS (fonts point to ./fonts/)
├── qualified-head-4517ae6b.js  ← Head scripts bundle (docking, sentinel, etc.)
├── daily/                                       ← Voice/calling runtime bundles (loaded by the widget)
│   ├── audio-processor-bundle.js
│   ├── call-machine-object-bundle.js
├── qualified-6e882fe9.unminified.js  ← Unminified copy (debugging only, do not host)
├── qualified-938256af.unminified.css  ← Unminified copy (debugging only, do not host)
├── qualified-head-4517ae6b.unminified.js  ← Unminified copy (debugging only, do not host)
├── daily/call-machine-object-bundle.unminified.js  ← Unminified copy (debugging only, do not host)
├── daily/audio-processor-bundle.unminified.js  ← Unminified copy (debugging only, do not host)
├── fonts/                                       ← 38 Inter font files (woff + woff2)
│   ├── Inter-Regular.*.woff2
│   ├── Inter-Regular.*.woff
│   └── ... (all Inter weights)
└── README.md                                    ← This file
```

All files must be served from the **same base directory** on your web server, keeping the
`daily/` and `fonts/` subfolders intact beneath it. The CSS file references fonts with
relative paths (`./fonts/Inter-*.woff2`), so as long as `fonts/` is a sibling of the CSS file,
fonts will resolve automatically. No find-and-replace needed.

**Do not rename or reorganize anything inside `daily/`.** The widget passes that folder
to the calling runtime, which appends the two filenames itself, so both must keep their exact
names and stay in the same folder as each other.

### Minified and unminified files

The JS and CSS files listed above are minified — those are the ones to host. Each also ships
as a `.unminified` copy: readable, expanded code that keeps the original function and variable
names, for stepping through the widget while debugging an issue. Line numbers in the unminified
copy do not correspond to the minified file a stack trace came from. These copies are not referenced
by any tag, so leave them out of your deployment unless support asks you to swap one in. If you
do swap one in, upload it under the original filename: the tags below reference these filenames,
and the calling runtime loads the files in `daily/` by exact name.

---

## How to Host These Files

### 1. Upload to your web server

Place all files in a single publicly accessible directory. Example:

```
https://assets.your-company.com/qualified/
  qualified-6e882fe9.js
  qualified-938256af.css
  qualified-head-4517ae6b.js
  daily/
    audio-processor-bundle.js
    call-machine-object-bundle.js
  fonts/
    Inter-Regular.f1f0c35b.woff2
    ...
```

The exact directory name does not matter, as long as the top-level files stay siblings and the
`daily/` and `fonts/` subfolders keep their names and contents.

### 2. Configure your web server

Your web server must serve these files with the correct MIME types and headers.

**Required MIME types:**

| Extension | MIME Type |
|-----------|-----------|
| .js       | `application/javascript` |
| .css      | `text/css` |
| .woff2    | `font/woff2` |
| .woff     | `font/woff` |

Most web servers (nginx, Apache, Caddy, S3+CloudFront) serve these MIME types automatically.
If you see font loading errors in the browser console, check that woff/woff2 types are configured.

**Required CORS headers (if assets are on a different origin than your page):**

```
Access-Control-Allow-Origin: https://your-app.com
Access-Control-Allow-Methods: GET, HEAD
```

Fonts in particular require CORS headers to load cross-origin. If your assets are on
the same origin as your page, no CORS configuration is needed.

**Recommended caching headers:**

All files in this package include a version identifier in their filename — either a content hash
(widget JS/CSS) or a versioned runtime filename (call-machine bundle). Long-lived caching is safe
for all files:

```
Cache-Control: public, max-age=31536000, immutable
```

When you upgrade to a new Qualified package, the filenames change, so old and new versions
coexist safely on your asset host.

---

## Content Security Policy (CSP) Directives

If your page uses a Content Security Policy, add these directives to allow the widget to operate.
Adjust hostnames to match your asset hosting URL.

**Minimum required CSP additions:**

```
script-src  'self' https://assets.your-company.com;
style-src   'self' https://assets.your-company.com;
font-src    'self' https://assets.your-company.com;
connect-src 'self' https://*.qualified.com wss://*.qualified.com;
worker-src  'self' blob:;
```

**CSP directive explanations:**

- `script-src` — allows loading the widget JS bundle, head scripts, and call-machine bundle from your asset host
- `style-src` — allows loading the CSS file from your asset host; the split-CSS self-hosted package
  does not require `'unsafe-inline'`
- `font-src` — allows loading the Inter font files from the `fonts/` directory
- `connect-src` — allows the widget to reach the Qualified API and WebSocket gateway for live chat
- `worker-src` — allows the packaged call-machine runtime to start its worker-based voice processing path;
  some browsers instantiate those workers from `blob:` URLs

**If your policy uses strict-dynamic or nonce-based CSP:**

The widget JS bundle is served as a classic script (no ESM exports). It is compatible with
`'strict-dynamic'` when loaded via a trusted `<script>` tag. The CSS file does not use
`@import` rules and does not inject styles dynamically — it is safe for strict-CSP pages.

The stylesheet `<link>` needs no inline `onload` handler, so no `'unsafe-hashes'` allowance is required for
it. Inline event handlers cannot carry a nonce, which is why the widget performs that step in JavaScript
instead.

---

## Permissions-Policy Header

If your site sends a `Permissions-Policy` response header, make sure it does not block
microphone or camera access for the page that hosts the widget. A restrictive policy like
`microphone=(), camera=()` prevents the multimodal voice and avatar flows from requesting device access.

**Recommended minimum header:**

```
Permissions-Policy: microphone=(self), camera=(self)
```

If you already maintain a broader `Permissions-Policy`, keep your existing directives and update the
`microphone` and `camera` entries so they allow the widget-hosting page.

---

## Adding the Widget to Your Page

Add these tags to your HTML `<head>`. Keep the filenames exactly as shown from this package and only update the asset host/path prefix to match your CDN or web server:

```html
<!-- 1. Load head scripts FIRST in <head>, synchronously, before the widget queue -->
<script src="https://assets.your-company.com/qualified/qualified-head-4517ae6b.js" type="text/javascript"></script>
<script type="text/javascript">
  // Prevents CLS (Cumulative Layout Shift) with pinned messenger mode (master README options)
  qualified.docking.init({"defaultDocked":true,"showSkeleton":true});

  // Terminates pending async tasks between navigation interceptions
  qualified.sentinel.init();
</script>

<!-- 2. Load the widget CSS (place in <head>) -->
<link rel="preload"
      as="style"
      data-q-stylesheet
      href="https://assets.your-company.com/qualified/qualified-938256af.css">

<!-- 3. Initialize the widget queue -->
<script>
(function (w, q) {
  w['QualifiedObject'] = q;
  w[q] = w[q] || function () {
    (w[q].q = w[q].q || []).push(arguments);
  };
})(window, 'qualified');

qualified('initialize', 'BCGYZamYC46SGX4H');
</script>

<!-- 4. Load the widget JS last -->
<script async src="https://assets.your-company.com/qualified/qualified-6e882fe9.js"></script>
```

**Important:** keep the `data-q-stylesheet` attribute on the stylesheet `<link>` tag exactly as shown above.

**Why `rel="preload"` instead of `rel="stylesheet"`:** nothing on your page needs these styles in order to
paint — they style the widget's own UI. As a plain stylesheet the file would block your first paint until it
finished downloading. `rel="preload"` fetches it off the critical path instead, and the widget bundle
switches it to a real stylesheet on startup. It does have to become one eventually: the file declares the
widget's fonts, and font declarations only take effect at document scope.

You may see the pattern written with `onload="this.onload=null;this.rel='stylesheet'"` on the tag. You do
not need it here — the widget performs that swap itself, which keeps your markup free of inline event
handlers that a strict CSP would reject.

**Important:** keep the head scripts in your `<head>`. Loading them there prevents layout shifts and ensures docking and sentinel initialize before the widget.

### Messenger layout

The Qualified head above loads from Qualified with your team token, not from this package. It
applies the messenger layout set on each Theme in the app (Pinned or Floating, starting position,
Pin beneath my header, the loading skeleton and skipping cross-origin stylesheets), so changes made
in the app reach your site on the next page load. Do not add `async` or `defer` to it, and do not
add a `qualified.docking.init(...)` call: the head ignores any later docking initialization.

With Pin beneath my header on a Theme, use semantic header/banner, main and applicable
footer/contentinfo regions. The header must be outside main and near the top of the page.
Skip cross-origin stylesheets only for actual CORS issues.

**Important:** the `daily/` folder must sit beside the widget JS bundle.

The widget resolves `daily/` relative to `qualified-6e882fe9.js` and hands that folder to
the calling runtime, which loads both files from it by exact name. You do not reference them
directly in your page — just ensure the folder is served at the same base path as the widget JS
file, with both files inside it.

One of the two is fetched lazily, at the moment a call starts noise cancellation — not at page
load. A missing or renamed file there will not show up when you check that the widget appears;
it surfaces as a failure partway into a live call. Verify by placing a test call after
deploying, not just by loading the page.

If you do not use pinned messenger mode, you can omit step 3 and skip hosting
`qualified-head-4517ae6b.js`.

---

## Upgrading

When a new version of the widget is available, your Qualified Success Architect (QSA) will
provide you with an updated zip package. Once you have it:

1. Upload the new top-level files to your asset host alongside the old ones. Their filenames
   include version identifiers, so old and new coexist safely.
2. Replace the contents of `daily/` with the new package's copy, both files together.
   These filenames are fixed by the calling runtime and carry no version identifier, so unlike
   the files above they cannot coexist with their previous versions — the new pair overwrites
   the old pair in place.
3. Update the `<link>` and `<script>` tags in your HTML to reference the new filenames.
4. After confirming the new version works, remove the old top-level files.

Because step 2 overwrites rather than adds, do steps 2 and 3 in the same deployment. Leaving a
new `daily/` in place while your page still loads the previous widget JS pairs
mismatched versions of the calling runtime.

You do **not** need to restart your web server — the files are static.

---

## Support

Contact your Qualified Success Architect or open a support ticket by emailing
help@qualified.com if you encounter issues with widget initialization, CSP
violations, or font loading.
