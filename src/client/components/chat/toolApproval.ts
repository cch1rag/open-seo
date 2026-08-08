export function getPendingToolApprovalId(part: unknown): string | null {
  if (
    !part ||
    typeof part !== "object" ||
    !("state" in part) ||
    part.state !== "approval-requested" ||
    !("approval" in part) ||
    !part.approval ||
    typeof part.approval !== "object" ||
    !("id" in part.approval) ||
    typeof part.approval.id !== "string"
  ) {
    return null;
  }

  return part.approval.id;
}
