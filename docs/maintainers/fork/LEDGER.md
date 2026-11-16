# Fork ledger

New entries go at the top; past entries are not edited. One entry per sync,
fix, deploy or cleanup. Link PRs and commits; keep secrets and `.env` values
out.

## 2026-11-16

- **Upstream sync to `2df84ff9`** (v0.1.25 → v0.1.27 + 20 commits, 107
  commits). PR #7, merge `2a92c6f4`. Conflicts:
  - `aiPromptResearch.ts`, `aiPromptSuggestions.ts`: took upstream's
    `withResearchAdmission`; kept `requireServerChatAgent` and
    `chatAgent.stepCostUsd` inside it.
  - `SamChatAgent.ts` `beforeTurn`: union of the fork's turn reset and
    upstream's `releaseTurnHold()`.
  - `deploy/alchemy/alchemy.run.ts` hit lint complexity 41/40; the VPC bind
    moved to `bindAiVpc` in `deploy/alchemy/forkAiEnv.ts`.
- **Standalone build fix.** PR #8, merge `dc298cbb`. Upstream's
  lean-bundle check denied `@ai-sdk/openai|anthropic`, which the fork uses;
  the rule now applies only to code-split worker builds
  (`vite-plugin-lean-worker-bundle.ts`). This also turned `main` CI green,
  red since 2026-10-31.
- **Deployed** the Cloudflare self-host at `dc298cbb`
  (`pnpm deploy:selfhost --yes`); version `27eb53fd`. Rebuilt the local
  Docker image; container left stopped.
- **Branch cleanup.** Deleted `fix/standalone-ai-sdk-denylist` and six stale
  remote branches: `feat/selfhost-compatible-ai-providers` (merged, PR #1)
  and five copies of upstream branches already merged upstream or closed
  (`audit-fk-indexes`, `claude/mcp-tool-text-parity`,
  `codex/greptile-review-rules`, `docs/cloudflare-access-mcp-dcr`,
  `dosu/doc-update-123`).
- **Docs.** Added this ledger, the context board and an index under
  `docs/maintainers/fork/`; moved fork plans and specs there from
  `docs/superpowers/`.

## 2026-11-05

- Upstream sync to v0.1.24 (`c87e1cf0`). `stepCostUsd` may now return a
  promise; callers await it. `OpenRouterAccess` kept module-private for knip.

## 2026-10-31

- Upstream sync to v0.1.21 (`abecf8a9`).
- PR #6: Anthropic and OpenAI providers (Anthropic loaded lazily), private
  provider through a Workers VPC service, served-model shown on each SAM
  reply, website and prompt research routed through the configured provider.

## 2026-09-18

- Upstream sync to v0.1.9 (PR #4). Recorded the sync playbook
  (`docs/FORK_SYNC.md`, PR #5).

## 2026-08-23

- Upstream sync to v0.1.6 (PR #3).

## 2026-08-08

- PR #1: OpenAI-compatible self-hosted AI providers, setup validation,
  `compose.yaml` builds the local image.
- PR #2: SAM tool hardening (call and paid-call budgets, per-turn abort,
  active-tool allowlist).
