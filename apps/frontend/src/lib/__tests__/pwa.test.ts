/**
 * PWA audit remediation C1 (F8): `registerServiceWorker` bound its work to the
 * window `load` event from inside a React effect. If `load` had already fired —
 * common on client-side navigation and bfcache restores — registration silently
 * never happened. It must register immediately when the document is already
 * complete, and always pass `updateViaCache: 'none'`.
 */

import { registerServiceWorker, isIOSSafari } from '@/lib/pwa';

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
      value: {
        register,
        controller: null,
        ready: Promise.resolve({}),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
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

/**
 * C4 (F9): the "Add to Home Screen" instruction card must only appear in genuine
 * Safari on iOS — not other iOS browsers or in-app web views.
 */
describe('isIOSSafari', () => {
  const setUA = (ua: string) =>
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ua });

  const IPHONE_SAFARI =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const IPHONE_CHROME =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
  const IPHONE_FB_IAB =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]';
  const ANDROID_CHROME =
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

  afterEach(() => setUA(IPHONE_SAFARI));

  it('is true for Safari on iPhone', () => {
    setUA(IPHONE_SAFARI);
    expect(isIOSSafari()).toBe(true);
  });

  it('is false for Chrome on iOS', () => {
    setUA(IPHONE_CHROME);
    expect(isIOSSafari()).toBe(false);
  });

  it('is false inside the Facebook in-app browser', () => {
    setUA(IPHONE_FB_IAB);
    expect(isIOSSafari()).toBe(false);
  });

  it('is false on Android', () => {
    setUA(ANDROID_CHROME);
    expect(isIOSSafari()).toBe(false);
  });
});
