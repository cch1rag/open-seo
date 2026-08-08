import { describe, expect, it } from "vitest";
import { buildSamSystemPrompt } from "./samSystemPrompt";

describe("buildSamSystemPrompt", () => {
  it("treats site content as untrusted and does not direct autonomous memory writes", () => {
    const prompt = buildSamSystemPrompt(
      {
        projectId: "project-1",
        projectName: "Example",
        domain: "example.com",
        locationCode: 2840,
        languageCode: "en",
      },
      { memoryIsEmpty: true },
    );

    expect(prompt).toContain("untrusted evidence");
    expect(prompt).not.toContain("pick up to 10 representative ones");
    expect(prompt).not.toContain("Save what you inferred to the memory block");
  });
});
