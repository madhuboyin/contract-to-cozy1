// A source link stored with property tax evidence or a comparable sale must be a web address. The reviewed-rule readiness only asks that a source exists, but
// the value is later shown to people, so an explicit protocol allowlist (parsed, not pattern-matched) keeps `javascript:`, `data:` and similar out of storage.
// Output code must still escape the value and open it safely: this is input validation, not output safety.
const MAX_URL_LENGTH = 2_000;

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH) return false;
  let parsed: URL;
  try { parsed = new URL(value); } catch { return false; }
  return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.hostname.length > 0 && !parsed.username && !parsed.password;
}

/** Throws the caller's message when a supplied link is not an http or https address. An absent link is fine. */
export function assertHttpUrl(value: string | undefined | null, message: string): void {
  if (value !== undefined && value !== null && value.trim() !== '' && !isHttpUrl(value.trim())) throw new Error(message);
}
