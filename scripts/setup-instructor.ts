import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "better-auth/crypto";
import { randomBytes, randomUUID } from "node:crypto";
import { emailSchema, nameSchema } from "../src/lib/policy";
const args = process.argv.slice(2);
if (
  !args.includes("--email") ||
  !args.includes("--name") ||
  !process.env.DATABASE_URL
)
  throw new Error(
    'Usage: npm run instructor:setup -- --email owner@example.com --name "Instructor name". DATABASE_URL is required.',
  );
const email = emailSchema.parse(args[args.indexOf("--email") + 1]);
const name = nameSchema.parse(args[args.indexOf("--name") + 1]);
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  const password = await hashPassword(randomBytes(48).toString("base64url"));
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(76351021)`;
    if (await tx.user.findFirst({ where: { role: "INSTRUCTOR" } }))
      throw new Error("An instructor already exists. Setup is closed.");
    if (await tx.user.findUnique({ where: { email } }))
      throw new Error(
        "This email already has an account. No account was modified.",
      );
    const id = randomUUID();
    await tx.user.create({
      data: {
        id,
        name,
        email,
        emailVerified: false,
        role: "INSTRUCTOR",
        accounts: {
          create: {
            id: randomUUID(),
            accountId: id,
            providerId: "credential",
            password,
          },
        },
      },
    });
    await tx.auditEvent.create({
      data: { actorId: id, action: "INSTRUCTOR_PROVISIONED", entityId: id },
    });
  });
  console.log(
    "Instructor prepared. Use Forgot password in the app to verify email ownership and choose a password. No email has been sent and no password is printed.",
  );
} finally {
  await db.$disconnect();
}
