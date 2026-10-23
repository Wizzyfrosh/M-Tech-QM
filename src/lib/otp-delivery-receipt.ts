import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/** Per-request receipt: no PII, OTP or credentials are persisted. */
type DeliveryReceipt = { attempts: number; accepted: number; failed: number };
const context = new AsyncLocalStorage<DeliveryReceipt>();

export async function trackEmailDelivery<T>(call: () => Promise<T>) {
  const receipt: DeliveryReceipt = { attempts: 0, accepted: 0, failed: 0 };
  const result = await context.run(receipt, call);
  return { result, receipt };
}
export function recordEmailDelivery(accepted: boolean) {
  const receipt = context.getStore();
  if (!receipt) return;
  receipt.attempts += 1;
  if (accepted) receipt.accepted += 1;
  else receipt.failed += 1;
}
