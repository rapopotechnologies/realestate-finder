/** Only follow redirects to paths on this site ("/search"), never "//evil.com" or full URLs. */
export function safeNext(next: string | null | undefined, fallback = "/search"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
