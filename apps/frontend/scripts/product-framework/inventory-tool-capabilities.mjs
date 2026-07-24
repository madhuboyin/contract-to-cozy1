#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '../..');
const repoRoot = path.resolve(frontendRoot, '../..');
const appRoot = path.join(frontendRoot, 'src/app');

const catalogPath = path.join(
  frontendRoot,
  'src/components/mobile/dashboard/mobileToolCatalog.ts',
);
const discoveryRegistryPath = path.join(
  frontendRoot,
  'src/features/tools/toolDiscoveryRegistry.ts',
);
const toolRegistryPath = path.join(
  frontendRoot,
  'src/features/tools/toolRegistry.ts',
);
const unifiedSelectorPath = path.join(
  frontendRoot,
  'src/features/tools/selectUnifiedHomeTools.ts',
);
const smartSelectorPath = path.join(
  frontendRoot,
  'src/features/tools/selectSmartContextTools.ts',
);
const capabilityIconRegistryPath = path.join(
  frontendRoot,
  'src/features/tools/capabilityIconRegistry.ts',
);
const backendCapabilityContractPath = path.join(
  repoRoot,
  'apps/backend/src/productFramework/capabilities/capability.contract.ts',
);
const backendLifecycleContractPath = path.join(
  repoRoot,
  'apps/backend/src/services/analytics/toolLifecycle.contract.ts',
);

const outputDirectory = path.join(repoRoot, 'docs/product/capability-discovery');
const jsonOutputPath = path.join(outputDirectory, 'current-capability-inventory.json');
const markdownOutputPath = path.join(outputDirectory, 'current-capability-inventory.md');

const plannedInitialTranche = new Set([
  'material-specs',
  'plant-advisor',
  'home-digital-will',
  'diy',
  'seller-prep',
  'permits',
  'hoa-compliance',
  'inspection-hub',
  'project-tracker',
]);

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`Missing source marker: ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  if (end === -1) throw new Error(`Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function parseCatalogEntries(source, startMarker, endMarker, sourceName) {
  const body = sliceBetween(source, startMarker, endMarker);
  const matches = [...body.matchAll(/\bkey:\s*'([^']+)'/g)];
  return matches
    .map((match, index) => {
      const chunkStart = match.index ?? 0;
      const chunkEnd = matches[index + 1]?.index ?? body.length;
      const chunk = body.slice(chunkStart, chunkEnd);
      const value = (field) => {
        const fieldMatch = chunk.match(new RegExp(`\\b${field}:\\s*['"]([^'"]+)['"]`));
        return fieldMatch?.[1] ?? null;
      };

      return {
        id: match[1],
        label: value(sourceName === 'ai' ? 'title' : 'name'),
        group: value('group'),
        href: value(sourceName === 'ai' ? 'href' : 'hrefSuffix'),
        navTarget: value('navTarget'),
        workflowOnly: /\bworkflowOnly:\s*true/.test(chunk),
        source: sourceName,
      };
    })
    .filter((entry) => entry.id !== 'view-all');
}

function parseStringMap(source, constName) {
  const match = source.match(
    new RegExp(`const ${constName}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`),
  );
  if (!match) throw new Error(`Unable to parse map ${constName}`);
  const result = {};
  const entryPattern = /(?:'([^']+)'|([A-Za-z][A-Za-z0-9_]*)):\s*'([^']+)'/g;
  for (const entry of match[1].matchAll(entryPattern)) {
    result[entry[1] ?? entry[2]] = entry[3];
  }
  return result;
}

function parseStringSet(source, constName) {
  const match = source.match(
    new RegExp(`const ${constName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\);`),
  );
  if (!match) throw new Error(`Unable to parse set ${constName}`);
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]));
}

function parseStringArray(source, constName) {
  const match = source.match(
    new RegExp(`(?:export )?const ${constName}[^=]*=\\s*\\[([\\s\\S]*?)\\]\\s*as const;`),
  );
  if (!match) throw new Error(`Unable to parse array ${constName}`);
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]));
}

