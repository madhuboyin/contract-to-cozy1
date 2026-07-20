#!/usr/bin/env node

/**
 * Worker-safe import boundary lint check (W4 item 7).
 *
 * Every prior W3 slice that added a new apps/workers/src import reaching
 * into apps/backend/src broke `docker build` at least once with a TS2307
 * "Cannot find module" error, because infrastructure/docker/workers/Dockerfile
 * copies a hand-curated list of backend source files into the image and
 * rewrites their (and the workers files') import paths with `sed` — a new
 * import has no automatic coverage. See the
 * feedback_workers_docker_curated_copy_list memory entry.
 *
 * This does NOT run a real Docker build. It parses the same Dockerfile the
 * build uses and checks two things:
 *
 *   1. Every apps/workers/src file's import that reaches into `backend/src`
 *      has a matching `RUN sed -i 's/<pattern>/.../g' <this file>` rule in
 *      the Dockerfile — i.e. the Dockerfile actually knows to rewrite it.
 *   2. Every backend source file the Dockerfile's `COPY` instructions
 *      reference still exists on disk (catches a copied file being
 *      renamed/deleted without updating the Dockerfile).
 *
 * Known gap (documented, not silently swept under the rug): a backend file
 * that IS already copied into the image (e.g. diyAiGuide.service.ts,
 * permitFetch.service.ts, RiskAssessment.service.ts) can itself gain a NEW
 * backend-reaching import — this script does not trace into those files'
 * own imports. When editing one of the Dockerfile's copied backend files,
 * manually verify new imports resolve inside the copied tree (see the W4
 * slice-1 memory entry for the exact manual-check pattern used there).
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

function parseDockerfileSedRules(text) {
  const rules = []; // { file, pattern, replacement }
  for (const instr of joinContinuations(text)) {
    if (!instr.includes('sed -i')) continue;
    for (const part of instr.split('&&')) {
      // Pattern/replacement bodies contain escaped slashes (`\/`, from
      // escaped path separators like `\.\.\/backend\/src`) — `(?:\\.|[^/])*`
      // treats each `\<char>` pair as a unit so an escaped slash doesn't
      // prematurely end the match at sed's own `/` delimiter.
      const m = part.match(/sed -i\s+'s\/((?:\\.|[^/])*)\/((?:\\.|[^/])*)\/g'\s+(.+)$/);
      if (!m) continue;
      const [, rawPattern, rawReplacement, filesStr] = m;
      // sed's pattern/replacement bodies here always escape both regex
      // metacharacters (`.`) and the delimiter (`/`) with a backslash —
      // unescape any `\<char>` pair back to its literal char so this can
      // be plain-substring-matched against a real (unescaped) import spec.
      const pattern = rawPattern.replace(/\\(.)/g, '$1');
      const replacement = rawReplacement.replace(/\\(.)/g, '$1');
      for (const file of filesStr.trim().split(/\s+/)) {
        if (file) rules.push({ file, pattern, replacement });
      }
    }
  }
  return rules;
}

// COPY <src...> <dst> — we only care about `apps/backend/src/...` sources,
// to check they still exist on disk.
function parseDockerfileBackendCopySources(text) {
  const sources = [];
  for (const instr of joinContinuations(text)) {
    if (!instr.trim().startsWith('COPY ')) continue;
    const parts = instr.trim().slice('COPY '.length).trim().split(/\s+/);
    if (parts.length < 2) continue;
    const srcs = parts.slice(0, -1);
    for (const src of srcs) {
      if (src.startsWith('apps/backend/src/')) sources.push(src);
    }
  }
  return sources;
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
function findImportViolationsFromSources(entries, rulesByFile) {
  const violations = [];
  for (const { relFile, source } of entries) {
    const specs = importsFromSource(source);
    const fileRules = rulesByFile.get(relFile) || [];

    for (const spec of specs) {
      if (!spec.includes('backend/src')) continue;
      const covered = fileRules.some((rule) => spec.includes(rule.pattern));
      if (!covered) violations.push({ file: relFile, spec });
    }
  }
  return violations;
}

function findImportViolations(files, rulesByFile) {
  const entries = files.map((file) => ({
    relFile: 'src/' + path.relative(SRC_ROOT, file).split(path.sep).join('/'),
    source: fs.readFileSync(file, 'utf8'),
  }));
  return findImportViolationsFromSources(entries, rulesByFile);
}

function findMissingCopySources(copySources) {
  return copySources.filter((src) => !fs.existsSync(path.join(REPO_ROOT, src)));
}

if (require.main === module) {
  const dockerfileText = fs.readFileSync(DOCKERFILE_PATH, 'utf8');
  const sedRules = parseDockerfileSedRules(dockerfileText);
  const rulesByFile = new Map();
  for (const rule of sedRules) {
    if (!rulesByFile.has(rule.file)) rulesByFile.set(rule.file, []);
    rulesByFile.get(rule.file).push(rule);
  }
  const copySources = parseDockerfileBackendCopySources(dockerfileText);

  const files = collectTsFiles(SRC_ROOT);
  const importViolations = findImportViolations(files, rulesByFile);
  const missingCopySources = findMissingCopySources(copySources);

  if (importViolations.length > 0 || missingCopySources.length > 0) {
    console.error('[worker-import-boundary] FAIL');
    if (importViolations.length > 0) {
      console.error('\nbackend-source imports with no matching Dockerfile sed rewrite rule');
      console.error('(these will break `docker build` with a TS2307 "Cannot find module" error):');
      for (const v of importViolations) {
        console.error(`  - ${v.file}: import '${v.spec}'`);
      }
      console.error(
        "\nFix: add a `RUN sed -i 's/<escaped old import>/<escaped new import>/g' <this file>` line to\n" +
        'infrastructure/docker/workers/Dockerfile (and a matching `COPY` line for the target backend\n' +
        'file, if it is not already copied). See feedback_workers_docker_curated_copy_list for the pattern.'
      );
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
    `${sedRules.length} Dockerfile sed rules and ${copySources.length} backend COPY sources`,
  );
}

module.exports = {
  collectTsFiles,
  joinContinuations,
  parseDockerfileSedRules,
  parseDockerfileBackendCopySources,
  importsFromSource,
  findImportViolations,
  findImportViolationsFromSources,
  findMissingCopySources,
  SRC_ROOT,
  DOCKERFILE_PATH,
};
