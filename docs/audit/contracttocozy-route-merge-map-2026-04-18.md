# ContractToCozy Route Merge Map (Old -> Canonical)

**Date:** April 18, 2026  
**Purpose:** Engineering-ready route consolidation map for homeowner experience coherence.  
**Scope:** Frontend app routes (`apps/frontend/src/app`) with explicit redirect targets, parameter handling, and dependencies.

---

## 1) Canonical Routing Rules

1. **Property-specific workflows must canonicalize to property-scoped routes** under `/dashboard/properties/[propertyId]/...`.
2. **Global routes remain only for cross-property surfaces** (`/dashboard`, `/dashboard/actions`, `/dashboard/properties`, `/dashboard/providers`, etc.).
3. **All old aliases redirect to canonical routes with query preservation.**
4. **Use 308 redirects** for deterministic path mappings.
5. **Use 307/edge resolver flow** when property resolution is required at runtime.

### Property resolution order (for old global -> property canonical)

1. `propertyId` in old route query string
2. `selectedPropertyId` from authenticated user context
3. If user has exactly 1 property, auto-select it
4. Otherwise redirect to `/dashboard/properties?navTarget=<target>`

### Query params to preserve (all mapped redirects)

Preserve and pass through when present:

- `guidanceJourneyId`
- `guidanceStepKey`
- `guidanceSignalIntentFamily`
- `itemId`
- `homeAssetId`
- `serviceCategory`
- `vendorName`
- `quoteAmount`
- `quoteComparisonWorkspaceId`
- `serviceRadarCheckId`
- `negotiationShieldCaseId`
- `utm_source`, `utm_medium`, `utm_campaign`

---

## 2) Merge Map (P0: Implement Now)

| Priority | Old Route Pattern | Canonical Route Pattern | Redirect Type | Param Mapping | Dependencies | Notes |
|---|---|---|---|---|---|---|
| P0 | `/dashboard/coverage-intelligence` | `/dashboard/properties/:propertyId/tools/coverage-intelligence` | 307 (resolver) | preserve all + `propertyId` resolution | Property resolver middleware | Remove global duplicate |
| P0 | `/dashboard/risk-premium-optimizer` | `/dashboard/properties/:propertyId/tools/risk-premium-optimizer` | 307 (resolver) | preserve all + `propertyId` resolution | Property resolver middleware | Remove global duplicate |
| P0 | `/dashboard/home-savings` | `/dashboard/properties/:propertyId/tools/home-savings` | 307 (resolver) | preserve all + `propertyId` resolution | Property resolver middleware | Remove global duplicate |
| P0 | `/dashboard/do-nothing-simulator` | `/dashboard/properties/:propertyId/tools/do-nothing` | 307 (resolver) | preserve all + `propertyId` resolution | Property resolver middleware | Route naming consolidation |
| P0 | `/dashboard/home-event-radar` | `/dashboard/properties/:propertyId/tools/home-event-radar` | 307 (resolver) | preserve all + `propertyId` resolution | Replace inverse redirect in property route | Canonical flips to property-scoped |
| P0 | `/dashboard/home-renovation-risk-advisor` | `/dashboard/properties/:propertyId/tools/home-renovation-risk-advisor` | 307 (resolver) | preserve all + `propertyId` resolution | Replace inverse redirect in property route | Canonical flips to property-scoped |
| P0 | `/dashboard/risk-radar` | `/dashboard/properties/:propertyId/tools/home-event-radar` | 307 (resolver) | preserve all + `propertyId` resolution | Property resolver middleware | Legacy alias cleanup |
| P0 | `/dashboard/inventory` | `/dashboard/properties/:propertyId/inventory` | 307 (resolver) | preserve all + `propertyId` resolution | Property resolver middleware | Inventory is property-scoped |
| P0 | `/dashboard/replace-repair?itemId=:itemId` | `/dashboard/properties/:propertyId/inventory/items/:itemId/replace-repair` | 307 (resolver) | map `itemId` query -> path + preserve rest | Property resolver middleware | Item-specific canonical |
| P0 | `/dashboard/replace-repair` (no `itemId`) | `/dashboard/properties/:propertyId/inventory?intent=replace-repair` | 307 (resolver) | preserve all + `propertyId` resolution | Property resolver middleware | Landing route for item selection |
| P0 | `/dashboard/checklist` | `/dashboard/maintenance` | 308 | preserve query | None | Single maintenance entry |
| P0 | `/dashboard/seasonal` | `/dashboard/maintenance?tab=seasonal` | 308 | append `tab=seasonal`; preserve existing query | None | Seasonal merged under maintenance shell |
| P0 | `/dashboard/seasonal/settings` | `/dashboard/maintenance-setup?tab=seasonal` | 308 | append `tab=seasonal`; preserve existing query | None | Seasonal config under setup |
| P0 | `/dashboard/properties/:propertyId/rooms` | `/dashboard/properties/:propertyId/inventory/rooms` | 308 | map `propertyId` path param | None | Eliminate duplicate room namespace |
| P0 | `/dashboard/properties/:propertyId/rooms/:roomId` | `/dashboard/properties/:propertyId/inventory/rooms/:roomId` | 308 | map `propertyId`, `roomId` path params | None | Eliminate duplicate room namespace |
| P0 | `/dashboard/properties/:propertyId/health-score` | `/dashboard/properties/:propertyId/home-score?tab=health` | 308 | map `propertyId`; set `tab=health` | Home score tab support | Consolidate score surfaces |
| P0 | `/dashboard/properties/:propertyId/risk-assessment` | `/dashboard/properties/:propertyId/home-score?tab=risk` | 308 | map `propertyId`; set `tab=risk` | Home score tab support | Consolidate score surfaces |
| P0 | `/dashboard/inspection-report` | `/dashboard/properties/:propertyId/reports?report=inspection` | 307 (resolver) | map `propertyId`; set `report=inspection`; preserve rest | Property resolver middleware | Consolidate report entry |
| P0 | `/marketplace` | `/dashboard/providers` | 308 | preserve query | None | Single provider marketplace entry |

