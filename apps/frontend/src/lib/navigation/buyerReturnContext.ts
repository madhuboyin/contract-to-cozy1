type SearchParamsReader = Pick<URLSearchParams, 'get'>;

const BUYER_CHECKLIST_SECTIONS = new Set([
  'CONTRACT_CONTINGENCIES',
  'INSPECTION_DUE_DILIGENCE',
  'FINANCING_APPRAISAL',
  'TITLE_ESCROW_HOA',
  'INSURANCE',
  'FINAL_WALKTHROUGH',
  'CLOSING_DISCLOSURE_FUNDS',
  'CLOSING_DAY',
  'MOVE_POSSESSION',
  'POST_CLOSE_SAVED',
]);

const SAFE_ENTITY_ID = /^[A-Za-z0-9_-]{1,128}$/;

function safeEntityId(value: string | null) {
  return value && SAFE_ENTITY_ID.test(value) ? value : null;
}

/**
 * Creates the only supported cross-tool return contract for Buyer Plan flows.
 * The target route is deliberately represented by a token instead of a URL so
 * callers cannot turn this continuity feature into an open redirect.
 */
export function buyerPlanLaunchQuery(input: {
  taskId?: string | null;
  section?: string | null;
}) {
  const query = new URLSearchParams({ returnTo: 'buyer-plan' });
  const taskId = safeEntityId(input.taskId ?? null);
  if (taskId) query.set('returnTaskId', taskId);
  if (input.section && BUYER_CHECKLIST_SECTIONS.has(input.section)) {
    query.set('returnSection', input.section);
  }
  return query.toString();
}

export function appendBuyerPlanReturnContext(
  href: string,
  input: { taskId?: string | null; section?: string | null },
) {
  const query = buyerPlanLaunchQuery(input);
  return `${href}${href.includes('?') ? '&' : '?'}${query}`;
}

export function buyerPlanReturnQuery(searchParams: SearchParamsReader) {
  if (searchParams.get('returnTo') !== 'buyer-plan') return '';
  return buyerPlanLaunchQuery({
    taskId: searchParams.get('returnTaskId'),
    section: searchParams.get('returnSection'),
  });
}

export function buyerPlanReturnHref(
  propertyId: string | null | undefined,
  searchParams: SearchParamsReader,
) {
  if (!propertyId || searchParams.get('returnTo') !== 'buyer-plan') return null;

  const targetQuery = new URLSearchParams();
  const taskId = safeEntityId(searchParams.get('returnTaskId'));
  const section = searchParams.get('returnSection');
  if (taskId) targetQuery.set('taskId', taskId);
  if (section && BUYER_CHECKLIST_SECTIONS.has(section)) targetQuery.set('section', section);

  const query = targetQuery.toString();
  const base = `/dashboard/properties/${encodeURIComponent(propertyId)}/buyer-plan`;
  return query ? `${base}?${query}` : base;
}
