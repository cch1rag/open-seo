# Self-Hosted OpenAI-Compatible Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Docker self-hosters use OpenAI, Azure AI Foundry, and other OpenAI-compatible endpoints for SAM and onboarding chat while retaining OpenRouter as the default and as the only hosted provider.

**Architecture:** Keep one shared chat-model boundary at `src/server/lib/openrouter.ts`, but make it select a typed OpenRouter or OpenAI-compatible configuration. Both SAM and onboarding already consume that boundary, so provider selection stays server-only and applies consistently. A pure setup-status helper will drive model creation, the Docker preflight, and SAM's setup gate so their requirements cannot drift.

**Tech Stack:** TypeScript, Vercel AI SDK 6, `@openrouter/ai-sdk-provider`, `@ai-sdk/openai-compatible`, Vitest, TanStack Start, Cloudflare Workers/Durable Objects, Docker Compose.

## Global Constraints

- `AI_PROVIDER=openai-compatible` works only in `AUTH_MODE=local_noauth`.
- OpenRouter remains the default when `AI_PROVIDER` is unset, and remains the only provider in hosted deployments.
- Compatible mode requires non-empty `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` values; secrets must never reach browser code or logs.
- Do not pass OpenRouter-only routing, ZDR, or reasoning options to a compatible provider.
- Preserve the existing `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` self-hosted configuration unchanged.
- `compose.yaml` already forwards `.env` through `env_file`; do not duplicate `AI_*` values in its explicit `environment` list.
- Do not push to `upstream`; any later user-authorized push targets `origin` only.

---

### Task 1: Add a typed, testable chat-provider boundary

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/server/lib/openrouter.ts`
- Create: `src/server/lib/openrouter.test.ts`

**Interfaces:**

- Consumes: `AUTH_MODE`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` as server-side environment values.
- Produces: `resolveChatAgentConfiguration(env): ChatAgentConfiguration`, `getChatAgentModel(): Promise<LanguageModelV3>`, and `getChatAgentModelSync(env): LanguageModelV3`.
- `ChatAgentConfiguration` is a discriminated union:

```ts
type ChatAgentConfiguration =
  | { provider: "openrouter"; apiKey: string; modelId?: string }
  | {
      provider: "openai-compatible";
      apiKey: string;
      baseUrl: string;
      modelId: string;
    };
```

- `resolveChatAgentConfiguration` throws `Error` messages that name missing configuration keys, unsupported providers, or the `local_noauth` restriction without interpolating secret values.

- [ ] **Step 1: Add configuration-resolution tests before production changes**

Create `src/server/lib/openrouter.test.ts` with literal environment fixtures. Test the behavior that a missing production branch would break:

```ts
import { describe, expect, it } from "vitest";
import { resolveChatAgentConfiguration } from "./openrouter";

describe("resolveChatAgentConfiguration", () => {
  it("keeps OpenRouter as the default provider", () => {
    expect(
      resolveChatAgentConfiguration({ OPENROUTER_API_KEY: "router-key" }),
    ).toEqual({
      provider: "openrouter",
      apiKey: "router-key",
      modelId: undefined,
    });
  });

  it("accepts a complete compatible configuration in local_noauth mode", () => {
    expect(
      resolveChatAgentConfiguration({
        AUTH_MODE: "local_noauth",
        AI_PROVIDER: "openai-compatible",
        AI_API_KEY: "provider-key",
        AI_BASE_URL: "https://example.test/openai/v1",
        AI_MODEL: "deployment-name",
      }),
    ).toEqual({
      provider: "openai-compatible",
      apiKey: "provider-key",
      baseUrl: "https://example.test/openai/v1",
      modelId: "deployment-name",
    });
  });
});
```

Add individual tests for each missing compatible variable, an unknown `AI_PROVIDER`, compatible mode outside `local_noauth`, and a missing default `OPENROUTER_API_KEY`. Each assertion must check the missing key or accepted-provider text, never a secret.

- [ ] **Step 2: Run the focused test and verify the intended red failure**

Run:

```bash
pnpm vitest run src/server/lib/openrouter.test.ts
```

Expected: the test fails because `resolveChatAgentConfiguration` does not exist yet. It must not fail because of an unrelated test-environment error.

