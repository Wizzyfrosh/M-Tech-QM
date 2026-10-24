import { getActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure } from "@/lib/http";
import { downloadAssignmentFile } from "@/lib/assignment-files";
export const maxDuration = 60;
export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    const actor = await getActor(request.headers);
    const file = await downloadAssignmentFile(
      getDb(),
      actor.id,
      (await context.params).fileId,
    );
    const fallback = file.name.replace(/[^a-zA-Z0-9._ -]/g, "_");
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(file.size),
        "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; sandbox; frame-ancestors 'none'",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
