#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const baselinePath = path.join(rootDir, 'qa', 'baselines', 'shared-primitives-allowlist.json');

const scanRoots = [
  'src/components/system',
  'src/app/(dashboard)/dashboard/properties/[id]/components/route-templates',
  'src/app/(dashboard)/dashboard/properties/[id]/tools',
];

const disallowedImports = [
  '@/components/ui/card',
  '@/components/ui/table',
  '@/components/ui/dialog',
  '@/components/ui/sheet',
  '@/components/ui/alert-dialog',
  '@/components/ui/popover',
];

const templateImportRegex =
  /route-templates\/(ToolWorkspaceTemplate|CompareTemplate|DetailTemplate|ReportTemplate|GuidedJourneyTemplate|TrustStrip|TrustPanel|PriorityActionPattern)/;

function walkFiles(relativeDir) {
  const absoluteDir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath);
    if (entry.isDirectory()) {
      files.push(...walkFiles(relativePath));
      continue;
    }
    if (entry.isFile() && /\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      files.push(relativePath);
    }
  }

  return files;
}

function shouldEnforce(filePath, source) {
  if (filePath.includes('components/system/')) return true;
  if (filePath.includes('/components/route-templates/')) return true;
  return templateImportRegex.test(source);
}

const failures = [];
const observedViolationIds = [];
const scopedFiles = scanRoots.flatMap((dir) => walkFiles(dir));

const allowlist = fs.existsSync(baselinePath)
  ? new Set(JSON.parse(fs.readFileSync(baselinePath, 'utf8')).allowlist || [])
  : new Set();

for (const relativeFile of scopedFiles) {
  const absoluteFile = path.join(rootDir, relativeFile);
  const source = fs.readFileSync(absoluteFile, 'utf8');

  if (!shouldEnforce(relativeFile, source)) {
    continue;
  }

  for (const importPath of disallowedImports) {
    const importRegex = new RegExp(`from\\s+['"]${importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
    if (importRegex.test(source)) {
      const violationId = `${relativeFile}|import:${importPath}`;
      observedViolationIds.push(violationId);
      if (!allowlist.has(violationId)) {
        failures.push(
          `${relativeFile}: disallowed raw primitive import "${importPath}" in shared/template-governed file`
        );
      }
    }
  }

  if (/\bwindow\.confirm\s*\(/.test(source) || /\bconfirm\s*\(/.test(source) || /\balert\s*\(/.test(source)) {
    const violationId = `${relativeFile}|native-confirm-alert`;
    observedViolationIds.push(violationId);
    if (!allowlist.has(violationId)) {
      failures.push(
        `${relativeFile}: disallowed native confirm/alert in shared/template-governed file (use system modal or toast)`
      );
    }
  }
}

const staleAllowlist = Array.from(allowlist).filter((entry) => !observedViolationIds.includes(entry));
if (staleAllowlist.length > 0) {
  for (const stale of staleAllowlist) {
    failures.push(`stale allowlist entry (remove from qa/baselines/shared-primitives-allowlist.json): ${stale}`);
  }
}

if (failures.length > 0) {
  console.error('\n[shared-primitives-check] FAILED');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[shared-primitives-check] PASSED');
console.log(`Validated files: ${scopedFiles.length}`);
