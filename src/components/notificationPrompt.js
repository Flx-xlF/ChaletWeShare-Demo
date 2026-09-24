/**
 * ChaletWeShare — Notification Permission Prompt Modal
 * Prompts users to enable browser notifications or explains how to unblock them.
 * Strict Bauhaus Aesthetic.
 */

import { pushService } from '../engine/pushService.js';
import { detectPlatform } from '../utils/pwaUtils.js';
import { PixelBell, PixelClock, PixelChat, PixelHome, PixelLock, PixelWarning, PixelCheck, PixelCancel } from '../data/pixelIcons.js';

const STORAGE_KEY_NOTIF_DISMISSED = 'chalet_notif_prompt_dismissed';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Check if the user has dismissed the notification prompt within cooldown
 * @returns {boolean}
 */
export function hasDismissedNotifPrompt() {
  if (typeof localStorage === 'undefined') return false;

  const val = localStorage.getItem(STORAGE_KEY_NOTIF_DISMISSED);
  if (!val) return false;

  if (val === 'never') return true;

  const timestamp = parseInt(val, 10);
  if (!isNaN(timestamp)) {
    return Date.now() - timestamp < COOLDOWN_MS;
  }

  return false;
}

/**
 * Record user dismissal of notification prompt
 * @param {boolean} [neverShowAgain=false]
 */
export function dismissNotifPrompt(neverShowAgain = false) {
  if (typeof localStorage === 'undefined') return;

  if (neverShowAgain) {
    localStorage.setItem(STORAGE_KEY_NOTIF_DISMISSED, 'never');
  } else {
    localStorage.setItem(STORAGE_KEY_NOTIF_DISMISSED, Date.now().toString());
  }
}

/**
 * Reset notification prompt dismissal
 */
export function resetNotifPrompt() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_NOTIF_DISMISSED);
  }
}

/**
 * Open the Notification prompt modal
 * @param {Object} options
 * @param {Object} options.user - Current user profile
 * @param {HTMLElement} [options.container] - Modal container element
 * @param {Function} [options.onClose] - Callback when modal is closed
 */
