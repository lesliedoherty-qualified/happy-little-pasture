# Happy Little Pasture

A fake company website ("Llamalytics") for testing Qualified Piper installs, the way the
`/test/<team_id>` pages in fireball do, but as a plain static site you control. It runs two ways
from the same files:

- **Locally** with a small Express server, pointed at your local fireball.
- **On GitHub Pages**, pointed at private dev / QA, `app1.qualified-dev.com` (team 642).

The copy is corporate jargon with Bob Ross mixed in. The art is llamas with perms.

## Run it locally

```sh
mise install        # Node 24, from mise.toml
# or, with nvm: nvm install && nvm use   (Node 24, from .nvmrc)
npm install
npm start           # http://localhost:4600
```

`npm run dev` restarts the server when `server.js` changes. Site files are served with caching
off, so a reload always picks up an edit. Set `PORT` to use another port.

By default, a page served from `localhost` loads Piper from local fireball (`env=local` in
[site/config.js](site/config.js): `http://localhost:34214`, team 1). Add `?env=qa` to load
team 642 from `app1.qualified-dev.com` instead.

## Publish it on GitHub Pages

1. Create an empty repo on your own GitHub profile (for example `happy-little-pasture`). Don't add a
   README or license, so the first push is clean.
2. Push this repo:

   ```sh
   git remote add origin git@github.com:<you>/happy-little-pasture.git
   git push -u origin main
   ```

3. In the repo, open **Settings > Pages** and set **Source** to **GitHub Actions**. The
   [workflow](.github/workflows/pages.yml) publishes `site/` on every push to `main`. The site is
   at `https://<you>.github.io/happy-little-pasture/`.

## Connect team 642 (QA, app1.qualified-dev.com)

1. **Token.** Copy the token from the install snippet at
   `https://app1.qualified-dev.com/settings/setup` (the `qualified.js?token=...` value) into
   `environments.qa.token` in [site/config.js](site/config.js). Commit and push. The token is
   public: it ships in every customer's page source. To try it before committing, add
   `?token=<token>` to the URL. Team 642's widget token is already set: `oZmyapJibDbNgGvo`.
   The 24-character Demo Tool API Token on Backstage's Demo Utilities tab is a different,
   private token for the Chrome extension. `qualified.js` answers it with an empty `;`, and it
   doesn't belong in this public repo.
2. **Allowlisted domains.** Team 642 already has an allowlist (test-environment setup added the
   test-site domain), so Piper won't load anywhere else until you add your domains. In Backstage,
   edit team 642's **allowlisted domains** and add:
   - `<you>.github.io` for GitHub Pages
   - `localhost:4600` if you also want `?env=qa` from the local server
3. Open the GitHub Pages URL. Off localhost, the page defaults to `env=qa`.

Local team 1: if its allowlist is empty, every domain is allowed. If it has entries, add
`localhost:4600`.

## Publishing the self-hosted QA pages

GitHub Pages publishes only `site/`, so the generator and its inputs live alongside it in this repo.
Like a customer's self-hosted install, the QA package is committed into the site and served from
it:

- `site/qualified-qa/`: the QA package (head and widget JS, CSS, fonts and `daily/`), with QA's
  hosts baked in. The `.unminified` debug copies aren't committed.
- The QA pages that work from github.io (`publish: true` in
  [scripts/self-hosted/pages.mjs](scripts/self-hosted/pages.mjs)): `self-hosted.qa.html`,
  `self-hosted-no-init.qa.html`, `self-hosted-token-head.qa.html` and `cdn-host-prod.qa.html`.
- `site/cdn/qa/` for the Prod CDN page.

To update what Pages serves: `npm run self-hosted -- --export`, then commit `site/qualified-qa/`,
the four `.qa.html` pages and `site/cdn/qa/`, and push. Re-exports change the head, widget and CSS
filenames, so commit the deletions too.

