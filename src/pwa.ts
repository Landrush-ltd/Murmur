import { registerSW } from 'virtual:pwa-register';

// ─── Service Worker Registration ─────────────────────────────────────────────

let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

export function initPWA(): void {
  updateSW = registerSW({
    onNeedRefresh() {
      // A new service worker is waiting. We use the auto-update strategy,
      // so apply the update silently.
      updateSW?.(true);
    },
    onOfflineReady() {
      console.info('[Murmur] App is ready to work offline.');
    },
    onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      // Poll for updates every 60 minutes while the page is open
      if (registration) {
        setInterval(
          () => {
            void registration.update();
          },
          60 * 60 * 1000,
        );
      }
    },
  });
}

// ─── Storage Persistence ─────────────────────────────────────────────────────

export async function requestStoragePersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) {
    return false;
  }

  const already = await navigator.storage.persisted();

  if (already) {
    return true;
  }

  return navigator.storage.persist();
}

// ─── Install Prompt ──────────────────────────────────────────────────────────

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<(canInstall: boolean) => void>();

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event as BeforeInstallPromptEvent;
  installListeners.forEach((cb) => cb(true));
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installListeners.forEach((cb) => cb(false));
});

export function onInstallAvailable(callback: (canInstall: boolean) => void): () => void {
  installListeners.add(callback);

  // Fire immediately if prompt is already available
  if (deferredInstallPrompt) {
    callback(true);
  }

  return () => installListeners.delete(callback);
}

export async function triggerInstallPrompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredInstallPrompt) {
    return 'unavailable';
  }

  await deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installListeners.forEach((cb) => cb(false));

  return outcome;
}

export function isRunningAsPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator &&
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}
