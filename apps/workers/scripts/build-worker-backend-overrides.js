#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const backendDist = path.resolve(process.argv[2]);
const stubsRoot = path.resolve(process.argv[3]);

const overrides = {
  'error-middleware.ts': 'middleware/error.middleware.js',
  'admin-audit-service.ts': 'services/adminAudit.service.js',
  'notification-service.ts': 'services/notification.service.js',
  'gemini-service.ts': 'services/gemini.service.js',
  'job-queue-service.ts': 'services/JobQueue.service.js',
  'analytics-schemas.ts': 'services/analytics/schemas.js',
  'property-service.ts': 'services/property.service.js',
};

for (const [stub, destination] of Object.entries(overrides)) {
  const input = path.join(stubsRoot, stub);
  const output = path.join(backendDist, destination);
  const source = fs.readFileSync(input, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: input,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, compiled);
}

console.log(`[worker-backend-overrides] wrote ${Object.keys(overrides).length} worker-safe modules`);
