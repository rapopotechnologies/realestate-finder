import type { SkipTraceProvider } from "./types";

/**
 * Providers available to SKIP_TRACE_PROVIDER. Empty on purpose: skip tracing is off until you
 * pick a vendor, sign their terms and add an implementation here, e.g.
 *
 *   import { myVendor } from "./providers/my-vendor";
 *   const PROVIDERS = { "my-vendor": myVendor };
 */
const PROVIDERS: Record<string, SkipTraceProvider> = {};

export function getSkipTraceProvider(): { id: string; provider: SkipTraceProvider; apiKey: string } | null {
  const id = process.env.SKIP_TRACE_PROVIDER?.trim();
  if (!id) return null;
  const provider = PROVIDERS[id];
  const apiKey = process.env.SKIP_TRACE_API_KEY ?? "";
  if (!provider || !apiKey) return null;
  return { id, provider, apiKey };
}

export function skipTraceEnabled(): boolean {
  return getSkipTraceProvider() !== null;
}