Local pages, the test CDN page and the GTM pages need localhost, so they stay git-ignored. On
github.io the menu sends each item to its published QA page (CDN host opens the Prod CDN page) and
disables GTM, the Local environment and the Test CDN option. The sub-menu's init toggles work there
too, because they only change the page's URL.

## Test-page menu

The header menu has one link per test page, and the current one is highlighted. It's left-aligned
at the same offset on every page, so it doesn't move between pages or when docking narrows the
page; page options (environment, visitor state, variants) live in the sub-menu below it. Together they
cover every install path explicitly: **Hosted** (Qualified serves everything), **Self-hosted**
(the customer serves the package), **CDN host** (the package comes from a CDN origin; a mock CDN
here, not production) and **GTM** (the hosted snippet runs from a Google Tag Manager tag; a mock
GTM here).

The **Self-hosted** button opens a sub-menu (like Components) with the three self-hosted pages:
the README install and the two docking variants.

| Menu | Page | Look |
| --- | --- | --- |
| Hosted | `index.html`: hosted install from `config.js` (`?install=` variants in the footer harness) | Llamalytics cream |
| Self-hosted (sub-menu) > Self-hosted | `self-hosted.html`: self-hosted head + the README's copied init | Sparkleforce pink |
| Self-hosted > Docking no token | `self-hosted-no-init.html`: self-hosted head, no inline init | Rainbowforce rainbow |
| Self-hosted > Docking with token | `self-hosted-token-head.html`: `docking.js?token=` head + self-hosted widget | Glitterforce violet |
| CDN host | `cdn-host.html` (test CDN) / `cdn-host-prod.html` (prod-like CDN), copied init | Cloudforce sky |
| GTM | `gtm.html` (docking script in `<head>`) / `gtm-docking-in-gtm.html` (docking script inside the GTM tag) | AlpacalpyseForce sunset |
| Components | A sub-menu that opens on click: **Meeting booker** (`components.html`, the booker before and after QAI-6749), **Multimodal** (`multimodal.html`, the messenger markup for QAI-6788's header hooks), **Form fields** (`form-fields.html`, every field request state by display mode and theme), **Messages** (`messages.html`, the chat timeline in eight conversations), **Cards** (`cards.html`, shared offer and shared content cards), **Presented content** (`presented.html`, deck, video and slide cards) and **Calendar** (`calendar.html`, the booker's timeline entries) | Llamalytics cream |

- **Environment: Local | QA** (in the page sub-menu) switches environment. On Hosted it sets
  `?env=` and keeps your other query parameters. Every generated page has a QA twin, `<page>.qa.html`, using team 642's token and a
  QA copy of the bundle in `site/qualified-qa/`. That copy has the widget's baked-in API, WebSocket
  and CDN hosts swapped for QA's, as a package downloaded from QA would have. QA's values are
  fetched from QA's `qualified.js` on each build, with
  [scripts/self-hosted/qa-environment.json](scripts/self-hosted/qa-environment.json) as the
  fallback.
- **Visitor state: Keep | Reset on load** (every test page's sub-menu): **Reset on load** adds
  `?q_state=false`, and [site/js/reset-state.js](site/js/reset-state.js), loaded first in `<head>`,
  clears Qualified's `__q_state_*` cookies and saved messenger UI state (`__qualified_ui_state_*` in
  sessionStorage) before any Qualified script runs. Every load, including a reload, is then a new
  visitor, without a fresh incognito window. `window.__PASTURE_STATE_RESET__` lists what it cleared.
- **Page sub-menu**: each generated page has a bar at the top of `<main>` with its own options.
  Variant pages link to their twin there (CDN: Test | Prod, Docking script loaded by: HTML head |
  GTM). Pages with a copied init (Self-hosted, both CDN pages) also get **Pin beneath header:
  true | false** and **Loading skeleton: true | false**. Those set `?underNav=` and `?skeleton=`,
  which [site/js/init-overrides.js](site/js/init-overrides.js) merges into the copied
  `docking.init({...})` before first paint. It's a test-harness script loaded right after the
  head script, so the README's install block stays verbatim. **Use the copied init** clears them.
  Docking no token has no init to change, and Docking with token's init comes from Qualified's `docking.js`
  response, so neither has toggles.
