/** The first owned Property is primary regardless of a client-side default. */
export function shouldCreatePropertyAsPrimary(
  existingPropertyCount: number,
  requestedPrimary: boolean | undefined,
): boolean {
  return existingPropertyCount === 0 || requestedPrimary === true;
}
