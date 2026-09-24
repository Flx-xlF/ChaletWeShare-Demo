/**
 * ChaletWeShare — Main Entrypoint & Router
 */

import './index.css';
import { profileManager } from './engine/profileManager.js';
import { renderAuthGate } from './components/authGate.js';
import { renderProfilePicker } from './components/profilePicker.js';
import { renderAvatarMarkup } from './data/avatars.js';
import { PixelCalendar, PixelStats, PixelProfile, PixelBell, PixelCheck, PixelCancel, PixelSwan, PixelHandshake, PixelHome, PixelWarning, PixelChat, PixelInfo } from './data/pixelIcons.js';
import { CalendarScreen } from './screens/calendar.js';
import { StatsScreen } from './screens/stats.js';
import { NotificationBadge } from './components/notificationBadge.js';
import { ChatHubBadge } from './components/chatHubBadge.js';
import { openLegendSheet } from './components/legendSheet.js';
import { pushService } from './engine/pushService.js';
import { reservationStore } from './engine/reservationStore.js';
import { reservationEngine } from './engine/reservationEngine.js';
import { formatDateFriendly } from './utils/dateUtils.js';
import { isStandalone, hasDismissedPwaPrompt, hasDismissedQuickTour, hasCompletedPwaTour, markPwaTourCompleted, resetQuickTour } from './utils/pwaUtils.js';
import { openPwaPrompt } from './components/pwaPrompt.js';
import { openQuickTour } from './components/quickTourPrompt.js';
import { openNotificationPrompt, hasDismissedNotifPrompt } from './components/notificationPrompt.js';
import { openReportModal } from './components/reportModal.js';
import { escapeHtml } from './utils/htmlUtils.js';
import { notificationToast } from './components/notificationToast.js';
import { confirmDialog } from './components/confirmDialog.js';

const app = document.getElementById('app');
let currentNotifBadge = null;
let currentChatHubBadge = null;
let currentCalendarScreen = null;

/**
 * Reliably navigates to the calendar screen (if not already there)
 * and executes an action callback once currentCalendarScreen is ready.
 * Completely eliminates race conditions when opening reservations/chats from other screens (e.g. #/profile).
 * @param {Function} actionFn - async (calendarScreen) => void
 */
export async function navigateToCalendarWithAction(actionFn) {
  const hash = window.location.hash || '#/';
  if (hash !== '#/' && hash !== '') {
    window.location.hash = '#/';
  }

  // Poll for currentCalendarScreen with a 3s timeout
  const start = Date.now();
  while (!currentCalendarScreen && (Date.now() - start < 3000)) {
    await new Promise((resolve) => setTimeout(resolve, 30));
  }

  if (currentCalendarScreen && typeof actionFn === 'function') {
    try {
      await actionFn(currentCalendarScreen);
    } catch (err) {
      console.error('Error executing action on calendar screen:', err);
    }
  }
}
window.navigateToCalendarWithAction = navigateToCalendarWithAction;


/* ─────────────────────────────────────────────
   PWA Auto-Update: Version Polling
   ───────────────────────────────────────────── */
(function initVersionCheck() {
  // __APP_VERSION__ is injected by Vite at build time.
  // During dev mode it won't exist, so we skip.
  if (typeof __APP_VERSION__ === 'undefined') return;

  const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  const currentVersion = __APP_VERSION__;

  async function checkForUpdate() {
    try {
      // Cache-bust the fetch so we always get the latest version.json
      const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();

      if (data.version && data.version !== currentVersion) {
        console.log(`[Update] New version detected: ${data.version} (current: ${currentVersion}). Reloading…`);

        // Unregister the service worker so the next load gets fresh assets
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            await reg.unregister();
          }
        }

        // Clear all caches
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          for (const name of cacheNames) {
            await caches.delete(name);
          }
        }

        // Hard reload — bypasses bfcache on most browsers
        window.location.reload();
      }
    } catch (err) {
      // Silently ignore — the user is likely offline
    }
  }

  // Periodic polling
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);

  // Also check when the tab regains focus (handles users who keep the PWA open)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForUpdate();
    }
  });
})();

