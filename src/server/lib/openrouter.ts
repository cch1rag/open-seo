import { ConfigurationError, createGatewayFetch } from "@every-app/sdk/server";
import {
  createOpenRouter,
  type LanguageModelV3,
  type OpenRouterProvider,
} from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { wrapLanguageModel } from "ai";
import { isEveryAppAuthMode, isHostedAuthMode } from "@/lib/auth-mode";
import { requireOpenRouterCostUsd } from "@/server/lib/chatAgent";
import { gatewayCallFor } from "@/server/lib/gateway-attribution";
import { getEnvValueSync, getWorkersEnv } from "@/server/lib/runtime-env";

/**
 * How a deployment reaches OpenRouter: with its own key, or behind an Every
 * App gateway (AUTH_MODE=everyapp) through the gateway's AI proxy, which
 * holds the key. The proxy's host is a placeholder the binding never
 * resolves.
 */
type OpenRouterAccess = { apiKey: string } | { gatewayFetch: typeof fetch };

const GATEWAY_BASE_URL =
  "https://every-app-gateway.invalid/api/ai/openrouter/api/v1";

function isBehindEveryAppGateway(env: object): boolean {
  return isEveryAppAuthMode(getEnvValueSync(env, "AUTH_MODE"));
}

/** The gateway's AI proxy fetch (whose call it is: gateway-attribution.ts). */
function gatewayOpenRouterFetch(env: object): typeof fetch {
  return createGatewayFetch({
    env,
    for: gatewayCallFor(),
  });
}

/**
 * This deployment's OpenRouter access, or null without one. Sync for
 * samAccess.
 */
export function getOpenRouterAccess(env: object): OpenRouterAccess | null {
  if (isBehindEveryAppGateway(env)) {
    try {
      return { gatewayFetch: gatewayOpenRouterFetch(env) };
    } catch (error) {
      // No gateway binding (and no local key in dev). A call that says
      // nobody's (AttributionError) is a bug, so it is thrown.
      if (error instanceof ConfigurationError) return null;
      throw error;
    }
  }
  const apiKey = getEnvValueSync(env, "OPENROUTER_API_KEY");
  return apiKey ? { apiKey } : null;
}

/** SAM's model, from its Durable Object env. Sync: Think's getModel() is. */
function buildSamChatModel(
  env: object,
  reasoningEffort: "max" | "low",
): LanguageModelV3 {
  const access = getOpenRouterAccess(env);
  if (!access) {
    throw new Error("OPENROUTER_API_KEY is required for the SAM agent");
  }
  return buildChatAgentModel(
    access,
    getEnvValueSync(env, "OPENROUTER_MODEL"),
    reasoningEffort,
  );
}

export type ChatAgentConfiguration =
  | { provider: "openrouter"; apiKey: string; modelId?: string }
  | {
      provider: "openai-compatible" | "openai";
      apiKey: string;
      baseUrl: string;
      modelId: string;
    }
  | { provider: "anthropic"; apiKey: string; modelId: string };

export type ChatAgentSetupStatus = {
  enabled: boolean;
  provider: ChatAgentConfiguration["provider"] | null;
  errorMessage: string | null;
};

const OWN_PROVIDERS = ["anthropic", "openai", "openai-compatible"] as const;
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";
const OPENAI_BASE_URL = "https://api.openai.com/v1";

// Every env value the provider choice reads, so callers can pass a snapshot.
const CHAT_AGENT_ENV_NAMES = [
  "AUTH_MODE",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "AI_PROVIDER",
  "AI_API_KEY",
  "AI_BASE_URL",
  "AI_MODEL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
] as const;

export function readChatAgentEnv(
  env: object,
): Record<string, string | undefined> {
  return Object.fromEntries(
    CHAT_AGENT_ENV_NAMES.map((name) => [name, getEnvValueSync(env, name)]),
  );
}

export function resolveChatAgentConfiguration(
  env: Record<string, string | undefined>,
): ChatAgentConfiguration {
  const provider = env.AI_PROVIDER;

  if (!provider) {
    const apiKey = getRequiredConfigurationValue(env, "OPENROUTER_API_KEY");
    return {
      provider: "openrouter",
      apiKey,
      modelId: env.OPENROUTER_MODEL,
    };
  }

  if (!isOwnProvider(provider)) {
    throw new Error(
      `Unsupported AI_PROVIDER. Accepted providers: ${OWN_PROVIDERS.join(", ")}.`,
    );
  }

  // Hosted OpenSEO meters AI spend through OpenRouter's cost reporting.
  if (isHostedAuthMode(env.AUTH_MODE)) {
    throw new Error(
      "AI_PROVIDER is not supported on hosted OpenSEO, which uses OpenRouter.",
    );
  }

  if (provider === "anthropic") {
    return {
      provider,
      apiKey: getRequiredConfigurationValue(env, "ANTHROPIC_API_KEY"),
      modelId: env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
    };
  }

  if (provider === "openai") {
    return {
      provider,
      apiKey: getRequiredConfigurationValue(env, "OPENAI_API_KEY"),
      baseUrl: OPENAI_BASE_URL,
      modelId: getRequiredConfigurationValue(env, "OPENAI_MODEL"),
    };
  }

  return {
    provider,
    apiKey: getRequiredConfigurationValue(env, "AI_API_KEY"),
    baseUrl: getRequiredConfigurationValue(env, "AI_BASE_URL"),
    modelId: getRequiredConfigurationValue(env, "AI_MODEL"),
  };
}

