import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { requestActivationSchema, redeemActivationSchema } from "@/lib/instructor-activation-policy";
import { requestInstructorActivation, redeemInstructorActivation } from "@/lib/instructor-activation";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { email } = await readJson(request, requestActivationSchema);
    return json(await requestInstructorActivation(getDb(), email));
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    assertOrigin(request);
    const { email, code, password } = await readJson(request, redeemActivationSchema);
    return json(await redeemInstructorActivation(getDb(), email, code, password));
  } catch (error) { return failure(error); }
}
