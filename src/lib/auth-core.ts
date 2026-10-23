import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins/email-otp";
import type { PrismaClient } from "@/generated/prisma/client";
import type { OtpMail } from "./mail";
import { emailSchema, nameSchema, mayAccess } from "./policy";

export function createAuth(
  db: PrismaClient,
  config: {
    url: string;
    secret: string;
    sendMail: (message: OtpMail) => Promise<void>;
  },
) {
  return betterAuth({
    appName: "M Tech QMS",
    logger: {
      log(level) {
        if (level === "error") console.error("QMS_AUTH_ERROR");
      },
    },
    baseURL: config.url,
    secret: config.secret,
    trustedOrigins: [new URL(config.url).origin],
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
    },
    user: {
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
      additionalFields: {
        role: { type: "string", defaultValue: "STUDENT", input: false },
        leaderboardOptOut: {
          type: "boolean",
          defaultValue: false,
          input: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
    advanced: { database: { generateId: () => crypto.randomUUID() } },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.body?.email !== undefined) {
          const parsed = emailSchema.safeParse(ctx.body.email);
          if (!parsed.success)
            throw new APIError("BAD_REQUEST", {
              message: "Enter a valid email address.",
            });
          ctx.body.email = parsed.data;
        }
        if (ctx.path === "/sign-up/email") {
          const parsed = nameSchema.safeParse(ctx.body?.name);
          if (!parsed.success)
            throw new APIError("BAD_REQUEST", {
              message: "Enter a name between 2 and 80 characters.",
            });
          ctx.body.name = parsed.data;
          const entry = await db.rosterEntry.findUnique({
            where: { normalizedEmail: ctx.body.email },
          });
          if (!entry || entry.status !== "ACTIVE")
            throw new APIError("BAD_REQUEST", {
              code: "ENROLLMENT_UNAVAILABLE",
              message:
                "Registration could not be completed. Contact your instructor.",
            });
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const email = emailSchema.parse(user.email);
            return {
              data: {
                ...user,
                email,
                role: "STUDENT",
                leaderboardOptOut: false,
              },
            };
          },
          after: async (user) => {
            // Link identity even if suspended during signup. Access checks still deny it.
            await db.rosterEntry.updateMany({
              where: { normalizedEmail: user.email, userId: null },
              data: { userId: user.id },
            });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await db.user.findUnique({
              where: { id: session.userId },
              include: { roster: true },
            });
            if (!mayAccess(user))
              throw new APIError("FORBIDDEN", {
                message:
                  "Account access is unavailable. Contact your instructor.",
              });
            return { data: session };
          },
        },
      },
    },
    plugins: [
      emailOTP({
        overrideDefaultEmailVerification: true,
        disableSignUp: true,
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: "hashed",
        sendVerificationOTP: config.sendMail,
      }),
    ],
  });
}
