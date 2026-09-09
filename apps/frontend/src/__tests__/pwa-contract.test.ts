/**
 * PWA audit remediation D1 (F12): the PWA layer used to be invisible to the
 * test suite. This runs the browser-free contract checker (manifest, real icon
 * assets, service-worker offline fallback, registration options, headers) so a
 * regression fails `npm test`, not just `qa:gates`.
 */

import { execFileSync } from 'child_process';
import { join } from 'path';

const SCRIPT = join(process.cwd(), 'scripts', 'check-pwa-contract.mjs');

describe('PWA contract', () => {
  it('passes the automated PWA contract checks', () => {
    let output = '';
    let exitCode = 0;
    try {
      output = execFileSync('node', [SCRIPT], { encoding: 'utf8' });
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      exitCode = e.status ?? 1;
      output = `${e.stdout ?? ''}\n${e.stderr ?? ''}`;
    }

    if (exitCode !== 0) {
      // Surface the failing checks in the test output.
      throw new Error(`check-pwa-contract.mjs exited ${exitCode}:\n${output}`);
    }
    expect(output).toMatch(/\d+ passed, 0 failed/);
  });
});
