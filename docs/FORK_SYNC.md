# Syncing this fork with upstream

This repository is a private fork of `every-app/open-seo`. This file is
fork-only — upstream has no copy, so it never conflicts during a sync.

- `origin` → `https://github.com/cch1rag/open-seo.git` (ours; push here)
- `upstream` → `https://github.com/every-app/open-seo.git` (never push)

## What the fork changes

Five things diverge from upstream. Everything else should be taken from
upstream wholesale.

1. **Your own AI provider** (`anthropic`, `openai` or any OpenAI-compatible
   endpoint, picked by `AI_PROVIDER`; refused only on hosted OpenSEO; passed
   through by `deploy/alchemy/alchemy.run.ts` for the Cloudflare self-host) (`src/server/lib/openrouter.ts`).
   The fork owns `resolveChatAgentConfiguration`, `getChatAgentSetupStatus`,
   `getChatAgentModelSync`, and `requireServerChatAgent`. Upstream only has
   `buildChatAgentModel` and talks to OpenRouter directly.
2. **SAM tool hardening** (`samToolPolicy.ts`, `samToolAccess.ts`,
   `samToolErrors.ts`, plus the wiring in `SamChatAgent.ts`): call and
   paid-call budgets, a per-turn abort signal, and an active-tool allowlist.
3. **Tighter SAM budgets**: `SAM_MAX_STEPS = 24`, `SAM_MAX_OUTPUT_TOKENS = 4000`.
4. **`compose.yaml` builds this checkout** instead of pulling the upstream
   image, and forwards `AI_*` provider values.
5. **One-off AI calls use the same provider as SAM.** Website research,
   prompt research and prompt suggestions call `requireServerChatAgent`, which
   returns the model plus a `stepCostUsd` reader (OpenRouter's strict cost
   parse, or 0 for a compatible provider, which only runs unbilled in
   `local_noauth`). Upstream calls `buildChatAgentModel(await
requireOpenRouterAccess(), …)` and `requireOpenRouterCostUsd` directly; any new
   upstream caller of that pair must be switched over at sync time, along with
   its test's `@/server/lib/openrouter` mock.

## Standing conflict resolutions

These files conflict on most syncs. The decisions below are settled — apply
them instead of re-deriving.

| File                                                                  | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.yaml`                                                        | Keep the fork's `build:` block (`dockerfile: deploy/docker/Dockerfile` since upstream moved `Dockerfile.selfhost` there), `open-seo:local` default image, and `pull_policy`. Keep the fork's deduplicated `OPENROUTER_API_KEY` — upstream lists that variable **twice** and the merge re-adds the duplicate.                                                                                                                          |
| `src/server/lib/openrouter.ts`                                        | Since v0.1.21: take upstream's file wholesale, then re-add the fork block (`ChatAgentConfiguration`, `resolveChatAgentConfiguration`, `getChatAgentSetupStatus`, `getChatAgentModelSync`). `getChatAgentModelSync` builds the OpenAI-compatible model when `AI_PROVIDER` is set and otherwise delegates to upstream's `buildSamChatModel` (made non-exported), so upstream's OpenRouter routing and Every App gateway stay untouched. |
| `src/serverFunctions/samAccess.ts`                                    | Fork's env-based `getChatAgentSetupStatus` path, preceded by upstream's Every App gateway branch (`getOpenRouterAccess`).                                                                                                                                                                                                                                                                                                             |
| SAM client (`useSamAccess`, `SamSetupGate`, `SamChat`, `ChatMessage`) | Take upstream's UI wholesale, then re-add `provider` on the `setup` access state (AI\_\* gate copy when not OpenRouter) and the `onToolApproval` Approve/Reject buttons in `ToolBadge`.                                                                                                                                                                                                                                               |
| Docker docs                                                           | `SELF_HOSTING_DOCKER.md` now describes upstream's multi-container stack: take it wholesale. The fork still runs the single-container image, whose guide is `SELF_HOSTING_DOCKER_LEGACY.md`; the fork's build-from-checkout note and "AI providers" section live there.                                                                                                                                                                |
| `SamChatAgent.ts` — `getModel()`                                      | Must route through `getChatAgentModelSync`. Never let a merge restore a direct `OPENROUTER_API_KEY` read; that silently breaks self-hosted deploys while still passing every check.                                                                                                                                                                                                                                                   |
| `SamChatAgent.ts` — budgets                                           | Fork values (24 / 4000) win over upstream's (40 / 16000).                                                                                                                                                                                                                                                                                                                                                                             |
| `SamChatAgent.ts` — fields, `beforeTurn`                              | Union both sides. Upstream's telemetry/billing state and the fork's `turnAbortSignal` + `turnToolPolicy` are independent.                                                                                                                                                                                                                                                                                                             |
| `samChatTools.ts` — `buildSamMcpTools`                                | Signature is the union: `(authContext, project, getAbortSignal?, turnId?)`. Both are used. Positional order matters — upstream call sites pass `turnId` third.                                                                                                                                                                                                                                                                        |
| `SamConversation.tsx`                                                 | Union. Upstream's `experimental_throttle`/`stop`/`isRecovering`/`connectionError` and the fork's `addToolApprovalResponse` are independent.                                                                                                                                                                                                                                                                                           |

## Procedure

```bash
rtk git fetch upstream --tags

# Dry-run the conflict list before touching the working tree.
git merge-tree --write-tree --name-only main upstream/main

rtk git checkout -b merge-upstream-vX.Y.Z
git merge upstream/main
```

Resolve using the table above, then **run all four static gates at once** —
they are cheap, and running them one at a time turns a merge into a long
serial fix loop:

```bash
pnpm types:check && pnpm exec oxlint . --type-aware && pnpm exec knip && pnpm exec prettier --check .
```

Fix everything they report, then commit, then run the full gate:

```bash
pnpm ci:check && pnpm test:ci
```

## Verification gotchas

- **`ci:check` must run against a committed tree.** Its last gate is
  `test -z "$(git status --porcelain -- plugins/openseo/skills)"`, which fails
  on staged-but-uncommitted generated skills with no explanatory message.
  Commit first, then run it.
- **`max-lines` is 400 with `skipBlankLines` and `skipComments`**, so the raw
  line count is much higher than the counted one. `SamChatAgent.ts` absorbs
  code from both sides and lands near the cap. Measure the counted lines
  _before_ extracting, and extract one chunk big enough in a single pass —
  shaving a few lines at a time costs a full lint cycle each round.
- **Deleting an upstream-orphaned export cascades.** Removing a function whose
  only caller upstream deleted tends to orphan its helpers and their imports
  in turn. Re-run `knip` and `oxlint` together after each removal.
- **Every `gh` command needs `--repo cch1rag/open-seo`.** In this checkout `gh`
  resolves to `every-app/open-seo`, so a bare `gh pr create` targets the public
  upstream repository rather than the fork.
- **Don't `git add -A` during a merge** without checking for untracked local
  tool state (`.serena/`, `.worktrees/`).
- The merge output is dense; read conflicted regions with a plain file read.
  Token-compressing wrappers mangle conflict markers, and they truncate check
  output — a `prettier --check` that prints only `Checking formatting...` is a
  clipped failure, not a pass. Trust `ci:check`'s exit code over a piped tail.

## Post-sync smoke test

`docker compose up -d --build` and confirm the preflight line:

```
[ ok ] AI features: openai-compatible provider configured
```

That single line proves customization 1 survived the merge. If it reads
`openrouter` instead, `getModel()` lost the provider abstraction.