- **CDN: Test / Prod** (CDN host sub-menu) switches where the package comes from:
  - **Test CDN**: a mock CDN on its own origin, `http://localhost:4601/<local|qa>/`, which
    `npm start` also runs (set `CDN_PORT` to move it, `CDN_PORT=0` to turn it off). It serves
    `cdn-test/`, cross-origin with CORS headers, like a real CDN.
  - **Prod CDN**: this site's own `/cdn/<local|qa>/` endpoint, which GitHub Pages also publishes.
    `site/cdn/qa/` isn't ignored by git, so you can commit it to publish the bundle you're
    testing (about 5MB). `site/cdn/local/` is ignored, because it only works against local fireball.
  - Both CDN copies hold only the head JS, widget JS, CSS and `woff2` fonts, without `daily/`,
    so voice and video calls don't work from them.
- **Docking script loaded by: HTML head / GTM** (GTM sub-menu) switches where the docking
  script goes:
  - **HTML head**: the Settings card's GTM install, `docking.js?token=` directly in `<head>` before
    the GTM container, with the standard Qualified snippet in a GTM tag.
  - **GTM**: the docking script inside the GTM tag too, the placement the Settings card warns
    against. It can only reserve space when the tag fires, after first paint.
- **Mock GTM**: [scripts/self-hosted/mock-gtm.js](scripts/self-hosted/mock-gtm.js) copies what
  GTM does to a page. Google's container snippet loads `gtm.js?id=GTM-PASTURE-<ENV>[-ALL]` from the
  mock CDN origin, and its Custom HTML tags fire on All Pages (`gtm.js`) and are appended to
  `<body>` with their scripts re-created, so they run late and aren't parser-inserted. The
  containers are generated into `cdn-test/gtm/`. `window.__PASTURE_GTM__.fired` lists what fired
  and when.
- **Timing**: `?delay=<ms>` on any `localhost:4601` URL holds that response. `GTM_DELAY_MS=<ms>
  npm start` slows the mock GTM container by default.
- **Themed art**: each generated page has its own logo, hero, feature illustrations and team
  portraits from [site/img/themes/](site/img/themes/), mapped to pages by
  [site/img/themes/asset-map.json](site/img/themes/asset-map.json) (Cloudforce and
  AlpacalpyseForce each cover both of their pages). `npm run self-hosted` swaps the image URLs at
  build time, keeping each image's existing width, height and alt text, so nothing changes after
  load. The build fails if a page image has no replacement or its aspect ratio differs. Hosted and
  the Components page keep the original Llamalytics art. `art/themes-preview.png` shows all five sets.
- **Components** is a disclosure button, not a link. Click, Enter or Space opens its list; Escape, a
  click outside or tabbing away closes it. The list is static HTML in every page (a manual
  `popover`), so it opens in the top layer, above a docked Piper, and moves nothing. The button
  is highlighted on either of its pages. Below 860px the whole menu is hidden, as before.
- Generated pages are git-ignored. Off localhost (GitHub Pages) their menu links are disabled.
- Names, H1s and eyebrows for the generated pages are in
  [scripts/self-hosted/pages.mjs](scripts/self-hosted/pages.mjs). Colours are the
  `html[data-page]` blocks in [site/css/site.css](site/css/site.css). The menu is static HTML;
  [site/js/nav.js](site/js/nav.js) only sets attributes on the Hosted page, so it never moves the
  layout.
- On QA, team 642 currently shows no messenger on this site with a plain install (Hosted,
  Docking no token, Docking with token). Pages with the copied init still show it docked, because that init starts
  docked by default. QA runs master, so its `docking.js?token=` doesn't embed saved settings yet.

## Query parameters

