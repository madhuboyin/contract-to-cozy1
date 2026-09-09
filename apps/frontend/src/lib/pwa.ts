// apps/frontend/src/lib/pwa.ts

/**
 * Dispatched on `window` when a newly installed service worker is waiting to
 * take over. ServiceWorkerUpdatePrompt listens for it and shows a toast.
 */
export const SW_UPDATE_READY_EVENT = 'ctc:sw-update-ready';

// Set when the user accepts the "Update available" toast. The controllerchange
// listener in registerServiceWorker() reloads the page once — but only when the
// user asked for it, never on a first-ever SW activation.
let updateAcceptedByUser = false;
let reloadingForUpdate = false;

/**
 * Register the service worker for PWA functionality.
 * Returns a cleanup function that clears the update interval.
 */
function isTrustedTypesServiceWorkerError(error: unknown): boolean {
  return error instanceof TypeError && error.message.includes('TrustedScriptURL');
}

function buildServiceWorkerUrl(): string | unknown {
  const serviceWorkerUrl = new URL('/sw.js', window.location.origin).toString();
  const trustedTypesApi = (window as Window & {
    trustedTypes?: {
      createPolicy?: (
        name: string,
        rules: { createScriptURL: (input: string) => string }
      ) => { createScriptURL: (input: string) => unknown };
    };
  }).trustedTypes;

  if (!trustedTypesApi?.createPolicy) {
    return serviceWorkerUrl;
  }

  try {
    const policy = trustedTypesApi.createPolicy('ctc-service-worker', {
      createScriptURL: (input) => input,
    });
    return policy.createScriptURL(serviceWorkerUrl);
  } catch {
    return serviceWorkerUrl;
  }
}

export function registerServiceWorker(): (() => void) | undefined {
  if (typeof window === 'undefined') return undefined;

  if (!('serviceWorker' in navigator)) {
    console.log('Service workers not supported');
    return undefined;
  }

  let intervalId: ReturnType<typeof setInterval> | undefined;
  let swRegistration: ServiceWorkerRegistration | undefined;
  let updateFoundHandler: (() => void) | undefined;
  let loadListenerAttached = false;

  // Reload once the accepted update actually takes control. Guarded so a
  // first-ever activation (no prior controller) never triggers a reload.
  const onControllerChange = () => {
    if (updateAcceptedByUser && !reloadingForUpdate) {
      reloadingForUpdate = true;
      window.location.reload();
    }
  };
  const canWatchController =
    typeof navigator.serviceWorker.addEventListener === 'function';
  if (canWatchController) {
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  }

  const registerAndWatch = async () => {
    try {
      swRegistration = await navigator.serviceWorker.register(buildServiceWorkerUrl() as string, {
        scope: '/',
        // Always revalidate sw.js itself against the network so a deploy is
        // picked up promptly instead of served from the HTTP cache.
        updateViaCache: 'none',
      });

      console.log('Service Worker registered:', swRegistration.scope);

      // Check for updates every hour
      intervalId = setInterval(() => {
        swRegistration!.update();
      }, 60 * 60 * 1000);

      // Handle updates — when a new worker finishes installing while an old one
      // still controls the page, announce it with a non-blocking event. A React
      // listener (ServiceWorkerUpdatePrompt) turns that into a dismissible
      // "Reload to update" toast instead of a blocking window.confirm().
      updateFoundHandler = () => {
        const newWorker = swRegistration!.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent(SW_UPDATE_READY_EVENT));
          }
        });
      };
      swRegistration.addEventListener('updatefound', updateFoundHandler);

    } catch (error) {
      if (isTrustedTypesServiceWorkerError(error)) {
        console.warn('Service Worker registration skipped: Trusted Types requires a TrustedScriptURL.');
        return;
      }
      console.error('Service Worker registration failed:', error);
    }
  };

  // If the page has already finished loading by the time this runs — common
  // after client-side navigation or a bfcache restore — the 'load' event will
  // never fire again, so register immediately. Otherwise wait for 'load' to
  // keep the SW off the critical path of the first paint.
  if (document.readyState === 'complete') {
    void registerAndWatch();
  } else {
    window.addEventListener('load', registerAndWatch, { once: true });
    loadListenerAttached = true;
  }

  return () => {
    if (intervalId !== undefined) clearInterval(intervalId);
    if (swRegistration && updateFoundHandler) {
      swRegistration.removeEventListener('updatefound', updateFoundHandler);
    }
    if (loadListenerAttached) {
      window.removeEventListener('load', registerAndWatch);
    }
    if (canWatchController) {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    }
  };
}

/**
 * Called when the user accepts the "Update available" toast. Tells the waiting
 * service worker to activate; the `controllerchange` listener installed by
 * registerServiceWorker() then reloads the page exactly once. Falls back to a
 * plain reload when there is no waiting worker or the SW API is unavailable.
 */
export async function applyServiceWorkerUpdate(): Promise<void> {
  if (typeof window === 'undefined') return;

  updateAcceptedByUser = true;

  if (!('serviceWorker' in navigator)) {
    window.location.reload();
    return;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.waiting) {
      registration.waiting.postMessage('SKIP_WAITING');
      return; // onControllerChange reloads once the new worker takes over
    }
  } catch {
    // fall through to a plain reload
  }

  window.location.reload();
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.log('Notifications not supported');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission;
  }

  return Notification.permission;
}

/**
 * Show a local notification
 */
export async function showNotification(title: string, options?: NotificationOptions) {
  const permission = await requestNotificationPermission();
  
  if (permission !== 'granted') {
    console.log('Notification permission denied');
    return;
  }

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      vibrate: [200, 100, 200],
      ...options
    } as NotificationOptions & { vibrate?: number[] });
  } else {
    new Notification(title, options);
  }
}

/**
 * Check if app is installed as PWA
 */
export function isPWA(): boolean {
  if (typeof window === 'undefined') return false;
  
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

/**
 * Get install prompt event.
 * Listens for the beforeinstallprompt event and resolves with it,
 * or resolves with null after 3 seconds. Cleans up the listener in both cases.
 */
export function getInstallPrompt(): Promise<any> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }

    let settled = false;

    const handler = (e: Event) => {
      e.preventDefault();
      if (!settled) {
        settled = true;
        window.removeEventListener('beforeinstallprompt', handler);
        resolve(e);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Timeout after 3 seconds
    setTimeout(() => {
      if (!settled) {
        settled = true;
        window.removeEventListener('beforeinstallprompt', handler);
        resolve(null);
      }
    }, 3000);
  });
}

/**
 * Check if device is iOS
 */
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

/**
 * Check if device is Android
 */
export function isAndroid(): boolean {
  if (typeof window === 'undefined') return false;

  return /android/i.test(navigator.userAgent);
}

/**
 * True only for genuine Safari on iOS — the one context where the
 * "Share → Add to Home Screen" instructions actually apply. Excludes other
 * iOS browsers (Chrome/Firefox/Edge, which cannot add PWAs from that menu)
 * and in-app web views (Facebook, Instagram, etc., which have no such option).
 */
export function isIOSSafari(): boolean {
  if (!isIOS()) return false;

  const ua = navigator.userAgent;

  // Other iOS browsers inject their own token.
  if (/CriOS|FxiOS|EdgiOS|OPiOS|mercury|GSA\//.test(ua)) return false;

  // Real Safari always carries a "Safari" token; most in-app web views drop it.
  if (!/Safari/.test(ua)) return false;

  // Known in-app browser signatures.
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|LinkedInApp|Snapchat|Pinterest|MicroMessenger/.test(ua)) {
    return false;
  }

  return true;
}
