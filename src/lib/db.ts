import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
const globalDb = globalThis as unknown as { qmsDb?: PrismaClient };
export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured.");
  const poolSize = Number(process.env.DATABASE_POOL_SIZE || 5);
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 20)
    throw new Error("Invalid database pool size.");
  if (!globalDb.qmsDb)
    globalDb.qmsDb = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        max: poolSize,
        connectionTimeoutMillis: 10_000,
      }),
    });
  return globalDb.qmsDb;
}
