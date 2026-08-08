import { describe, expect, it } from "vitest";
import { getSamActiveToolNames } from "./samToolAccess";

describe("getSamActiveToolNames", () => {
  it("excludes Think's writable context tool while preserving other available tools", () => {
    expect(
      getSamActiveToolNames({
        get_keyword_metrics: {},
        save_keywords: {},
        set_context: {},
      }),
    ).toEqual(["get_keyword_metrics", "save_keywords"]);
  });
});