---

## 3) Merge Map (P1: Requires Small Canonical Build)

| Priority | Old Route Pattern | Canonical Route Pattern | Redirect Type | Param Mapping | Dependencies | Notes |
|---|---|---|---|---|---|---|
| P1 | `/dashboard/home-tools` | `/dashboard/tools` | 308 | preserve query | Build new `/dashboard/tools` route | Unified launcher |
| P1 | `/dashboard/ai-tools` | `/dashboard/tools?tab=ai` | 308 | set `tab=ai`; preserve query | Build new `/dashboard/tools` route | Unified launcher |
| P1 | `/dashboard/tax-appeal` | `/dashboard/properties/:propertyId/tools/property-tax?mode=appeal` | 307 (resolver) | map `propertyId`; set `mode=appeal`; preserve rest | Property-tax route accepts `mode` | Merge tax flows |
| P1 | `/dashboard/appreciation` | `/dashboard/properties/:propertyId/tools/capital-timeline?view=appreciation` | 307 (resolver) | map `propertyId`; set `view=appreciation`; preserve rest | Capital timeline accepts `view` | Consolidate appreciation |
| P1 | `/dashboard/budget` | `/dashboard/properties/:propertyId/tools/true-cost?view=budget` | 307 (resolver) | map `propertyId`; set `view=budget`; preserve rest | True-cost view mode support | Consolidate budget UX |
| P1 | `/dashboard/expenses` | `/dashboard/properties/:propertyId/tools/true-cost?view=expenses` | 307 (resolver) | map `propertyId`; set `view=expenses`; preserve rest | True-cost view mode support | Consolidate expense UX |
| P1 | `/dashboard/insurance` | `/dashboard/properties/:propertyId/tools/coverage-intelligence?entry=insurance` | 307 (resolver) | map `propertyId`; set `entry=insurance`; preserve rest | Coverage route supports insurance entry mode | Consolidate insurance entry |
| P1 | `/dashboard/properties/:propertyId/tools/coverage-options` | `/dashboard/properties/:propertyId/tools/coverage-intelligence?tab=options` | 308 | map `propertyId`; set `tab=options`; preserve rest | Coverage intelligence includes options view | Remove weak standalone wrapper |
| P1 | `/dashboard/properties/:propertyId/tools/insurance-trend` | `/dashboard/properties/:propertyId/tools/coverage-intelligence?tab=trend` | 308 | map `propertyId`; set `tab=trend`; preserve rest | Coverage intelligence includes trend view | Retire weak standalone trend route |
| P1 | `/dashboard/properties/:propertyId/tools/quote-comparison` (interim) | `/dashboard/properties/:propertyId/tools/service-price-radar?workspace=quote` | 308 | map `propertyId`; set `workspace=quote`; preserve guidance params | Until real quote workspace ships | Temporary deprecation path |

