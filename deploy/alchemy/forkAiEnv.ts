// Fork: env values and bindings for your own AI provider (see
// docs/FORK_SYNC.md), passed to the Worker alongside upstream's OPENROUTER_*.
const FORK_AI_VARS = [
  "AI_PROVIDER",
  "AI_BASE_URL",
  "AI_MODEL",
  "ANTHROPIC_MODEL",
  "OPENAI_MODEL",
] as const;
const FORK_AI_SECRETS = [
  "AI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
] as const;

export function forkAiEnv<Var, Secret>(
  optionalVar: (name: string) => Var,
  optionalSecret: (name: string) => Secret,
): Record<string, Var | Secret> {
  return {
    ...Object.fromEntries(
      FORK_AI_VARS.map((name) => [name, optionalVar(name)]),
    ),
    ...Object.fromEntries(
      FORK_AI_SECRETS.map((name) => [name, optionalSecret(name)]),
    ),
  };
}

// Workers VPC service id; when set, the app worker binds it as AI_VPC_SERVICE
// so a private provider (omniroute behind Cloudflare Tunnel) needs no public
// address.
export const AI_VPC_SERVICE_ID = "AI_VPC_SERVICE_ID";

export const vpcBinding = (serviceId: string) => ({
  bindings: [
    { type: "vpc_service" as const, name: "AI_VPC_SERVICE", serviceId },
  ],
});
