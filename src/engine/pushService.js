/**
 * ChaletWeShare — Push Service
 * Client-side Web Push subscription & service worker manager.
 */

class PushService {
  constructor() {
    this.registration = null;
    this.publicKey = null;
  }

  isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  getPermission() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'default', 'granted', 'denied'
  }

  async initServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;

    try {
      this.registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'PUSH_RECEIVED') {
          window.dispatchEvent(new CustomEvent('chaletPushReceived', { detail: event.data.data }));
        }
      });

      return this.registration;
    } catch (err) {
      console.warn('Service Worker registration failed:', err);
      return null;
    }
  }

  async getPublicKey() {
    if (this.publicKey) return this.publicKey;
    try {
      const res = await fetch('./api/push.php?action=get_public_key');
      const data = await res.json();
      if (data && data.success && data.publicKey) {
        this.publicKey = data.publicKey;
        return this.publicKey;
      }
    } catch (err) {
      console.warn('Could not fetch VAPID public key:', err);
    }
    return null;
  }

  async isSubscribed() {
    if (!this.isSupported()) return false;
    try {
      const reg = this.registration || (await navigator.serviceWorker.ready);
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch (e) {
      return false;
    }
  }

  async subscribe(user) {
    if (!this.isSupported()) {
      if (this.isIOS() && !this.isStandalone()) {
        return { success: false, error: 'Auf dem iPhone müssen Sie die App zuerst zum Home-Bildschirm hinzufügen (Teilen > Zum Home-Bildschirm), um Mitteilungen zu aktivieren.' };
      }
      return { success: false, error: 'Web Push wird von diesem Browser nicht unterstützt.' };
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { success: false, error: 'Mitteilungs-Berechtigung wurde abgelehnt.' };
      }

      const reg = this.registration || (await navigator.serviceWorker.ready);
      const pubKey = await this.getPublicKey();

      let subscription = null;
      if (pubKey) {
        const convertedVapidKey = this.urlBase64ToUint8Array(pubKey);
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });

        // Register with backend
        const regRes = await fetch('./api/push.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'subscribe',
            user_id: user.id,
            sync_token: user.sync_token,
            subscription: subscription.toJSON(),
          }),
        });
        const regData = await regRes.json();
        if (!regData || !regData.success) {
          throw new Error(regData?.error || 'Subscription konnte nicht auf dem Server gespeichert werden.');
        }
      } else {
        // Fallback for local testing without VAPID configured
        console.info('VAPID key not configured on server. In-browser notifications will be used.');
      }

      return { success: true, subscription };
    } catch (err) {
      console.error('Push subscription failed:', err);
      return { success: false, error: err.message };
    }
  }

  async unsubscribe(user) {
    if (!this.isSupported()) return { success: true };

    try {
      const reg = this.registration || (await navigator.serviceWorker.ready);
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();

        await fetch('./api/push.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'unsubscribe',
            user_id: user.id,
            sync_token: user.sync_token,
            endpoint: endpoint,
          }),
        });
      }
      return { success: true };
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
      return { success: false, error: err.message };
    }
  }

  async sendTestNotification(user) {
    if (this.getPermission() !== 'granted') {
      const res = await this.subscribe(user);
      if (!res.success) return res;
    }

    try {
      // 1. Try server-side push
      const pubKey = await this.getPublicKey();
      if (pubKey) {
        const res = await fetch('./api/push.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'test_push',
            user_id: user.id,
            sync_token: user.sync_token,
          }),
        });
        const data = await res.json();
        if (data.success && data.sent) {
            return { success: true, method: 'server' };
        } else {
            return { success: false, error: data.error || 'Server-Push fehlgeschlagen. VAPID oder Backend inkorrekt.' };
        }
      }

      // 2. Direct browser notification fallback (only if VAPID not configured)
      if (this.registration) {
        await this.registration.showNotification('ChaletWeShare', {
          body: 'Lokale Test-Mitteilung: Push-Mitteilungen sind aktiv! Tippe hier für Profil.',
          icon: './app-icon-192-v2.png',
          badge: './app-icon-192-v2.png',
          data: { type: 'test', route: '#/profile' }
        });
        return { success: true, method: 'local' };
      } else {
        new Notification('ChaletWeShare', {
          body: 'Lokale Test-Mitteilung: Push-Mitteilungen sind aktiv! Tippe hier für Profil.',
          data: { type: 'test', route: '#/profile' }
        });
        return { success: true, method: 'local' };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

export const pushService = new PushService();
