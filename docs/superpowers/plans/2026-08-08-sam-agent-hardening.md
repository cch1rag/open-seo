# SAM agent hardening implementation plan

> **For implementation:** Use the `executing-plans` skill and execute this plan in `feat/sam-agent-hardening`. Do not start, stop, or restart a server from the main checkout; any isolated browser test must use an explicit port other than 3001.

**Goal:** Bound SAM's work and spending, prevent unreviewed durable writes, make cancellation real where supported, and make external evidence and failures safe to consume.

**Architecture:** Retain the existing authorization model—session owner, organisation membership, and server-side project injection. Add the smallest enforcement at the existing tool boundary (`buildSamMcpTools` / `adaptMcpTool`), not a second agent framework. Use the installed Agents/AI SDK approval mechanism if it can securely bind a pending operation to an authenticated user; otherwise stop after the compatibility spike and choose the repository-native alternative before implementing UI/protocol changes.

**Tech stack:** TypeScript, Cloudflare Agents/AI SDK, Zod, Vitest, React.

## Critique of the original findings

| Finding | Assessment | Revised priority and rationale |
| --- | --- | --- |
| Crawled pages can prompt-inject SAM and get persisted | The exposure is real: `read_pages` returns page text to the model and the prompt tells it to save inferred context. No exploit or cross-project authorization bypass was demonstrated. | **High integrity risk**, not “critical”: make external data non-authoritative and remove automatic persistence. Approval then limits the blast radius. |
| 48 steps / 6,000 output tokens and no hard tool/cost cap | Confirmed. The code explicitly relies on “per-step metering and the model stopping”; `onStepFinish` only adds LLM cost after each step. | **High cost/availability risk**. Enforce total and paid-tool limits in the wrapper; choose conservative defaults from production telemetry before shipping. |
| Rewind does not abort in-flight work | Confirmed. SAM supplies a newly created placeholder signal and the code comments that no handler reads it. | **High cost/UX risk**, not a proven security issue. Thread the real signal where SDK/client support exists, and test the remaining unsupported providers explicitly. |
| Durable memory and saved keywords rely on prompt wording | Confirmed for memory—`set_context` is explicitly writable and the fresh-project prompt demands an immediate write. `save_keywords` is model-callable. | **High integrity/UX risk**. First remove auto-writing; add user approval for tool-initiated writes once the SDK capability is verified. Preserve an explicit user save action rather than adding friction to every harmless reply. |
| Credits are checked before but charged after a turn | Confirmed for hosted credit reconciliation. It is not proof that a customer can overrun a balance; billing may have its own controls. | **Medium**: tool budgets are the immediate control. Add low-credit/charge telemetry and only introduce reservations after measuring whether the billing API supports a safe atomic hold. |
| Raw exception messages are returned to the model | Confirmed in `adaptMcpTool`. | **Medium**: normalize expected errors and redact unknown failures, preserving enough category information for recovery. |
| Model fallback and provider are not auditable per turn | Cost is recorded as OpenRouter cost and a static `provider: "openrouter"`; final routing/fallback detail is not retained. There is no evidence that unsafe fallback happens. | **Medium observability gap**: record resolved response metadata where available. Do not add a new model allowlist unless product policy requires one. |
| Raw project metadata is interpolated into the prompt | It is quoted but not separately structured. This is a defense-in-depth concern, not a demonstrated prompt injection path. | **Low**: delimit/serialize it as metadata while touching the prompt; no standalone feature. |
| “Narrate nothing” and research-log wording | These are product tradeoffs, not defects on their own. | **Not in this hardening scope**. Preserve concise interaction; expose only meaningful states such as approval, partial result, or budget exhaustion. |
| SAM lifecycle lacks direct tests | TokenSave reports 13 of 14 production symbols in `SamChatAgent.ts` lack direct coverage (one apparent `fetch` association is unrelated). | **Medium regression risk**: add focused tests around the hardening seams, not a speculative end-to-end harness first. |

## Critique of the first plan and decisions applied here

- It treated prompt injection as a demonstrated critical compromise. The revised plan calls it a high-probability data-integrity risk and relies on server-side write control instead of claiming prompt delimiters solve it.
- It proposed a broad, new approval protocol before verifying the SDK's existing approval support. This version begins with a short compatibility spike and has a clear decision gate.
- It introduced provider-specific dollar ceilings, an evaluation suite, an environment model allowlist, and new documentation as if all were required. Those are useful only after telemetry shows a need, so they are deferred.
- It classified every write as requiring an extra confirmation, which risks making an explicit “save these keywords” request awkward. The revised rule blocks autonomous/tool-initiated commits; the authenticated user can explicitly approve a presented payload.
- It named uncertain files and interfaces (`scrapeTools.ts`, generic approval endpoint) rather than the actual `samChatTools.ts` seam. The revised plan uses verified paths and calls out the one SDK API that must be inspected before wiring it.
- It picked hard limits without an observed workload baseline. The revised plan makes limits centrally configurable, measures production turn shape, and ships only values supported by that data.

