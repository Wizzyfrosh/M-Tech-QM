import { requireInstructor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { blankQuiz } from "@/lib/quiz-policy";
import { createQuiz, quizSummarySelect } from "@/lib/quizzes";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    const actor = await requireInstructor(request.headers);
    const u = new URL(request.url);
    const page = Math.max(
      1,
      Math.min(10000, Math.floor(Number(u.searchParams.get("page")) || 1)),
    );
    const q = (u.searchParams.get("q") || "").slice(0, 120);
    const status = u.searchParams.get("status");
    const statuses = ["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"] as const;
    if (status && !statuses.includes(status as (typeof statuses)[number]))
      return json({ error: "Invalid quiz status." }, 400);
    const where = {
      createdBy: actor.id,
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
      ...(status ? { status: status as (typeof statuses)[number] } : {}),
    };
    const db = getDb();
    const [quizzes, total] = await db.$transaction([
      db.quiz.findMany({
        where,
        select: quizSummarySelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      db.quiz.count({ where }),
    ]);
    return json({ quizzes, total, page, pageSize: 20 });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    await readJson(request, z.object({}).strict());
    return json(await createQuiz(getDb(), actor.id, blankQuiz()), 201);
  } catch (e) {
    return failure(e);
  }
}
