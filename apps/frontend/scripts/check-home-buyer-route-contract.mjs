import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(frontendRoot, '../..');

const requiredRouteFiles = [
  'src/app/(dashboard)/dashboard/page.tsx',
  'src/app/(dashboard)/dashboard/ask/page.tsx',
  'src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/page.tsx',
  'src/app/(dashboard)/dashboard/properties/[id]/documents/page.tsx',
  'src/app/(dashboard)/dashboard/properties/[id]/timeline/page.tsx',
  'src/app/(dashboard)/dashboard/properties/[id]/household/page.tsx',
  'src/app/(dashboard)/dashboard/properties/[id]/home-operations/page.tsx',
  'src/app/(dashboard)/dashboard/properties/[id]/tools/home-records/page.tsx',
];

const removedLegacyFiles = [
  'src/app/(dashboard)/dashboard/checklist/page.tsx',
  'src/app/(dashboard)/dashboard/components/HomeBuyerChecklistCard.tsx',
];

const failures = [];
const read = (path) => readFileSync(resolve(frontendRoot, path), 'utf8');
const requireMatch = (path, pattern, message) => {
  if (!pattern.test(read(path))) failures.push(`${path}: ${message}`);
};

for (const path of requiredRouteFiles) {
  if (!existsSync(resolve(frontendRoot, path))) failures.push(`${path}: canonical route is missing`);
}
for (const path of removedLegacyFiles) {
  if (existsSync(resolve(frontendRoot, path))) failures.push(`${path}: obsolete buyer checklist surface still exists`);
}

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

for (const path of sourceFiles(resolve(frontendRoot, 'src'))) {
  const source = readFileSync(path, 'utf8');
  if (source.includes('/dashboard/checklist')) {
    failures.push(`${relative(repositoryRoot, path)}: references removed global checklist route`);
  }
  if (source.includes('HomeBuyerChecklistCard')) {
    failures.push(`${relative(repositoryRoot, path)}: references removed dashboard checklist card`);
  }
}

requireMatch(
  'src/app/(dashboard)/dashboard/page.tsx',
  /presentationMode === 'BUYER_CLOSING'[\s\S]*<BuyerClosingHome overview=/,
  'pre-close dashboard no longer dispatches to Buyer Closing Home',
);
for (const routeName of ['plan', 'documents', 'inspection', 'ask']) {
  requireMatch(
    'src/components/home/BuyerClosingHome.tsx',
    new RegExp(`href=\\{routes\\.${routeName}\\}`),
    `Buyer Closing Home is missing its canonical ${routeName} CTA`,
  );
}
for (const routeName of ['plan', 'timeline', 'homeRecords', 'homeOperations', 'ask']) {
  requireMatch(
    'src/components/home/RecentOwnerTransition.tsx',
    new RegExp(`href=\\{routes\\.${routeName}\\}`),
    `Recent Owner transition is missing its canonical ${routeName} CTA`,
  );
}
requireMatch(
  'src/app/onboarding/first-value/page.tsx',
  /router\.push\(buyer\.planHref\)/,
  'buyer first value is missing the canonical plan handoff',
);
requireMatch(
  'src/app/onboarding/first-value/page.tsx',
  /router\.push\(buyer\.askHref\)/,
  'buyer first value is missing the canonical Ask handoff',
);
requireMatch(
  'src/lib/navigation/buyerReturnContext.ts',
  /dashboard\/properties\/\$\{encodeURIComponent\(propertyId\)\}\/buyer-plan/,
  'buyer return context is not property-scoped to Buyer Plan',
);

const apiClient = read('src/lib/api/client.ts');
if (/\bHOME_BUYER\b/.test(apiClient)) {
  failures.push('src/lib/api/client.ts: user-level HOME_BUYER terminology remains in buyer API documentation');
}

const backendTerminologyChecks = [
  ['apps/backend/src/services/riskAssessmentIntegration.service.ts', /HOME_BUYER|EXISTING_OWNER/],
  ['apps/backend/src/routes/movingConcierge.routes.ts', /HOME_BUYER users|HOME_BUYER only/],
  ['apps/backend/src/services/checklist.service.ts', /HOME_BUYER segment|EXISTING_OWNER segment/],
  ['apps/backend/src/controllers/checklist.controller.ts', /^ \* - (HOME_BUYER|EXISTING_OWNER):/m],
  ['apps/backend/src/services/seasonalChecklistIntegration.service.ts', /HOME_BUYER property|EXISTING_OWNER property/],
];
for (const [path, pattern] of backendTerminologyChecks) {
  const source = readFileSync(resolve(repositoryRoot, path), 'utf8');
  if (pattern.test(source)) failures.push(`${path}: obsolete user-segment terminology remains`);
}

if (failures.length > 0) {
  console.error('Home buyer route contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Home buyer route contract passed (${requiredRouteFiles.length} canonical routes, 9 guarded CTAs).`);
