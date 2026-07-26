#!/usr/bin/env node

/**
 * Worker-safe import boundary lint check (W4 item 7 / W5 items 1-4).
 *
 * Every apps/workers/src file that reaches into backend source now does so
 * through the `@worker-shared/*` alias (apps/workers/tsconfig.json) rather
 * than a `../../../backend/src/...`-style relative path. Locally that alias
 * resolves straight to the live sibling apps/backend/src, so it always
 * "just works" in dev/tests. The Docker build is different: it resolves
 * the same alias (tsconfig.docker.json) against a hand-curated COPY'd
 * mirror at src/shared/backend/... — so a new `@worker-shared/X` import
 * with no matching `COPY .../X.ts src/shared/backend/.../` line still
 * breaks `docker build` with a TS2307 "Cannot find module" error, exactly
 * like the old sed-rewrite mechanism this replaced (W5 removed the ~70
 * hand-maintained `sed -i` rules; the COPY-list itself is unchanged and
 * still needs this check). See feedback_workers_docker_curated_copy_list.
 *
 * This does NOT run a real Docker build. It parses the same Dockerfile the
 * build uses and checks:
 *
 *   1. Every apps/workers/src file's `@worker-shared/X` import has a
 *      matching Dockerfile `COPY` instruction that lands a file at the
 *      corresponding src/shared/backend/X(.ts) path in the image.
 *   2. Every relative import inside a copied backend module resolves to
 *      another module available in the assembled shared tree. This catches
 *      the otherwise Docker-only TS2307 failure where a copied file gains a
 *      new `./sibling` dependency but the sibling is omitted from COPY.
 *   3. Every backend source file the Dockerfile's `COPY` instructions
 *      reference still exists on disk (catches a copied file being
 *      renamed/deleted without updating the Dockerfile).
 */

const fs = require('fs');
const path = require('path');

const WORKERS_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WORKERS_ROOT, '..', '..');
const SRC_ROOT = path.join(WORKERS_ROOT, 'src');
const DOCKERFILE_PATH = path.join(REPO_ROOT, 'infrastructure/docker/workers/Dockerfile');

function collectTsFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(full, out);
      continue;
    }
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

// Joins Dockerfile backslash-continued lines into single logical
// instructions, the way Docker's own line joiner does — including
// silently dropping comment-only lines inside a continuation, which is a
// real gotcha documented in this project's Dockerfile-simulation notes.
function joinContinuations(text) {
  const lines = text.split('\n');
  const joined = [];
  let buf = '';
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (buf) {
      if (line.trim().startsWith('#')) continue;
      buf += ' ' + line.trim();
    } else {
      buf = line;
    }
    if (buf.trimEnd().endsWith('\\')) {
      buf = buf.trimEnd().slice(0, -1);
    } else {
      joined.push(buf);
      buf = '';
    }
  }
  if (buf) joined.push(buf);
  return joined;
}

// COPY <src...> <dst> instructions. Multiple sources always mean dst is a
// directory (Docker's own COPY semantics); a single source may target
// either a directory (dst ends with '/') or a renamed single file (a stub
// swap, e.g. stubs/job-queue-service.ts -> .../JobQueue.service.ts).
function parseDockerfileCopyRules(text) {
  const rules = [];
  for (const instr of joinContinuations(text)) {
    const trimmed = instr.trim();
    if (!trimmed.startsWith('COPY ')) continue;
    let rest = trimmed.slice('COPY '.length).trim();
    if (rest.startsWith('--from=')) continue; // stage-to-stage copies, not source-tree copies
    const parts = rest.split(/\s+/);
    if (parts.length < 2) continue;
    const dest = parts[parts.length - 1];
    const sources = parts.slice(0, -1);
    rules.push({ sources, dest });
  }
  return rules;
}

// Backend source files referenced by any COPY instruction (for the
// still-exists-on-disk check).
function parseDockerfileBackendCopySources(text) {
  const sources = [];
  for (const { sources: srcs } of parseDockerfileCopyRules(text)) {
    for (const src of srcs) {
      if (src.startsWith('apps/backend/src/')) sources.push(src);
    }
  }
  return sources;
}

// Every module path actually available under src/shared/... in the built
// image, e.g. "src/shared/backend/config/workerJobRegistry".
function resolveAvailableSharedModules(copyRules) {
  const available = new Set();
  for (const { sources, dest } of copyRules) {
    if (!dest.startsWith('src/shared/')) continue;
    const destIsDir = dest.endsWith('/') || sources.length > 1;
    if (destIsDir) {
      const destDir = dest.endsWith('/') ? dest.slice(0, -1) : dest;
      for (const src of sources) {
        const base = path.basename(src).replace(/\.ts$/, '');
        available.add(`${destDir}/${base}`);
      }
    } else {
      available.add(dest.replace(/\.ts$/, ''));
    }
  }
  return available;
}

function importsFromSource(source) {
  const specs = [];
  const re = /(?:from|require\()\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source))) specs.push(m[1]);
  return specs;
}