function init() {
  if (currentNotifBadge) {
    currentNotifBadge.stopPolling();
    currentNotifBadge = null;
  }
  if (currentChatHubBadge) {
    currentChatHubBadge.destroy();
    currentChatHubBadge = null;
  }
  if (currentCalendarScreen) {
    currentCalendarScreen.destroy();
    currentCalendarScreen = null;
  }

  // Clean up any legacy pairing URL parameters if present
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('p') || url.searchParams.has('s') || url.searchParams.has('g')) {
      url.searchParams.delete('p');
      url.searchParams.delete('s');
      url.searchParams.delete('g');
      window.history.replaceState({}, '', url.toString());
    }
  } catch (e) {
    // Ignore URL cleanup errors
  }

  if (!profileManager.isGateUnlocked()) {
    renderAuthGate(app, () => init());
    return;
  }

  const activeProfile = profileManager.getActiveProfile();
  if (!activeProfile) {
    renderProfilePicker(app, () => {
      init();
    });
    return;
  }

  // Initialize service worker
  pushService.initServiceWorker();

  // Deep-link from push notification clicks
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
        const payload = event.data.data || {};
        if (payload.reservation_id) {
          navigateToCalendarWithAction((cal) => cal.openReservation(payload.reservation_id));
        } else if (payload.date) {
          navigateToCalendarWithAction((cal) => cal.openDate(payload.date));
        } else if (payload.maintenance_id) {
          navigateToCalendarWithAction(async (cal) => {
            const m = reservationStore.maintenanceBlocks?.find(b => b.id == payload.maintenance_id);
            if (m && (m.dateStart || m.date_start)) {
              await cal.openDate(m.dateStart || m.date_start);
            }
          });
        }
      }
    });
  }

  renderAppShell(activeProfile);
  checkPromptsFlow(activeProfile);
}

function checkNotificationPrompt(user, onClosed) {
  const perm = pushService.getPermission();
  if (perm !== 'granted' && perm !== 'unsupported' && !hasDismissedNotifPrompt()) {
    setTimeout(() => {
      openNotificationPrompt({
        user,
        onClose: () => {
          if (typeof onClosed === 'function') onClosed();
        }
      });
    }, 300);
    return true;
  }
  return false;
}

function checkPromptsFlow(user) {
  if (isStandalone()) {
    // When running in PWA (installed instance), automatically trigger QuickTour if this PWA instance
    // hasn't completed it yet. The user is prompted to allow notifications directly on Step 3/3!
    if (!hasCompletedPwaTour()) {
      setTimeout(() => {
        openQuickTour({
          user,
          onClose: () => {
            markPwaTourCompleted();
          }
        });
      }, 400);
    }
  } else if (!hasDismissedPwaPrompt()) {
    setTimeout(() => {
      openPwaPrompt({
        onClose: () => {
          checkNotificationPrompt(user);
        }
      });
    }, 400);
  } else {
    checkNotificationPrompt(user);
  }
}