- [ ] **Step 3: Install the compatible-provider dependency**

Run:

```bash
pnpm add @ai-sdk/openai-compatible
```

Confirm that only `package.json` and `pnpm-lock.yaml` change for this step.

- [ ] **Step 4: Implement the provider resolver and factories**

In `src/server/lib/openrouter.ts`:

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function resolveChatAgentConfiguration(
  env: Record<string, string | undefined>,
): ChatAgentConfiguration {
  // Unset AI_PROVIDER selects OpenRouter.
  // `openai-compatible` requires local_noauth plus AI_API_KEY, AI_BASE_URL, AI_MODEL.
}
```

Build OpenRouter models exactly as today, including `usage`, `reasoning`, and
`provider` options. Build compatible models with only:

```ts
createOpenAICompatible({
  name: "openai-compatible",
  apiKey: configuration.apiKey,
  baseURL: configuration.baseUrl,
})(configuration.modelId);
```

Have the async and synchronous factories read all relevant environment values,
resolve one `ChatAgentConfiguration`, and build a `LanguageModelV3`. Do not
rename the file in this task; retaining the import path avoids unrelated churn.

- [ ] **Step 5: Run the focused tests and verify green**

Run:

```bash
pnpm vitest run src/server/lib/openrouter.test.ts
```

Expected: every provider-resolution test passes.

- [ ] **Step 6: Run the formatter and type check for the changed boundary**

Run:

```bash
pnpm prettier --write src/server/lib/openrouter.ts src/server/lib/openrouter.test.ts package.json
pnpm types:check
```

Expected: exit code 0.

- [ ] **Step 7: Create a local commit after review**

```bash
git add package.json pnpm-lock.yaml src/server/lib/openrouter.ts src/server/lib/openrouter.test.ts
git commit -m "feat: support compatible self-hosted AI providers"
```

Do not push.

### Task 2: Route both chat agents through the provider boundary and type the runtime environment

**Files:**

- Modify: `src/server/features/sam/SamChatAgent.ts`
- Modify: `src/env.d.ts`
- Test: `src/server/lib/openrouter.test.ts`

**Interfaces:**

- Consumes: `getChatAgentModelSync(this.env)` from Task 1.
- Produces: SAM and onboarding both obtain a `LanguageModelV3` through the same resolver; all `AI_*` bindings are declared in `Cloudflare.Env`.

- [ ] **Step 1: Extend the failing test to cover the synchronous Durable Object path**

Add a test that calls the exported synchronous factory with a complete compatible fixture and asserts it returns a `LanguageModelV3` object without making a network request:

```ts
it("builds a compatible model for the SAM Durable Object", () => {
  const model = getChatAgentModelSync({
    AUTH_MODE: "local_noauth",
    AI_PROVIDER: "openai-compatible",
    AI_API_KEY: "provider-key",
    AI_BASE_URL: "https://example.test/openai/v1",
    AI_MODEL: "deployment-name",
  });

  expect(model.specificationVersion).toBe("v3");
});
```

The production mutation this protects is bypassing compatible selection in the
sync SAM-only factory.

- [ ] **Step 2: Run the test and verify red**

Run:

```bash
pnpm vitest run src/server/lib/openrouter.test.ts
```

Expected: fail because the synchronous factory is absent or still requires an
OpenRouter key.

- [ ] **Step 3: Replace SAM's direct OpenRouter-key handling**

In `SamChatAgent.getModel()`, replace the direct `OPENROUTER_API_KEY` and
`OPENROUTER_MODEL` reads with `return getChatAgentModelSync(this.env)`. Remove
the now-unused runtime-env import. Do not change the onboarding caller: it
already uses the async shared factory.

- [ ] **Step 4: Declare the compatible bindings**

Add these optional server-side bindings to `Cloudflare.Env` in `src/env.d.ts`:

```ts
AI_PROVIDER?: "openai-compatible";
AI_API_KEY?: string;
AI_BASE_URL?: string;
AI_MODEL?: string;
```

Keep the existing OpenRouter declarations unchanged.

- [ ] **Step 5: Run focused tests and the type check**

Run:

```bash
pnpm vitest run src/server/lib/openrouter.test.ts
pnpm types:check
```

Expected: exit code 0 for both commands.

- [ ] **Step 6: Create a local commit after review**

```bash
git add src/server/features/sam/SamChatAgent.ts src/env.d.ts src/server/lib/openrouter.test.ts
git commit -m "feat: route SAM through shared AI provider selection"
```

Do not push.

### Task 3: Make self-host validation and SAM setup messaging provider-aware

**Files:**

- Modify: `src/server/lib/openrouter.ts`
- Modify: `src/lib/selfhost-preflight.ts`
- Modify: `src/lib/selfhost-preflight.test.ts`
- Modify: `src/server/lib/setup-status.ts`
- Modify: `src/serverFunctions/samAccess.ts`
- Modify: `src/client/features/sam/useSamAccess.ts`
- Modify: `src/client/features/sam/SamSetupGate.tsx`
- Test: `src/server/lib/openrouter.test.ts`

**Interfaces:**

- Consumes: `resolveChatAgentConfiguration` from Task 1.
- Produces: `getChatAgentSetupStatus(env)` returning `{ enabled, provider, errorMessage }`, where `provider` is `"openrouter"`, `"openai-compatible"`, or `null` when configuration is invalid.
- `getSamAccessSetupStatus` returns the same status to the browser, but never a key, endpoint, or model value.

- [ ] **Step 1: Add failing setup-status and preflight tests**

In `src/server/lib/openrouter.test.ts`, add coverage that a complete
local-noauth compatible fixture returns:

```ts
{
  enabled: true,
  provider: "openai-compatible",
  errorMessage: null,
}
```

and an incomplete compatible fixture returns `enabled: false` with a message
containing the missing variable name.

In `src/lib/selfhost-preflight.test.ts`, add tests that prove:

```ts
expect(itemFor(result, "AI features")?.level).toBe("ok");
expect(itemFor(result, "AI features")?.message).toContain("openai-compatible");
```

for a complete compatible local-noauth configuration, and `warn` plus
`AI_MODEL` for a fixture missing only that value. Keep the stock Docker test
passing with AI unconfigured: AI remains optional.

- [ ] **Step 2: Run the two focused tests and verify red**

Run:

```bash
pnpm vitest run src/server/lib/openrouter.test.ts src/lib/selfhost-preflight.test.ts
```

Expected: the newly added setup-status/preflight assertions fail because the
current checks only inspect `OPENROUTER_API_KEY`.

- [ ] **Step 3: Implement one non-secret setup-status helper**

Add `getChatAgentSetupStatus(env)` next to the resolver. It catches resolver
errors and returns their message, rather than exposing an exception to the
browser or preflight. The success message identifies only the provider name.

Make `checkOptionalFeatures` use this helper. A valid alternate provider is
`ok`; incomplete/unsupported compatible settings are `warn`; a missing default
OpenRouter key remains the existing optional `info` state. Never put actual
environment values in a message.

- [ ] **Step 4: Route runtime health and SAM's gate through the shared status**

Add `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` to
`CHECK_ENV_VARS` in `src/server/lib/setup-status.ts` so `/api/health` sees the
same configuration as Docker preflight.

In `src/serverFunctions/samAccess.ts`, load those values, call
`getChatAgentSetupStatus`, and return its `enabled`, `provider`, and
`errorMessage`. Retain the hosted-mode fast path as
`{ enabled: true, provider: "openrouter", errorMessage: null }`.

- [ ] **Step 5: Make the SAM gate's copy match the selected provider**

Extend `useSamAccess` to retain the returned provider and pass it to
`SamSetupGate`. Keep the current OpenRouter copy, guide link, and key button
only when `provider === "openrouter"`. For `openai-compatible` or an invalid
provider value, render a provider-neutral message directing the user to set the
missing `AI_*` values in `.env` and restart; do not show an OpenRouter link or
button.

- [ ] **Step 6: Run focused tests and the type check**

Run:

```bash
pnpm vitest run src/server/lib/openrouter.test.ts src/lib/selfhost-preflight.test.ts
pnpm types:check
```

Expected: exit code 0 for both commands.

- [ ] **Step 7: Create a local commit after review**

```bash
git add src/server/lib/openrouter.ts src/server/lib/openrouter.test.ts src/lib/selfhost-preflight.ts src/lib/selfhost-preflight.test.ts src/server/lib/setup-status.ts src/serverFunctions/samAccess.ts src/client/features/sam/useSamAccess.ts src/client/features/sam/SamSetupGate.tsx
git commit -m "feat: validate self-hosted AI provider setup"
```

Do not push.

### Task 4: Document the Docker-only configuration paths

**Files:**

- Modify: `.env.example`
- Modify: `compose.yaml`
- Modify: `docs/SELF_HOSTING_DOCKER.md`

**Interfaces:**

- Consumes: the documented `OPENROUTER_*` default path and the `AI_*`
  compatible path from Tasks 1–3.
- Produces: copy-paste-safe `.env` examples without real secrets and a Docker
  guide that makes the two paths mutually exclusive.

- [ ] **Step 1: Use the documentation acceptance checklist during review**

Verify these exact conditions after changing the prose:

```text
1. The example contains no credential-looking value.
2. It states that AI_PROVIDER is optional and OpenRouter is the default.
3. It lists AI_API_KEY, AI_BASE_URL, and AI_MODEL together.
4. It shows OpenAI's https://api.openai.com/v1 base URL.
5. It describes Azure AI Foundry as an /openai/v1 endpoint with a deployment/model name.
6. It says compatible mode is local_noauth Docker-only and is not for hosted deployments.
```

These are documentation requirements, not a source-text unit test; verify them
by reviewing the rendered diff.

- [ ] **Step 2: Update the environment example and Compose comment**

In `.env.example`, retain the OpenRouter block and add a separate, commented
OpenAI-compatible block:

```env
# AI_PROVIDER=openai-compatible
# AI_API_KEY=replace-with-your-provider-api-key
# AI_BASE_URL=https://api.openai.com/v1
# AI_MODEL=gpt-4.1-mini
```

Add one Azure AI Foundry comment that uses a placeholder resource/project
endpoint ending in `/openai/v1` and tells the reader to use its deployment name
as `AI_MODEL`. State that the OpenRouter and `AI_*` paths are alternatives.

In `compose.yaml`, clarify that `env_file` forwards `AI_*` values as well as
OpenRouter values, without adding duplicate explicit environment entries.

- [ ] **Step 3: Update the Docker guide**

Replace the single OpenRouter-only optional-variable bullet with an **AI
providers** subsection. Keep OpenRouter as the default path; add a compatible
path with the same generic variables; state that Azure Foundry uses its
OpenAI-v1 endpoint and deployment name. Include the required model capability:
streaming chat and tool/function calling for SAM. State that alternate
providers are supported only by local Docker self-hosting, not hosted OpenSEO.

- [ ] **Step 4: Verify documentation and Compose syntax**

Run:

```bash
git diff --check -- .env.example compose.yaml docs/SELF_HOSTING_DOCKER.md
docker compose config --no-interpolate -q
```

Then inspect the diff against the six-item checklist from Step 1. Do not run
`docker compose config` without `--no-interpolate`, because it would print
local secret values.

- [ ] **Step 5: Run the full verification suite**

Run:

```bash
pnpm test
pnpm types:check
pnpm lint
pnpm prettier --check package.json src/server/lib/openrouter.ts src/server/lib/openrouter.test.ts src/server/features/sam/SamChatAgent.ts src/env.d.ts src/lib/selfhost-preflight.ts src/lib/selfhost-preflight.test.ts src/server/lib/setup-status.ts src/serverFunctions/samAccess.ts src/client/features/sam/useSamAccess.ts src/client/features/sam/SamSetupGate.tsx .env.example compose.yaml docs/SELF_HOSTING_DOCKER.md
```

Expected: each command exits 0. If the full test suite cannot run because of an
environmental dependency, report the exact failure and retain the focused test
evidence rather than weakening tests.

- [ ] **Step 6: Create a local documentation commit after review**

```bash
git add .env.example compose.yaml docs/SELF_HOSTING_DOCKER.md
git commit -m "docs: explain compatible Docker AI providers"
```

Do not push.
