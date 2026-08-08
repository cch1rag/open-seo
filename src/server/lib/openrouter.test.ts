import { describe, expect, it } from "vitest";
import { resolveChatAgentConfiguration } from "./openrouter";

describe("resolveChatAgentConfiguration", () => {
  it("keeps OpenRouter as the default provider", () => {
    expect(
      resolveChatAgentConfiguration({ OPENROUTER_API_KEY: "router-key" }),
    ).toEqual({
      provider: "openrouter",
      apiKey: "router-key",
      modelId: undefined,
    });
  });

  it("accepts a complete compatible configuration in local_noauth mode", () => {
    expect(
      resolveChatAgentConfiguration({
        AUTH_MODE: "local_noauth",
        AI_PROVIDER: "openai-compatible",
        AI_API_KEY: "provider-key",
        AI_BASE_URL: "https://example.test/openai/v1",
        AI_MODEL: "deployment-name",
      }),
    ).toEqual({
      provider: "openai-compatible",
      apiKey: "provider-key",
      baseUrl: "https://example.test/openai/v1",
      modelId: "deployment-name",
    });
  });

  it.each(["AI_API_KEY", "AI_BASE_URL", "AI_MODEL"] as const)(
    "requires %s for compatible providers",
    (missingKey) => {
      const env = {
        AUTH_MODE: "local_noauth",
        AI_PROVIDER: "openai-compatible",
        AI_API_KEY: "provider-key",
        AI_BASE_URL: "https://example.test/openai/v1",
        AI_MODEL: "deployment-name",
      };
      delete env[missingKey];

      expect(() => resolveChatAgentConfiguration(env)).toThrow(missingKey);
    },
  );

  it("rejects an unknown provider", () => {
    expect(() =>
      resolveChatAgentConfiguration({
        AI_PROVIDER: "unknown-provider",
      }),
    ).toThrow("openai-compatible");
  });

  it("restricts compatible providers to local_noauth mode", () => {
    expect(() =>
      resolveChatAgentConfiguration({
        AUTH_MODE: "hosted",
        AI_PROVIDER: "openai-compatible",
        AI_API_KEY: "provider-key",
        AI_BASE_URL: "https://example.test/openai/v1",
        AI_MODEL: "deployment-name",
      }),
    ).toThrow("local_noauth");
  });

  it("requires an OpenRouter API key for the default provider", () => {
    expect(() => resolveChatAgentConfiguration({})).toThrow(
      "OPENROUTER_API_KEY",
    );
  });
});
