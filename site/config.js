// Which Qualified environment this page loads Piper from.
//
// Pick one per page load with ?env=local or ?env=qa. Without ?env=, the page
// uses `defaultEnv.localhost` when served from localhost and
// `defaultEnv.hosted` everywhere else (GitHub Pages).
//
// Tokens are the public widget token: the `qualified.js?token=...` value in
// the install snippet at Settings > Setup. They already ship in every
// customer's page source, so committing them here is fine.
//
// Don't confuse it with the "Demo Tool API Token" on Backstage's Demo
// Utilities tab. That one is a bearer token for the Chrome extension demo
// tool, qualified.js answers it with an empty `;`, and it must not be
// committed to this public repo.
window.PASTURE_CONFIG = {
  environments: {
    local: {
      label: "Local fireball, team 1 (QAI-6672 worktree)",
      baseUrl: "http://localhost:34214",
      token: "BCGYZamYC46SGX4H",
    },
    qa: {
      label: "Private dev (QA), team 642 on app1.qualified-dev.com",
      baseUrl: "https://app1.qualified-dev.com",
      token: "oZmyapJibDbNgGvo",
    },
  },

  defaultEnv: {
    localhost: "local",
    hosted: "qa",
  },

  // How Piper is installed. Override per load with ?install=<name>.
  //   snippet      The standard install snippet only. The theme decides pinning.
  //   head         Adds a blocking qualified-head.js with no options.
  //   head-token   qualified-head.js?token=... (the QAI-6672 POC reads saved settings this way).
  //   recommended  The pinned-mode install we recommend to customers: auto-init,
  //                docked by default, skeleton, docked under the header.
  install: "snippet",
};
