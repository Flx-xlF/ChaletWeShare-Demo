/**
 * ChaletWeShare — PWA Installation Prompt Modal
 * Explains how to install the app to the home screen on iOS and Android.
 * Strict Bauhaus Aesthetic.
 */

import { detectPlatform, dismissPwaPrompt, canNativeInstall, triggerNativeInstall } from '../utils/pwaUtils.js';
import { PixelShare, PixelHome, PixelCheck, PixelInfo, PixelHandshake, PixelCancel } from '../data/pixelIcons.js';
import { profileManager } from '../engine/profileManager.js';
import { escapeHtml } from '../utils/htmlUtils.js';

/**
 * Open the PWA installation modal
 * @param {Object} options
 * @param {HTMLElement} [options.container] - Modal container element
 * @param {Function} [options.onClose] - Callback when modal is closed
 */
export function openPwaPrompt({ container, onClose } = {}) {
  let modalEl = container;
  let createdContainer = false;

  const activeProfile = profileManager.getActiveProfile();
  const storedToken = activeProfile ? (profileManager.getStoredToken(activeProfile.profile_id) || activeProfile.sync_token) : null;
  const syncCode = storedToken ? storedToken.substring(0, 6).toUpperCase() : null;

  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'pwa-prompt-modal-container';
    modalEl.className = 'bottom-sheet-backdrop modal-backdrop';
    const containerEl = document.getElementById('global-overlays') || document.body;
    containerEl.appendChild(modalEl);
    createdContainer = true;
  }

  let activePlatform = detectPlatform(); // 'ios' | 'android' | 'desktop'
  let neverShow = false;

  function render() {
    const isIos = activePlatform === 'ios';
    const isAndroid = activePlatform === 'android';
    const isDesktop = activePlatform === 'desktop';
    const hasNativePrompt = canNativeInstall();

    modalEl.style.display = 'flex';
    modalEl.innerHTML = `
      <div class="bottom-sheet pwa-prompt-sheet" id="pwa-sheet-content" style="max-height: 90vh; overflow-y: auto;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: var(--border); padding-bottom: 8px;">
          <div>
            <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--color-accent); letter-spacing: 0.04em; display: flex; align-items: center; gap: 4px;">
              ${PixelHome} Web-App Installation
            </span>
            <h3 style="margin-top: 2px;">ChaletWeShare installieren</h3>
          </div>
          <button id="pwa-prompt-close-btn" class="btn btn--icon btn--sm" aria-label="Schliessen">${PixelCancel}</button>
        </div>

        <!-- Value Proposition Note & Setup Instructions -->
        <div class="card" style="background: var(--color-surface); border: var(--border); padding: 10px 12px; margin-top: 10px; font-size: 0.85rem; line-height: 1.4;">
          <div style="font-weight: 800; margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">
            ${PixelInfo} <strong>Als App auf dem Home-Bildschirm:</strong>
          </div>
          Vollbildmodus ohne Browserleiste, direkter Schnellzugriff und sofortige Push-Mitteilungen bei Veto & Konflikten.
          ${
            activeProfile && syncCode
              ? `
            <div style="margin-top: 10px; padding: 10px; background: #FFFDE6; border: var(--border); box-shadow: var(--shadow-brutal-sm);">
              <div style="font-size: 0.78rem; font-weight: 800; text-transform: uppercase; color: var(--color-text); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                <span>${PixelHandshake}</span>
                <span>Wichtig zur Ersteinrichtung der PWA:</span>
              </div>
              <ol style="margin: 0; padding-left: 18px; font-size: 0.8rem; line-height: 1.4; color: var(--color-text);">
                <li>App nach der Installation auf dem Smartphone öffnen.</li>
                <li>Zuerst das <strong>Familien-Passwort</strong> eingeben.</li>
                <li>Dein Profil <strong>«${escapeHtml(activeProfile.name)}»</strong> mit diesem Koppel-Code verknüpfen:</li>
              </ol>
              <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
                <span id="pwa-sync-code-display" style="font-family: var(--font-mono); font-size: 1.25rem; font-weight: 900; letter-spacing: 0.15em; color: var(--color-accent); background: #FFF; padding: 4px 10px; border: var(--border);">${syncCode}</span>
                <button id="pwa-btn-copy-code" type="button" class="btn btn--sm" style="font-size: 0.75rem; padding: 4px 8px;">Kopieren</button>
                <span id="pwa-copy-feedback" style="font-size: 0.72rem; color: #008744; font-weight: 700; display: none;">Kopiert!</span>
              </div>
            </div>
          `
              : ''
          }
        </div>

        <!-- Platform Tabs -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 12px;">
          <button type="button" id="tab-pwa-ios" class="btn btn--sm ${isIos ? 'btn--primary' : ''}" style="font-size: 0.75rem; padding: 6px 2px;">
            iOS (Apple)
          </button>
          <button type="button" id="tab-pwa-android" class="btn btn--sm ${isAndroid ? 'btn--primary' : ''}" style="font-size: 0.75rem; padding: 6px 2px;">
            Android
          </button>
          <button type="button" id="tab-pwa-desktop" class="btn btn--sm ${isDesktop ? 'btn--primary' : ''}" style="font-size: 0.75rem; padding: 6px 2px;">
            Desktop
          </button>
        </div>

        <!-- Instructions Content -->
        <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
          ${
            isIos
              ? `
            <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF;">
              <div style="display: flex; gap: 10px; align-items: flex-start;">
                <span style="font-family: var(--font-mono); font-weight: 900; font-size: 0.85rem; background: var(--color-text); color: #FFF; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">1</span>
                <div>
                  <div style="font-weight: 800; font-size: 0.88rem;">Teilen-Symbol antippen</div>
                  <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                    In Safari unten in der Menüleiste auf das Teilen-Symbol <span style="display: inline-block; vertical-align: middle;">${PixelShare}</span> tippen.
                  </div>
                </div>
              </div>
            </div>

            <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF;">
              <div style="display: flex; gap: 10px; align-items: flex-start;">
                <span style="font-family: var(--font-mono); font-weight: 900; font-size: 0.85rem; background: var(--color-text); color: #FFF; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">2</span>
                <div>
                  <div style="font-weight: 800; font-size: 0.88rem;">«Zum Home-Bildschirm» wählen</div>
                  <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                    Im Aktionsmenü nach unten scrollen und <strong>«Zum Home-Bildschirm»</strong> auswählen.
                  </div>
                </div>
              </div>
            </div>

            <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF;">
              <div style="display: flex; gap: 10px; align-items: flex-start;">
                <span style="font-family: var(--font-mono); font-weight: 900; font-size: 0.85rem; background: var(--color-text); color: #FFF; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">3</span>
                <div>
                  <div style="font-weight: 800; font-size: 0.88rem;">Bestätigen</div>
                  <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                    Oben rechts auf <strong>«Hinzufügen»</strong> tippen. Das Chalet-Symbol erscheint auf deinem Startbildschirm.
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
                  <div style="font-weight: 800; font-size: 0.88rem;">Browser-Menü öffnen</div>
                  <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                    In Chrome oben rechts auf das Dreipunkt-Menü <strong>⋮</strong> tippen.
                  </div>
                </div>
              </div>
            </div>

            <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF;">
              <div style="display: flex; gap: 10px; align-items: flex-start;">
                <span style="font-family: var(--font-mono); font-weight: 900; font-size: 0.85rem; background: var(--color-text); color: #FFF; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">2</span>
                <div>
                  <div style="font-weight: 800; font-size: 0.88rem;">«App installieren» wählen</div>
                  <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                    Auf <strong>«App installieren»</strong> oder <strong>«Zum Startbildschirm hinzufügen»</strong> tippen.
                  </div>
                </div>
              </div>
            </div>

            <div class="card" style="padding: 10px 12px; border: var(--border); background: #FFFFFF;">
              <div style="display: flex; gap: 10px; align-items: flex-start;">
                <span style="font-family: var(--font-mono); font-weight: 900; font-size: 0.85rem; background: var(--color-text); color: #FFF; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">3</span>
                <div>
                  <div style="font-weight: 800; font-size: 0.88rem;">Bestätigen</div>
                  <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                    Mit <strong>«Installieren»</strong> bestätigen. ChaletWeShare startet künftig wie eine native App.
                  </div>
                </div>
              </div>
            </div>
          `
              : `
            <div class="card" style="padding: 12px; border: var(--border); background: #FFFFFF;">
              <div style="font-weight: 800; font-size: 0.9rem; margin-bottom: 4px;">Installation auf dem Computer</div>
              <p style="font-size: 0.82rem; color: var(--color-text-muted); line-height: 1.4;">
                Klicke in Chrome, Edge oder Brave in der Adressleiste ganz rechts auf das Installationssymbol <strong>⊕ (App installieren)</strong>.
              </p>
              <p style="font-size: 0.82rem; color: var(--color-text-muted); line-height: 1.4; margin-top: 8px;">
                Oder öffne die Adresse einfach auf deinem Smartphone (iPhone oder Android), um sie zum mobilen Home-Bildschirm hinzuzufügen.
              </p>
            </div>
          `
          }
        </div>

        <!-- Never show again checkbox -->
        <div style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="pwa-never-checkbox" style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--color-accent);">
          <label for="pwa-never-checkbox" style="font-size: 0.78rem; font-weight: 600; color: var(--color-text-muted); cursor: pointer;">
            Nicht mehr anzeigen
          </label>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
          ${
            hasNativePrompt
              ? `
            <button id="pwa-btn-native-install" class="btn btn--block btn--primary">
              App jetzt installieren
            </button>
          `
              : ''
          }
          <button id="pwa-btn-confirm" class="btn btn--block ${hasNativePrompt ? 'btn--black' : 'btn--primary'}">
            Verstanden
          </button>
          <button id="pwa-btn-later" class="btn btn--block" style="font-size: 0.8rem;">
            Später erinnern
          </button>
        </div>
      </div>
    `;

    bindEvents();
  }

  function close() {
    const neverCheckbox = modalEl.querySelector('#pwa-never-checkbox');
    if (neverCheckbox && neverCheckbox.checked) {
      dismissPwaPrompt(true);
    } else {
      dismissPwaPrompt(false);
    }

    modalEl.style.display = 'none';
    modalEl.innerHTML = '';
    if (createdContainer && modalEl.parentNode) {
      modalEl.parentNode.removeChild(modalEl);
    }

    if (onClose) onClose();
  }

  function bindEvents() {
    const closeBtn = modalEl.querySelector('#pwa-prompt-close-btn');
    const confirmBtn = modalEl.querySelector('#pwa-btn-confirm');
    const laterBtn = modalEl.querySelector('#pwa-btn-later');
    const nativeInstallBtn = modalEl.querySelector('#pwa-btn-native-install');
    const btnCopy = modalEl.querySelector('#pwa-btn-copy-code');
    const copyFeedback = modalEl.querySelector('#pwa-copy-feedback');

    if (btnCopy && syncCode) {
      btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(syncCode);
        if (copyFeedback) {
          copyFeedback.style.display = 'inline';
          setTimeout(() => {
            copyFeedback.style.display = 'none';
          }, 2500);
        }
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (confirmBtn) confirmBtn.addEventListener('click', close);

    if (laterBtn) {
      laterBtn.addEventListener('click', () => {
        dismissPwaPrompt(false); // 7 day cooldown
        close();
      });
    }

    if (nativeInstallBtn) {
      nativeInstallBtn.addEventListener('click', async () => {
        nativeInstallBtn.disabled = true;
        const accepted = await triggerNativeInstall();
        if (accepted) {
          dismissPwaPrompt(true);
          close();
        } else {
          nativeInstallBtn.disabled = false;
        }
      });
    }

    // Tab switches
    const tabIos = modalEl.querySelector('#tab-pwa-ios');
    const tabAndroid = modalEl.querySelector('#tab-pwa-android');
    const tabDesktop = modalEl.querySelector('#tab-pwa-desktop');

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
