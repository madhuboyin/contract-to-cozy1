/**
 * The parameters persisted when a confirmed command completes: the execution's stored parameters (which carry
 * `sourceExecutionId`, entity ids and the confirmation payload that replay reconciliation reads) with the result's own parameters
 * layered on top. A result that reports parameters (for example `focusedDecisionThreadId`) must add to the stored ones, never
 * replace them. A result with no parameters leaves the stored ones untouched (undefined = no write).
 */
export function mergeConfirmedParameters(
  stored: Record<string, unknown>,
  fromResult: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  return fromResult ? { ...stored, ...fromResult } : undefined;
}