function renderAppShell(user) {
  if (currentNotifBadge) {
    currentNotifBadge.stopPolling();
    currentNotifBadge = null;
  }
  if (currentChatHubBadge) {
    currentChatHubBadge.destroy();
    currentChatHubBadge = null;
  }

  app.innerHTML = `
    <header class="app-header-pill">
      <h1 class="sr-only">Chalet Alpenrose — Ferienhaus Kalender & Buchung</h1>
      <div class="app-header-pill__title" aria-hidden="true">
        <span>CHALET</span>
        <span class="app-header-pill__badge">ALPENROSE</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div id="header-chat-hub-container"></div>
        <div id="header-legend-container"></div>
        <div id="header-notif-container"></div>
      </div>
    </header>

    <main class="app-content" id="main-content">
      <!-- Active screen mounted here -->
    </main>

    <nav class="app-nav" aria-label="Hauptnavigation">
      <a href="#/" id="nav-item-calendar" class="app-nav__item is-active" aria-current="page">
        <span class="app-nav__icon">${PixelCalendar}</span>
        <span>Kalender</span>
      </a>
      <a href="#/stats" id="nav-item-stats" class="app-nav__item">
        <span class="app-nav__icon">${PixelStats}</span>
        <span>Statistik</span>
      </a>
      <a href="#/profile" id="nav-item-profile" class="app-nav__item">
        <span class="app-nav__icon">${PixelProfile}</span>
        <span>Profil</span>
      </a>
    </nav>
    <div id="global-overlays"></div>
  `;

  // Mount chat and conflict hub badge
  const chatHubContainer = app.querySelector('#header-chat-hub-container');
  if (chatHubContainer) {
    currentChatHubBadge = new ChatHubBadge(chatHubContainer, user, {
      onConflictClick: async (reservationId) => {
        await navigateToCalendarWithAction((cal) => cal.openReservation(reservationId));
      },
      onChatClick: async (dateStr, meta) => {
        await navigateToCalendarWithAction(async (cal) => {
          if (meta && meta.type === 'reservation' && meta.targetId) {
            await cal.openReservation(meta.targetId);
          } else if (dateStr) {
            await cal.openDate(dateStr);
          }
        });
      }
    });
    currentChatHubBadge.render();
  }

  // Mount notification badge
  const notifContainer = app.querySelector('#header-notif-container');
  if (notifContainer) {
    currentNotifBadge = new NotificationBadge(notifContainer, user, {
      onNotificationClick: async (target) => {
        await navigateToCalendarWithAction(async (cal) => {
          if (typeof target === 'object' && target !== null) {
            if (target.reservationId) {
              await cal.openReservation(target.reservationId);
            } else if (target.date) {
              await cal.openDate(target.date);
            }
          } else if (target) {
            await cal.openReservation(target);
          }
        });
      }
    });
    currentNotifBadge.render();
  }

  // Mount calendar legend / info button
  const legendContainer = app.querySelector('#header-legend-container');
  if (legendContainer) {
    legendContainer.innerHTML = `
      <button type="button" id="btn-header-legend" class="notif-badge-btn" title="Kalender-Legende & Erklärung" aria-label="Kalender-Legende & Erklärung">
        <span class="notif-badge-btn__icon" style="display: flex; align-items: center; justify-content: center; color: var(--color-text);">${PixelInfo}</span>
      </button>
    `;
    legendContainer.querySelector('#btn-header-legend').addEventListener('click', () => {
      openLegendSheet({ user });
    });
  }

  // Handle routing
  function handleRoute() {
    const hash = window.location.hash || '#/';
    const contentEl = app.querySelector('#main-content');

    // Update nav active classes & aria-current
    app.querySelectorAll('.app-nav__item').forEach((item) => {
      item.classList.remove('is-active');
      item.removeAttribute('aria-current');
    });

    if (hash === '#/stats') {
      const navItem = app.querySelector('#nav-item-stats');
      if (navItem) {
        navItem.classList.add('is-active');
        navItem.setAttribute('aria-current', 'page');
      }
      renderStatsScreen(contentEl, user);
    } else if (hash === '#/profile') {
      const navItem = app.querySelector('#nav-item-profile');
      if (navItem) {
        navItem.classList.add('is-active');
        navItem.setAttribute('aria-current', 'page');
      }
      renderProfileScreen(contentEl, user);
    } else {
      const navItem = app.querySelector('#nav-item-calendar');
      if (navItem) {
        navItem.classList.add('is-active');
        navItem.setAttribute('aria-current', 'page');
      }
      renderCalendarScreen(contentEl, user);
    }
  }

  window.removeEventListener('hashchange', handleRoute);
  window.addEventListener('hashchange', handleRoute);

  handleRoute();

  // Handle deep-link from push notification (cold start via sw.js openWindow)
  const startupHash = window.location.hash;
  if (startupHash.startsWith('#/reservation/')) {
    const resId = startupHash.replace('#/reservation/', '');
    navigateToCalendarWithAction((cal) => cal.openReservation(resId));
  } else if (startupHash.startsWith('#/date/')) {
    const date = startupHash.replace('#/date/', '');
    navigateToCalendarWithAction((cal) => cal.openDate(date));
  }
}

