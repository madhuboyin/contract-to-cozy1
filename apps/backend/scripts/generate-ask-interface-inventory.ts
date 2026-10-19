import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  buildAskOperationInventory,
  buildHomeownerRouteInventory,
  validateAskRouteRetirementRegistry,
} from '../src/services/ask/governance/askRouteRetirementRegistry';

const frontendAppRoot = join(__dirname, '../../frontend/src/app');

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? pageFiles(path) : entry.name === 'page.tsx' ? [path] : [];
  });
}

export function discoverHomeownerRouteTemplates(): string[] {
  return pageFiles(frontendAppRoot)
    .map((file) => relative(frontendAppRoot, file).split(sep).filter((part) => !/^\(.+\)$/.test(part)).slice(0, -1))
    .filter((parts) => parts[0] === 'dashboard')
    .filter((parts) => parts[1] !== 'admin' && !['analytics-admin', 'knowledge-admin', 'worker-jobs'].includes(parts[1] ?? ''))
    .map((parts) => `/${parts.join('/')}`)
    .sort();
}

const registryIssues = validateAskRouteRetirementRegistry();
const routes = buildHomeownerRouteInventory(discoverHomeownerRouteTemplates());
const issues = [...registryIssues, ...routes.issues];
if (issues.length) throw new Error(`Ask interface inventory generation failed:\n${issues.join('\n')}`);

process.stdout.write(`${JSON.stringify({
  generatedAt: new Date().toISOString(),
  operationCount: buildAskOperationInventory().length,
  routeCount: routes.rows.length,
  operations: buildAskOperationInventory(),
  routes: routes.rows,
}, null, 2)}\n`);

