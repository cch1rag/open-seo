import {
  createOpenRouter,
  type LanguageModelV3,
} from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getEnvValueSync } from "@/server/lib/runtime-env";

// OpenRouter model slug used for the SAM in-app chat agent. Override with
// OPENROUTER_MODEL to swap models without a code change.
const DEFAULT_CHAT_AGENT_MODEL = "openai/gpt-5.6-luna";

// Previous default; kept reachable via OPENROUTER_MODEL for rollback. Its
// routing needs the ZDR/provider tuning below.
const MINIMAX_M3 = "minimax/minimax-m3";

export type ChatAgentConfiguration =
  | { provider: "openrouter"; apiKey: string; modelId?: string }
  | {
      provider: "openai-compatible";
      apiKey: string;
      baseUrl: string;
      modelId: string;
    };

export type ChatAgentSetupStatus = {
  enabled: boolean;
  provider: ChatAgentConfiguration["provider"] | null;
  errorMessage: string | null;
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
    return {
      enabled: false,
      provider: !env.AI_PROVIDER
        ? "openrouter"
        : env.AI_PROVIDER === "openai-compatible"
          ? "openai-compatible"
          : null,
      errorMessage:
        error instanceof Error
          ? error.message
          : "AI provider configuration is invalid.",
    };
  }
}

/**
 * Returns the AI SDK LanguageModel for the chat agent, built from the
 * configured provider (OpenRouter by default, or an OpenAI-compatible
 * endpoint when AI_PROVIDER is set).
 *
 * On OpenRouter, `usage: { include: true }` turns on usage accounting so each
 * response carries its real USD cost (providerMetadata.openrouter.usage.cost)
 * — which we meter against the shared usage-credit pool.
 */
export function getChatAgentModelSync(
  env: object,
  reasoningEffort: "max" | "low" = "max",
): LanguageModelV3 {
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
    reasoningEffort,
  );
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
  reasoningEffort: "max" | "low" = "max",
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
    reasoningEffort,
  );
}

/**
 * Default model: GPT-5.6 Luna at `reasoning.effort: "max"` — "max" is valid at
 * the OpenRouter API for GPT-5.x but missing from the SDK's effort union, so
 * the reasoning config rides in `extraBody`. Reasoning tokens stream on the
 * separate reasoning channel and are billed as output tokens, which the usage
 * accounting above captures.
 */
function buildOpenRouterChatAgentModel(
  apiKey: string,
  modelId?: string,
  reasoningEffort: "max" | "low" = "max",
): LanguageModelV3 {
  const model = modelId ?? DEFAULT_CHAT_AGENT_MODEL;
  const openrouter = createOpenRouter({ apiKey });

  // MiniMax M3 (env-override path only): `provider.order` prefers Together,
  // then Atlas Cloud (fp8); `zdr: true` restricts routing to Zero-Data-
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