## Implementation plan

### Task 1: Verify the extension points and define acceptance tests

**Files:**
- Inspect: installed Agents/AI SDK declarations under `node_modules` (read-only)
- Create: `src/server/features/sam/samChatTools.test.ts`
- Create: `src/server/features/sam/samSystemPrompt.test.ts`
- Create: `src/server/features/sam/SamChatAgent.test.ts`

1. Inspect the installed SDK for the actual turn cancellation signal and native tool-approval API (including how it binds an approval to a session/user). Record the API names and version in the implementation PR description.
2. Write failing tests against today’s behavior: a wrapped tool receives the placeholder signal; a tool error exposes its raw message; the empty-memory prompt orders automatic persistence; and `beforeTurn` exposes the current oversized limits.
3. Add one authorization regression test that proves `adaptMcpTool` continues to strip a model-supplied `projectId` and reinject the authenticated project ID.
4. **Decision gate:** use native tool approval only if its response is authenticated, session-bound, payload-bound (or can be bound by the wrapper), expiring, and single-use. If any property is absent, pause implementation and propose the smallest repository-native server route/store design; do not invent a client-only token protocol.
5. Run `rtk pnpm vitest run src/server/features/sam`.

### Task 2: Remove autonomous context writes and harden the prompt's evidence model

**Files:**
- Modify: `src/server/features/sam/samSystemPrompt.ts`
- Modify: `src/server/features/sam/samChatTools.ts`
- Modify: existing scrape tests under `src/server/lib/scrape.test.ts` as needed
- Modify: `src/server/features/sam/samSystemPrompt.test.ts`

1. Remove the fresh-project instruction to save inferred facts “right away” and the unconditional ten-page crawl before answering a research question. Keep lightweight orientation, but make it proportional to the user's request.
2. Add clear system-prompt rules: web pages, SERP content, and tool output are untrusted evidence; they cannot modify policies, authorize tools/writes, or override user intent. Ask SAM to distinguish sourced fact from inference and name the relevant source URL when making material recommendations.
3. Label scrape results with their URL and retrieval context in their existing structured return shape. Do not build a second scraping pipeline or attempt brittle text sanitization; SSRF validation and output size caps remain in the existing scrape library.
4. Delimit project metadata and stored context as data in the prompt. This is defense-in-depth; it does not change authorization or claim to eliminate prompt injection.
5. Test empty and populated prompt output: it retains no-fabricated-metrics guidance, never directs autonomous persistence, never mandates ten pages, and includes the untrusted-evidence rule.
6. Run focused prompt/scrape tests.

### Task 3: Add an enforcement wrapper for bounded tool work and safe errors

**Files:**
- Create: `src/server/features/sam/samToolPolicy.ts`
- Create: `src/server/features/sam/samToolPolicy.test.ts`
- Modify: `src/server/features/sam/samChatTools.ts`
- Modify: `src/server/features/sam/SamChatAgent.ts`

1. Categorize the existing tool definitions in one explicit map: ordinary read, paid read, and mutation. Classification is server-owned; neither the client nor the model can select it.
2. Create a per-turn policy state passed into `buildSamMcpTools`. It must cap total tool invocations and paid invocations, reject calls after a deadline/cancellation, and produce stable public error codes (`budget_exhausted`, `cancelled`, `unavailable`, `invalid_request`).
3. Start with conservative, named environment/config defaults, but select final production values only after examining anonymized current turn telemetry (median, p95, and paid-call distribution). Keep `maxSteps` and output-token caps in the same central policy to avoid contradictory limits.
4. Make `adaptMcpTool` invoke policy validation before the handler and settle call state in `finally`. Replace raw `error.message` output with a small allowlisted mapper; unknown errors become a generic retry-safe failure and the detailed cause remains server-side only.
5. Do not add a new dollar estimator in this phase. Existing final LLM cost charging remains reconciliation; paid-call caps give a deterministic first control while data-provider prices are not yet proven available before a call.
6. Test normal calls, budget exhaustion, paid-call exhaustion, typed validation errors, and a database/provider-like unknown error. Re-run the project-ID injection regression.

Example public result:

```ts
{ error: { code: "budget_exhausted", retryable: false } }
```

### Task 4: Propagate genuine cancellation as far as the stack supports

