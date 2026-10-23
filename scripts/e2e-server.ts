// Disposable local test harness. Never run against production data.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { hashPassword } from "better-auth/crypto";
let lite: PGlite | undefined;
let socket: PGLiteSocketServer | undefined;
let url = process.env.TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (
    !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
    !parsed.pathname.endsWith("_test")
  )
    throw new Error("A dedicated local database ending in _test is required.");
} else {
  lite = await PGlite.create();
  socket = new PGLiteSocketServer({ db: lite, host: "127.0.0.1", port: 55433 });
  await socket.start();
  url = "postgresql://postgres:postgres@127.0.0.1:55433/postgres";
}
const pool = new Pool({ connectionString: url, max: 1 });
await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
await pool.query(
  await readFile(
    "prisma/migrations/202610230001_foundation/migration.sql",
    "utf8",
  ),
);
const id = crypto.randomUUID();
const password = await hashPassword("Synthetic-instructor-password-123!");
await pool.query(
  'INSERT INTO "User" (id,name,email,"emailVerified",role,"updatedAt") VALUES ($1,$2,$3,true,$4,NOW())',
  [id, "Test Instructor", "instructor@example.test", "INSTRUCTOR"],
);
await pool.query(
  'INSERT INTO "Account" (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
  [crypto.randomUUID(), id, "credential", id, password],
);
await pool.end();
await rm(".local-mail", { recursive: true, force: true });
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: url,
      DATABASE_POOL_SIZE: lite ? "1" : "5",
      BETTER_AUTH_URL: "http://127.0.0.1:3100",
      BETTER_AUTH_SECRET: "test-only-secret-for-local-browser-checks-123456789",
      MAIL_TRANSPORT: "file",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  child.kill("SIGTERM");
  await socket?.stop();
  await new Promise((r) => setTimeout(r, 100));
  await lite?.close();
  process.exit(0);
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
child.on("exit", () => void stop());
