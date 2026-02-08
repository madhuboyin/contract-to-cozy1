// apps/frontend/src/lib/pwa.ts

/**
 * Register the service worker for PWA functionality.
 * Returns a cleanup function that clears the update interval.
 */
export function registerServiceWorker(): (() => void) | undefined {
  if (typeof window === 'undefined') return undefined;

  if (!('serviceWorker' in navigator)) {
    console.log('Service workers not supported');
    return undefined;
  }

  let intervalId: ReturnType<typeof setInterval> | undefined;

  const onLoad = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      console.log('Service Worker registered:', registration.scope);

      // Check for updates every hour
      intervalId = setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);

      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            if (window.confirm('A new version is available. Reload to update?')) {
              window.location.reload();
            }
          }
        });
      });

    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  };

  window.addEventListener('load', onLoad, { once: true });

  return () => {
    if (intervalId !== undefined) clearInterval(intervalId);
    window.removeEventListener('load', onLoad);
  };
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