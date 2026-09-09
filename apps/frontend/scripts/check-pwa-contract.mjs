#!/usr/bin/env node
//
// PWA audit remediation D1 (F12): a browser-free check of the PWA contract so
// regressions in this layer stop being invisible to CI. It validates the
// manifest, the real icon assets (not placeholders), the service-worker offline
// fallback, the registration options, and the supporting config — the parts
// that broke or were faked in the original audit.
//
// `runPwaContractChecks()` is exported for reuse (see
// scripts/sprint3/generate-mobile-qa-matrix.mjs). Run directly to gate CI.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..', '..');

const read = (rel, base = FRONTEND_ROOT) => fs.readFileSync(path.join(base, rel), 'utf8');
const exists = (rel, base = FRONTEND_ROOT) => fs.existsSync(path.join(base, rel));

/** Width/height of a PNG from its IHDR chunk. Returns null if not a PNG. */
function pngDimensions(absPath) {
  const buf = fs.readFileSync(absPath);
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(SIG)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

const MIN_ICON_BYTES = 1024; // the original placeholders were 166 B – 1.9 KB

export function runPwaContractChecks() {
  const failures = [];
  const passed = [];
  const check = (name, ok, detail = '') => {
    (ok ? passed : failures).push(detail ? `${name} — ${detail}` : name);
  };

  // ── manifest ────────────────────────────────────────────────────────────
  let manifest;
  try {
    manifest = JSON.parse(read('public/manifest.json'));
    check('manifest.json parses', true);
  } catch (err) {
    check('manifest.json parses', false, String(err));
    return { passed, failures };
  }

  check('manifest.name', typeof manifest.name === 'string' && manifest.name.length > 0);
  check('manifest.short_name', typeof manifest.short_name === 'string' && manifest.short_name.length > 0);
  check('manifest.start_url', typeof manifest.start_url === 'string' && manifest.start_url.startsWith('/'));
  check('manifest.scope', manifest.scope === '/');
  check('manifest.display standalone', manifest.display === 'standalone');
  check('manifest.id present (stable identity)', typeof manifest.id === 'string' && manifest.id.length > 0);
  check(
    'manifest.display_override',
    Array.isArray(manifest.display_override) && manifest.display_override.includes('standalone'),
  );
  check(
    'manifest.launch_handler',
    manifest.launch_handler != null && typeof manifest.launch_handler.client_mode === 'string',
  );
  check('manifest.theme_color', typeof manifest.theme_color === 'string');
  check('manifest.background_color', typeof manifest.background_color === 'string');

  // ── icons ───────────────────────────────────────────────────────────────
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const anySizes = icons.filter((i) => (i.purpose ?? 'any').split(' ').includes('any'));
  const maskable = icons.filter((i) => (i.purpose ?? '').split(' ').includes('maskable'));
  const hasSize = (list, px) => list.some((i) => i.sizes === `${px}x${px}`);

  check('icons: an "any" icon at 192', hasSize(anySizes, 192));
  check('icons: an "any" icon at 512', hasSize(anySizes, 512));
  check('icons: a dedicated maskable icon', maskable.length > 0);

  for (const icon of icons) {
    const rel = path.join('public', icon.src.replace(/^\//, ''));
    const abs = path.join(FRONTEND_ROOT, rel);
    if (!fs.existsSync(abs)) {
      check(`icon file exists: ${icon.src}`, false);
      continue;
    }
    const dims = pngDimensions(abs);
    if (!dims) {
      check(`icon is a PNG: ${icon.src}`, false);
      continue;
    }
    const [w, h] = icon.sizes.split('x').map(Number);
    check(
      `icon dimensions match ${icon.sizes}: ${icon.src}`,
      dims.width === w && dims.height === h,
      `actual ${dims.width}x${dims.height}`,
    );
    check(
      `icon is not a placeholder: ${icon.src}`,
      dims.bytes >= MIN_ICON_BYTES,
      `${dims.bytes} bytes (min ${MIN_ICON_BYTES})`,
    );
  }

  // apple-touch-icon
  if (exists('public/apple-touch-icon.png')) {
    const dims = pngDimensions(path.join(FRONTEND_ROOT, 'public/apple-touch-icon.png'));
    check('apple-touch-icon is 180x180', dims != null && dims.width === 180 && dims.height === 180);
    check('layout.tsx references apple-touch-icon', /apple-touch-icon\.png/.test(read('src/app/layout.tsx')));
  } else {
    check('public/apple-touch-icon.png exists', false);
  }

  // ── service worker ──────────────────────────────────────────────────────
  const sw = read('public/sw.js');
  check('sw: precaches the offline shell', /cache\.add\(\s*new Request\(\s*OFFLINE_URL/.test(sw));
  check(
    'sw: navigations fall back to the offline shell',
    /request\.mode === 'navigate'/.test(sw) && /caches\.match\(\s*OFFLINE_URL/.test(sw),
  );
  check('sw: never intercepts API calls', /pathname\.startsWith\('\/api\/'\)/.test(sw));
  check('sw: never intercepts RSC requests', /_rsc=/.test(sw));

  // ── offline route ───────────────────────────────────────────────────────
  check('offline route exists', exists('src/app/offline/page.tsx'));
  check("middleware treats /offline as public", /['"]\/offline['"]/.test(read('middleware.ts')));

  // ── registration ────────────────────────────────────────────────────────
  const pwaLib = read('src/lib/pwa.ts');
  check("registration passes updateViaCache: 'none'", /updateViaCache:\s*'none'/.test(pwaLib));
  check(
    'registration runs immediately when the document is already loaded',
    /document\.readyState === 'complete'/.test(pwaLib),
  );

  // ── config ──────────────────────────────────────────────────────────────
  const nextConfig = read('next.config.js');
  check(
    'next.config.js: /sw.js served no-cache',
    /source:\s*'\/sw\.js'[\s\S]{0,400}Cache-Control[\s\S]{0,80}no-cache/.test(nextConfig),
  );

  const securityHeaders = read('security-headers.js');
  check('Permissions-Policy: camera not fully disabled', !/camera=\(\)/.test(securityHeaders));
  check('Permissions-Policy: camera allowed for self', /camera=\(self\)/.test(securityHeaders));

  return { passed, failures };
}

// ── CLI ───────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const { passed, failures } = runPwaContractChecks();
  for (const name of passed) console.log(`  ok   ${name}`);
  for (const name of failures) console.error(`  FAIL ${name}`);
  console.log(
    `\n[check-pwa-contract] ${passed.length} passed, ${failures.length} failed` +
      ` (repo: ${path.relative(process.cwd(), REPO_ROOT) || '.'})`,
  );
  process.exit(failures.length > 0 ? 1 : 0);
}