function renderCalendarScreen(mountEl, user) {
  if (currentCalendarScreen) {
    currentCalendarScreen.destroy();
  }
  currentCalendarScreen = new CalendarScreen(mountEl);
  currentCalendarScreen.render();
}

function renderStatsScreen(mountEl, user) {
  if (currentCalendarScreen) {
    currentCalendarScreen.destroy();
    currentCalendarScreen = null;
  }
  const statsScreen = new StatsScreen(mountEl, user);
  statsScreen.render();
}

function renderProfileScreen(mountEl, user) {
  if (currentCalendarScreen) {
    currentCalendarScreen.destroy();
    currentCalendarScreen = null;
  }

  // Ensure any orphaned profile modal is closed
  const existingModal = document.getElementById('profile-modal-container');
  if (existingModal) {
    existingModal.style.display = 'none';
    existingModal.innerHTML = '';
  }

  const isSupported = pushService.isSupported();

  // Ensure a valid sync token is always available (auto-provision if missing or malformed)
  let storedToken = profileManager.getStoredToken(user.profile_id) || user.sync_token;
  if (!storedToken || storedToken.length < 6) {
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    profileManager.saveStoredToken(user.profile_id, randomHex);
    storedToken = randomHex;
    user.sync_token = randomHex;
    profileManager.setActiveProfile(user);

    // Sync generated token to backend in background
    profileManager.resetSyncToken(user.profile_id, '', randomHex).catch(err => {
      console.warn('[Profile] Background token auto-provision sync:', err);
    });
  }
  let syncCode = storedToken.substring(0, 6).toUpperCase();

  mountEl.innerHTML = `
    <div class="profile-screen" style="display: flex; flex-direction: column; gap: 14px; padding-bottom: 24px;">
      <!-- Identity & Quick Profile Switch -->
      <div class="card" style="display: flex; flex-direction: column; gap: 14px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          ${renderAvatarMarkup(user.avatar, 60)}
          <div style="min-width: 0;">
            <h2 style="font-size: 1.25rem; margin-bottom: 2px;">${escapeHtml(user.name)}</h2>
            <span style="font-size: 0.76rem; color: var(--color-text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em;">
              ID: ${escapeHtml(user.profile_id || 'LOCAL')}
            </span>
          </div>
        </div>
        <button id="btn-switch-user" class="btn btn--block btn--black" style="font-size: 0.82rem; padding: 10px 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span>${PixelProfile}</span>
          <span>Profil wechseln / Anderes Profil wählen</span>
        </button>
      </div>

      <!-- Settings Group: Geräte & Sync -->
      <div class="settings-group">
        <div class="settings-group__title">Geräte & Synchronisation</div>
        <div class="settings-list">
          <button class="settings-row" id="row-pairing" type="button">
            <div class="settings-row__left">
              <span class="settings-row__icon">${PixelHandshake}</span>
              <div class="settings-row__title-wrap">
                <span class="settings-row__label">Neues Gerät koppeln</span>
                <span class="settings-row__subtitle">6-stelliger Koppel-Code</span>
              </div>
            </div>
            <div class="settings-row__right">
              <span id="row-pairing-badge" class="settings-row__badge" style="font-family: var(--font-mono);">${syncCode}</span>
              <span class="settings-row__chevron">›</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Settings Group: App & Benachrichtigungen -->
      <div class="settings-group">
        <div class="settings-group__title">App & Benachrichtigungen</div>
        <div class="settings-list">
          <button class="settings-row" id="row-push" type="button">
            <div class="settings-row__left">
              <span class="settings-row__icon">${PixelBell}</span>
              <div class="settings-row__title-wrap">
                <span class="settings-row__label">Push-Mitteilungen</span>
                <span class="settings-row__subtitle">Sofortige Meldungen auf Handy</span>
              </div>
            </div>
            <div class="settings-row__right">
              <span id="row-push-badge" class="settings-row__badge settings-row__badge--muted">Lade...</span>
              <span class="settings-row__chevron">›</span>
            </div>
          </button>

          <button class="settings-row" id="row-pwa" type="button">
            <div class="settings-row__left">
              <span class="settings-row__icon">${PixelHome}</span>
              <div class="settings-row__title-wrap">
                <span class="settings-row__label">App installieren (PWA)</span>
                <span class="settings-row__subtitle">Homescreen-Anleitung</span>
              </div>
            </div>
            <div class="settings-row__right">
              <span class="settings-row__chevron">›</span>
            </div>
          </button>

          <button class="settings-row" id="row-tour" type="button">
            <div class="settings-row__left">
              <span class="settings-row__icon">${PixelCalendar}</span>
              <div class="settings-row__title-wrap">
                <span class="settings-row__label">App-Tour starten</span>
                <span class="settings-row__subtitle">Funktionen im Überblick</span>
              </div>
            </div>
            <div class="settings-row__right">
              <span class="settings-row__chevron">›</span>
            </div>
          </button>

          <button class="settings-row" id="row-report-bug" type="button">
            <div class="settings-row__left">
              <span class="settings-row__icon" style="color: var(--color-accent);">${PixelWarning}</span>
              <div class="settings-row__title-wrap">
                <span class="settings-row__label">Problem melden</span>
                <span class="settings-row__subtitle">Fehler oder Feedback an Entwickler</span>
              </div>
            </div>
            <div class="settings-row__right">
              <span class="settings-row__chevron">›</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Settings Group: Gefahrenzone -->
      <div class="settings-group">
        <div class="settings-group__title" style="color: var(--color-danger);">Gefahrenzone</div>
        <div class="settings-list">
          <button class="settings-row settings-row--danger" id="row-delete-profile" type="button">
            <div class="settings-row__left">
              <span class="settings-row__icon">${PixelCancel}</span>
              <div class="settings-row__title-wrap">
                <span class="settings-row__label">Eigenes Profil löschen</span>
                <span class="settings-row__subtitle">Profil unwiderruflich entfernen</span>
              </div>
            </div>
            <div class="settings-row__right">
              <span class="settings-row__chevron">›</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Footer Branding -->
      <div style="text-align: center; margin-top: 32px; margin-bottom: 16px; font-size: 0.72rem; color: var(--color-text-muted); font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.8;">
        Built with love and a bit of madness by <a href="https://github.com/Flx-xlF" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline; text-underline-offset: 3px; font-weight: 600;">schema/f</a>
      </div>
    </div>
  `;

  // --- Modal Management Helper ---
  let modalContainer = document.getElementById('profile-modal-container');
  if (!modalContainer) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'profile-modal-container';
    modalContainer.className = 'bottom-sheet-backdrop modal-backdrop';
    modalContainer.setAttribute('role', 'dialog');
    modalContainer.setAttribute('aria-modal', 'true');
    modalContainer.setAttribute('aria-label', 'Einstellungen & Details');
    modalContainer.style.display = 'none';
    const containerEl = document.getElementById('global-overlays') || document.body;
    containerEl.appendChild(modalContainer);
  }

  function closeModal() {
    if (modalContainer) {
      modalContainer.style.display = 'none';
      modalContainer.innerHTML = '';
    }
  }

  modalContainer.addEventListener('click', (e) => {
    if (e.target === modalContainer) {
      closeModal();
    }
  });

  function showModal(contentHtml, setupListeners) {
    modalContainer.innerHTML = contentHtml;
    modalContainer.style.display = 'flex';
    const closeBtn = modalContainer.querySelector('#modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }
    if (setupListeners) {
      setupListeners(modalContainer);
    }
  }

  // --- Profile Switch Handler ---
  mountEl.querySelector('#btn-switch-user').addEventListener('click', () => {
    closeModal();
    if (currentNotifBadge) currentNotifBadge.stopPolling();
    profileManager.clearActiveProfile();
    renderProfilePicker(app, () => init(), { forceRoster: true });
  });

  // --- Row: Pairing Modal ---
  const rowPairing = mountEl.querySelector('#row-pairing');
  const rowPairingBadge = mountEl.querySelector('#row-pairing-badge');

  rowPairing.addEventListener('click', () => {
    const modalHtml = `
      <div class="bottom-sheet" style="max-height: 85vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: var(--border); padding-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: var(--color-accent);">${PixelHandshake}</span>
            <h3 style="font-size: 1rem; font-weight: 800; text-transform: uppercase;">Neues Gerät koppeln</h3>
          </div>
          <button id="modal-close-btn" class="btn btn--icon" style="border: none; background: transparent; padding: 4px; cursor: pointer;" title="Schliessen">
            ${PixelCancel}
          </button>
        </div>

        <p style="font-size: 0.82rem; color: var(--color-text-muted); line-height: 1.45;">
          Gib diesen 6-stelligen Koppel-Code auf deinem neuen Smartphone oder Tablet ein, um dein Profil zu verknüpfen:
        </p>

        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--color-surface); border: var(--border-thick); padding: 12px 16px; box-shadow: var(--shadow-brutal-sm);">
          <span id="modal-sync-code-display" style="font-family: var(--font-mono); font-size: 1.6rem; font-weight: 800; letter-spacing: 0.15em; color: var(--color-accent);">${syncCode}</span>
          <button id="modal-btn-copy-sync" class="btn btn--sm" style="font-size: 0.78rem; padding: 6px 12px;" title="Code kopieren">
            Kopieren
          </button>
        </div>
        <span id="modal-copy-feedback" style="font-size: 0.78rem; color: var(--color-accent); font-weight: 700; display: none; align-items: center; gap: 4px;">${PixelCheck} Code in Zwischenablage kopiert!</span>

        <div style="background: var(--color-bg); border: var(--border); padding: 10px 12px; font-size: 0.78rem; color: var(--color-text-muted); line-height: 1.45;">
          <strong>So geht's:</strong> Öffne ChaletWeShare auf deinem Zweitgerät, gib das Familienpasswort ein und wähle <em>"Bestehendes Profil koppeln"</em>.
        </div>

        <div style="border-top: var(--border); padding-top: 14px; margin-top: 4px;">
          <button id="modal-btn-reset-sync" class="btn btn--sm btn--block" style="font-size: 0.76rem; padding: 8px 10px; opacity: 0.85;">
            Neuen Code generieren (Andere Geräte abmelden)
          </button>
        </div>
      </div>
    `;

    showModal(modalHtml, (container) => {
      const btnCopy = container.querySelector('#modal-btn-copy-sync');
      const copyFeedback = container.querySelector('#modal-copy-feedback');
      if (btnCopy) {
        btnCopy.addEventListener('click', () => {
          navigator.clipboard.writeText(syncCode);
          if (copyFeedback) {
            copyFeedback.style.display = 'inline-flex';
            setTimeout(() => {
              copyFeedback.style.display = 'none';
            }, 3000);
          }
        });
      }

      const btnReset = container.querySelector('#modal-btn-reset-sync');
      if (btnReset) {
        btnReset.addEventListener('click', async () => {
          const confirmMsg = 'Möchtest du wirklich einen neuen Koppel-Code generieren?\n\nAlle anderen Geräte, die bisher mit diesem Profil gekoppelt waren, werden abgemeldet und müssen mit dem neuen Code erneut gekoppelt werden.';
          if (!(await confirmDialog({
            title: 'Neuen Code generieren',
            message: confirmMsg,
            confirmLabel: 'Neuen Code generieren',
            isDanger: true
          }))) return;

          btnReset.disabled = true;
          btnReset.textContent = 'Generieren...';
          const token = profileManager.getStoredToken(user.profile_id) || user.sync_token;
          const res = await profileManager.resetSyncToken(user.profile_id, token);
          if (res.success) {
            syncCode = res.sync_code;
            const codeDisplay = container.querySelector('#modal-sync-code-display');
            if (codeDisplay) codeDisplay.textContent = res.sync_code;
            if (rowPairingBadge) rowPairingBadge.textContent = res.sync_code;
            notificationToast.show('Erfolg', 'Neuer Koppel-Code erfolgreich generiert! Andere Geräte wurden abgemeldet.');
          } else {
            notificationToast.showError('Fehler', res.error || 'Fehler beim Generieren des neuen Codes.', 'Profil / Kopplung');
          }
          btnReset.disabled = false;
          btnReset.textContent = 'Neuen Code generieren (Andere Geräte abmelden)';
        });
      }
    });
  });

  // --- Row: Push Notifications Modal & Status ---
  const rowPush = mountEl.querySelector('#row-push');
  const rowPushBadge = mountEl.querySelector('#row-push-badge');

  async function updatePushStatusUI(modalContainerRef = null) {
    if (!isSupported) {
      if (rowPushBadge) {
        rowPushBadge.textContent = 'Nicht unterstützt';
        rowPushBadge.className = 'settings-row__badge settings-row__badge--muted';
      }
      if (modalContainerRef) {
        const badge = modalContainerRef.querySelector('#modal-push-status-badge');
        const btnToggle = modalContainerRef.querySelector('#modal-btn-toggle-push');
        if (badge) badge.textContent = 'Browser nicht unterstützt';
        if (btnToggle) {
          btnToggle.disabled = true;
          btnToggle.textContent = 'Nicht verfügbar';
        }
      }
      return;
    }

    const isSub = await pushService.isSubscribed();
    if (isSub) {
      if (rowPushBadge) {
        rowPushBadge.textContent = 'Aktiv';
        rowPushBadge.className = 'settings-row__badge settings-row__badge--active';
      }
      if (modalContainerRef) {
        const badge = modalContainerRef.querySelector('#modal-push-status-badge');
        const btnToggle = modalContainerRef.querySelector('#modal-btn-toggle-push');
        if (badge) {
          badge.innerHTML = `${PixelCheck} Aktiviert`;
          badge.className = 'settings-row__badge settings-row__badge--active';
        }
        if (btnToggle) {
          btnToggle.disabled = false;
          btnToggle.textContent = 'Mitteilungen ausschalten';
          btnToggle.className = 'btn btn--outline btn--block';
        }
      }
    } else {
      const perm = pushService.getPermission();
      const isDenied = perm === 'denied';
      if (rowPushBadge) {
        rowPushBadge.textContent = isDenied ? 'Blockiert' : 'Deaktiviert';
        rowPushBadge.className = 'settings-row__badge settings-row__badge--muted';
      }
      if (modalContainerRef) {
        const badge = modalContainerRef.querySelector('#modal-push-status-badge');
        const btnToggle = modalContainerRef.querySelector('#modal-btn-toggle-push');
        if (badge) {
          badge.innerHTML = isDenied ? `${PixelCancel} Im Browser blockiert` : 'Nicht aktiviert';
          badge.className = 'settings-row__badge settings-row__badge--muted';
        }
        if (btnToggle) {
          btnToggle.disabled = false;
          btnToggle.textContent = 'Mitteilungen aktivieren';
          btnToggle.className = 'btn btn--primary btn--block';
        }
      }
    }
  }

  // Initial push status badge update
  updatePushStatusUI();

  rowPush.addEventListener('click', () => {
    const modalHtml = `
      <div class="bottom-sheet" style="max-height: 85vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: var(--border); padding-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: var(--color-accent);">${PixelBell}</span>
            <h3 style="font-size: 1rem; font-weight: 800; text-transform: uppercase;">Push-Mitteilungen</h3>
          </div>
          <button id="modal-close-btn" class="btn btn--icon" style="border: none; background: transparent; padding: 4px; cursor: pointer;" title="Schliessen">
            ${PixelCancel}
          </button>
        </div>

        <p style="font-size: 0.82rem; color: var(--color-text-muted); line-height: 1.45;">
          Erhalte Mitteilungen auf deinem Smartphone bei neuen Reservationen, Veto-Ereignissen und Terminkonflikten.
        </p>

        <div style="display: flex; align-items: center; justify-content: space-between; background: var(--color-surface); border: var(--border); padding: 10px 14px; box-shadow: var(--shadow-brutal-sm);">
          <span style="font-size: 0.82rem; font-weight: 700;">Status auf diesem Gerät:</span>
          <span id="modal-push-status-badge" class="settings-row__badge">Lade...</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 8px;">
          <button id="modal-btn-toggle-push" class="btn btn--primary btn--block" style="font-size: 0.82rem; padding: 10px 14px; min-height: 42px;" disabled>
            Lade...
          </button>
          <button id="modal-btn-test-push" class="btn btn--black btn--block" style="font-size: 0.82rem; padding: 10px 14px; min-height: 42px;">
            Test-Mitteilung senden
          </button>
        </div>
      </div>
    `;

    showModal(modalHtml, (container) => {
      updatePushStatusUI(container);

      const btnToggle = container.querySelector('#modal-btn-toggle-push');
      const btnTest = container.querySelector('#modal-btn-test-push');

      if (btnToggle) {
        btnToggle.addEventListener('click', async () => {
          btnToggle.disabled = true;
          const isSub = await pushService.isSubscribed();
          if (isSub) {
            await pushService.unsubscribe(user);
          } else {
            const res = await pushService.subscribe(user);
            if (!res.success) {
              notificationToast.showError('Fehler', res.error || 'Fehler beim Aktivieren der Mitteilungen.', 'Profil / Kopplung');
            }
          }
          await updatePushStatusUI(container);
          btnToggle.disabled = false;
        });
      }

      if (btnTest) {
        btnTest.addEventListener('click', async () => {
          btnTest.disabled = true;
          const res = await pushService.sendTestNotification(user);
          if (res.success) {
            notificationToast.show('Erfolg', 'Test-Mitteilung gesendet!');
          } else {
            notificationToast.showError('Fehler', res.error || 'Test-Mitteilung konnte nicht gesendet werden.', 'Profil / Kopplung');
          }
          btnTest.disabled = false;
        });
      }
    });
  });

  // --- Row: PWA Guide ---
  mountEl.querySelector('#row-pwa').addEventListener('click', () => {
    closeModal();
    openPwaPrompt();
  });

  // --- Row: App Tour ---
  mountEl.querySelector('#row-tour').addEventListener('click', () => {
    closeModal();
    openQuickTour();
  });

  // --- Row: Bug Report ---
  mountEl.querySelector('#row-report-bug').addEventListener('click', () => {
    closeModal();
    openReportModal();
  });

  // --- Row: Delete Profile (Danger Zone) ---
  mountEl.querySelector('#row-delete-profile').addEventListener('click', async () => {
    const confirmMsg = `Möchtest du dein Profil "${user.name}" wirklich endgültig löschen?\n\nDeine bisherigen Buchungen bleiben im Chalet-Kalender erhalten, aber dein Zugang wird gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`;
    if (!(await confirmDialog({
      title: 'Profil löschen',
      message: confirmMsg,
      confirmLabel: 'Endgültig löschen',
      isDanger: true
    }))) return;

    const rowDel = mountEl.querySelector('#row-delete-profile');
    if (rowDel) rowDel.disabled = true;

    const token = profileManager.getStoredToken(user.profile_id) || user.sync_token;
    const res = await profileManager.deleteProfile(user.profile_id, token);
    if (res.success) {
      if (currentNotifBadge) currentNotifBadge.stopPolling();
      if (currentChatHubBadge) currentChatHubBadge.destroy();
      notificationToast.show('Profil gelöscht', 'Dein Profil wurde gelöscht.');
      location.reload();
    } else {
      notificationToast.showError('Fehler', res.error || 'Fehler beim Löschen des Profils.', 'Profil / Kopplung');
      if (rowDel) rowDel.disabled = false;
    }
  });
}

// Start application
init();