// Takes pre-read { relFile, source } entries rather than doing its own
// filesystem I/O, so the matching logic itself (the part worth testing) can
// be exercised with synthetic fixtures instead of real files.
function findImportViolationsFromSources(entries, availableSharedModules) {
  const violations = [];
  for (const { relFile, source } of entries) {
    const specs = importsFromSource(source);
    for (const spec of specs) {
      if (!spec.startsWith('@worker-shared/')) continue;
      const modulePath = 'src/shared/backend/' + spec.slice('@worker-shared/'.length);
      if (!availableSharedModules.has(modulePath)) {
        violations.push({ file: relFile, spec });
      }
    }
  }
  return violations;
}

function findImportViolations(files, availableSharedModules) {
  const entries = files.map((file) => ({
    relFile: 'src/' + path.relative(SRC_ROOT, file).split(path.sep).join('/'),
    source: fs.readFileSync(file, 'utf8'),
  }));
  return findImportViolationsFromSources(entries, availableSharedModules);
}

function copiedSharedSourceEntries(copyRules) {
  const entries = [];
  for (const { sources, dest } of copyRules) {
    if (!dest.startsWith('src/shared/')) continue;
    const destIsDir = dest.endsWith('/') || sources.length > 1;
    const destDir = dest.endsWith('/') ? dest.slice(0, -1) : dest;
    for (const sourceFile of sources) {
      if (!sourceFile.endsWith('.ts')) continue;
      const imageFile = destIsDir
        ? `${destDir}/${path.basename(sourceFile)}`
        : dest;
      const absoluteSource = path.join(REPO_ROOT, sourceFile);
      if (!fs.existsSync(absoluteSource)) continue;
      entries.push({
        sourceFile,
        imageFile,
        source: fs.readFileSync(absoluteSource, 'utf8'),
      });
    }
  }
  return entries;
}

function findCopiedRelativeImportViolationsFromSources(
  entries,
  availableSharedModules,
) {
  const violations = [];
  for (const { sourceFile, imageFile, source } of entries) {
    for (const spec of importsFromSource(source)) {
      if (!spec.startsWith('.')) continue;
      const resolved = path.posix
        .normalize(path.posix.join(path.posix.dirname(imageFile), spec))
        .replace(/\.(?:js|ts)$/, '');
      if (
        !availableSharedModules.has(resolved) &&
        !availableSharedModules.has(`${resolved}/index`)
      ) {
        violations.push({ file: sourceFile, spec, expectedImageModule: resolved });
      }
    }
  }
  return violations;
}

function findMissingCopySources(copySources) {
  return copySources.filter((src) => !fs.existsSync(path.join(REPO_ROOT, src)));
}

if (require.main === module) {
  const dockerfileText = fs.readFileSync(DOCKERFILE_PATH, 'utf8');
  const copyRules = parseDockerfileCopyRules(dockerfileText);
  const availableSharedModules = resolveAvailableSharedModules(copyRules);
  const copySources = parseDockerfileBackendCopySources(dockerfileText);

  const files = collectTsFiles(SRC_ROOT);
  const importViolations = findImportViolations(files, availableSharedModules);
  const copiedRelativeImportViolations =
    findCopiedRelativeImportViolationsFromSources(
      copiedSharedSourceEntries(copyRules),
      availableSharedModules,
    );
  const missingCopySources = findMissingCopySources(copySources);

  if (
    importViolations.length > 0 ||
    copiedRelativeImportViolations.length > 0 ||
    missingCopySources.length > 0
  ) {
    console.error('[worker-import-boundary] FAIL');
    if (importViolations.length > 0) {
      console.error('\n@worker-shared imports with no matching Dockerfile COPY destination');
      console.error('(these will break `docker build` with a TS2307 "Cannot find module" error):');
      for (const v of importViolations) {
        console.error(`  - ${v.file}: import '${v.spec}'`);
      }
      console.error(
        '\nFix: add a `COPY apps/backend/src/<path>.ts src/shared/backend/<path>/` line to\n' +
        'infrastructure/docker/workers/Dockerfile so the alias resolves inside the image too.\n' +
        'See feedback_workers_docker_curated_copy_list for the pattern.'
      );
    }
    if (copiedRelativeImportViolations.length > 0) {
      console.error(
        '\nCopied backend modules with unresolved relative imports',
      );
      console.error(
        '(these compile locally but fail after Docker assembles src/shared/backend):',
      );
      for (const violation of copiedRelativeImportViolations) {
        console.error(
          `  - ${violation.file}: import '${violation.spec}' ` +
          `(expected ${violation.expectedImageModule})`,
        );
      }
    }
    if (missingCopySources.length > 0) {
      console.error('\nDockerfile COPY instructions reference backend source files that no longer exist:');
      for (const src of missingCopySources) {
        console.error(`  - ${src}`);
      }
    }
    process.exit(1);
  }

  console.log(
    `[worker-import-boundary] PASS: validated ${files.length} TypeScript files against ` +
    `${availableSharedModules.size} available @worker-shared modules and ${copySources.length} backend COPY sources`,
  );
}

module.exports = {
  collectTsFiles,
  joinContinuations,
  parseDockerfileCopyRules,
  parseDockerfileBackendCopySources,
  resolveAvailableSharedModules,
  copiedSharedSourceEntries,
  importsFromSource,
  findImportViolations,
  findImportViolationsFromSources,
  findCopiedRelativeImportViolationsFromSources,
  findMissingCopySources,
  SRC_ROOT,
  DOCKERFILE_PATH,
};
