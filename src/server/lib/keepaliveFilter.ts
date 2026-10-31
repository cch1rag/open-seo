// omniroute opens a combo's stream with a placeholder chunk (model
// "keepalive") while it picks a provider. The AI SDK takes a response's model
// id from the first chunk, so the placeholder is dropped to let the model
// that actually served the request through.
export function dropKeepaliveChunks(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    const isStream = response.headers
      .get("content-type")
      ?.includes("text/event-stream");
    if (!response.body || !isStream) return response;
    return new Response(response.body.pipeThrough(keepaliveFilter()), response);
  };
}

const EVENT_SEPARATOR = "\n\n";

function keepaliveFilter(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const events = buffer.split(EVENT_SEPARATOR);
      buffer = events.pop() ?? "";
      for (const event of events) {
        if (event.includes('"id":"chatcmpl-keepalive"')) continue;
        controller.enqueue(encoder.encode(event + EVENT_SEPARATOR));
      }
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer) controller.enqueue(encoder.encode(buffer));
    },
  });
}
