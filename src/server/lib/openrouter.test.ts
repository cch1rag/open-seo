import { generateText } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  getChatAgentModelSync,
  getChatAgentSetupStatus,
  resolveChatAgentConfiguration,
} from "./openrouter";

const completion = () =>
  Response.json({
    choices: [
      {
        message: { role: "assistant", content: "ok" },
        finish_reason: "stop",
      },
    ],
  });

// The egress country is cached per module (one lookup per isolate), so each
// test needs a fresh module to run its own lookup.
beforeEach(() => {
  vi.resetModules();
});

async function requestedModel(trace: () => Promise<Response>) {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementationOnce(trace)
    .mockResolvedValueOnce(completion());
  const { buildChatAgentModel } = await import("./openrouter");
  await generateText({
    model: buildChatAgentModel({ apiKey: "key" }),
    prompt: "hi",
  });
  const body = z
    .object({ model: z.string() })
    .parse(JSON.parse(z.string().parse(fetchMock.mock.calls[1]?.[1]?.body)));
  return body.model;
}

it("sends OpenAI calls to MiniMax M3 from a country where OpenAI is blocked", async () => {
  expect(
    await requestedModel(async () => new Response("colo=HKG\nloc=HK\n")),
  ).toBe("minimax/minimax-m3");
});

it("stays on OpenAI when the country lookup fails", async () => {
  expect(
    await requestedModel(async () => {
      throw new Error("offline");
    }),
  ).toBe("openai/gpt-5.6-luna");
});

describe("resolveChatAgentConfiguration", () => {
  it("builds a compatible model for the SAM Durable Object", () => {
    const model = getChatAgentModelSync({
      AUTH_MODE: "local_noauth",
      AI_PROVIDER: "openai-compatible",
      AI_API_KEY: "provider-key",
      AI_BASE_URL: "https://example.test/openai/v1",
      AI_MODEL: "deployment-name",
    });

    expect(model.specificationVersion).toBe("v3");
    expect(model.provider).toBe("openai-compatible.chat");
  });

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

describe("getChatAgentSetupStatus", () => {
  it("reports a complete compatible provider in local_noauth mode", () => {
    expect(
      getChatAgentSetupStatus({
        AUTH_MODE: "local_noauth",
        AI_PROVIDER: "openai-compatible",
        AI_API_KEY: "provider-key",
        AI_BASE_URL: "https://example.test/openai/v1",
        AI_MODEL: "deployment-name",
      }),
    ).toEqual({
      enabled: true,
      provider: "openai-compatible",
      errorMessage: null,
    });
  });

  it("reports the missing compatible provider value without exposing configuration", () => {
    const status = getChatAgentSetupStatus({
      AUTH_MODE: "local_noauth",
      AI_PROVIDER: "openai-compatible",
      AI_API_KEY: "provider-key",
      AI_BASE_URL: "https://example.test/openai/v1",
    });

    expect(status).toMatchObject({
      enabled: false,
      provider: "openai-compatible",
    });
    expect(status.errorMessage).toContain("AI_MODEL");
  });

  it("retains the default OpenRouter provider when its key is missing", () => {
    const status = getChatAgentSetupStatus({});

    expect(status).toMatchObject({
      enabled: false,
      provider: "openrouter",
    });
    expect(status.errorMessage).toContain("OPENROUTER_API_KEY");
  });

  it("does not identify an unsupported provider", () => {
    const status = getChatAgentSetupStatus({ AI_PROVIDER: "unknown-provider" });

    expect(status).toMatchObject({
      enabled: false,
      provider: null,
    });
    expect(status.errorMessage).toContain("Unsupported AI_PROVIDER");
  });
});

describe("requireServerChatAgent", () => {
  async function agentFor(env: Record<string, string>) {
    vi.doMock("@/server/lib/runtime-env", async (importOriginal) => ({
      ...(await importOriginal<object>()),
      getWorkersEnv: async () => env,
    }));
    const { requireServerChatAgent } = await import("./openrouter");
    return requireServerChatAgent("low");
  }

  it("uses the compatible provider and bills nothing when AI_PROVIDER is set", async () => {
    const agent = await agentFor({
      AUTH_MODE: "local_noauth",
      AI_PROVIDER: "openai-compatible",
      AI_API_KEY: "provider-key",
      AI_BASE_URL: "https://example.test/openai/v1",
      AI_MODEL: "deployment-name",
    });
    expect(agent.model.provider).toBe("openai-compatible.chat");
    expect(agent.stepCostUsd({})).toBe(0);
  });

  it("keeps OpenRouter's strict cost reading without AI_PROVIDER", async () => {
    const agent = await agentFor({ OPENROUTER_API_KEY: "router-key" });
    expect(agent.model.provider).toContain("openrouter");
    expect(agent.stepCostUsd({ openrouter: { usage: { cost: 0.5 } } })).toBe(
      0.5,
    );
    expect(() => agent.stepCostUsd({})).toThrow();
  });
});
