/*
 * ts-node custom transpiler: TypeScript's transpileModule with the output memoised on disk.
 *
 * Why: every test file runs in its own process and each one re-transpiles the same few hundred src files, which is
 * about 8 s of a ~9 s file. Output is keyed by a hash of the source text, file name, compiler options and TypeScript
 * version, so an edited file is never served stale. scripts/run-tests-chunked.js sets TS_NODE_TRANSPILER to this file;
 * set C2C_TS_CACHE=off to bypass, C2C_TS_CACHE_DIR to relocate.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function create({ service: { config }, nodeModuleEmitKind }) {
  const ts = require('typescript');
  const enabled = process.env.C2C_TS_CACHE !== 'off';
  const dir = process.env.C2C_TS_CACHE_DIR || path.join(os.tmpdir(), 'c2c-ts-transpile-cache');
  const compilerOptions = config.options;
  const optionsKey = JSON.stringify([ts.version, nodeModuleEmitKind || '', compilerOptions]);

  return {
    transpile(input, { fileName }) {
      const run = () => ts.transpileModule(input, { fileName, compilerOptions, reportDiagnostics: true });
      if (!enabled) return run();
      const key = crypto.createHash('sha1').update(optionsKey).update('\0').update(fileName).update('\0').update(input).digest('hex');
      const file = path.join(dir, key.slice(0, 2), `${key}.json`);
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* miss */ }
      const result = run();
      if (!result.diagnostics || !result.diagnostics.length) {
        try {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          const tmp = `${file}.${process.pid}.tmp`;
          fs.writeFileSync(tmp, JSON.stringify({ outputText: result.outputText, sourceMapText: result.sourceMapText }));
          fs.renameSync(tmp, file);
        } catch { /* the cache is best-effort */ }
      }
      return result;
    },
  };
}
exports.create = create;
