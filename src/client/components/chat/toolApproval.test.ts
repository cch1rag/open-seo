import { describe, expect, it } from "vitest";
import { getPendingToolApprovalId } from "./toolApproval";

describe("getPendingToolApprovalId", () => {
  it("returns the approval id only for a tool awaiting a user decision", () => {
    expect(
      getPendingToolApprovalId({
        type: "tool-save_keywords",
        state: "approval-requested",
        approval: { id: "approval-1" },
      }),
    ).toBe("approval-1");

    expect(
      getPendingToolApprovalId({
        type: "tool-save_keywords",
        state: "approval-responded",
        approval: { id: "approval-1", approved: true },
      }),
    ).toBeNull();
  });
});
