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

## Booker lab

[site/booker.html](site/booker.html) (`http://localhost:4600/booker.html`) shows the PiperX
full-screen meeting booker (`LightboxExperience` → `MeetingTimeSelector`) side by side at
several widths. It needs no rep, routing, calendar, or Piper install, so you can check its layout,
focus, and CSS in seconds instead of going through a live booking. Each frame is its own
viewport, so the app's `(max-width: 767px)` mobile queries apply. Click **open** on a frame
to inspect it in DevTools.

Nothing in it is hand-styled:

- `site/booker/frame.html` holds markup captured by rendering the real fireball components with
  fake slots (Thu/Fri, 15-minute times, America/Denver), so it carries the app's own hashed
  Panda class names.
- `site/booker/panda.css` is the app's own Panda stylesheet for that markup.

There are two controls:

- **Layout:** *As captured* is the booker exactly as the captured fireball checkout renders it.
  It's captured twice, once with the app's `isMobile` on and once with it off, and each frame
  shows the capture that matches its width. *Preview: compact layout on mobile* swaps the compact
  layout into the frames below 768px, so you can try the layout half of the QAI-6749 fix on a
  checkout that doesn't have it.
- **Time pill CSS-only patch:** adds `white-space: nowrap; height: auto; min-height: 36px` to
  `SlotButton`, from a separate `<style>` in the frame. That's the CSS half of the fix, for a
  checkout that doesn't have it.

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
stubs `src/validation`, an `.erb` module that would otherwise boot Rails. To capture the fix
itself, make the change in a fireball worktree and refresh from it.
Then *As captured* shows your edited code at every width.

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
