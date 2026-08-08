import { z } from "zod";

export function toSamToolError(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      error: {
        code: "invalid_request",
        message: "SAM could not validate that tool request.",
      },
    };
  }

  return {
    error: {
      code: "unavailable",
      message: "That data source is temporarily unavailable.",
    },
  };
}