export function openNotificationPrompt({ user, container, onClose } = {}) {
  let modalEl = container;
  let createdContainer = false;

  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'notif-prompt-modal-container';
    modalEl.className = 'bottom-sheet-backdrop modal-backdrop';
    const containerEl = document.getElementById('global-overlays') || document.body;
    containerEl.appendChild(modalEl);
    createdContainer = true;
  }

  let activePlatform = detectPlatform(); // 'ios' | 'android' | 'desktop'
  let permState = pushService.getPermission(); // 'default' | 'denied' | 'granted' | 'unsupported'
  let isActivating = false;
  let activationError = null;

  function render() {
    const isDenied = permState === 'denied';
    const isIos = activePlatform === 'ios';
    const isAndroid = activePlatform === 'android';
    const isDesktop = activePlatform === 'desktop';
    const isIosSafari = pushService.isIOS() && !pushService.isStandalone();

    modalEl.style.display = 'flex';
    modalEl.innerHTML = `
      <div class="bottom-sheet notif-prompt-sheet" id="notif-sheet-content" style="max-height: 90vh; overflow-y: auto;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: var(--border); padding-bottom: 8px;">
          <div>
            <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--color-accent); letter-spacing: 0.04em; display: flex; align-items: center; gap: 4px;">
              ${PixelBell} Mitteilungen
            </span>
            <h3 style="margin-top: 2px;">${isDenied ? 'Mitteilungen freischalten' : 'Mitteilungen erlauben'}</h3>
          </div>
          <button id="notif-prompt-close-btn" class="btn btn--icon btn--sm" aria-label="Schliessen">${PixelCancel}</button>
        </div>

        </div>

        ${
          isIosSafari
            ? `
          <!-- iOS Safari PWA Install Banner -->
          <div class="card" style="background: #FFF0F5; border: 2px solid var(--color-accent); padding: 10px 12px; margin-top: 10px; font-size: 0.85rem; line-height: 1.4;">
            <div style="font-weight: 800; margin-bottom: 2px; display: flex; align-items: center; gap: 6px; color: var(--color-text);">
              ${PixelBell} <strong>Zum Home-Bildschirm hinzufügen</strong>
            </div>
            Auf dem iPhone / iPad werden Web-Mitteilungen nur unterstützt, wenn du die App installierst.
          </div>

          <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
            <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF;">
              <div style="display: flex; gap: 10px; align-items: flex-start;">
                <span style="font-family: var(--font-mono); font-weight: 900; font-size: 0.85rem; background: var(--color-text); color: #FFF; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">1</span>
                <div>
                  <div style="font-weight: 800; font-size: 0.88rem;">Teilen-Menü öffnen</div>
                  <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                    Tippe unten im Safari-Browser auf das <strong>Teilen-Symbol (Viereck mit Pfeil)</strong>.
                  </div>
                </div>
              </div>
            </div>

            <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF;">
              <div style="display: flex; gap: 10px; align-items: flex-start;">
                <span style="font-family: var(--font-mono); font-weight: 900; font-size: 0.85rem; background: var(--color-text); color: #FFF; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">2</span>
                <div>
                  <div style="font-weight: 800; font-size: 0.88rem;">Zum Home-Bildschirm</div>
                  <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                    Wähle <strong>«Zum Home-Bildschirm»</strong> aus dem Menü aus und öffne die App danach von dort.
                  </div>
                </div>
              </div>
            </div>
          </div>
        `
            : isDenied
            ? `
          <!-- Blocked Banner -->
          <div class="card" style="background: #FFF0F5; border: 2px solid var(--color-accent); padding: 10px 12px; margin-top: 10px; font-size: 0.85rem; line-height: 1.4;">
            <div style="font-weight: 800; margin-bottom: 2px; display: flex; align-items: center; gap: 6px; color: var(--color-text);">
              ${PixelLock} <strong>Mitteilungen sind im Browser blockiert</strong>
            </div>
            Damit du Veto-Fristen und Buchungs-Updates nicht verpasst, kannst du Mitteilungen in den Browser-Einstellungen wieder aktivieren.
          </div>

          <!-- Platform Switcher Tabs -->
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 12px;">
            <button type="button" id="tab-notif-ios" class="btn btn--sm ${isIos ? 'btn--primary' : ''}" style="font-size: 0.75rem; padding: 6px 2px;">
              iOS (Apple)
            </button>
            <button type="button" id="tab-notif-android" class="btn btn--sm ${isAndroid ? 'btn--primary' : ''}" style="font-size: 0.75rem; padding: 6px 2px;">
              Android
            </button>
            <button type="button" id="tab-notif-desktop" class="btn btn--sm ${isDesktop ? 'btn--primary' : ''}" style="font-size: 0.75rem; padding: 6px 2px;">
              Desktop
            </button>
          </div>

          <!-- Unblock Step-by-Step Instructions -->
          <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
            ${
              isIos
                ? `
              <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF;">
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                  <span style="font-family: var(--font-mono); font-weight: 900; font-size: 0.85rem; background: var(--color-text); color: #FFF; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">1</span>
                  <div>
                    <div style="font-weight: 800; font-size: 0.88rem;">iOS Einstellungen öffnen</div>
                    <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                      Öffne die <strong>Einstellungen</strong> auf deinem iPhone / iPad.
                    </div>
                  </div>
                </div>
              </div>

              <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF;">
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                  <span style="font-family: var(--font-mono); font-weight: 900; font-size: 0.85rem; background: var(--color-text); color: #FFF; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">2</span>
                  <div>
                    <div style="font-weight: 800; font-size: 0.88rem;">Safari / Web-App auswählen</div>
                    <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                      Scrolle zu <strong>Safari</strong> oder direkt zur installierten App <strong>ChaletWeShare</strong>.
                    </div>
                  </div>
                </div>
              </div>

              <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF;">
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                  <span style="font-family: var(--font-mono); font-weight: 900; font-size: 0.85rem; background: var(--color-text); color: #FFF; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">3</span>
                  <div>
                    <div style="font-weight: 800; font-size: 0.88rem;">Mitteilungen erlauben</div>
                    <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                      Tippe auf <strong>Mitteilungen</strong> und aktiviere den Schalter <strong>«Mitteilungen erlauben»</strong>.
                    </div>
                  </div>
                </div>
              </div>
            `
                : isAndroid
                ? `
              <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF;">
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                  <span style="font-family: var(--font-mono); font-weight: 900; font-size: 0.85rem; background: var(--color-text); color: #FFF; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">1</span>
                  <div>
                    <div style="font-weight: 800; font-size: 0.88rem;">Schloss- / Reglersymbol</div>
                    <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                      Tippe links neben der Web-Adresse auf das Schloss-Symbol <span style="display: inline-block; vertical-align: middle;">${PixelLock}</span> oder das Regler-Symbol.
                    </div>
                  </div>
                </div>
              </div>

              <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF;">
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                  <span style="font-family: var(--font-mono); font-weight: 900; font-size: 0.85rem; background: var(--color-text); color: #FFF; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">2</span>
                  <div>
                    <div style="font-weight: 800; font-size: 0.88rem;">Berechtigungen aufrufen</div>
                    <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                      Wähle <strong>«Berechtigungen»</strong> und tippe auf <strong>«Benachrichtigungen»</strong>.
                    </div>
                  </div>
                </div>
              </div>

              <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF;">
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                  <span style="font-family: var(--font-mono); font-weight: 900; font-size: 0.85rem; background: var(--color-text); color: #FFF; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">3</span>
                  <div>
                    <div style="font-weight: 800; font-size: 0.88rem;">Zulassen und neu laden</div>
                    <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                      Setze die Option auf <strong>«Zulassen»</strong> und lade die Seite neu.
                    </div>
                  </div>
                </div>
              </div>
            `
                : `
              <div class="card" style="padding: 12px; border: var(--border); background: #FFFFFF;">
                <div style="font-weight: 800; font-size: 0.9rem; margin-bottom: 4px;">Freigabe im Computer-Browser</div>
                <p style="font-size: 0.82rem; color: var(--color-text-muted); line-height: 1.4;">
                  Klicke ganz links in der Adressleiste auf das Schloss-Symbol <span style="display: inline-block; vertical-align: middle;">${PixelLock}</span> oder das Website-Icon.
                </p>
                <p style="font-size: 0.82rem; color: var(--color-text-muted); line-height: 1.4; margin-top: 8px;">
                  Ändere die Einstellung für <strong>«Benachrichtigungen»</strong> auf <strong>«Zulassen»</strong> und aktualisiere anschliessend das Browserfenster.
                </p>
              </div>
            `
            }
          </div>
        `
            : `
          <!-- Default / Not Asked State: Value Proposition -->
          <div class="card" style="background: var(--color-surface); border: var(--border); padding: 10px 12px; margin-top: 10px; font-size: 0.85rem; line-height: 1.4;">
            <div style="font-weight: 800; margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">
              ${PixelBell} <strong>Warum Mitteilungen unverzichtbar sind:</strong>
            </div>
            Erhalte wichtige Fristen und Ereignisse direkt auf dein Smartphone, ohne die App ständig manuell prüfen zu müssen.
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px;">
            <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF; display: flex; align-items: flex-start; gap: 10px;">
              <div style="color: var(--color-accent); font-size: 1.1rem; flex-shrink: 0; margin-top: 2px;">
                ${PixelClock}
              </div>
              <div>
                <div style="font-weight: 800; font-size: 0.88rem;">12h Veto-Frist</div>
                <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                  Sofortige Warnung, wenn eine provisorische Buchung deiner Familie abläuft oder angefochten wird.
                </div>
              </div>
            </div>

            <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF; display: flex; align-items: flex-start; gap: 10px;">
              <div style="color: var(--color-accent); font-size: 1.1rem; flex-shrink: 0; margin-top: 2px;">
                ${PixelChat}
              </div>
              <div>
                <div style="font-weight: 800; font-size: 0.88rem;">Konflikt-Chat & Einigung</div>
                <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                  Neue Chat-Nachrichten und Einigungsvorschläge bei überschneidenden Ferienwünschen.
                </div>
              </div>
            </div>

            <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF; display: flex; align-items: flex-start; gap: 10px;">
              <div style="color: var(--color-accent); font-size: 1.1rem; flex-shrink: 0; margin-top: 2px;">
                ${PixelHome}
              </div>
              <div>
                <div style="font-weight: 800; font-size: 0.88rem;">Wechseltag & Schlüsselübergabe</div>
                <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                  Wichtige Hinweise des Vornutzers zur Abreise und Anreise am Übergabetag.
                </div>
              </div>
            </div>
          </div>
        `
        }

        ${
          activationError
            ? `
          <div class="error-banner" style="margin-top: 10px;">
            ${activationError}
          </div>
        `
            : ''
        }

        <!-- Never show again checkbox -->
        <div style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="notif-never-checkbox" style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--color-accent);">
          <label for="notif-never-checkbox" style="font-size: 0.78rem; font-weight: 600; color: var(--color-text-muted); cursor: pointer;">
            Nicht mehr anzeigen
          </label>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
          ${
            isIosSafari || isDenied
              ? `
            <button id="notif-btn-confirm" class="btn btn--block btn--primary">
              Verstanden
            </button>
          `
              : `
            <button id="notif-btn-activate" class="btn btn--block btn--primary" ${isActivating ? 'disabled' : ''}>
              ${isActivating ? 'Wird aktiviert...' : 'Mitteilungen jetzt aktivieren'}
            </button>
            <button id="notif-btn-later" class="btn btn--block" style="font-size: 0.8rem;">
              Später erinnern
            </button>
          `
          }
        </div>
      </div>
    `;

    bindEvents();
  }

  function close() {
    const neverCheckbox = modalEl.querySelector('#notif-never-checkbox');
    if (neverCheckbox && neverCheckbox.checked) {
      dismissNotifPrompt(true);
    } else {
      dismissNotifPrompt(false);
    }

    modalEl.style.display = 'none';
    modalEl.innerHTML = '';
    if (createdContainer && modalEl.parentNode) {
      modalEl.parentNode.removeChild(modalEl);
    }

    if (onClose) onClose();
  }

  function bindEvents() {
    const closeBtn = modalEl.querySelector('#notif-prompt-close-btn');
    const confirmBtn = modalEl.querySelector('#notif-btn-confirm');
    const laterBtn = modalEl.querySelector('#notif-btn-later');
    const activateBtn = modalEl.querySelector('#notif-btn-activate');

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (confirmBtn) confirmBtn.addEventListener('click', close);

    if (laterBtn) {
      laterBtn.addEventListener('click', () => {
        dismissNotifPrompt(false); // 7-day cooldown
        close();
      });
    }

    if (activateBtn) {
      activateBtn.addEventListener('click', async () => {
        isActivating = true;
        activationError = null;
        render();

        try {
          const res = await pushService.subscribe(user);
          isActivating = false;
          if (res.success) {
            dismissNotifPrompt(true); // permanently dismissed since activated
            close();
          } else {
            permState = pushService.getPermission();
            activationError = res.error || 'Aktivierung fehlgeschlagen.';
            render();
          }
        } catch (err) {
          isActivating = false;
          permState = pushService.getPermission();
          activationError = err.message || 'Ein unerwarteter Fehler ist aufgetreten.';
          render();
        }
      });
    }

    // Tab switches for denied state
    const tabIos = modalEl.querySelector('#tab-notif-ios');
    const tabAndroid = modalEl.querySelector('#tab-notif-android');
    const tabDesktop = modalEl.querySelector('#tab-notif-desktop');

    if (tabIos) {
      tabIos.addEventListener('click', () => {
        activePlatform = 'ios';
        render();
      });
    }
    if (tabAndroid) {
      tabAndroid.addEventListener('click', () => {
        activePlatform = 'android';
        render();
      });
    }
    if (tabDesktop) {
      tabDesktop.addEventListener('click', () => {
        activePlatform = 'desktop';
        render();
      });
    }

    // Modal backdrop click
    modalEl.onclick = (e) => {
      if (e.target === modalEl) {
        close();
      }
    };
  }

  render();
}
