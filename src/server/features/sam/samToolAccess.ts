export function getSamActiveToolNames(
  tools: Record<string, unknown>,
): string[] {
  return Object.keys(tools).filter((name) => name !== "set_context");
}
