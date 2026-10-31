import type { UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";
import { servedModelOf } from "@/shared/servedModel";
import { recordServedModel } from "./samServedModel";

const assistant: UIMessage = {
  id: "m1",
  role: "assistant",
  parts: [{ type: "text", text: "hi" }],
  metadata: { other: 1 },
};

describe("recordServedModel", () => {
  it("saves the served model on the reply and keeps its metadata", async () => {
    const addMessages = vi.fn(async (_messages: UIMessage[]) => {});
    await recordServedModel({ addMessages }, assistant, {
      refusal: null,
      model: "gemini-3.1-flash-lite",
    });
    const saved = addMessages.mock.calls[0]?.[0]?.[0];
    expect(saved?.metadata).toEqual({
      other: 1,
      servedModel: "gemini-3.1-flash-lite",
    });
    expect(saved && servedModelOf(saved)).toBe("gemini-3.1-flash-lite");
  });

  it("skips refusals", async () => {
    const addMessages = vi.fn(async () => {});
    await recordServedModel({ addMessages }, assistant, {
      refusal: "credits",
      model: "static",
    });
    expect(addMessages).not.toHaveBeenCalled();
  });

  it("does not throw when the save fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const addMessages = vi.fn(async () => {
      throw new Error("storage down");
    });
    await expect(
      recordServedModel({ addMessages }, assistant, {
        refusal: null,
        model: "m",
      }),
    ).resolves.toBeUndefined();
  });
});
