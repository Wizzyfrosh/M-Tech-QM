import { AccessError } from "./access-error";

// Fixed messages only: provider bodies can contain account details or lesson text.
export class AiProviderError extends AccessError {
  constructor(public readonly code: string, message: string, status = 503) {
    super(status, message);
  }
}

export function providerHttpError(provider: string, status: number) {
  if (status === 401 || status === 403)
    return new AiProviderError("AUTH", `${provider}: the API key was rejected or this account lacks model access. Check the key and permissions in the provider dashboard.`);
  if (status === 402)
    return new AiProviderError("CREDITS", `${provider}: insufficient credits. Add credits in the provider dashboard or choose another provider.`);
  if (status === 429)
    return new AiProviderError("QUOTA", `${provider}: rate limit or provider quota reached. Wait before retrying or choose another provider.`);
  if (status === 404)
    return new AiProviderError("MODEL", `${provider}: the configured model is unavailable. Check the server model setting or choose another provider.`);
  if (status === 400 || status === 422)
    return new AiProviderError("REQUEST", `${provider}: the request was rejected. Check the API key, model settings and provider access, or choose another provider.`);
  return new AiProviderError("UNAVAILABLE", `${provider}: the service is temporarily unavailable. Try again later or choose another provider.`);
}

export function normalizeProviderError(provider: string, error: unknown): AccessError {
  if (error instanceof AccessError) return error;
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))
    return new AiProviderError("TIMEOUT", `${provider}: generation timed out. Try fewer questions or choose another provider.`);
  return new AiProviderError("NETWORK", `${provider}: the response could not be completed. Try again or choose another provider.`);
}
