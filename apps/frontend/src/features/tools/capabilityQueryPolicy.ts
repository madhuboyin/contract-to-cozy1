export function shouldRetryCapabilityQuery(
  failureCount: number,
  error: unknown,
): boolean {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : null;

  if (status === 429) return false;
  return failureCount < 1;
}
