import {
  createOpenRouter,
  type LanguageModelV3,
} from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getEnvValueSync, getOptionalEnvValue } from "@/server/lib/runtime-env";

// OpenRouter model slug used for the in-app chat agents (onboarding + SAM).
// Override with OPENROUTER_MODEL to swap models without a code change.
const DEFAULT_CHAT_AGENT_MODEL = "minimax/minimax-m3";

export type ChatAgentConfiguration =
  | { provider: "openrouter"; apiKey: string; modelId?: string }
  | {
      provider: "openai-compatible";
      apiKey: string;
      baseUrl: string;
      modelId: string;
    };

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

  if (provider !== "openai-compatible") {
    throw new Error(
      "Unsupported AI_PROVIDER. Accepted provider: openai-compatible.",
    );
  }

  if (env.AUTH_MODE !== "local_noauth") {
    throw new Error(
      "AI_PROVIDER=openai-compatible is only supported when AUTH_MODE=local_noauth.",
    );
  }

  return {
    provider: "openai-compatible",
    apiKey: getRequiredConfigurationValue(env, "AI_API_KEY"),
    baseUrl: getRequiredConfigurationValue(env, "AI_BASE_URL"),
    modelId: getRequiredConfigurationValue(env, "AI_MODEL"),
  };
}

/**
 * Returns the AI SDK LanguageModel for the chat agents. `usage: { include: true }`
 * turns on OpenRouter usage accounting so each response carries its real USD
 * cost (providerMetadata.openrouter.usage.cost) — which we meter against the
 * shared usage-credit pool. `provider.order` prefers Together, then Atlas
 * Cloud (fp8); `zdr: true` restricts routing to Zero-Data-Retention endpoints
 * (prompts are never retained), which is the actual constraint — it excludes
 * MiniMax first-party without a hand-maintained allowlist. The account also
 * enforces this ("Non-frontier requires ZDR" data policy); the request-level
 * flag is belt-and-braces so the constraint survives a dashboard change.
 * Fallbacks stay on within the ZDR set because pinning providers caused a
 * prod outage (Jul 2026: Together upstream-rate-limited m3 and every chat
 * turn 429'd); as of Jul 2026 the ZDR set for m3 is Together/AtlasCloud/
 * Novita/Parasail at the same price plus Morph at 2x output as a last resort.
 *
 * `reasoning` turns on OpenRouter's reasoning-token channel so the model's
 * chain-of-thought comes back as a separate reasoning stream instead of
 * leaking into the visible answer text (MiniMax M3 otherwise dumps its
 * `<think>` trace inline). `effort: "medium"` is OpenRouter's default —
 * stated explicitly only because the SDK type requires one once the channel
 * is configured.
 */
export async function getChatAgentModel(): Promise<LanguageModelV3> {
  const env = await getChatAgentEnvironment();
  return buildChatAgentModelFromConfiguration(
    resolveChatAgentConfiguration(env),
  );
}

export function getChatAgentModelSync(env: object): LanguageModelV3 {
  return buildChatAgentModelFromConfiguration(
    resolveChatAgentConfiguration({
      AUTH_MODE: getEnvValueSync(env, "AUTH_MODE"),
      OPENROUTER_API_KEY: getEnvValueSync(env, "OPENROUTER_API_KEY"),
      OPENROUTER_MODEL: getEnvValueSync(env, "OPENROUTER_MODEL"),
      AI_PROVIDER: getEnvValueSync(env, "AI_PROVIDER"),
      AI_API_KEY: getEnvValueSync(env, "AI_API_KEY"),
      AI_BASE_URL: getEnvValueSync(env, "AI_BASE_URL"),
      AI_MODEL: getEnvValueSync(env, "AI_MODEL"),
    }),
  );
}

/**
 * Synchronous variant for callers that already hold the env values. Think's
 * `getModel()` hook is sync and runs on every turn, so the SAM agent reads the
 * key/model from its DO env and builds the model here.
 */
export function buildChatAgentModel(
  apiKey: string,
  modelId?: string,
): LanguageModelV3 {
  return buildOpenRouterChatAgentModel(apiKey, modelId);
}

async function getChatAgentEnvironment(): Promise<
  Record<string, string | undefined>
> {
  const [
    authMode,
    openRouterApiKey,
    openRouterModel,
    aiProvider,
    aiApiKey,
    aiBaseUrl,
    aiModel,
  ] = await Promise.all([
    getOptionalEnvValue("AUTH_MODE"),
    getOptionalEnvValue("OPENROUTER_API_KEY"),
    getOptionalEnvValue("OPENROUTER_MODEL"),
    getOptionalEnvValue("AI_PROVIDER"),
    getOptionalEnvValue("AI_API_KEY"),
    getOptionalEnvValue("AI_BASE_URL"),
    getOptionalEnvValue("AI_MODEL"),
  ]);

  return {
    AUTH_MODE: authMode,
    OPENROUTER_API_KEY: openRouterApiKey,
    OPENROUTER_MODEL: openRouterModel,
    AI_PROVIDER: aiProvider,
    AI_API_KEY: aiApiKey,
    AI_BASE_URL: aiBaseUrl,
    AI_MODEL: aiModel,
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

function buildChatAgentModelFromConfiguration(
  configuration: ChatAgentConfiguration,
): LanguageModelV3 {
  if (configuration.provider === "openai-compatible") {
    return createOpenAICompatible({
      name: "openai-compatible",
      apiKey: configuration.apiKey,
      baseURL: configuration.baseUrl,
    })(configuration.modelId);
  }

  return buildOpenRouterChatAgentModel(
    configuration.apiKey,
    configuration.modelId,
  );
}

function buildOpenRouterChatAgentModel(
  apiKey: string,
  modelId?: string,
): LanguageModelV3 {
  return createOpenRouter({ apiKey })(modelId ?? DEFAULT_CHAT_AGENT_MODEL, {
    usage: { include: true },
    reasoning: { effort: "medium" },
    provider: {
      order: ["together", "atlas-cloud/fp8"],
      zdr: true,
      allow_fallbacks: true,
    },
  });
}
