import { requireInstructor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { studentSchema } from "@/lib/policy";
export async function GET(request: Request) {
  try {
    await requireInstructor(request.headers);
    const url = new URL(request.url);
    const page = Math.max(
      1,
      Math.min(10000, Number(url.searchParams.get("page")) || 1),
    );
    const q = (url.searchParams.get("q") || "").slice(0, 80);
    const requested = url.searchParams.get("status");
    const status: "PENDING" | "ACTIVE" | "SUSPENDED" | null =
      requested === "ACTIVE" || requested === "SUSPENDED" || requested === "PENDING"
        ? requested : requested === "ALL" ? null : "PENDING";
    const where = {
      ...(status ? { status } : {}),
      ...(status === "PENDING" ? { user: { emailVerified: true } } : {}),
      ...(q ? { OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { normalizedEmail: { contains: q, mode: "insensitive" as const } },
      ] } : {}),
    };
    const db = getDb();
    const [entries, total] = await db.$transaction([
      db.rosterEntry.findMany({
        where,
        skip: (Math.floor(page) - 1) * 20,
        take: 20,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          name: true,
          normalizedEmail: true,
          status: true,
          revision: true,
          createdAt: true,
          user: { select: { emailVerified: true } },
        },
      }),
      db.rosterEntry.count({ where }),
    ]);
    return json({ entries, total, page: Math.floor(page), pageSize: 20 });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    const data = await readJson(request, studentSchema);
    const db = getDb();
    const existing = await db.user.findUnique({
      where: { email: data.email },
      select: { id: true, role: true },
    });
    if (existing?.role === "INSTRUCTOR")
      return json(
        { error: "The instructor cannot be added as a student." },
        409,
      );
    const entry = await db.$transaction(async (tx) => {
      const row = await tx.rosterEntry.create({
        data: {
          name: data.name,
          normalizedEmail: data.email,
          userId: existing?.id,
          status: "ACTIVE", // Explicit manual instructor override retained for legacy compatibility.
        },
        select: { id: true },
      });
      await tx.auditEvent.create({
        data: { actorId: actor.id, action: "ROSTER_ADDED", entityId: row.id },
      });
      return row;
    });
    return json(entry, 201);
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "P2002"
    )
      return json({ error: "This email is already on the roster." }, 409);
    return failure(error);
  }
}
