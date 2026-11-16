# Fork context board

_Last updated: 2026-11-16_

## Current state

| Item            | Value                                                               |
| --------------- | ------------------------------------------------------------------- |
| Upstream synced | `every-app/open-seo` `2df84ff9` (v0.1.27 + 20 commits)              |
| `origin/main`   | `dc298cbb` — sync (PR #7) plus the standalone build fix (PR #8)     |
| CI on `main`    | Green: `ci`, `standalone-image`, `docker-build`, `everyapp release` |
| Remote branches | `main`, `dulse` only                                                |
| Working branch  | `dulse` (Orca worktree); kept level with `main`                     |

## Deployments

| Target                      | How it is deployed                                                                              | Running                                |
| --------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------- |
| Cloudflare self-host        | `pnpm deploy:selfhost --yes` from the main checkout (`.env.selfhost`, Alchemy stage `selfhost`) | `dc298cbb`, behind Cloudflare Access   |
| Local Docker (legacy image) | `docker compose up -d --build` from the main checkout (`.env`)                                  | Built at `dc298cbb`; container stopped |

Merging to `main` deploys nothing: `deploy-production.yml` is manual and
upstream's, and the Docker publish job only runs on `every-app/open-seo`.

## What the fork changes

See `docs/FORK_SYNC.md` → "What the fork changes". In short: your own AI
provider (`AI_PROVIDER`, optional `AI_VPC_SERVICE`), SAM tool hardening,
tighter SAM budgets (24 steps / 4000 tokens), `compose.yaml` builds the
checkout, and one-off AI calls use the same provider as SAM.

## Open items

- `.env.selfhost` sets `AI_PROVIDER` on two lines; the later one wins.
  Remove the duplicate when convenient.
- `src/server/lib/openrouter.test.ts` ("loads the Anthropic provider on first
  use…") fails when the shell exports `ANTHROPIC_BASE_URL`. Unset it before
  `pnpm test:ci`.
- Live check of SAM on the Cloudflare self-host (sign in, send one message)
  has not been done since the 2026-11-16 deploy.
