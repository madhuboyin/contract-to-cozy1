/**
 * One sentence-case status formatter for every Ask record list (owner review 2026-11-21): "IN_PROGRESS" and "in progress" are both shown as "In progress", so a status pill reads the same
 * in claims, warranties, documents, maintenance and events. A record's own status code is never shown raw or lowercased.
 */
export function formatStatusLabel(value: string | null | undefined, fallback = ''): string {
  const words = (value ?? '').trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ');
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : fallback;
}