function isOwnProvider(value: string): value is (typeof OWN_PROVIDERS)[number] {
  return (OWN_PROVIDERS as readonly string[]).includes(value);
}

export function getChatAgentSetupStatus(
  env: Record<string, string | undefined>,
): ChatAgentSetupStatus {
  try {
    const configuration = resolveChatAgentConfiguration(env);
    return {
      enabled: true,
      provider: configuration.provider,
      errorMessage: null,
    };
  } catch (error) {
    const provider = env.AI_PROVIDER;
    return {
      enabled: false,
      provider: !provider
        ? "openrouter"
        : isOwnProvider(provider)
          ? provider
          : null,
      errorMessage:
        error instanceof Error
          ? error.message
          : "AI provider configuration is invalid.",
    };
  }
}

/**
 * SAM's model: the provider named by AI_PROVIDER (fork), otherwise upstream's
 * OpenRouter path (own key or Every App gateway).
 */
export function getChatAgentModelSync(
  env: object,
  reasoningEffort: "max" | "low" = "max",
): LanguageModelV3 {
  if (!getEnvValueSync(env, "AI_PROVIDER")) {
    return buildSamChatModel(env, reasoningEffort);
  }
  const configuration = resolveChatAgentConfiguration(readChatAgentEnv(env));
  if (configuration.provider === "openrouter") {
    throw new Error("Unreachable: AI_PROVIDER resolved to OpenRouter.");
  }
  if (configuration.provider === "anthropic") {
    return lazyAnthropicModel(configuration.apiKey, configuration.modelId);
  }
  return createOpenAICompatible({
    name: configuration.provider,
    apiKey: configuration.apiKey,
    baseURL: configuration.baseUrl,
    fetch: vpcServiceFetch(env),
    // Without this the JSON schema is never sent, so research and prompt
    // suggestions get free-form JSON that fails their schema.
    supportsStructuredOutputs: true,
  })(configuration.modelId);
}

/**
 * Requests through the AI_VPC_SERVICE binding when the deploy set one: a
 * Workers VPC service reaching a provider on a private network (a local
 * omniroute behind Cloudflare Tunnel), so it needs no public address. The
 * service fixes host and port; the URL only supplies the path and Host header.
 */
function vpcServiceFetch(env: object): typeof fetch | undefined {
  const binding: unknown = Reflect.get(env, "AI_VPC_SERVICE");
  if (!isFetcher(binding)) return undefined;
  return (input, init) => binding.fetch(input, init);
}

function isFetcher(value: unknown): value is { fetch: typeof fetch } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "fetch") === "function"
  );
}

/**
 * The Anthropic model, with @ai-sdk/anthropic imported on the first call: the
 * lean-worker-bundle build keeps that package out of the eager startup graph
 * (vite-plugin-lean-worker-bundle.ts), and getModel() is sync.
 */
function lazyAnthropicModel(apiKey: string, modelId: string): LanguageModelV3 {
  let model: Promise<LanguageModelV3> | undefined;
  const load = () =>
    (model ??= import("@ai-sdk/anthropic").then(({ createAnthropic }) =>
      createAnthropic({ apiKey })(modelId),
    ));
  return {
    specificationVersion: "v3",
    provider: "anthropic.messages",
    modelId,
    supportedUrls: {},
    doGenerate: async (options) => (await load()).doGenerate(options),
    doStream: async (options) => (await load()).doStream(options),
  };
}

/**
 * A one-off server-side model call (website research, prompt research and
 * suggestions): the same provider SAM uses, plus how to read each step's USD
 * cost. AI_PROVIDER is refused on hosted OpenSEO, so nothing it runs is billed.
 */
export type ServerChatAgent = {
  model: LanguageModelV3;
  stepCostUsd: (providerMetadata: unknown) => number;
};

export async function requireServerChatAgent(
  reasoningEffort: "max" | "low",
): Promise<ServerChatAgent> {
  const env = (await getWorkersEnv()) ?? {};
  if (getEnvValueSync(env, "AI_PROVIDER")) {
    return {
      model: getChatAgentModelSync(env, reasoningEffort),
      stepCostUsd: () => 0,
    };
  }
  return {
    model: buildChatAgentModel(
      await requireOpenRouterAccess(),
      getEnvValueSync(env, "OPENROUTER_MODEL"),
      reasoningEffort,
    ),
    stepCostUsd: requireOpenRouterCostUsd,
  };
}

