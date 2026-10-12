/** What we know about the owner when asking a provider for phone numbers / emails. */
export interface SkipTraceRequest {
  ownerName: string;
  mailingAddress: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingZip: string | null;
  propertyAddress: string | null;
  propertyCity: string | null;
  propertyZip: string | null;
}

export interface SkipTraceResult {
  phones: string[];
  emails: string[];
}

/**
 * A skip-trace provider. Add one by implementing this interface in lib/skip-trace/providers/,
 * registering it in lib/skip-trace/index.ts, and setting SKIP_TRACE_PROVIDER (+ SKIP_TRACE_API_KEY)
 * in Vercel. Runs on the server only; the key never reaches the browser.
 */
export interface SkipTraceProvider {
  /** Shown next to results as the source ("via <label>") */
  label: string;
  lookup(req: SkipTraceRequest, apiKey: string): Promise<SkipTraceResult>;
}
