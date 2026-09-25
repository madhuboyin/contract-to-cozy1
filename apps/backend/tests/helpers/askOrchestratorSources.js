const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, resolve } = require('node:path');

// The Ask orchestrator's handlers are being moved out of askOrchestrator.service.ts into services/ask/handlers/, execution/ and askHandlerSupport.ts (see
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). Tests that assert on the source text (a function body calls a
// service, a block id sits next to a field) read it through this helper, so they keep working wherever the code lives.
// The orchestrator's own text comes first, then the support module, then the handler and execution files, sorted by path.
const ASK_DIR = resolve(__dirname, '../../src/services/ask');

function handlerFiles(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return handlerFiles(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

function readAskOrchestratorSources() {
  const files = [join(ASK_DIR, 'askOrchestrator.service.ts')];
  // The shared support module, then every file under handlers/ and execution/ (whichever exist).
  files.push(join(ASK_DIR, 'askHandlerSupport.ts'));
  for (const dir of ['handlers', 'execution']) {
    try { files.push(...handlerFiles(join(ASK_DIR, dir))); } catch { /* the directory does not exist yet */ }
  }
  return files.map((file) => readFileSync(file, 'utf8')).join('\n');
}

module.exports = { readAskOrchestratorSources };