| Parameter | Values | What it does |
| --- | --- | --- |
| `env` | `local`, `qa` | Which environment in `config.js`. |
| `install` | `snippet` (default), `head`, `head-token`, `recommended` | How Piper is installed (below). |
| `docking_<option>` | for example `docking_showSkeleton=0` | Passed through to `qualified-head.js`. Adds a head script with `docking_autoInit=1` if there isn't one. |
| `sync` | `1` | Loads `qualified.js` without `async` (the sync snippet). |
| `token`, `host` | | Override the environment's token or base URL for one load. |
| `piper` | `off` | Renders the page with no Piper. |

Installs:

- **`snippet`**: only the standard install snippet from Settings > Setup. The theme decides whether
  Piper pins, so this is the baseline for theme-level pinned mode.
- **`head`**: adds a blocking `qualified-head.js` with no options before the snippet.
- **`head-token`**: `qualified-head.js?token=...`, as the QAI-6672 POC install does to read saved
  settings.
- **`recommended`**: the pinned install we recommend to customers:
  `qualified-head.js?docking_autoInit=1&docking_defaultDocked=1&docking_showSkeleton=1&docking_dockUnderHeader=1`.
  It docks at parse, before Piper reads the theme, so don't use it to judge the theme toggle.

The **Test harness** panel in the footer shows what this load installed, links to the other
combinations, copies the exact install HTML, and has **Reset visitor and reload**. Piper remembers
whether a visitor left it open, closed or docked, so reset (or use a fresh incognito window)
between theme changes.

## Self-hosted install

