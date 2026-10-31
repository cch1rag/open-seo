import { describe, expect, it } from "vitest";
import { dropKeepaliveChunks } from "./keepaliveFilter";

const KEEPALIVE =
  'data: {"id":"chatcmpl-keepalive","model":"keepalive","choices":[]}\n\n';
const REAL = 'data: {"id":"chatcmpl-1","model":"gemini-3.1-flash-lite"}\n\n';

function streamOf(...pieces: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
}

describe("dropKeepaliveChunks", () => {
  it("drops omniroute's placeholder chunk, even split across reads", async () => {
    const raw = KEEPALIVE + REAL + "data: [DONE]\n\n";
    const body = streamOf(raw.slice(0, 20), raw.slice(20, 90), raw.slice(90));
    const fetchImpl = dropKeepaliveChunks(
      async () =>
        new Response(body, {
          headers: { "content-type": "text/event-stream" },
        }),
    );
    const text = await (await fetchImpl("http://x/v1/chat/completions")).text();
    expect(text).toBe(REAL + "data: [DONE]\n\n");
  });

  it("leaves non-stream responses untouched", async () => {
    const fetchImpl = dropKeepaliveChunks(async () =>
      Response.json({ model: "keepalive" }),
    );
    const body: unknown = await (await fetchImpl("http://x")).json();
    expect(body).toEqual({ model: "keepalive" });
  });
});
