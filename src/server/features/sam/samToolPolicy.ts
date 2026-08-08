const PAID_TOOL_NAMES = new Set([
  "research_keywords",
  "get_domain_overview",
  "get_domain_keyword_suggestions",
  "get_backlinks_overview",
  "get_backlinks_profile",
  "get_serp_results",
  "get_rank_tracker",
  "get_ranked_keywords",
  "find_serp_competitors",
  "search_local_businesses",
  "get_local_serp_results",
  "get_google_business_questions",
  "get_keyword_metrics",
]);

type SamToolPolicyOptions = {
  maxCalls: number;
  maxPaidCalls: number;
};

type SamToolPolicyBlock = {
  code: "tool_budget_exhausted" | "paid_tool_budget_exhausted";
  reason: string;
};

export class SamToolPolicy {
  private calls = 0;
  private paidCalls = 0;

  constructor(private readonly options: SamToolPolicyOptions) {}

  allow(toolName: string): SamToolPolicyBlock | null {
    if (this.calls >= this.options.maxCalls) {
      return {
        code: "tool_budget_exhausted",
        reason: "SAM reached this turn's tool-call limit.",
      };
    }

    if (
      PAID_TOOL_NAMES.has(toolName) &&
      this.paidCalls >= this.options.maxPaidCalls
    ) {
      return {
        code: "paid_tool_budget_exhausted",
        reason: "SAM reached this turn's paid research limit.",
      };
    }

    this.calls += 1;
    if (PAID_TOOL_NAMES.has(toolName)) this.paidCalls += 1;
    return null;
  }

  summary() {
    return { toolCalls: this.calls, paidToolCalls: this.paidCalls };
  }
}