[site/self-hosted.html](http://localhost:4600/self-hosted.html) is the home page with Piper
installed **self-hosted**: the head script, CSS and widget JS load from this site's
`site/qualified/` folder, using the install tags from the package README word for word. It's for
QAI-6672's saved pinned messenger settings, so it uses a local package exported from the
`fireball-qai-6672` worktree. The package and the page are both generated and git-ignored.

```sh
npm run self-hosted -- --export   # export a fresh package from fireball, copy it in, build the page
npm run self-hosted               # re-copy the last export and rebuild the page
FIREBALL=~/_Server/qualified/<worktree> npm run self-hosted -- --export
```

- The package README carries team 1's saved settings **as of the export**, so run `--export`
  after every save in Settings. A page built from an old export keeps the old early layout.
- The export bundles fireball's widget-stable build. After widget code changes, rebuild it in
  `fireball-qai-6672/services` with `mise run build:js:stable`, then export.
- The footer panel shows which settings, export time and widget build the page was built from.
- It also builds two variants from the same export:
  - `self-hosted-no-init.html`: the local head script without the inline `docking.init` /
    `sentinel.init` block. Settings arrive only with the runtime configuration, so docking
    happens after first paint.
  - `self-hosted-token-head.html`: the self-hosted widget with the head from
    `docking.js?token=` on fireball (set `QUALIFIED_HOST` for another host). The server embeds the
    current saved settings, so there's no copied init to keep in sync.
- Running `mise run build:js:stable` in fireball removes the dev server's build manifests.
  Restart that worktree's `dev:rsbuild` afterwards, or hosted `docking.js` returns 500.
- The widget still talks to local fireball (34214) for its configuration and WebSockets. Only
  the asset files are self-hosted.

The manual checklist is in
`~/_Server/qualified/.cursor/projects/pinned-onboarding-rendering/QAI-6672-self-hosted-validations.md`.

## Comparing pinned and not pinned

1. Open `https://<you>.github.io/happy-little-pasture/` (team 642, master's theme-level pinned).
2. In `app1.qualified-dev.com` as team 642, turn the theme's **Pinned** on, save, then **Reset
   visitor and reload**. Repeat with Pinned off.
3. Do the same on `http://localhost:4600/` against local team 1, where the POC settings apply.

Both pages are the same HTML, so any layout difference comes from Piper and its settings.

## Components page

[site/components.html](site/components.html) (`http://localhost:4600/components.html`; the old
`booker.html` redirects there) shows the PiperX
full-screen meeting booker (`LightboxExperience` → `MeetingTimeSelector`) side by side at
several widths. It needs no rep, routing, calendar, or Piper install, so you can check its layout,
focus, and CSS in seconds instead of going through a live booking. Each frame is its own
viewport, so the app's `(max-width: 767px)` mobile queries apply. Click **open** on a frame
to inspect it in DevTools.

The top toggle switches between **Before (QAI-6749)** and **After** (the default):

- **Before:** the frozen original mobile layout, with four time columns and arrows on either
  side of the day strip. `site/booker/before.css` restores wrapping, fixed 36px pills and the
  original padding, reproducing the label overflow even when the underlying CSS has the fix.
- **After:** the compact mobile layout with three columns and arrows beside the month title.
  `site/booker/after.css` applies the shipped `SlotButton` rules: `white-space: nowrap`,
  `min-height: 36px`, and 4px inline padding. Desktop keeps its four-column layout.

Both CSS files import the captured Fireball Panda stylesheet (`site/booker/panda.css`). The
explicit pill rules keep the comparison reliable when a local checkout is behind production.
The layout comes from real component captures, rather than simulated grid styles. The frozen
`scripts/booker/dump/before-mobile.html` is preserved across refreshes; `fixed.html` captures the
compact selector. Use `?version=before` or `?version=after` to link directly to either version.

Width and brand colour controls remain available.

The frame loads Inter from Google Fonts, the font the messenger uses. That makes it the one page
on this site with a third-party request besides Qualified.

Time selection works (the frame swaps the app's selected and unselected class lists). Nothing
else is interactive, because there's no Preact behind the markup.

### Refresh it from fireball

The capture is committed, and `frame.html` records the fireball commit it came from. After
fireball changes (or to try an edit you've made there), re-capture:

```sh
npm run booker:refresh                          # ~/_Server/qualified/fireball
FIREBALL=~/_Server/qualified/<worktree> npm run booker:refresh
npm run booker:build                            # rebuild from the committed capture only
```

`booker:refresh` copies [scripts/booker/zz_booker_static_dump.test.tsx](scripts/booker/zz_booker_static_dump.test.tsx)
into fireball's `multimodal_v2/components/meetings/`, runs it with `mise run test:js`, removes it
again (even on failure), and runs [scripts/build-booker.mjs](scripts/build-booker.mjs). The test
stubs `src/validation`, an `.erb` module that would otherwise boot Rails. The Before layout stays frozen; After uses the captured compact selector.

## Multimodal page

[site/multimodal.html](site/multimodal.html) (`http://localhost:4600/multimodal.html`) shows the
PiperX messenger (`Main`) in text mode as markup only, with no Piper running. It's for checking
QAI-6788's header CSS hooks (`--q-toolbar-background`, `--q-toolbar-text-color`,
`--q-toolbar-secondary-text-color`, `--q-toolbar-button-hover-background`; see "Host-page CSS
hooks" in fireball's `multimodal_v2/DEVELOPMENT.md`) without a running app.

- **States:** Sidebar, Docked, Collapsed right, Collapsed right with the preview card showing,
  and Mobile (Sidebar with `isMobile` on). Sidebar and Collapsed right also come with no job title
  and with no name or job title: neither is required in Settings, and a cleared one stays blank,
  so the header can be the name line only, or only the avatar. The mobile layout comes from the
  app's `isMobile` signal at capture time, not the frame width.
- **Hooks:** a text field per variable (blank means unset, any CSS colour works) with a colour
  picker, plus **Classic header** and **Unset all** presets. The frame sets them on the host
  with `style.setProperty`. The page URL keeps the state and hooks, so a comparison can be linked.
- **Frame:** [site/multimodal/frame.html](site/multimodal/frame.html) puts the markup in a real open
  shadow root (declarative shadow DOM) on `#qualified-multimodal-host`, with production's inline
  host style, so `:host` rules, inherited custom properties and `::part()` behave as in
  production. One difference: there's no focus gate, so the host has no `tabindex="-1"` and Tab
  reaches the controls directly. The frame takes `?state=` and the hook names without `--q-`
  (for example `?toolbar-background=%231f5fa0`).
- Like the booker frame, it loads Inter from Google Fonts. Nothing is interactive beyond focus
  and hover.
- The 1280px frame is wider than the page, so scroll the frames row to see the floating card.

### Refresh it from fireball

```sh
FIREBALL=~/_Server/qualified/fireball-qai-6788 npm run multimodal:refresh   # the hooks branch
npm run multimodal:refresh                      # ~/_Server/qualified/fireball
npm run multimodal:build                        # rebuild from the committed capture only
```

`multimodal:refresh` copies
[scripts/multimodal/zz_multimodal_static_dump.test.tsx](scripts/multimodal/zz_multimodal_static_dump.test.tsx)
into fireball's `multimodal_v2/components/app/`, runs it with `mise run test:js`, removes it
again (even on failure), and runs [scripts/build-multimodal.mjs](scripts/build-multimodal.mjs).
The stylesheet doesn't come from the test: Jest's Panda transformer rewrites it for jsdom
(`:host` to `html`, `@layer` to `@media all`, `:where()` unwrapped), which breaks it in a
shadow root. The script runs `panda cssgen` in the same checkout instead, writing into the dump.
`frame.html` records the fireball commit, with `+uncommitted` when `multimodal_v2` had edits.

## Form fields page

[site/form-fields.html](site/form-fields.html) (`http://localhost:4600/form-fields.html`) shows the
PiperX field request (`FieldRequest`), the field the messenger shows when the agent asks for a
value, as markup only, with no Piper running.

- **Field states:** name (empty, full name required), email (empty, valid, invalid, business
  domain required, submit failed), company, phone (invalid), number, short answer with the
  admin's placeholder, long answer, picklist (default, stacked, stacked full width),
  multi-picklist (nothing picked, two picked) and checkbox (unchecked, checked). A single
  picklist has no picked state: a chip click submits at once.
- **Display modes:** Sidebar (labelled "same as docked") and Collapsed right. Docked isn't
  captured: its field styles match Sidebar's, except that Sidebar adds `marginInline: $xl` to
  the field request container. In Sidebar and Docked, picklists are anchored in the chat timeline under the agent's question (`input.isAnchored`), so those
  captures render `FieldRequestRenderer`, are labelled "(in the timeline)", and get the
  timeline's 24px inset. Collapsed right shows the question above the field.
- **Themes:** Piper colours the fields with the team's theme, set as `--q-*` properties on the
  host. The dump runs fireball's own `applyThemeCssVars` for the new-team default
  (`Team::Themes`: `#437D88`, outline rectangle buttons), Solid and Shade, and the frame sets
  those on each host. **No theme** shows the stylesheet's fallbacks, which production renders
  until a theme arrives.
- **Frame:** [site/form-fields/frame.html](site/form-fields/frame.html) shows every state for one
  mode and theme, each in its own open shadow root with the widget's stylesheet. It takes
  `?mode=`, `?theme=` and `?field=` (one state id or several, comma-separated). It inserts the
  markup once the stylesheet has loaded, as in production; inserted first, the multi-picklist's
  `transition: all` animates from browser defaults.
- The dump changes the capture in two ways: `value`, `checked` and textarea contents are copied
  from properties into the markup (Preact sets them as properties, which `innerHTML` drops), and
  the build drops `autofocus`. The message is marked read so the timeline doesn't type the
  question out.

### Refresh it from fireball

```sh
npm run form-fields:refresh                      # ~/_Server/qualified/fireball-master
FIREBALL=~/_Server/qualified/fireball-qai-1234 npm run form-fields:refresh   # a branch
npm run form-fields:build                        # rebuild from the committed capture only
```

`form-fields:refresh` defaults to the `fireball-master` worktree, so the page shows master. Only
Jest and `panda cssgen` run there: no stack and no database. It copies
[scripts/form-fields/zz_form_fields_static_dump.test.tsx](scripts/form-fields/zz_form_fields_static_dump.test.tsx)
into fireball's `multimodal_v2/components/field_request/`, runs it with `mise run test:js`,
removes it again (even on failure), and runs
[scripts/build-form-fields.mjs](scripts/build-form-fields.mjs). The stylesheet comes from
`panda cssgen`, for the same reason as the Multimodal page. The test stubs `src/validation` with
just enough rules to reach each email error.

## Messages page

[site/messages.html](site/messages.html) (`http://localhost:4600/messages.html`) shows the PiperX
chat timeline as markup only, with no Piper running. Each state is a different conversation in the
whole messenger (`Main`, text mode), so the timeline keeps its real spacing, header and composer.

- **Conversations:** a short exchange; rich text (paragraphs, bold, bulleted and numbered lists,
  an internal and an external link); a table; long and unbroken text (a long visitor message, a
  bare URL and a word with no spaces); a sales rep joining (the header switches to the rep and
  the timeline shows the joined line); reps offline (the composer gives way to the offline
  notice); and Piper thinking, both in its first second (dot only) and after it, when
  `ThinkingAnimation` shows its label. Agent text is HTML, as the server sends it after rendering
  the markdown.
- **Layouts:** Sidebar and Mobile. Mobile comes from the app's `isMobile` signal at capture time,
  not the frame width.
- **Themes:** the new-team default (outline), Solid, and none, set on the host as on the Form
  fields page.
- **Frame:** [site/messages/frame.html](site/messages/frame.html) uses the Multimodal frame's
  host: an open shadow root on `#qualified-multimodal-host` with production's inline style. It
  takes `?state=`, `?layout=` and `?theme=`, and inserts the markup once the stylesheet has
  loaded. The avatars are the local team portraits.
- Agent messages are marked read, so `RichText` shows them whole instead of fading them in. The
  joined line's "Today, &lt;time&gt;" is text from the capture day.

### Refresh it from fireball

```sh
npm run messages:refresh                      # ~/_Server/qualified/fireball-master
FIREBALL=~/_Server/qualified/fireball-qai-1234 npm run messages:refresh   # a branch
npm run messages:build                        # rebuild from the committed capture only
```

Like `form-fields:refresh`, it defaults to the `fireball-master` worktree and only runs Jest and
`panda cssgen` there. It copies
[scripts/messages/zz_messages_static_dump.test.tsx](scripts/messages/zz_messages_static_dump.test.tsx)
into fireball's `multimodal_v2/components/app/`, runs it, removes it again (even on failure), and
runs [scripts/build-messages.mjs](scripts/build-messages.mjs).

## Cards page

[site/cards.html](site/cards.html) (`http://localhost:4600/cards.html`) shows the cards Piper puts
in the chat timeline when it shares an offer (`SharedOfferRenderer`: image, headline and short
URL) or a page (`ShareContentRenderer`: preview image and title). Both are `LinkPreviewCard`
underneath. It's built like the Messages page: each state is a conversation in the whole
messenger, with the same Sidebar and Mobile layouts and themes. The headline uses the theme's
primary colour.

- **States:** an offer with text and an image, the card alone, no image, a long headline and URL;
  shared content with a preview, with a long title, and with no preview.
- **Known bug, shown as is:** shared content titles are meant to be one line
  (`lineClamp: 1`), and the collapsed preview's offer text three. The messenger's Panda config
  ejects the presets (`eject: true`), so `lineClamp` isn't expanded to `-webkit-line-clamp`, and
  production's CSS has a bare `line-clamp`, which browsers ignore. The long title shows in full.
- Messages are marked read: an unread offer's card stays hidden until its text has animated in.
- The offer and preview images are the site's own art; the dump lists the placeholder URLs it
  used (`assets` in `states.json`) and the build swaps them in.

```sh
npm run cards:refresh                      # ~/_Server/qualified/fireball-master
npm run cards:build                        # rebuild from the committed capture only
```

[scripts/build-messages.mjs](scripts/build-messages.mjs) builds all four timeline pages: Messages
with no argument, or `cards`, `presented` or `calendar`.

## Presented content page

[site/presented.html](site/presented.html) (`http://localhost:4600/presented.html`) shows what Piper
puts in the timeline when it presents something: the deck card (`PresentDeckRenderer`), the video
section card (`PresentVideoRenderer`) and the slide thumbnail (`PresentContentRenderer`). It's
built like the Messages and Cards pages, with the same layouts and themes.

- **Deck states:** never opened (stacked sheets, slide count, Start presentation); one slide;
  presented with a call still possible (Continue presentation); read partway (Resume, progress
  bar); watched (Watch again, Watched); the Email button; emailed (Sent to, Resend). The reading
  states use a real `DecksStore`: the dump opens the deck, steps through it and closes it, as the
  deck tests do, then clears the overlay's message id, which `clearArtifact` leaves set in the
  mock and which would otherwise keep the whole messenger in the viewer's layout.
- **Video section:** only shown where a call is possible, so it's captured in voice mode before a
  call. Its thumbnail is a canvas Piper paints from a video frame at runtime, blank in a capture;
  the frame paints the hero art on it as a stand-in and marks the canvas
  `data-pasture-stand-in` (`canvasStandIn` in `states.json`).
- The slide images are the site's own art, which isn't 16:9, and the deck card's width follows
  the slide, so widths vary between states.

```sh
npm run presented:refresh                      # ~/_Server/qualified/fireball-master
npm run presented:build                        # rebuild from the committed capture only
```

## Calendar page

[site/calendar.html](site/calendar.html) (`http://localhost:4600/calendar.html`) shows the meeting
booker's entries in the chat timeline, built like the other timeline pages: the "Continue
booking" card (`CalendarEventOfferRenderer` and `MeetingBookerEntry`), the cancelled offer (a rep
joined a scripted conversation), and the booked meeting (`CalendarEventPickRenderer` and
`MeetingDetailsCard`) with and without a named rep, and for a visitor in Tokyo. A fresh offer opens
the booker in the overlay instead, which the Meeting booker page (`components.html`) covers;
booked and superseded offers render nothing, so they aren't captured.

```sh
npm run calendar:refresh                      # ~/_Server/qualified/fireball-master
npm run calendar:build                        # rebuild from the committed capture only
```

## Team portraits

The six team cards use `site/img/team/1.png` to `6.png`, cut from the character sheet in
[art/character-sheet.png](art/character-sheet.png): left to right, top row first. The sheet
lives outside `site/`, so it isn't published. To re-cut them:

```sh
npm run team                          # uses art/character-sheet.png
npm run team -- path/to/new-sheet.png
```

This uses `sips`, which ships with macOS. The characters sit off-centre and close together, so
the script cuts each one to its own measured horizontal range (`TEAM_X_RANGES`), trims the top
where a shadow from the row above crosses the row line (`TEAM_TOP_TRIMS`), pads back to a square
in the sheet's cream (`TEAM_PAD_COLOR`), and resizes to 480px (`TEAM_PORTRAIT_SIZE`). A new
sheet with a different layout needs new ranges.

## Llama art

`site/img/*.svg` comes from [scripts/build-llamas.mjs](scripts/build-llamas.mjs): one llama, a
handful of props (palette, brush, easel, happy little cloud, laptop, sign) and a glowing
backdrop. Edit it and run `npm run llamas`. The SVGs are committed, so the site has no build step.

## Notes

- The page uses system fonts, fixed image sizes and no third-party requests besides Qualified, so
  layout shifts you see come from Piper.
- The first `<header>` is the sticky site header, so `dockUnderHeader` has a real header to track.
  Content sits in `<main>` and `<footer>`.
- `js/piper-loader.js` writes the install with `document.write`, so it's parser-inserted in
  `<head>` exactly like a pasted snippet. Chrome may log a warning about that; it's expected.
