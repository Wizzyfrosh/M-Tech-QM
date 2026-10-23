import "server-only";
import { z } from "zod";
import { AccessError } from "./access";
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function assertOrigin(request: Request) {
  const expected = process.env.BETTER_AUTH_URL;
  if (!expected || request.headers.get("origin") !== new URL(expected).origin)
    throw new AccessError(403, "Request origin is not allowed.");
}
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AccessError(415, "Send JSON data.");
  // Stream with a hard cap; Content-Length can be missing or untrusted.
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400, "Request body is required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) {
      await reader.cancel();
      throw new AccessError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  try {
    return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    throw new AccessError(400, "Check the form fields and try again.");
  }
}
export function failure(error: unknown) {
  if (error instanceof AccessError)
    return json({ error: error.message }, error.status);
  console.error("QMS_REQUEST_FAILED");
  return json(
    { error: "We could not complete this request. Please try again." },
    503,
  );
}