function parseSelectorToolIds(source) {
  return new Set([...source.matchAll(/\btoolId:\s*'([^']+)'/g)].map((entry) => entry[1]));
}

function walkPages(directory) {
  const pages = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) pages.push(...walkPages(absolute));
    if (entry.isFile() && entry.name === 'page.tsx') pages.push(absolute);
  }
  return pages;
}

function pageFileToRoute(file) {
  let route = path.relative(appRoot, file).replaceAll(path.sep, '/');
  route = route === 'page.tsx' ? '' : route.replace(/\/page\.tsx$/, '');
  route = route.replace(/(^|\/)\([^/]+\)(?=\/|$)/g, '');
  route = route.replace(/\/+/g, '/');
  return route ? `/${route}`.replace('//', '/') : '/';
}

function canonicalRoute(entry) {
  if (entry.source === 'home') {
    return `/dashboard/properties/[id]/${entry.href.split('?')[0]}`;
  }
  return entry.href.split('?')[0];
}

function markdownEscape(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function buildInventory() {
  const catalogSource = read(catalogPath);
  const discoverySource = read(discoveryRegistryPath);
  const toolRegistrySource = read(toolRegistryPath);

  const aiEntries = parseCatalogEntries(
    catalogSource,
    'const RAW_MOBILE_AI_TOOL_CATALOG',
    'export const MOBILE_AI_TOOL_CATALOG',
    'ai',
  );
  const homeEntries = parseCatalogEntries(
    catalogSource,
    'export const MOBILE_HOME_TOOL_LINKS',
    null,
    'home',
  );

  const rolloutKeys = parseStringMap(discoverySource, 'ROLLOUT_KEY_BY_TOOL_ID');
  const betaIds = parseStringSet(discoverySource, 'BETA_TOOL_IDS');
  const materialIds = parseStringSet(discoverySource, 'MATERIAL_TOOL_IDS');
  const coverageIds = parseStringSet(discoverySource, 'COVERAGE_TOOL_IDS');
  const homeOutcomeByGroup = parseStringMap(discoverySource, 'HOME_OUTCOME_BY_GROUP');
  const aiOutcomeByGroup = parseStringMap(discoverySource, 'AI_OUTCOME_BY_GROUP');
  const completionByCategory = parseStringMap(discoverySource, 'COMPLETION_KIND_BY_CATEGORY');
  const relatedRegistryIds = parseStringArray(toolRegistrySource, 'TOOL_IDS');
  const unifiedSelectorIds = parseSelectorToolIds(read(unifiedSelectorPath));
  const smartSelectorIds = parseSelectorToolIds(read(smartSelectorPath));
  const lifecycleCanonicalIds = parseStringSet(
    read(backendLifecycleContractPath),
    'DISCOVERABLE_TOOL_IDS',
  );
  const pageRoutes = new Set(walkPages(appRoot).map(pageFileToRoute));

  const aiById = new Map(aiEntries.map((entry) => [entry.id, entry]));
  const homeById = new Map(homeEntries.map((entry) => [entry.id, entry]));
  const ids = [...new Set([...aiById.keys(), ...homeById.keys()])].sort();

  const capabilities = ids.map((id) => {
    const homeEntry = homeById.get(id);
    const aiEntry = aiById.get(id);
    const entry = homeEntry ?? aiEntry;
    const sources = [
      ...(homeEntry ? ['home'] : []),
      ...(aiEntry ? ['ai'] : []),
    ];
    const outcomeCategory = homeEntry
      ? homeOutcomeByGroup[homeEntry.group]
      : aiOutcomeByGroup[aiEntry.group];
    const selectorCoverage = [
      ...(unifiedSelectorIds.has(id) ? ['unified_home'] : []),
      ...(smartSelectorIds.has(id) ? ['smart_context'] : []),
    ];
    const route = canonicalRoute(entry);
    const recommendationDisposition = entry.workflowOnly
      ? 'WORKFLOW_ONLY'
      : selectorCoverage.length > 0
        ? 'CONTEXTUAL_EXISTING'
        : plannedInitialTranche.has(id)
          ? 'CONTEXTUAL_PLANNED'
          : 'CATALOG_ONLY_PENDING_REVIEW';

    return {
      id,
      label: entry.label,
      sources,
      canonicalRoute: route,
      routeVerified: pageRoutes.has(route),
      workflowOnly: entry.workflowOnly,
      outcomeCategory,
      rolloutKey: rolloutKeys[id] ?? null,
      releaseStage: betaIds.has(id) ? 'BETA' : 'ACTIVE',
      safetyTier: coverageIds.has(id)
        ? 'REGULATED_COVERAGE'
        : materialIds.has(id)
          ? 'MATERIAL_FINANCIAL'
          : id === 'emergency'
            ? 'SAFETY_EMERGENCY'
            : 'LOW_CONSEQUENCE',
      completionKind: completionByCategory[outcomeCategory] ?? null,
      lifecycleCanonicalized: lifecycleCanonicalIds.has(id),
      relatedRegistryCoverage: relatedRegistryIds.has(id),
      selectorCoverage,
      plannedInitialTranche: plannedInitialTranche.has(id),
      recommendationDisposition,
    };
  });

  const summary = {
    aiCatalogEntries: aiEntries.length,
    homeCatalogEntries: homeEntries.length,
    overlappingEntries: aiEntries.filter((entry) => homeById.has(entry.id)).length,
    distinctCapabilities: capabilities.length,
    routeVerified: capabilities.filter((entry) => entry.routeVerified).length,
    relatedRegistryCoverage: capabilities.filter((entry) => entry.relatedRegistryCoverage).length,
    existingContextualCoverage: capabilities.filter(
      (entry) => entry.recommendationDisposition === 'CONTEXTUAL_EXISTING',
    ).length,
    plannedContextualTranche: capabilities.filter(
      (entry) => entry.recommendationDisposition === 'CONTEXTUAL_PLANNED',
    ).length,
    workflowOnly: capabilities.filter(
      (entry) => entry.recommendationDisposition === 'WORKFLOW_ONLY',
    ).length,
    lifecycleCanonicalized: capabilities.filter(
      (entry) => entry.lifecycleCanonicalized,
    ).length,
    catalogOnlyPendingReview: capabilities.filter(
      (entry) => entry.recommendationDisposition === 'CATALOG_ONLY_PENDING_REVIEW',
    ).length,
  };

  return {
    generatedFrom: [
      path.relative(repoRoot, catalogPath),
      path.relative(repoRoot, discoveryRegistryPath),
      path.relative(repoRoot, toolRegistryPath),
      path.relative(repoRoot, unifiedSelectorPath),
      path.relative(repoRoot, smartSelectorPath),
      path.relative(repoRoot, backendCapabilityContractPath),
      path.relative(repoRoot, backendLifecycleContractPath),
      path.relative(repoRoot, capabilityIconRegistryPath),
    ],
    summary,
    capabilities,
  };
}

function renderJson(inventory) {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

function renderMarkdown(inventory) {
  const { summary, capabilities } = inventory;
  const lines = [
    '# Current Capability Inventory',
    '',
    '> Generated by `apps/frontend/scripts/product-framework/inventory-tool-capabilities.mjs`.',
    '> Do not edit manually. Run the script with `--write` after changing capability metadata.',
    '',
    '## Summary',
    '',
    '| Measure | Count |',
    '| --- | ---: |',
    `| AI catalog entries | ${summary.aiCatalogEntries} |`,
    `| Home catalog entries | ${summary.homeCatalogEntries} |`,
    `| Overlapping entries | ${summary.overlappingEntries} |`,
    `| Distinct capabilities | ${summary.distinctCapabilities} |`,
    `| Canonical routes verified | ${summary.routeVerified} |`,
    `| Legacy related-registry coverage | ${summary.relatedRegistryCoverage} |`,
    `| Existing contextual selector coverage | ${summary.existingContextualCoverage} |`,
    `| Planned contextual tranche | ${summary.plannedContextualTranche} |`,
    `| Workflow-only | ${summary.workflowOnly} |`,
    `| Backend lifecycle canonicalized | ${summary.lifecycleCanonicalized} |`,
    `| Catalog-only pending review | ${summary.catalogOnlyPendingReview} |`,
    '',
    '## Capability Matrix',
    '',
    '| ID | Label | Sources | Canonical route | Route | Outcome | Release | Safety | Completion | Lifecycle | Related registry | Selector coverage | Planned tranche | Recommendation disposition |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...capabilities.map((entry) => [
      markdownEscape(entry.id),
      markdownEscape(entry.label),
      entry.sources.join(', '),
      `\`${markdownEscape(entry.canonicalRoute)}\``,
      entry.routeVerified ? 'Verified' : 'Missing',
      markdownEscape(entry.outcomeCategory),
      markdownEscape(entry.releaseStage),
      markdownEscape(entry.safetyTier),
      markdownEscape(entry.completionKind),
      entry.lifecycleCanonicalized ? 'Canonical' : 'Missing',
      entry.relatedRegistryCoverage ? 'Yes' : 'No',
      entry.selectorCoverage.length > 0 ? entry.selectorCoverage.join(', ') : 'None',
      entry.plannedInitialTranche ? 'Yes' : 'No',
      markdownEscape(entry.recommendationDisposition),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |')),
    '',
    '## Interpretation',
    '',
    '- `CONTEXTUAL_EXISTING` means at least one current central selector explicitly considers the capability.',
    '- `CONTEXTUAL_PLANNED` means the approved initial niche tranche plans reviewed contextual activation.',
    '- `WORKFLOW_ONLY` means general discovery is intentionally suppressed.',
    '- `CATALOG_ONLY_PENDING_REVIEW` is the safe default until eligibility and suggestion behavior are reviewed.',
    '- Route verification checks the current Next.js page inventory; it does not certify runtime behavior.',
    '',
  ];
  return lines.join('\n');
}

function validateInventory(inventory) {
  const errors = [];
  const ids = new Set();
  for (const capability of inventory.capabilities) {
    if (ids.has(capability.id)) errors.push(`Duplicate capability ID: ${capability.id}`);
    ids.add(capability.id);
    if (!capability.rolloutKey) errors.push(`Missing rollout key: ${capability.id}`);
    if (!capability.completionKind) errors.push(`Missing completion kind: ${capability.id}`);
    if (!capability.lifecycleCanonicalized) errors.push(`Missing backend lifecycle canonicalization: ${capability.id}`);
    if (!capability.outcomeCategory) errors.push(`Missing outcome category: ${capability.id}`);
    if (!capability.routeVerified) errors.push(`Missing canonical page route: ${capability.id} (${capability.canonicalRoute})`);
  }

  const backendIconNames = parseStringArray(
    read(backendCapabilityContractPath),
    'CAPABILITY_ICON_NAMES',
  );
  const frontendIconNames = parseStringArray(
    read(capabilityIconRegistryPath),
    'CAPABILITY_ICON_NAMES',
  );
  for (const iconName of backendIconNames) {
    if (!frontendIconNames.has(iconName)) {
      errors.push(`Backend capability icon is not registered by the frontend: ${iconName}`);
    }
  }
  for (const iconName of frontendIconNames) {
    if (!backendIconNames.has(iconName)) {
      errors.push(`Frontend capability icon is not allowed by the backend: ${iconName}`);
    }
  }

  return errors;
}

function assertCurrent(filePath, expected) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing generated artifact ${path.relative(repoRoot, filePath)}. Run with --write.`);
  }
  const actual = fs.readFileSync(filePath, 'utf8');
  if (actual !== expected) {
    throw new Error(`Stale generated artifact ${path.relative(repoRoot, filePath)}. Run with --write.`);
  }
}

const inventory = buildInventory();
const errors = validateInventory(inventory);
if (errors.length > 0) {
  console.error('Capability inventory validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const json = renderJson(inventory);
const markdown = renderMarkdown(inventory);

if (process.argv.includes('--write')) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(jsonOutputPath, json);
  fs.writeFileSync(markdownOutputPath, markdown);
  console.log(`Wrote ${path.relative(repoRoot, jsonOutputPath)}`);
  console.log(`Wrote ${path.relative(repoRoot, markdownOutputPath)}`);
} else {
  assertCurrent(jsonOutputPath, json);
  assertCurrent(markdownOutputPath, markdown);
  console.log(`Capability inventory is current (${inventory.summary.distinctCapabilities} distinct capabilities).`);
}
