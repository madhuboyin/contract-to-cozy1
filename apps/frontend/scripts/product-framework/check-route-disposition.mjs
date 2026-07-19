#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '../..');
const appRoot = path.join(frontendRoot, 'src/app');
const backendRoot = path.resolve(frontendRoot, '../backend');
const workersRoot = path.resolve(frontendRoot, '../workers');
const guidanceTemplateRegistry = path.join(backendRoot, 'src/services/guidanceEngine/guidanceTemplateRegistry.ts');

// WKR-003: worker-generated notification actionUrl values (neighborhood,
// permit, reserve fund, seasonal, warranty, recall follow-ups, ...) were
// previously outside this audit entirely — only apps/backend/src was
// scanned, so a worker-side deep link could break without failing the
// route contract. Both source roots are scanned with the same rule below.
const NOTIFICATION_SOURCE_ROOTS = [
  { root: path.join(backendRoot, 'src'), prefix: '' },
  { root: path.join(workersRoot, 'src'), prefix: 'workers: ' },
];

const PHASE2_CANONICAL_CTA_ROUTES = [
  '/dashboard',
  '/dashboard/actions',
  '/dashboard/properties/[id]',
  '/dashboard/ask',
  '/dashboard/profile',
  '/dashboard/properties/[id]/tools/guidance-overview',
  '/dashboard/properties/[id]/projects/[projectId]',
  '/dashboard/properties/[id]/incidents/[incidentId]',
  '/dashboard/properties/[id]/recalls',
  '/dashboard/properties/[id]/tools/coverage-intelligence',
  '/dashboard/properties/[id]/inventory',
];

export const ROUTE_DISPOSITIONS = [
  'KEEP_PRIMARY',
  'KEEP_PUBLIC',
  'MERGE_HOME',
  'MERGE_PLAN_PROJECTS',
  'MERGE_HOME_RECORD',
  'MERGE_SETTINGS',
  'CONTEXTUAL_ONLY',
  'VALIDATE_PLACEMENT',
  'REDIRECT_DUPLICATE',
  'ADMIN_ONLY',
  'PROVIDER_ONLY',
  'INTERNAL_ONLY',
];

const exact = (values) => (route) => values.includes(route);
const matches = (pattern) => (route) => pattern.test(route);

