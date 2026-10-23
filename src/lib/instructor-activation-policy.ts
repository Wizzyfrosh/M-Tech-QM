import { z } from "zod";
import { emailSchema } from "./policy";
export const requestActivationSchema = z.object({ email: emailSchema }).strict();
export const redeemActivationSchema = requestActivationSchema.extend({
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(8).max(128),
}).strict();