---

## 4) Engineering Implementation Notes

### 4.1 Suggested implementation split

1. **Middleware/edge resolver:** context-dependent global -> property redirects (all 307 resolver rows)
2. **`next.config.js` redirects:** deterministic 308 rows
3. **Route-level guards:** remove inverse redirects in property wrappers and enforce canonical self-route
4. **Telemetry:** add `route_redirected` event with `{ oldRoute, canonicalRoute, redirectType }`

### 4.2 Redirect hygiene requirements

- Keep old routes for at least 2 releases (soft-deprecation window)
- Ensure no redirect loops (`old -> canonical -> old`)
- Unit test mapping table + e2e test top 20 redirected URLs
- Add canonical `<link rel="canonical">` on migrated pages

---

## 5) Copy/Paste Manifest (TypeScript)

```ts
export type RouteMergeRule = {
  oldPattern: string;
  canonicalPattern: string;
  priority: 'P0' | 'P1';
  redirectType: '308' | '307-resolver';
  requiresPropertyResolution: boolean;
  notes?: string;
};

export const ROUTE_MERGE_RULES: RouteMergeRule[] = [
  { oldPattern: '/dashboard/coverage-intelligence', canonicalPattern: '/dashboard/properties/:propertyId/tools/coverage-intelligence', priority: 'P0', redirectType: '307-resolver', requiresPropertyResolution: true },
  { oldPattern: '/dashboard/risk-premium-optimizer', canonicalPattern: '/dashboard/properties/:propertyId/tools/risk-premium-optimizer', priority: 'P0', redirectType: '307-resolver', requiresPropertyResolution: true },
  { oldPattern: '/dashboard/home-savings', canonicalPattern: '/dashboard/properties/:propertyId/tools/home-savings', priority: 'P0', redirectType: '307-resolver', requiresPropertyResolution: true },
  { oldPattern: '/dashboard/do-nothing-simulator', canonicalPattern: '/dashboard/properties/:propertyId/tools/do-nothing', priority: 'P0', redirectType: '307-resolver', requiresPropertyResolution: true },
  { oldPattern: '/dashboard/home-event-radar', canonicalPattern: '/dashboard/properties/:propertyId/tools/home-event-radar', priority: 'P0', redirectType: '307-resolver', requiresPropertyResolution: true },
  { oldPattern: '/dashboard/home-renovation-risk-advisor', canonicalPattern: '/dashboard/properties/:propertyId/tools/home-renovation-risk-advisor', priority: 'P0', redirectType: '307-resolver', requiresPropertyResolution: true },
  { oldPattern: '/dashboard/risk-radar', canonicalPattern: '/dashboard/properties/:propertyId/tools/home-event-radar', priority: 'P0', redirectType: '307-resolver', requiresPropertyResolution: true },
  { oldPattern: '/dashboard/inventory', canonicalPattern: '/dashboard/properties/:propertyId/inventory', priority: 'P0', redirectType: '307-resolver', requiresPropertyResolution: true },
  { oldPattern: '/dashboard/replace-repair', canonicalPattern: '/dashboard/properties/:propertyId/inventory?intent=replace-repair', priority: 'P0', redirectType: '307-resolver', requiresPropertyResolution: true },
  { oldPattern: '/dashboard/checklist', canonicalPattern: '/dashboard/maintenance', priority: 'P0', redirectType: '308', requiresPropertyResolution: false },
  { oldPattern: '/dashboard/seasonal', canonicalPattern: '/dashboard/maintenance?tab=seasonal', priority: 'P0', redirectType: '308', requiresPropertyResolution: false },
  { oldPattern: '/dashboard/seasonal/settings', canonicalPattern: '/dashboard/maintenance-setup?tab=seasonal', priority: 'P0', redirectType: '308', requiresPropertyResolution: false },
  { oldPattern: '/dashboard/properties/:propertyId/rooms', canonicalPattern: '/dashboard/properties/:propertyId/inventory/rooms', priority: 'P0', redirectType: '308', requiresPropertyResolution: false },
  { oldPattern: '/dashboard/properties/:propertyId/rooms/:roomId', canonicalPattern: '/dashboard/properties/:propertyId/inventory/rooms/:roomId', priority: 'P0', redirectType: '308', requiresPropertyResolution: false },
  { oldPattern: '/dashboard/properties/:propertyId/health-score', canonicalPattern: '/dashboard/properties/:propertyId/home-score?tab=health', priority: 'P0', redirectType: '308', requiresPropertyResolution: false },
  { oldPattern: '/dashboard/properties/:propertyId/risk-assessment', canonicalPattern: '/dashboard/properties/:propertyId/home-score?tab=risk', priority: 'P0', redirectType: '308', requiresPropertyResolution: false },
  { oldPattern: '/dashboard/inspection-report', canonicalPattern: '/dashboard/properties/:propertyId/reports?report=inspection', priority: 'P0', redirectType: '307-resolver', requiresPropertyResolution: true },
  { oldPattern: '/marketplace', canonicalPattern: '/dashboard/providers', priority: 'P0', redirectType: '308', requiresPropertyResolution: false },

  { oldPattern: '/dashboard/home-tools', canonicalPattern: '/dashboard/tools', priority: 'P1', redirectType: '308', requiresPropertyResolution: false },
  { oldPattern: '/dashboard/ai-tools', canonicalPattern: '/dashboard/tools?tab=ai', priority: 'P1', redirectType: '308', requiresPropertyResolution: false },
  { oldPattern: '/dashboard/tax-appeal', canonicalPattern: '/dashboard/properties/:propertyId/tools/property-tax?mode=appeal', priority: 'P1', redirectType: '307-resolver', requiresPropertyResolution: true },
  { oldPattern: '/dashboard/appreciation', canonicalPattern: '/dashboard/properties/:propertyId/tools/capital-timeline?view=appreciation', priority: 'P1', redirectType: '307-resolver', requiresPropertyResolution: true },
  { oldPattern: '/dashboard/budget', canonicalPattern: '/dashboard/properties/:propertyId/tools/true-cost?view=budget', priority: 'P1', redirectType: '307-resolver', requiresPropertyResolution: true },
  { oldPattern: '/dashboard/expenses', canonicalPattern: '/dashboard/properties/:propertyId/tools/true-cost?view=expenses', priority: 'P1', redirectType: '307-resolver', requiresPropertyResolution: true },
  { oldPattern: '/dashboard/insurance', canonicalPattern: '/dashboard/properties/:propertyId/tools/coverage-intelligence?entry=insurance', priority: 'P1', redirectType: '307-resolver', requiresPropertyResolution: true },
  { oldPattern: '/dashboard/properties/:propertyId/tools/coverage-options', canonicalPattern: '/dashboard/properties/:propertyId/tools/coverage-intelligence?tab=options', priority: 'P1', redirectType: '308', requiresPropertyResolution: false },
  { oldPattern: '/dashboard/properties/:propertyId/tools/insurance-trend', canonicalPattern: '/dashboard/properties/:propertyId/tools/coverage-intelligence?tab=trend', priority: 'P1', redirectType: '308', requiresPropertyResolution: false },
  { oldPattern: '/dashboard/properties/:propertyId/tools/quote-comparison', canonicalPattern: '/dashboard/properties/:propertyId/tools/service-price-radar?workspace=quote', priority: 'P1', redirectType: '308', requiresPropertyResolution: false },
];
```

---

## 6) Acceptance Criteria

A merge is complete only when:

1. Redirect works for direct URL hits and in-app navigations.
2. Query/context parameters are preserved.
3. No redirect loops occur.
4. Analytics receives redirect events.
5. Navigation menus only expose canonical routes.
6. Legacy routes are removed from sitemap and internal link generation.

