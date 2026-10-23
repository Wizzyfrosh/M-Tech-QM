import { readdir, readFile } from "node:fs/promises";
import type { Pool } from "pg";
export async function applyTestMigrations(pool: Pool) {
  for (const entry of (
    await readdir("prisma/migrations", { withFileTypes: true })
  )
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name)))
    await pool.query(
      await readFile(`prisma/migrations/${entry.name}/migration.sql`, "utf8"),
    );
}
