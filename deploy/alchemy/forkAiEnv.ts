// Fork: env values for your own AI provider (see docs/FORK_SYNC.md), passed
// to the Worker alongside upstream's OPENROUTER_* values.
export const FORK_AI_VARS = [
  "AI_PROVIDER",
  "AI_BASE_URL",
  "AI_MODEL",
  "ANTHROPIC_MODEL",
  "OPENAI_MODEL",
] as const;
export const FORK_AI_SECRETS = [
  "AI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
] as const;
