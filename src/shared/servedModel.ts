import type { UIMessage } from "ai";

// The model that served an assistant message (see samServedModel.ts).
export function servedModelOf(message: UIMessage): string | null {
  const metadata = message.metadata;
  if (typeof metadata !== "object" || metadata === null) return null;
  const model: unknown = Reflect.get(metadata, "servedModel");
  return typeof model === "string" ? model : null;
}