export const ROUTE_DISPOSITION_RULES = [
  {
    id: 'internal-only',
    disposition: 'INTERNAL_ONLY',
    rationale: 'Acceptance and visual-development surfaces are not part of the homeowner product.',
    matches: matches(/^\/(acceptance\/|aha-mock$)/),
  },
  {
    id: 'admin-only',
    disposition: 'ADMIN_ONLY',
    rationale: 'Operational and governance surfaces remain role-gated outside homeowner navigation.',
    matches: matches(/^\/dashboard\/(admin(?:\/|$)|analytics-admin$|knowledge-admin(?:\/|$)|worker-jobs$)/),
  },
  {
    id: 'provider-only',
    disposition: 'PROVIDER_ONLY',
    rationale: 'Provider-portal routes retain their separate role-specific experience.',
    matches: matches(/^\/providers(?:\/|$)/),
  },
  {
    id: 'public-core',
    disposition: 'KEEP_PUBLIC',
    rationale: 'Public acquisition, authentication, legal, invitation, and controlled-share routes remain public.',
    matches: matches(/^\/$|^\/(login|signup|forgot-password|reset-password|verify-email|privacy|terms|cookies|offline)(?:\/|$)|^\/(invite|knowledge|gazette\/share|home-score\/share|reports\/share|vault\/\[propertyId\])(?:\/|$)/),
  },
  {
    id: 'onboarding-entry',
    disposition: 'KEEP_PRIMARY',
    rationale: 'Onboarding remains a primary acquisition flow and is redesigned around entry context in Phase 1.',
    matches: matches(/^\/onboarding(?:\/|$)/),
  },
  {
    id: 'home-primary',
    disposition: 'KEEP_PRIMARY',
    rationale: 'The authenticated dashboard becomes the canonical Home destination.',
    matches: exact(['/dashboard', '/dashboard/ask']),
  },
  {
    id: 'settings-merge',
    disposition: 'MERGE_SETTINGS',
    rationale: 'Profile, household, notification, and cadence controls consolidate under Profile & Settings.',
    matches: matches(/^\/dashboard\/(profile|notifications|seasonal\/settings)$|^\/dashboard\/properties\/\[id\]\/household(?:\/|$)/),
  },
  {
    id: 'known-global-duplicates',
    disposition: 'REDIRECT_DUPLICATE',
    rationale: 'Global duplicates cut over to property-scoped or canonical destination routes.',
    matches: exact([
      '/dashboard/coverage-intelligence',
      '/dashboard/documents',
      '/dashboard/fix',
      '/dashboard/hoa',
      '/dashboard/home-event-radar',
      '/dashboard/home-renovation-risk-advisor',
      '/dashboard/home-savings',
      '/dashboard/inspection-report',
      '/dashboard/inventory',
      '/dashboard/maintenance',
      '/dashboard/permits',
      '/dashboard/quote-comparison',
      '/dashboard/replace-repair',
      '/dashboard/risk-premium-optimizer',
      '/dashboard/vault',
    ]),
  },
  {
    id: 'plan-and-projects',
    disposition: 'MERGE_PLAN_PROJECTS',
    rationale: 'Stateful journeys, bookings, projects, claims, and major moments converge in Plan & Projects.',
    matches: matches(/^\/dashboard\/(actions|bookings|resolution-center|moving-concierge)(?:\/|$)|^\/dashboard\/properties\/\[id\]\/(projects|claims|guidance|seller-prep|buyer-plan|new-home-plan)(?:\/|$)/),
  },
  {
    id: 'home-record',
    disposition: 'MERGE_HOME_RECORD',
    rationale: 'Property identity, systems, evidence, history, records, rooms, and household artifacts converge in Home Record.',
    matches: matches(/^\/dashboard\/properties(?:\/new|\/\[id\](?:\/|$))?$|^\/dashboard\/properties\/\[id\]\/(edit|inventory|rooms|timeline|reports|vault|materials|home-score|health-score|environment-report)(?:\/|$)|^\/dashboard\/(expenses|insurance|warranties|modifications|financing)(?:\/|$)/),
  },
  {
    id: 'home-attention',
    disposition: 'MERGE_HOME',
    rationale: 'Attention, recurring care, risk, and overview surfaces become sections or actions on Home.',
    matches: (route) =>
      route !== '/dashboard/seasonal/settings' &&
      (/^\/dashboard\/(checklist|climate|daily-snapshot|maintenance-setup|protect|save|seasonal|risk-radar)(?:\/|$)/.test(route) ||
        /^\/dashboard\/properties\/\[id\]\/(fix|focus|incidents|protect|recalls|risk-assessment|save|status-board|onboarding)(?:\/|$)/.test(route)),
  },
  {
    id: 'specialized-tools',
    disposition: 'CONTEXTUAL_ONLY',
    rationale: 'Specialized tools remain available from actions, journeys, records, Ask, or command search—not primary navigation.',
    matches: matches(/^\/dashboard\/properties\/\[id\]\/tools(?:\/|$)|^\/dashboard\/(ai-tools|budget|diy|do-nothing-simulator|emergency|energy|home-lab|home-tools|oracle|tax-appeal|visual-inspector)(?:\/|$)/),
  },
  {
    id: 'contextual-execution-and-marketplace',
    disposition: 'CONTEXTUAL_ONLY',
    rationale: 'Execution, provider, pricing, and decision surfaces are invoked from a scoped action or journey.',
    matches: matches(/^\/dashboard\/(providers|community-events)(?:\/|$)|^\/dashboard\/permits\/|^\/dashboard\/properties\/\[id\]\/(financial-efficiency|inspection-hub)(?:\/|$)/),
  },
  {
    id: 'validate-placement',
    disposition: 'VALIDATE_PLACEMENT',
    rationale: 'These broad engagement or informational surfaces require outcome evidence before receiving prominent placement.',
    matches: matches(/^\/dashboard\/(appreciation|neighbourhood-trust|personalization)(?:\/|$)/),
  },
];

