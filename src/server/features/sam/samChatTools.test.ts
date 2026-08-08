import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { buildSamMcpTools } from "./samChatTools";

describe("buildSamMcpTools", () => {
  it("requires an approval before SAM saves keywords", async () => {
    const tools = buildSamMcpTools(
      {
        userId: "user-1",
        userEmail: "user@example.test",
        organizationId: "org-1",
        clientId: null,
        scopes: [],
        audience: "https://app.example.test",
        subject: "user-1",
        baseUrl: "https://app.example.test",
      },
      { id: "project-1", domain: "example.test" },
    );

    expect(
      "needsApproval" in tools.save_keywords &&
        tools.save_keywords.needsApproval,
    ).toBe(true);
  });
});
