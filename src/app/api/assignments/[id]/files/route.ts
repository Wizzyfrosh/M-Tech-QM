import { after } from "next/server";
import { z } from "zod";
import { getActor, AccessError } from "@/lib/access";
import { getDb } from "@/lib/db";
import { consumeEmailQuota } from "@/lib/throttle";
import { assertOrigin, failure, json } from "@/lib/http";
import {
  readAssignmentUpload,
  uploadAssignmentFile,
  cleanupAssignmentFiles,
} from "@/lib/assignment-files";
export const maxDuration = 60;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const actor = await getActor(request.headers);
    if (actor.role !== "STUDENT")
      throw new AccessError(403, "Student access required.");
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret)
      throw new AccessError(503, "The account service is unavailable.");
    if (
      !(await consumeEmailQuota(
        getDb(),
        actor.id,
        "assignment-file-upload",
        secret,
        12,
      ))
    )
      throw new AccessError(
        429,
        "Too many upload attempts. Wait ten minutes before trying again.",
      );
    const uploadId = z.uuid().safeParse(request.headers.get("x-upload-id"));
    if (!uploadId.success)
      throw new AccessError(400, "Select the file again to start an upload.");
    let name: string;
    try {
      name = decodeURIComponent(request.headers.get("x-file-name") ?? "");
    } catch {
      throw new AccessError(400, "Invalid file name.");
    }
    const id = (await context.params).id;
    const bytes = await readAssignmentUpload(request);
    after(() =>
      cleanupAssignmentFiles(getDb(), actor.id, id).catch(() => {
        console.error("QMS_FILE_CLEANUP_FAILED");
      }),
    );
    const file = await uploadAssignmentFile(
      getDb(),
      actor.id,
      id,
      uploadId.data,
      name,
      bytes,
    );
    return json(file, 201);
  } catch (e) {
    return failure(e);
  }
}
