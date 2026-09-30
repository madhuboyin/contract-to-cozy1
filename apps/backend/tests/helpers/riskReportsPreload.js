// Preload for running scripts/measure-asset-identity-conflicts.ts without a database. The stub allows exactly ONE call,
// riskAssessmentReport.findMany, and throws on anything else, so a run that passes proves the script only reads.
const Module = require('module');
const originalLoad = Module._load;
const reports = JSON.parse(process.env.FIXTURE_REPORTS || '[]', (key, value) => (key === 'lastCalculatedAt' ? new Date(value) : value));
const forbidden = (path) => () => { throw new Error(`READ-ONLY VIOLATION: ${path} was called`); };
Module._load = function patched(request, parent, isMain) {
  if (request === '@prisma/client') {
    return {
      PrismaClient: class {
        constructor() {
          const model = new Proxy(
            { findMany: async (args) => { console.log(`FINDMANY_ARGS ${JSON.stringify(args)}`); return reports; } },
            { get: (target, method) => (method in target ? target[method] : forbidden(`riskAssessmentReport.${String(method)}`)) },
          );
          this.riskAssessmentReport = model;
          // Any other model on the client is off limits.
          return new Proxy(this, { get: (target, name) => (name in target ? target[name] : forbidden(String(name))) });
        }
        async $disconnect() { console.log('DISCONNECTED'); }
      },
    };
  }
  return originalLoad.apply(this, arguments);
};
