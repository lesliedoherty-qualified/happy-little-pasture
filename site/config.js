// Which Qualified environment this page loads Piper from.
//
// Pick one per page load with ?env=local or ?env=dev. Without ?env=, the page
// uses `defaultEnv.localhost` when served from localhost and
// `defaultEnv.hosted` everywhere else (GitHub Pages).
//
// Tokens are the public widget token from Settings > Setup (the
// `qualified.js?token=...` value in the install snippet). They already ship in
// every customer's page source, so committing them here is fine.
window.PASTURE_CONFIG = {
  environments: {
    local: {
      label: "Local fireball, team 1 (QAI-6672 worktree)",
      baseUrl: "http://localhost:34214",
      token: "BCGYZamYC46SGX4H",
    },
    dev: {
      label: "app.qualified-dev.com, team 642",
      baseUrl: "https://app.qualified-dev.com",
      // Paste team 642's token from https://app.qualified-dev.com/settings/setup
      token: "",
    },
  },

  defaultEnv: {
    localhost: "local",
    hosted: "dev",
  },

  // How Piper is installed. Override per load with ?install=<name>.
  //   snippet      The standard install snippet only. The theme decides pinning.
  //   head         Adds a blocking qualified-head.js with no options.
  //   head-token   qualified-head.js?token=... (the QAI-6672 POC reads saved settings this way).
  //   recommended  The pinned-mode install we recommend to customers: auto-init,
  //                docked by default, skeleton, docked under the header.
  install: "snippet",
};
