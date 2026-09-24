/**
 * ChaletWeShare — PWA Utilities
 * Standalone detection, platform identification, install prompts & dismissal persistence.
 */

const STORAGE_KEY_DISMISSED = 'chalet_pwa_prompt_dismissed';
const STORAGE_KEY_QUICKTOUR = 'chalet_quicktour_dismissed';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let deferredInstallPrompt = null;

// Capture beforeinstallprompt event if supported by browser (e.g. Chrome on Android/Desktop)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });
}

/**
 * Checks if the app is currently running in standalone PWA mode
 * @returns {boolean}
 */
export function isStandalone() {
  if (typeof window === 'undefined') return false;

  if (window.__TEST_STANDALONE__) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('standalone') === '1' || params.get('mode') === 'standalone') return true;
  } catch (e) {}

  const isStandaloneMedia = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  const isIosStandalone = window.navigator && window.navigator.standalone === true;
  const isAndroidReferrer = document.referrer && document.referrer.startsWith('android-app://');

  return Boolean(isStandaloneMedia || isIosStandalone || isAndroidReferrer);
}

/**
 * Detects user operating platform ('ios' | 'android' | 'desktop')
 * @returns {'ios'|'android'|'desktop'}
 */
export function detectPlatform() {
  if (typeof window === 'undefined' || !window.navigator) return 'desktop';

  const ua = window.navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';

  const isAndroid = /Android/i.test(ua);
  if (isAndroid) return 'android';

  return 'desktop';
}

/**
 * Checks if the user has dismissed the PWA prompt within the cooldown window
 * @returns {boolean}
 */
export function hasDismissedPwaPrompt() {
  if (typeof localStorage === 'undefined') return false;

  const val = localStorage.getItem(STORAGE_KEY_DISMISSED);
  if (!val) return false;

  if (val === 'never') return true;

  const timestamp = parseInt(val, 10);
  if (!isNaN(timestamp)) {
    return Date.now() - timestamp < COOLDOWN_MS;
  }

  return false;
}

/**
 * Record user dismissal of the PWA prompt
 * @param {boolean} [neverShowAgain=false]
 */
export function dismissPwaPrompt(neverShowAgain = false) {
  if (typeof localStorage === 'undefined') return;

  if (neverShowAgain) {
    localStorage.setItem(STORAGE_KEY_DISMISSED, 'never');
  } else {
    localStorage.setItem(STORAGE_KEY_DISMISSED, Date.now().toString());
  }
}

/**
 * Trigger native browser install prompt if available
 * @returns {Promise<boolean>} whether user accepted
 */
export async function triggerNativeInstall() {
  if (!deferredInstallPrompt) return false;

  try {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return choice && choice.outcome === 'accepted';
  } catch (e) {
    return false;
  }
}

/**
 * Check if native deferred install prompt is available
 * @returns {boolean}
 */
export function canNativeInstall() {
  return Boolean(deferredInstallPrompt);
}

/**
 * Reset prompt dismissal (useful for testing or profile switches)
 */
export function resetPwaPrompt() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_DISMISSED);
  }
}

const STORAGE_KEY_PWA_TOUR = 'chalet_pwa_standalone_tour_completed';

/**
 * Checks if the user has completed or dismissed the PWA quick tour
 * @returns {boolean}
 */
export function hasDismissedQuickTour() {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY_QUICKTOUR) === 'true';
}

/**
 * Persist quick tour dismissal
 */
export function dismissQuickTour() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_QUICKTOUR, 'true');
  }
}

/**
 * Checks if the PWA standalone instance tour has been completed
 * @returns {boolean}
 */
export function hasCompletedPwaTour() {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY_PWA_TOUR) === 'true';
}

/**
 * Mark the PWA standalone tour as completed
 */
export function markPwaTourCompleted() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_PWA_TOUR, 'true');
    localStorage.setItem(STORAGE_KEY_QUICKTOUR, 'true');
  }
}

/**
 * Reset quick tour status (for replay or testing)
 */
export function resetQuickTour() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_QUICKTOUR);
    localStorage.removeItem(STORAGE_KEY_PWA_TOUR);
  }
}
