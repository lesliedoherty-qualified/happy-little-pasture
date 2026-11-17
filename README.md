# Happy Little Pasture

A fake company website ("Llamalytics") for testing Qualified Piper installs, the way the
`/test/<team_id>` pages in fireball do, but as a plain static site you control. It runs two ways
from the same files:

- **Locally** with a small Express server, pointed at your local fireball.
- **On GitHub Pages**, pointed at `app.qualified-dev.com` (team 642).

The copy is corporate jargon with Bob Ross mixed in. The art is llamas with perms.

## Run it locally

```sh
mise install        # Node 24, from mise.toml
npm install
npm start           # http://localhost:4600
```

`npm run dev` restarts the server when `server.js` changes. Site files are served with caching
off, so a reload always picks up an edit. Set `PORT` to use another port.

By default, a page served from `localhost` loads Piper from local fireball (`env=local` in
[site/config.js](site/config.js): `http://localhost:34214`, team 1). Add `?env=dev` to load
team 642 from `app.qualified-dev.com` instead.

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

## Connect team 642 (app.qualified-dev.com)

1. **Token.** Copy the token from the install snippet at
   `https://app.qualified-dev.com/settings/setup` (the `qualified.js?token=...` value) into
   `environments.dev.token` in [site/config.js](site/config.js). Commit and push. The token is
   public: it ships in every customer's page source. To try it before committing, add
   `?token=<token>` to the URL.
2. **Allowlisted domains.** Team 642 already has an allowlist (test-environment setup added the
   test-site domain), so Piper won't load anywhere else until you add your domains. In Backstage,
   edit team 642's **allowlisted domains** and add:
   - `<you>.github.io` for GitHub Pages
   - `localhost:4600` if you also want `?env=dev` from the local server
3. Open the GitHub Pages URL. Off localhost, the page defaults to `env=dev`.

Local team 1: if its allowlist is empty, every domain is allowed. If it has entries, add
`localhost:4600`.

## Query parameters

| Parameter | Values | What it does |
| --- | --- | --- |
| `env` | `local`, `dev` | Which environment in `config.js`. |
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

## Comparing pinned and not pinned

1. Open `https://<you>.github.io/happy-little-pasture/` (team 642, master's theme-level pinned).
2. In `app.qualified-dev.com` as team 642, turn the theme's **Pinned** on, save, then **Reset
   visitor and reload**. Repeat with Pinned off.
3. Do the same on `http://localhost:4600/` against local team 1, where the POC settings apply.

Both pages are the same HTML, so any layout difference comes from Piper and its settings.

## Team portraits

The six team cards read `site/img/team/1.png` to `6.png`: left to right, top row first, from the
character sheet. To cut them from a 3-by-2 sheet:

```sh
npm run team -- path/to/character-sheet.png
```

This uses `sips`, which ships with macOS, to crop six centred squares and resize them to 480px
(set `TEAM_PORTRAIT_SIZE` to change that). Until the files exist, the cards show a soft tile.

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
