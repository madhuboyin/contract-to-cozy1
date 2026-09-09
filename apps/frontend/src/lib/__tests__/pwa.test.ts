/**
 * PWA audit remediation C1 (F8): `registerServiceWorker` bound its work to the
 * window `load` event from inside a React effect. If `load` had already fired —
 * common on client-side navigation and bfcache restores — registration silently
 * never happened. It must register immediately when the document is already
 * complete, and always pass `updateViaCache: 'none'`.
 */

import { registerServiceWorker } from '@/lib/pwa';

type ReadyState = DocumentReadyState;

function setReadyState(state: ReadyState) {
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => state,
  });
}

describe('registerServiceWorker', () => {
  let register: jest.Mock;
  let originalServiceWorker: unknown;

  beforeEach(() => {
    register = jest.fn().mockResolvedValue({
      scope: '/',
      installing: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      update: jest.fn(),
    });
    originalServiceWorker = (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, controller: null, ready: Promise.resolve({}) },
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: originalServiceWorker,
    });
    setReadyState('complete');
    jest.restoreAllMocks();
  });

  it('registers immediately when the document has already loaded', async () => {
    setReadyState('complete');

    registerServiceWorker();
    await Promise.resolve();

    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0][1]).toMatchObject({ scope: '/', updateViaCache: 'none' });
  });

  it('defers to the load event when the document is still loading', async () => {
    setReadyState('loading');

    registerServiceWorker();
    await Promise.resolve();
    expect(register).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('load'));
    await Promise.resolve();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('returns a cleanup function that removes the pending load listener', async () => {
    setReadyState('loading');
    const removeSpy = jest.spyOn(window, 'removeEventListener');

    const cleanup = registerServiceWorker();
    cleanup?.();

    window.dispatchEvent(new Event('load'));
    await Promise.resolve();

    expect(removeSpy).toHaveBeenCalledWith('load', expect.any(Function));
    expect(register).not.toHaveBeenCalled();
  });
});
