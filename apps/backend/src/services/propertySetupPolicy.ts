/** The first owned Property is primary regardless of a client-side default. */
export function shouldCreatePropertyAsPrimary(
  existingPropertyCount: number,
  requestedPrimary: boolean | undefined,
): boolean {
  return existingPropertyCount === 0 || requestedPrimary === true;
}

/** Existing primary rows are cleared only for an explicit later-primary choice. */
export function shouldClearExistingPrimary(
  existingPropertyCount: number,
  requestedPrimary: boolean | undefined,
): boolean {
  return existingPropertyCount > 0 && requestedPrimary === true;
}

/** Run auxiliary work without allowing its failure to undo a committed create. */
export async function runNonFatalPostCreateStep(
  step: () => Promise<unknown>,
  onFailure: (error: unknown) => void,
): Promise<void> {
  try {
    await step();
  } catch (error) {
    onFailure(error);
  }
}
