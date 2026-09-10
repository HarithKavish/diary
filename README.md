# Diary

A personal journal, live at [diary.harithkavish.com](https://diary.harithkavish.com).
Every signed-in HarithKavish account gets its own public pages under `/@handle`,
writable only by that account.

Part of the HarithKavish ecosystem. See [GOVERNANCE.md](GOVERNANCE.md) for what governs
this repository.

## Layout

```
index.html, app.js, style.css, 404.html   The static shell -- a client-side
                                           router (no build step) that renders
                                           /, /@handle, and /@handle/topic/slug
                                           and calls the API below.
worker/                                   The API: a Cloudflare Worker + D1
                                           database, mounted at /api/* on the
                                           same custom domain.
```

## How sign-in works

Diary is a registered OAuth client of `account.harithkavish.com` (the same pattern
`forge` and `realmora` use): `/api/auth/login` starts a PKCE authorization-code round
trip, `/api/auth/callback` exchanges the code and reads `sub` / `preferred_username`
from `/api/oauth/userinfo`, and diary keeps its own session cookie from there. A
user's `preferred_username` becomes their `@handle`; if they have not set one, a
short id is used as a fallback until they change it (`PATCH /api/me/handle`).

Pages are public to read. Writing one requires a diary session whose user matches
the page's owner.

## Running it locally

The shell is static — open `index.html` directly, or serve the repo root with any
static file server. The API needs `worker/`: `npm install` there, then
`wrangler dev` (needs a local `OAUTH_SECRET_DIARY`, and the callback URL registered
against a locally-reachable account.harithkavish.com client — see worker/wrangler.toml).

## Deployment

- **Shell:** GitHub Pages, via [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)
  on every push to `main`. Custom domain in [CNAME](CNAME).
- **API:** a Cloudflare Worker (`worker/`), deployed via
  [.github/workflows/deploy-worker.yml](.github/workflows/deploy-worker.yml) and mounted
  at `diary.harithkavish.com/api/*` by a Worker Route declared in
  [worker/wrangler.toml](worker/wrangler.toml) — everything else on that hostname falls
  through to GitHub Pages.
