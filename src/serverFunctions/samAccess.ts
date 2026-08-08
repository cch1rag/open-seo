import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import {
  getChatAgentSetupStatus,
  type ChatAgentSetupStatus,
} from "@/server/lib/openrouter";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

type SamAccessStatus = ChatAgentSetupStatus;

// Gates SAM on a configured AI provider, the same way backlinks/AI-search gate
// on their DataForSEO subscriptions. Hosted deployments always use OpenRouter.
export const getSamAccessSetupStatus = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async (): Promise<SamAccessStatus> => {
    if (await isHostedServerAuthMode()) {
      return { enabled: true, provider: "openrouter", errorMessage: null };
    }

    const [authMode, openRouterApiKey, aiProvider, aiApiKey, aiBaseUrl, aiModel] =
      await Promise.all([
        getOptionalEnvValue("AUTH_MODE"),
        getOptionalEnvValue("OPENROUTER_API_KEY"),
        getOptionalEnvValue("AI_PROVIDER"),
        getOptionalEnvValue("AI_API_KEY"),
        getOptionalEnvValue("AI_BASE_URL"),
        getOptionalEnvValue("AI_MODEL"),
      ]);

    return getChatAgentSetupStatus({
      AUTH_MODE: authMode,
      OPENROUTER_API_KEY: openRouterApiKey,
      AI_PROVIDER: aiProvider,
      AI_API_KEY: aiApiKey,
      AI_BASE_URL: aiBaseUrl,
      AI_MODEL: aiModel,
    });
  });
