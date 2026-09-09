/**
 * C5 (F10): the web app manifest was missing identity and launch metadata.
 * This locks in the fields an installed PWA needs so they can't quietly
 * regress. The manifest is authored by hand at public/manifest.json.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), 'public/manifest.json'), 'utf8'),
) as Record<string, unknown>;

describe('public/manifest.json', () => {
  it('declares a stable id independent of start_url', () => {
    expect(typeof manifest.id).toBe('string');
    expect(manifest.id).toBe('/?source=pwa');
  });

  it('launches the dashboard with a PWA attribution parameter', () => {
    expect(manifest.start_url).toBe('/dashboard?source=pwa');
    expect(manifest.scope).toBe('/');
  });

  it('offers a browser-controls display fallback', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.display_override).toEqual(['standalone', 'minimal-ui']);
  });

  it('reuses an existing window on launch', () => {
    expect(manifest.launch_handler).toEqual({ client_mode: 'navigate-existing' });
  });

  it('still ships an installable icon set with a dedicated maskable icon', () => {
    const icons = manifest.icons as Array<{ sizes: string; purpose: string }>;
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });
});
