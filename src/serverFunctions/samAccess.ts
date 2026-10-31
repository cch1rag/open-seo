import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getWorkersEnv,
  isEveryAppServerAuthMode,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import {
  getChatAgentSetupStatus,
  getOpenRouterAccess,
  readChatAgentEnv,
  type ChatAgentSetupStatus,
} from "@/server/lib/openrouter";
import { requireProjectContext } from "@/serverFunctions/middleware";

const OPENROUTER_KEY_MISSING_MESSAGE =
  "OPENROUTER_API_KEY is not set for this deployment yet. Add it to your environment, restart OpenSEO, then confirm here.";

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

    // Behind an Every App gateway this is the gateway's binding; the gateway
    // answers 503 until an admin sets its OPENROUTER_API_KEY.
    if (await isEveryAppServerAuthMode()) {
      const enabled = Boolean(
        getOpenRouterAccess((await getWorkersEnv()) ?? {}),
      );
      return {
        enabled,
        provider: "openrouter",
        errorMessage: enabled ? null : OPENROUTER_KEY_MISSING_MESSAGE,
      };
    }

    return getChatAgentSetupStatus(
      readChatAgentEnv((await getWorkersEnv()) ?? {}),
    );
  });
