# Syncing this fork with upstream

This repository is a private fork of `every-app/open-seo`. This file is
fork-only — upstream has no copy, so it never conflicts during a sync.

- `origin` → `https://github.com/cch1rag/open-seo.git` (ours; push here)
- `upstream` → `https://github.com/every-app/open-seo.git` (never push)

## What the fork changes

Four things diverge from upstream. Everything else should be taken from
upstream wholesale.

1. **Self-hosted OpenAI-compatible AI provider** (`src/server/lib/openrouter.ts`).
   The fork owns `resolveChatAgentConfiguration`, `getChatAgentSetupStatus`,
   `getChatAgentModelSync`, and `buildChatAgentModelFromConfiguration`.
   Upstream only has `buildChatAgentModel` and talks to OpenRouter directly.
2. **SAM tool hardening** (`samToolPolicy.ts`, `samToolAccess.ts`,
   `samToolErrors.ts`, plus the wiring in `SamChatAgent.ts`): call and
   paid-call budgets, a per-turn abort signal, and an active-tool allowlist.
3. **Tighter SAM budgets**: `SAM_MAX_STEPS = 24`, `SAM_MAX_OUTPUT_TOKENS = 4000`.
4. **`compose.yaml` builds this checkout** instead of pulling the upstream
   image, and forwards `AI_*` provider values.

## Standing conflict resolutions

These files conflict on most syncs. The decisions below are settled — apply
them instead of re-deriving.

| File                                     | Resolution                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.yaml`                           | Keep the fork's `build:` block, `open-seo:local` default image, and `pull_policy`. Keep the fork's deduplicated `OPENROUTER_API_KEY` — upstream lists that variable **twice** and the merge re-adds the duplicate.                                                                              |
| `src/server/lib/openrouter.ts`           | The provider abstraction wins. Upstream's model-routing changes belong **inside** `buildOpenRouterChatAgentModel`. Any new argument upstream adds to `buildChatAgentModel` must be threaded `getChatAgentModelSync` → `buildChatAgentModelFromConfiguration` → `buildOpenRouterChatAgentModel`. |
| `SamChatAgent.ts` — `getModel()`         | Must route through `getChatAgentModelSync`. Never let a merge restore a direct `OPENROUTER_API_KEY` read; that silently breaks self-hosted deploys while still passing every check.                                                                                                             |
| `SamChatAgent.ts` — budgets              | Fork values (24 / 4000) win over upstream's (40 / 16000).                                                                                                                                                                                                                                       |
| `SamChatAgent.ts` — fields, `beforeTurn` | Union both sides. Upstream's telemetry/billing state and the fork's `turnAbortSignal` + `turnToolPolicy` are independent.                                                                                                                                                                       |
| `samChatTools.ts` — `buildSamMcpTools`   | Signature is the union: `(authContext, project, getAbortSignal?, turnId?)`. Both are used. Positional order matters — upstream call sites pass `turnId` third.                                                                                                                                  |
| `SamConversation.tsx`                    | Union. Upstream's `experimental_throttle`/`stop`/`isRecovering`/`connectionError` and the fork's `addToolApprovalResponse` are independent.                                                                                                                                                     |

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
