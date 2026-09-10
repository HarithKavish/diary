# Agent Instructions

This repository is part of the **HarithKavish ecosystem**.

**Before changing anything**, read
[AGENT_BOOTSTRAP.md](https://github.com/HarithKavish/harithkavish-governance/blob/main/AGENT_BOOTSTRAP.md)
and follow it. See [GOVERNANCE.md](GOVERNANCE.md) for what governs this repository.

Do not begin implementation work before discovery is complete.

## Hard stops

A reminder, not the rule. These restate doctrine articles so an agent that reads nothing
else still has the guardrails. Governance is authoritative; if these ever disagree with
it, governance wins.

- Do not commit to the production branch (Article 6).
- Do not commit secrets or credentials (Article 5, SECURITY).
- Do not redefine design foundations locally (Article 4).
- Do not copy governance or the design system into this repository (Article 3).
- Do not act outside the scope you were given (Article 9).

## About this repository

Diary is a personal journal at diary.harithkavish.com: a static GitHub Pages shell
(client-side router, no build step) in front of a Cloudflare Worker + D1 API mounted
at `/api/*`. Every signed-in HarithKavish account gets public, self-editable pages
under `/@handle`. See README.md for the layout and the sign-in flow.

## Working here

- The shell (`index.html`, `app.js`, `style.css`) has no build step and no
  dependencies — edit directly.
- The API (`worker/`) is a Cloudflare Worker. `npm install` in `worker/` before
  editing its TypeScript; deploy is `.github/workflows/deploy-worker.yml`, not a
  manual `wrangler deploy`, once that workflow's `CLOUDFLARE_API_TOKEN` secret is set.
- Diary is a registered OAuth client of `account.harithkavish.com`
  (`lib/oauth/clients.ts` there). Changing diary's redirect URI or client id means a
  matching change on that side, coordinated as its own scoped pull request — never
  assume the two can drift independently.
- `OAUTH_SECRET_DIARY` (a Worker secret) must equal the secret configured for the
  `diary` client on account.harithkavish.com. Neither value ever appears in this
  repository.
