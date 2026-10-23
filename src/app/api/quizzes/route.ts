import { getActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json } from "@/lib/http";
import { quizSummarySelect } from "@/lib/quizzes";
export async function GET(request: Request) {
  try {
    await getActor(request.headers);
    const u = new URL(request.url);
    const page = Math.max(
      1,
      Math.min(10000, Math.floor(Number(u.searchParams.get("page")) || 1)),
    );
    const db = getDb();
    const where = {
      status: { in: ["PUBLISHED", "CLOSED"] as ("PUBLISHED" | "CLOSED")[] },
    };
    const [quizzes, total] = await db.$transaction([
      db.quiz.findMany({
        where,
        select: quizSummarySelect,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
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
