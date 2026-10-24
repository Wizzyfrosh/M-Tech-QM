import { requireInstructor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json, assertOrigin, readJson } from "@/lib/http";
import { createAssignment } from "@/lib/assignments";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    await readJson(request, z.object({}).strict());
    return json(await createAssignment(getDb(), actor.id), 201);
  } catch (e) {
    return failure(e);
  }
}
