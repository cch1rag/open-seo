# Self-Hosted OpenAI-Compatible Provider Design

## Goal

Let Docker self-hosters run SAM and onboarding chat with OpenAI, Azure AI
Foundry, or another OpenAI-compatible endpoint, while retaining OpenRouter as
the default and as the only provider for hosted deployments.

## Scope

This change applies only when `AUTH_MODE=local_noauth`, which is the mode set
by `compose.yaml`. Hosted deployments remain OpenRouter-only because their
credit metering relies on OpenRouter's response-cost metadata.

It does not add provider selection to the UI, Azure Entra ID authentication,
per-provider price calculation, or separate provider-specific integrations.

## Configuration

The existing OpenRouter configuration remains valid and is the default:

```env
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=...
```

Self-hosters may instead select the generic compatible adapter:

```env
AI_PROVIDER=openai-compatible
AI_API_KEY=...
AI_BASE_URL=https://example.com/openai/v1
AI_MODEL=provider-model-or-deployment-name
```

`AI_PROVIDER` is optional. Its absence selects OpenRouter. The only accepted
alternate value is `openai-compatible`; any other value produces a clear
configuration error. Compatible mode requires all three `AI_*` values. Their
values are never sent to the client or written to logs.

OpenAI uses `https://api.openai.com/v1` as `AI_BASE_URL`. Azure AI Foundry
uses its resource or project `/openai/v1` endpoint and the deployed model name
as `AI_MODEL`.

## Architecture

The single model-factory module, currently `src/server/lib/openrouter.ts`,
becomes the neutral provider boundary. Its async factory serves onboarding;
its synchronous factory serves the SAM Durable Object. Both resolve one shared
configuration object and return the same `LanguageModelV3` interface already
consumed by the agents.

For OpenRouter, the factory keeps the existing model default, ZDR routing,
reasoning channel, fallback configuration, and response-cost metadata.
For compatible mode, it builds an AI SDK OpenAI-compatible provider using the
configured API key, base URL, and model. It must not send OpenRouter-only
options such as `zdr`, `provider.order`, or OpenRouter reasoning settings.

The factory rejects compatible mode outside `local_noauth`. This makes hosted
cost accounting correct by construction instead of silently metering alternate
provider calls as zero dollars.

## User Experience and Documentation

The self-hosted preflight and SAM setup gate identify the selected provider and
report the exact missing setting when AI is not configured. Existing OpenRouter
copy stays unchanged when that provider is selected. Compatible mode gives a
provider-neutral setup message rather than linking users to OpenRouter.

`compose.yaml` already forwards `.env` values through `env_file`, so it needs
no additional secret-forwarding entries. The Docker guide and `.env.example`
will document the two mutually exclusive configuration blocks and OpenAI/Azure
examples.

## Error Handling

- Missing OpenRouter key with the default provider retains the existing setup
  behavior.
- `AI_PROVIDER=openai-compatible` without `AI_API_KEY`, `AI_BASE_URL`, or
  `AI_MODEL` returns a configuration error naming the missing variable.
- An unsupported provider returns a configuration error naming the accepted
  values.
- Alternate providers in hosted mode return a configuration error before a
  model request starts.

## Testing

Provider-selection tests exercise the model factory with controlled runtime
configuration. They prove that default configuration uses OpenRouter, valid
compatible configuration creates a usable model, and each invalid configuration
fails with the intended user-safe error. They also prove that hosted mode
rejects the alternate provider.

Preflight/setup tests prove that the visible self-hosted setup state follows
the selected provider and never asks for an OpenRouter key when compatible mode
is correctly configured.

## Acceptance Criteria

- Existing OpenRouter Docker configuration continues to work without changes.
- A local-noauth container can use OpenAI or an Azure AI Foundry OpenAI-v1
  endpoint with only the documented `AI_*` variables.
- No alternate provider can run in hosted mode.
- No alternate-provider key, endpoint, or model is exposed to browser code or
  logs.
- Docker documentation and environment examples describe both supported
  self-hosted paths.