function walkPages(directory) {
  const pages = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) pages.push(...walkPages(absolute));
    if (entry.isFile() && entry.name === 'page.tsx') pages.push(absolute);
  }
  return pages;
}

export function pageFileToRoute(file) {
  let route = path.relative(appRoot, file).replaceAll(path.sep, '/');
  route = route === 'page.tsx' ? '' : route.replace(/\/page\.tsx$/, '');
  route = route.replace(/(^|\/)\([^/]+\)(?=\/|$)/g, '');
  route = route.replace(/\/+/g, '/');
  return route ? `/${route}`.replace('//', '/') : '/';
}

export function classifyRoute(route) {
  const matched = ROUTE_DISPOSITION_RULES.filter((rule) => rule.matches(route));
  if (matched.length !== 1) return { route, matched };
  return { route, ...matched[0], matched };
}

export function auditRouteDisposition() {
  const routes = walkPages(appRoot).map(pageFileToRoute).sort();
  const results = routes.map(classifyRoute);
  const invalid = results.filter((result) => result.matched.length !== 1);
  return { routes, results, invalid };
}

function normalizeContractRoute(routePath) {
  return routePath
    .split('?')[0]
    .replace(/\$\{[^}]+\}/g, '[id]')
    .replace(/:propertyId/g, '[id]')
    .replace(/:itemId/g, '[itemId]')
    .replace(/:([A-Za-z][A-Za-z0-9_]*)/g, '[$1]');
}

function extractGuidanceTemplateRoutes() {
  const source = fs.readFileSync(guidanceTemplateRegistry, 'utf8');
  return [...source.matchAll(/routePath:\s*'([^']+)'/g)].map((match) => match[1]);
}

function walkTypeScript(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkTypeScript(absolute));
    if (entry.isFile() && /\.tsx?$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

function extractNotificationRoutes() {
  const routes = [];
  for (const { root, prefix } of NOTIFICATION_SOURCE_ROOTS) {
    for (const file of walkTypeScript(root)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/actionUrl:\s*([`'"])(\/dashboard[^`'"]+)\1/g)) {
        routes.push({ route: match[2], file: `${prefix}${path.relative(root, file)}` });
      }
    }
  }
  return routes;
}

function auditPhase2RouteContracts(routes) {
  const knownRoutes = new Set(routes);
  const contracts = [
    ...PHASE2_CANONICAL_CTA_ROUTES.map((route) => ({ source: 'Phase 2 canonical CTA', route })),
    ...extractGuidanceTemplateRoutes().map((route) => ({ source: 'Guidance template', route })),
    ...extractNotificationRoutes().map(({ route, file }) => ({ source: `Notification URL (${file})`, route })),
  ];
  const invalid = [];
  for (const contract of contracts) {
    const normalized = normalizeContractRoute(contract.route);
    if (!knownRoutes.has(normalized)) invalid.push({ ...contract, normalized });
  }
  return { contracts, invalid };
}

const { routes, results, invalid } = auditRouteDisposition();
const routeContracts = auditPhase2RouteContracts(routes);
if (invalid.length > 0 || routeContracts.invalid.length > 0) {
  console.error('[product-framework:routes] FAILED');
  for (const result of invalid) {
    const issue = result.matched.length === 0
      ? 'unclassified'
      : `matched multiple rules: ${result.matched.map((rule) => rule.id).join(', ')}`;
    console.error(`- ${result.route}: ${issue}`);
  }
  for (const contract of routeContracts.invalid) {
    console.error(`- ${contract.source} target ${contract.route}: no page matches ${contract.normalized}`);
  }
  process.exit(1);
}

const counts = new Map();
for (const result of results) {
  counts.set(result.disposition, (counts.get(result.disposition) ?? 0) + 1);
}

console.log(`[product-framework:routes] PASSED — ${routes.length} routes classified`);
console.log(`- PRODUCT_FRAMEWORK_ROUTE_CONTRACTS: ${routeContracts.contracts.length}`);
for (const disposition of ROUTE_DISPOSITIONS) {
  const count = counts.get(disposition) ?? 0;
  if (count > 0) console.log(`- ${disposition}: ${count}`);
}
