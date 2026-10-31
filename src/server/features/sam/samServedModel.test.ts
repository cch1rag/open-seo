import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { servedModelOf } from "@/shared/servedModel";
import { withServedModel } from "./samServedModel";

const assistant: UIMessage = {
  id: "m1",
  role: "assistant",
  parts: [{ type: "text", text: "hi" }],
  metadata: { other: 1 },
};

describe("withServedModel", () => {
  it("records the model on an assistant message and keeps its metadata", () => {
    const served = withServedModel(assistant, "gemini-3.1-flash-lite");
    expect(served?.metadata).toEqual({
      other: 1,
      servedModel: "gemini-3.1-flash-lite",
    });
    expect(served && servedModelOf(served)).toBe("gemini-3.1-flash-lite");
  });

  it("skips user messages and unknown models", () => {
    expect(withServedModel({ ...assistant, role: "user" }, "m")).toBeNull();
    expect(withServedModel(assistant, null)).toBeNull();
    expect(servedModelOf(assistant)).toBeNull();
  });
});
