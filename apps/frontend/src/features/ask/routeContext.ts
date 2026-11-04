// UX-10 (consolidated plan 4A): what the floating panel may offer to ask about, from the page it was opened on.
//
// Only reviewed route patterns are listed, and only the exact identifiers parsed from the route are used; nothing is inferred from display text.
// An entry exists only where the server already pairs that entity type with an operation that acts on exactly that entity, so the starter's
// "this item" is real. The server reauthorizes the entity and the home on every request regardless; this module only decides what to suggest.
export interface RouteAskContext {
  propertyId: string;
  entityType: string;
  entityId: string;
  /** Pairs with the entity so the starter reaches the operation that acts on exactly this record. */
  operationId: string;
  /** Short noun phrase for the chip: "Ask about this item". */
  label: string;
  /** The message sent when the starter is chosen. */
  starterQuestion: string;
}

interface RouteRule {
  pattern: RegExp;
  build: (match: RegExpExecArray) => Omit<RouteAskContext, 'propertyId'> | null;
}

const ID = '([A-Za-z0-9_-]{6,64})';
const RULES: RouteRule[] = [
  {
    // /dashboard/properties/:propertyId/inventory/items/:itemId and its replace-repair / coverage sub-pages.
    pattern: new RegExp(`^/dashboard/properties/${ID}/inventory/items/${ID}(?:/(?:replace-repair|coverage))?/?$`),
    build: (match) => ({ entityType: 'INVENTORY_ITEM', entityId: match[2], operationId: 'REPLACEMENT_GUIDANCE', label: 'this item', starterQuestion: 'Should I repair or replace this item?' }),
  },
];

/** The context for a pathname, or null for any route that is not a reviewed pattern (the panel then stays generic). */
export function resolveRouteAskContext(pathname: string | null | undefined): RouteAskContext | null {
  if (!pathname) return null;
  const path = pathname.split(/[?#]/)[0];
  for (const rule of RULES) {
    const match = rule.pattern.exec(path);
    if (!match) continue;
    const built = rule.build(match);
    if (built) return { propertyId: match[1], ...built };
  }
  return null;
}