function getRequiredConfigurationValue(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** For server code: the access, or the error a missing key always threw. */
async function requireOpenRouterAccess(): Promise<OpenRouterAccess> {
  const access = getOpenRouterAccess((await getWorkersEnv()) ?? {});
  if (!access) {
    throw new Error(
      "Missing required environment variable: OPENROUTER_API_KEY",
    );
  }
  return access;
}

// OpenRouter model slug used for the SAM in-app chat agent. Override with
// OPENROUTER_MODEL to swap models without a code change.
const DEFAULT_CHAT_AGENT_MODEL = "openai/gpt-5.6-luna";

// Previous default; kept reachable via OPENROUTER_MODEL for rollback, and the
// fallback where OpenAI is blocked. Its routing needs the ZDR/provider tuning
// below.
const MINIMAX_M3 = "minimax/minimax-m3";

// OpenRouter rejects OpenAI models for requests from these countries ("This
// model is not available in your region"). Workflows and Durable Objects run
// near the user, outside prod's US placement.
const OPENAI_BLOCKED_COUNTRIES = [
  "CN",
  "HK",
  "MO",
  "RU",
  "BY",
  "IR",
  "KP",
  "SY",
  "CU",
];

// The country this isolate's requests leave from. An isolate stays in one
// location, so one lookup serves its lifetime. Caches the value, not the
// promise: Workers can't share a pending fetch across requests. Fails open: a
// slow or failed lookup leaves the country unknown, and calls stay on OpenAI.
let egressCountry: string | undefined;
async function openAiBlockedHere(): Promise<boolean> {
  egressCountry ??= await fetch("https://www.cloudflare.com/cdn-cgi/trace", {
    signal: AbortSignal.timeout(2000),
  })
    .then((response) => response.text())
    .then((trace) => /^loc=(\w+)$/m.exec(trace)?.[1] ?? "")
    .catch(() => "");
  return OPENAI_BLOCKED_COUNTRIES.includes(egressCountry);
}

/**
 * Returns the AI SDK LanguageModel for the chat agent. `usage: { include: true }`
 * turns on OpenRouter usage accounting so each response carries its real USD
 * cost (providerMetadata.openrouter.usage.cost) — which we meter against the
 * shared usage-credit pool.
 *
 * Default model: GPT-5.6 Luna at `reasoning.effort: "max"` — "max" is valid at
 * the OpenRouter API for GPT-5.x but missing from the SDK's effort union, so
 * the reasoning config rides in `extraBody`. Reasoning tokens stream on the
 * separate reasoning channel and are billed as output tokens, which the usage
 * accounting above captures.
 *
 * Sync on purpose: Think's `getModel()` hook is sync and runs on every turn,
 * so the SAM agent reads its access/model from its DO env and builds here.
 */
export function buildChatAgentModel(
  access: OpenRouterAccess,
  modelId?: string,
  reasoningEffort: "max" | "low" = "max",
): LanguageModelV3 {
  const model = modelId ?? DEFAULT_CHAT_AGENT_MODEL;
  const openrouter =
    "apiKey" in access
      ? createOpenRouter({ apiKey: access.apiKey })
      : createOpenRouter({
          apiKey: "gateway-managed",
          baseURL: GATEWAY_BASE_URL,
          fetch: access.gatewayFetch,
        });
  const primary = openRouterModel(openrouter, model, reasoningEffort);
  if (!model.startsWith("openai/")) return primary;
  // Where OpenRouter would reject OpenAI, pick MiniMax M3 before the request.
  // The country lookup is async and getModel() is sync, so it runs per call.
  const fallback = openRouterModel(openrouter, MINIMAX_M3, reasoningEffort);
  const pick = async () => ((await openAiBlockedHere()) ? fallback : primary);
  return wrapLanguageModel({
    model: primary,
    middleware: {
      specificationVersion: "v3",
      wrapGenerate: async ({ params }) => (await pick()).doGenerate(params),
      wrapStream: async ({ params }) => (await pick()).doStream(params),
    },
  });
}

function openRouterModel(
  openrouter: OpenRouterProvider,
  model: string,
  reasoningEffort: "max" | "low",
): LanguageModelV3 {
  // MiniMax M3 (env override or OpenAI fallback): `provider.order` prefers
  // Together, then Atlas Cloud (fp8); `zdr: true` restricts routing to Zero-Data-
  // Retention endpoints, which excludes MiniMax first-party — the account's
  // "Non-frontier requires ZDR" data policy enforces the same, this flag is
  // belt-and-braces. Fallbacks stay on within the ZDR set because pinning
  // providers caused a prod outage (Jul 2026: Together upstream-rate-limited
  // m3 and every chat turn 429'd). The explicit reasoning channel keeps m3's
  // `<think>` trace out of the visible answer text.
  if (model === MINIMAX_M3) {
    return openrouter(model, {
      usage: { include: true },
      reasoning: { effort: reasoningEffort === "low" ? "low" : "medium" },
      provider: {
        order: ["together", "atlas-cloud/fp8"],
        zdr: true,
        allow_fallbacks: true,
      },
    });
  }

  return openrouter(model, {
    usage: { include: true },
    extraBody: { reasoning: { effort: reasoningEffort } },
  });
}
