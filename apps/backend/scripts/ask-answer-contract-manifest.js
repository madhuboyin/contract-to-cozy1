#!/usr/bin/env node
// FR-GATE-1/2: builds the answer-contract manifest for EVERY message-routable operation from the registry and the handler sources. `--write` rewrites the committed manifest; without it the script prints drift and exits 1.
// What the manifest records per operation: the handler file(s) behind its adapter key, the block types the registry allows, the block ids the handler source can emit (literal ids and template prefixes found by a source scan),
// whether a typed answer contract (matches*AnswerContract) exists, and the evidence TIER. The scan is a drift detector only; by FR-GATE-2 it never passes an operation by itself, so a scan-only operation is recorded as such.
require('ts-node/register/transpile-only');
const fs = require('node:fs'); const path = require('node:path');
const root = path.join(__dirname, '..'); const askDir = path.join(root, 'src/services/ask');
const OUT = path.join(askDir, 'answerContract/answerContractManifest.json');
const reg = require(path.join(askDir, 'askOperationRegistry.ts'));

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []));
const files = walk(askDir).filter((f) => !f.includes('/answerContract/'));
const source = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));
const rel = (f) => path.relative(askDir, f);

// adapter key -> files that register a handler for it
const handlerFiles = (key) => [...source].filter(([, text]) => text.includes(`registerCapabilityHandler('${key}'`)).map(([f]) => rel(f)).sort();
// operations that have a typed contract: the semantic validator tests `operationId === 'X' && matches...AnswerContract`
const semantic = source.get(path.join(askDir, 'askSemanticAnswerValidator.ts'));
const typedContracts = new Map(); for (const m of semantic.matchAll(/operationId === '([A-Z0-9_]+)'\s*&&\s*(matches\w+AnswerContract)\(/g)) typedContracts.set(m[1], m[2]);
const { blockIds } = require('./lib/askBlockIdScan');
// Tier evidence a test or declared constant already provides (FR-GATE-2): CODE_PATH_CONTRACT = a conformance test reads the handler against a declared block-id constant.
const CONFORMANCE_TESTED = new Set(['INVENTORY_LOOKUP', 'CAPITAL_RESERVE_PLAN']);

const operations = Object.values(reg.ASK_OPERATION_DEFINITIONS).filter((d) => reg.isAskMessageRoutableOperation(d.operationId)).sort((a, b) => a.operationId.localeCompare(b.operationId)).map((d) => {
  const hf = handlerFiles(d.adapterKey);
  const ids = [...new Set(hf.flatMap((f) => blockIds(source.get(path.join(askDir, f)))))].sort();
  const typed = typedContracts.get(d.operationId) ?? null;
  // For a typed contract, the ids its file declares versus the ids the handler emits: an emitted id the contract does not name is either a variant another validator path accepts (boundary, empty, permission) or a block the
  // contract would withhold. Recording the list means a NEW emitted id changes the manifest and must be looked at, which is the drift that withheld correct roof answers.
  let contract = null;
  if (typed) {
    const cf = files.find((f) => /\/ask[A-Za-z]*Intent\.ts$/.test(f) && source.get(f).includes(`function ${typed}(`));
    const declared = cf ? [...new Set([...source.get(cf).matchAll(/'([a-z0-9][a-z0-9_.:-]*-[a-z0-9_.:-]*)'/g)].map((m) => m[1]))].sort() : [];
    const emitted = ids.map((i) => i.split(':')[1]);
    contract = { file: cf ? rel(cf) : null, declaredIds: declared, emittedNotDeclared: emitted.filter((i) => !declared.includes(i) && !declared.includes(i.replace(/\*$/, ''))).sort(), declaredNeverEmitted: declared.filter((i) => !emitted.some((e) => e === i || (e.endsWith('*') && i.startsWith(e.slice(0, -1))))).sort() };
  }
  const tier = CONFORMANCE_TESTED.has(d.operationId) ? 'CODE_PATH_CONTRACT' : typed ? 'TYPED_CONTRACT_UNTESTED_AGAINST_HANDLER' : 'SOURCE_SCAN_ONLY';
  return { operationId: d.operationId, adapterKey: d.adapterKey, handlerFiles: hf, allowedBlockTypes: [...d.allowedBlockTypes].sort(), emittedBlockIds: ids, typedContract: typed, contract, evidenceTier: tier };
});
// A handler file often serves several operations (and command receipts of operations that are not message-routable), so the block ids scanned from it are attributed to the FILE, not to one operation. `attribution` says which.
const fileUsers = new Map(); for (const o of operations) { const k = o.handlerFiles.join('|'); fileUsers.set(k, (fileUsers.get(k) ?? 0) + 1); }
for (const o of operations) o.attribution = fileUsers.get(o.handlerFiles.join('|')) === 1 ? 'EXCLUSIVE_FILE' : 'SHARED_FILE';
const manifest = { version: 1, generatedBy: 'scripts/ask-answer-contract-manifest.js', operationCount: operations.length, operations };
const text = `${JSON.stringify(manifest, null, 1)}\n`;
if (process.argv.includes('--write')) { fs.writeFileSync(OUT, text); const byTier = {}; for (const o of operations) byTier[o.evidenceTier] = (byTier[o.evidenceTier] ?? 0) + 1; console.log(`wrote ${operations.length} operations`, byTier, `no handler file: ${operations.filter((o) => !o.handlerFiles.length).length}`); }
else { const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''; if (cur !== text) { console.error('answer-contract manifest is out of date: run node scripts/ask-answer-contract-manifest.js --write'); process.exit(1); } console.log('manifest is current'); }
