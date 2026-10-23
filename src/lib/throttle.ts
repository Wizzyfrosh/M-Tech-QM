import { createHmac } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
export async function consumeEmailQuota(
  db: PrismaClient,
  email: string,
  category: string,
  secret: string,
  max = 10,
) {
  const key = createHmac("sha256", secret)
    .update(`${category}:${email}`)
    .digest("hex");
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RequestBucket" ("key", "count", "expiresAt") VALUES (${key}, 1, NOW() + INTERVAL '10 minutes')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RequestBucket"."expiresAt" <= NOW() THEN 1 ELSE "RequestBucket"."count" + 1 END,
      "expiresAt" = CASE WHEN "RequestBucket"."expiresAt" <= NOW() THEN NOW() + INTERVAL '10 minutes' ELSE "RequestBucket"."expiresAt" END
    RETURNING "count"`;
  return rows[0].count <= max;
}
