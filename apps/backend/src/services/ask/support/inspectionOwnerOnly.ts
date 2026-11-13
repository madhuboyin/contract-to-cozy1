// Owner audience policy 2026-11-13: an inspection finding's free-form text (the inspector's description, the interpretation, the recommendation, resolution notes) and its cost figures are OWNER-only on every Ask
// surface. Contributors and viewers get the STRUCTURED finding only: home system, subsystem, severity, status, disposition. These helpers are the one place that decides what a non-owner may see, so no handler
// builds a title, a review, a confirmation, a target list, a stored parameter or a completion line from the restricted columns. A non-owner's label is structured and may be shared by two findings; such a
// finding is then chosen through an already-authorized row or launch context (its opaque id), never by repeating hidden text.
export const isFindingOwner = (role: unknown): boolean => role === 'OWNER';

const words = (value: unknown) => String(value ?? '').toLowerCase().replace(/_/g, ' ');
export const FINDING_OWNER_ONLY_COLUMNS = ['inspectorDescription', 'aiInterpretation', 'inspectorRecommendation', 'estimatedCostCentsLow', 'estimatedCostCentsHigh', 'resolutionNotes', 'location'] as const;

/** The display label of a finding: the owner keeps "system: description"; everyone else gets "system / subsystem (severity)". */
export function findingLabel(finding: { homeSystem: unknown; subsystem?: unknown; severity?: unknown; inspectorDescription?: unknown }, isOwner: boolean): string {
  if (isOwner && finding.inspectorDescription) return `${String(finding.homeSystem)}: ${String(finding.inspectorDescription)}`;
  const system = String(finding.homeSystem ?? 'Finding'); const sub = finding.subsystem ? ` / ${String(finding.subsystem)}` : ''; const sev = finding.severity ? ` (${words(finding.severity)})` : '';
  return `${system}${sub}${sev}`;
}

/** A copy of the row with every owner-only column blanked, for a non-owner. The owner's row is returned unchanged. */
export function reduceFindingRow<T extends object>(finding: T, isOwner: boolean): T {
  if (isOwner) return finding;
  const copy: Record<string, unknown> = { ...(finding as Record<string, unknown>) };
  for (const key of FINDING_OWNER_ONLY_COLUMNS) if (key in copy) copy[key] = key === 'inspectorDescription' ? '' : null;
  return copy as T;
}
