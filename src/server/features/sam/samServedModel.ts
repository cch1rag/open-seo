import type { UIMessage } from "ai";

/**
 * The assistant message with the model that served it recorded in its
 * metadata, shown under the reply. For a routed model (an omniroute combo or
 * OpenRouter) this is the provider model, not the configured id.
 */
function withServedModel(
  message: UIMessage,
  model: string | null,
): UIMessage | null {
  if (!model || message.role !== "assistant") return null;
  const metadata =
    typeof message.metadata === "object" && message.metadata !== null
      ? message.metadata
      : {};
  return { ...message, metadata: { ...metadata, servedModel: model } };
}

/**
 * Saves the served model on the turn's reply. The upsert also re-sends the
 * message to open chats. Refusals are answered by a static model, so skipped.
 * Best-effort: a failed save must not stop the rest of the response hook.
 */
export async function recordServedModel(
  agent: {
    addMessages(
      messages: UIMessage[],
      options: { mode: "upsert" },
    ): Promise<void>;
  },
  message: UIMessage,
  turn: { refusal: unknown; model: string | null } | null,
): Promise<void> {
  const served = turn?.refusal
    ? null
    : withServedModel(message, turn?.model ?? null);
  if (!served) return;
  await agent
    .addMessages([served], { mode: "upsert" })
    .catch((error: unknown) => {
      console.error("[sam] served model not saved", error);
    });
}
