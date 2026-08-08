import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toSamToolError } from "./samToolErrors";

describe("toSamToolError", () => {
  it("returns a safe invalid-request result for schema errors", () => {
    const schema = z.object({ keyword: z.string().min(1) });
    const error = schema.safeParse({ keyword: "" }).error;

    expect(toSamToolError(error)).toEqual({
      error: {
        code: "invalid_request",
        message: "SAM could not validate that tool request.",
      },
    });
  });

  it("does not expose an unknown upstream error message to the model", () => {
    expect(toSamToolError(new Error("database password: secret-value"))).toEqual(
      {
        error: {
          code: "unavailable",
          message: "That data source is temporarily unavailable.",
        },
      },
    );
  });
});
