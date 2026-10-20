import type { AskSearchParams } from './AskRoutePage';

const first = (value?: string | string[]) => (typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : '');

const QUESTIONS = { record: 'Browse my home record', work: 'What needs me?', saved: 'Show my saved results' } as const;
const EXPORT_QUESTION = 'Export my home record';

/**
 * The Ask URL that replaces a retired destination address. Record, Work and Saved are answers in the conversation now, so the old address
 * opens Ask with that question already asked (for the same home), and the old export-review address asks to export; the history list keeps a `view`.
 */
export function legacyAskViewRedirect(
  view: 'record' | 'work' | 'saved' | 'history',
  params: AskSearchParams & { section?: string | string[]; recordId?: string | string[]; export?: string | string[]; open?: string | string[] },
): string {
  const query = new URLSearchParams();
  const propertyId = first(params.propertyId).trim();
  if (propertyId) query.set('propertyId', propertyId);
  if (view === 'history') query.set('view', 'history');
  else if (view === 'record' && first(params.export) === 'review') query.set('question', EXPORT_QUESTION);
  else query.set('question', QUESTIONS[view]);
  return `/dashboard/ask?${query.toString()}`;
}