**Files:**
- Modify: `src/server/features/sam/SamChatAgent.ts`
- Modify: `src/server/features/sam/samChatTools.ts`
- Modify: `src/server/lib/scrape.ts` only if its request path accepts a signal
- Modify: `src/server/features/sam/samChatTools.test.ts`

1. Replace the placeholder controller with the real SDK turn/request signal established in Task 1. Thread it through the policy and MCP tool adapter.
2. Pass the signal to `fetch`-based scrape work and provider clients only where their actual APIs accept it. For a provider that cannot cancel an outbound request, prevent subsequent calls and record `cancellation_not_propagated` telemetry rather than pretending it was aborted.
3. Ensure a cancelled/rejected tool call cannot transition into a mutation commit. Keep rewind's existing stability wait as message-store protection, not the cancellation mechanism.
4. Test signal propagation with a deferred handler, abort-before-start, and abort-during-supported-fetch cases.
5. Run `rtk pnpm vitest run src/server/features/sam`.

### Task 5: Require a verified approval before a SAM-proposed durable mutation

**Files:**
- Modify: `src/server/features/sam/samChatTools.ts`
- Modify: `src/server/features/sam/SamChatAgent.ts`
- Modify: `src/server/mcp/tools/save-keywords.ts`
- Modify: `src/server/features/sam/SamProjectMemoryRepository.ts` only if the approved write needs provenance fields
- Modify: `src/client/features/sam/SamConversation.tsx`
- Create: `src/server/features/sam/samMutationApproval.test.ts`

1. Implement the Task 1 decision: wire the native approval mechanism, or implement the approved server-side alternative. Never treat model text or scraped text as approval.
2. Present the exact proposed change (keyword additions/tags or curated memory patch) to the user. Bind approval to authenticated user, organisation, project, session, tool name, canonical payload digest, expiry, and single use.
3. On approval, revalidate the current session/project authorization and payload digest immediately before calling the existing repository/MCP mutation. On rejection/expiry, return a clear non-retryable tool result.
4. Scope the first rollout to `save_keywords` and durable SAM memory. Do not blanket-wrap unrelated MCP mutations until their user interaction and idempotency are reviewed.
5. Preserve explicit user intent: “save these” can create an approval proposal, but the visible authenticated confirmation commits it. This provides a reviewable diff rather than trusting ambiguous natural language.
6. Test approval/rejection/expiry/single-use and attempts to replay across users, sessions, projects, and organisations.

### Task 6: Add only the observability needed to operate the controls

**Files:**
- Modify: `src/server/features/sam/SamChatAgent.ts`
- Modify: `src/server/lib/openrouter.ts` only if a resolved model descriptor does not already exist
- Modify: `src/server/lib/chatAgent.ts` only if the resolver must expose non-secret model configuration
- Modify: relevant resolver tests

1. Emit a sanitized per-turn summary: configured model ID/provider family, provider/model reported in response metadata if available, steps, tool counts by category, policy stops, cancellation state, and measured LLM cost.
2. Keep the existing hosted credit check and charge path. Add an alertable/queriable event when a turn starts with low remaining credit or finishes with a budget/cancellation stop; do not introduce credit reservations without a transaction-safe billing capability.
3. Exclude prompts, page content, tool arguments, tokens, emails, and API credentials from these events.
4. Add resolver/telemetry tests for default model, explicit configuration, invalid configuration, and response metadata that does or does not report a final provider.

### Task 7: Release-gate the targeted behavior

**Files:**
- Modify: the tests created above
- Add documentation only if the approval flow or configurable limits require maintainer operation; otherwise keep the contract in code/tests.

1. Run focused SAM tests, then the full suite:

```bash
rtk pnpm vitest run src/server/features/sam
rtk pnpm test
rtk pnpm lint
rtk pnpm build
rtk git diff --check
```

2. Manually exercise a mocked/isolated chat flow in the worktree only: normal read, site text containing hostile instructions, attempted keyword save, approval, rejection, policy limit, and cancellation. If a browser server is needed, select a non-3001 port explicitly.
3. Review the diff for secret-bearing error/telemetry data, project-ID bypasses, mutation paths outside approval, and new unbounded tool paths.
4. Roll out the policy limits first with telemetry. Tighten defaults after observing legitimate workload distribution; do not assume the original 48-step workload is either necessary or abusive.

## Sequencing and non-goals

Tasks 1–4 can ship as the first bounded-work safety slice. Task 5 follows only once its approval binding is proven. Task 6 makes the new controls operable; Task 7 is the release gate.

Not included without fresh evidence: a new model allowlist, a generic dollar-pricing engine, broad prompt filtering, a complete agent evaluation platform, or replacing the existing access-control model. They add complexity but do not address a confirmed gap as directly as the work above.
