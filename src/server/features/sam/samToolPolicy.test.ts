import { describe, expect, it } from "vitest";
import { SamToolPolicy } from "./samToolPolicy";

describe("SamToolPolicy", () => {
  it("blocks the next call after the total tool-call budget is exhausted", () => {
    const policy = new SamToolPolicy({ maxCalls: 2, maxPaidCalls: 1 });

    expect(policy.allow("list_saved_keywords")).toBeNull();
    expect(policy.allow("list_saved_keywords")).toBeNull();
    expect(policy.allow("list_saved_keywords")).toEqual({
      code: "tool_budget_exhausted",
      reason: "SAM reached this turn's tool-call limit.",
    });
  });

  it("blocks paid research without blocking remaining ordinary reads", () => {
    const policy = new SamToolPolicy({ maxCalls: 3, maxPaidCalls: 1 });

    expect(policy.allow("research_keywords")).toBeNull();
    expect(policy.allow("get_serp_results")).toEqual({
      code: "paid_tool_budget_exhausted",
      reason: "SAM reached this turn's paid research limit.",
    });
    expect(policy.allow("list_saved_keywords")).toBeNull();
  });

  it("reports only aggregate counts for turn telemetry", () => {
    const policy = new SamToolPolicy({ maxCalls: 3, maxPaidCalls: 1 });

    policy.allow("research_keywords");
    policy.allow("list_saved_keywords");

    expect(policy.summary()).toEqual({ toolCalls: 2, paidToolCalls: 1 });
  });
});
