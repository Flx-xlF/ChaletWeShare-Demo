/**
 * ChaletWeShare — PWA QuickTour Onboarding Component
 * Step-by-step spotlight tour explaining core booking mechanics, countdowns, and resolution.
 * Strict Bauhaus Aesthetic: Zero radius, brutalist borders, hot pink accents.
 */

import { dismissQuickTour, markPwaTourCompleted } from '../utils/pwaUtils.js';
import { pushService } from '../engine/pushService.js';
import { profileManager } from '../engine/profileManager.js';
import {
  PixelCalendar,
  PixelBell,
  PixelLightning,
  PixelClock,
  PixelWarning,
  PixelHandshake,
  PixelDice,
  PixelChat,
  PixelHome,
  PixelCheck,
  PixelCancel,
  PixelUndo
} from '../data/pixelIcons.js';

/**
 * Open the PWA QuickTour prompt
 * @param {Object} options
 * @param {Object} [options.user] - Active user profile
 * @param {Function} [options.onClose] - Callback when tour is completed or dismissed
 */
export function openQuickTour({ user, onClose } = {}) {
  const activeUser = user || profileManager.getActiveProfile();

  // Remove existing tour instance if any
  const existing = document.getElementById('chalet-quicktour-container');
  if (existing) {
    existing.remove();
  }

  const overlayContainer = document.getElementById('global-overlays') || document.body;

  const tourRoot = document.createElement('div');
  tourRoot.id = 'chalet-quicktour-container';
  tourRoot.className = 'quicktour-overlay';
  overlayContainer.appendChild(tourRoot);

  let currentStep = 0;

  function getStep3Content() {
    const perm = pushService.getPermission();
    let notifActionHtml = '';

    if (perm === 'granted') {
      notifActionHtml = `
        <div class="card" style="background: #EDFBF1; border: 1.5px solid #008744; padding: 8px 10px; margin-top: 8px; font-size: 0.78rem; font-weight: 700; color: #008744; display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-flex; align-items: center;">${PixelCheck}</span>
          <span>Mitteilungen sind auf diesem Gerät bereits aktiv!</span>
        </div>
      `;
    } else if (perm === 'denied') {
      notifActionHtml = `
        <div class="card" style="background: #FFF4D9; border: 1.5px solid #D4A000; padding: 8px 10px; margin-top: 8px; font-size: 0.76rem; color: #664D00; line-height: 1.35;">
          <strong>Hinweis:</strong> Mitteilungen sind im Browser blockiert. Du kannst sie jederzeit in deinen Systemeinstellungen freischalten.
        </div>
      `;
    } else {
      notifActionHtml = `
        <div class="card" style="display: flex; flex-direction: column; gap: 6px; background: #FFF0F5; border: 2px solid var(--color-accent); padding: 8px 10px; margin-top: 8px;">
          <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 0.82rem; color: var(--color-text);">
            <span style="color: var(--color-accent);">${PixelBell}</span>
            <span>Mitteilungen jetzt aktivieren:</span>
          </div>
          <div style="font-size: 0.76rem; color: var(--color-text-muted); line-height: 1.35;">
            Verpasse keine Veto-Fristen und wichtige Absprachen mehr.
          </div>
          <button id="quicktour-btn-enable-notif" type="button" class="btn btn--primary btn--sm btn--block" style="margin-top: 4px; font-weight: 800; font-size: 0.8rem; padding: 7px 10px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
            <span>${PixelBell}</span>
            <span id="quicktour-notif-btn-text">Mitteilungen erlauben</span>
          </button>
          <div id="quicktour-notif-feedback" style="display: none; font-size: 0.74rem; font-weight: 700; text-align: center; margin-top: 2px;"></div>
        </div>
      `;
    }

    return `
      <p style="font-size: 0.84rem; line-height: 1.4; margin-bottom: 8px;">
        Über die <strong>Glocke</strong> bleibst du immer auf dem aktuellen Stand:
      </p>
      <ul style="font-size: 0.8rem; line-height: 1.4; padding-left: 18px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 4px;">
        <li>Sofortige Benachrichtigung bei neuen Veto-Fristen</li>
        <li>Direkte Updates bei Veto-Entscheidungen & Chat</li>
        <li>Mitteilungen zu anstehenden Übergabeprotokollen</li>
      </ul>
      ${notifActionHtml}
    `;
  }

  const steps = [
    {
      id: 'step-calendar',
      targetSelector: '#nav-item-calendar',
      badge: 'SCHRITT 1 / 3 • BUCHUNG & ZEITFENSTER',
      title: 'Kalender & Buchungsfristen',
      icon: PixelCalendar,
      content: `
        <p style="font-size: 0.84rem; line-height: 1.4; margin-bottom: 8px;">
          Tippe Reisetage im Kalender an und bestätige mit <strong>«Reservieren»</strong>. Anschliessend startet der Veto-Countdown:
        </p>
        <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.8rem;">
          <div style="display: flex; align-items: flex-start; gap: 8px; background: var(--color-surface); border: var(--border); padding: 6px 8px;">
            <span style="color: var(--color-accent); font-size: 1.05rem; line-height: 1;">${PixelLightning}</span>
            <div>
              <strong>Kurzfristig (&lt; 48h vor Anreise):</strong>
              <div style="color: var(--color-text-muted); font-size: 0.76rem;">Verkürzte <strong>4-Stunden-Blitzfrist</strong> ab Buchungszeitpunkt.</div>
            </div>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 8px; background: var(--color-surface); border: var(--border); padding: 6px 8px;">
            <span style="color: var(--color-accent); font-size: 1.05rem; line-height: 1;">${PixelClock}</span>
            <div>
              <strong>Reguläre Buchung (2 bis 30 Tage):</strong>
              <div style="color: var(--color-text-muted); font-size: 0.76rem;">Frist bis <strong>20:15 Uhr</strong> (am gleichen Tag bei Buchung vor 08:00 Uhr, sonst am Folgetag).</div>
            </div>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 8px; background: var(--color-surface); border: var(--border); padding: 6px 8px;">
            <span style="color: #2563EB; font-size: 1.05rem; line-height: 1;">${PixelClock}</span>
            <div>
              <strong>Langfristig (&gt; 30 Tage im Voraus):</strong>
              <div style="color: var(--color-text-muted); font-size: 0.76rem;">Verlängerte <strong>3-Tage-Frist (20:15 Uhr)</strong> für Abklärungen bei Arbeitgeber oder Partner.</div>
            </div>
          </div>
        </div>
        <p style="font-size: 0.76rem; color: var(--color-text-muted); margin-top: 8px; display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 10px; height: 10px; background: var(--color-yellow); border: 1px solid #000; flex-shrink: 0;"></span>
          <span>Tage in der Veto-Frist werden im Kalender <strong>gelb gepunktet</strong> markiert.</span>
        </p>
        <div style="margin-top: 6px; background: #EDFBF1; border: 1.5px solid #008744; padding: 6px 8px; font-size: 0.76rem; color: #008744; font-weight: 700; display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-flex; align-items: center;">${PixelCheck}</span>
          <span><strong>Turbo-Bestätigung:</strong> Sobald alle Geschwister zustimmen, wird deine Buchung sofort bestätigt!</span>
        </div>
      `
    },
    {
      id: 'step-veto',
      targetSelector: null, // Centered overview
      badge: 'SCHRITT 2 / 3 • VETO & KONFLIKTLÖSUNG',
      title: 'Veto & Die 3 Lösungswege',
      icon: PixelWarning,
      content: `
        <p style="font-size: 0.88rem; line-height: 1.45; margin-bottom: 10px;">
          Falls Termine kollidieren, kann jedes Familienmitglied während der Frist <strong>Veto</strong> einlegen. Bei einem Veto greifen drei faire Optionen:
        </p>
        <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.8rem;">
          <div style="display: flex; align-items: center; gap: 8px; background: var(--color-surface); border: var(--border); padding: 6px 10px;">
            <span style="color: var(--color-accent); font-size: 1.1rem; line-height: 1;">${PixelHandshake}</span>
            <div><strong>1. Doppelnutzung:</strong> Ihr teilt euch das Chalet unkompliziert gemeinsam.</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; background: var(--color-surface); border: var(--border); padding: 6px 10px;">
            <span style="color: var(--color-accent); font-size: 1.1rem; line-height: 1;">${PixelDice}</span>
            <div><strong>2. Losentscheid:</strong> Ein digitaler Würfel ermittelt fair den Gewinner.</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; background: var(--color-surface); border: var(--border); padding: 6px 10px;">
            <span style="color: var(--color-accent); font-size: 1.1rem; line-height: 1; display: inline-flex; align-items: center;">${PixelUndo}</span>
            <div><strong>3. Rückzug:</strong> Eine Partei verzichtet freiwillig; die Tage werden sofort frei.</div>
          </div>
        </div>
        <div style="margin-top: 10px; display: flex; align-items: center; gap: 6px; font-size: 0.78rem; background: #FFF4D9; border: var(--border); padding: 6px 10px; color: #4A3800;">
          <span>${PixelChat}</span>
          <span>Im <strong>Buchungs-Chat</strong> könnt ihr euch vorab direkt absprechen.</span>
        </div>
        <div style="margin-top: 8px; font-size: 0.75rem; color: var(--color-text-muted); line-height: 1.35;">
          <strong>Tipp:</strong> Alle Farbcodes (Unterhalt, Arbeitstage, Wechseltage) findest du jederzeit über das <strong>[?]</strong>-Symbol oben im Menü!
        </div>
      `
    },
    {
      id: 'step-notif',
      targetSelector: '#header-notif-container',
      badge: 'SCHRITT 3 / 3 • MITTEILUNGEN & PWA',
      title: 'Mitteilungen & Schnellzugriff',
      icon: PixelBell,
      getContent: getStep3Content
    }
  ];

  // Spotlight Box
  const spotlightBox = document.createElement('div');
  spotlightBox.className = 'quicktour-spotlight-box';
  tourRoot.appendChild(spotlightBox);

  // Card
  const cardEl = document.createElement('div');
  cardEl.className = 'quicktour-card';
  cardEl.setAttribute('role', 'dialog');
  cardEl.setAttribute('aria-modal', 'true');
  tourRoot.appendChild(cardEl);

  function finishTour() {
    dismissQuickTour();
    markPwaTourCompleted();
    window.removeEventListener('resize', updatePosition);
    window.removeEventListener('keydown', handleKeydown);
    tourRoot.style.opacity = '0';
    setTimeout(() => {
      tourRoot.remove();
      if (typeof onClose === 'function') {
        onClose();
      }
    }, 200);
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      finishTour();
    } else if (e.key === 'ArrowRight' && currentStep < steps.length - 1) {
      currentStep++;
      renderStep();
    } else if (e.key === 'ArrowLeft' && currentStep > 0) {
      currentStep--;
      renderStep();
    }
  }

  function updatePosition() {
    const step = steps[currentStep];
    const targetEl = step.targetSelector ? document.querySelector(step.targetSelector) : null;

    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const pad = 8;
      spotlightBox.style.display = 'block';
      spotlightBox.style.top = Math.max(0, rect.top - pad) + 'px';
      spotlightBox.style.left = Math.max(0, rect.left - pad) + 'px';
      spotlightBox.style.width = (rect.width + pad * 2) + 'px';
      spotlightBox.style.height = (rect.height + pad * 2) + 'px';
      spotlightBox.style.opacity = '1';

      // Place card either above or below target depending on viewport space
      const viewportHeight = window.innerHeight;
      const targetCenterY = rect.top + rect.height / 2;

      cardEl.style.transform = 'none';
      if (targetCenterY > viewportHeight / 2) {
        // Target is in bottom half -> place card at top, respecting notch/safe-area
        cardEl.style.top = 'max(14px, calc(env(safe-area-inset-top, 0px) + 10px))';
        cardEl.style.bottom = 'auto';
        // Ensure card never overlaps the bottom target
        const spaceAbove = rect.top - 16;
        cardEl.style.maxHeight = `${Math.max(260, spaceAbove - 30)}px`;
      } else {
        // Target is in top half -> place card below target or middle
        const topPos = Math.max(rect.bottom + 12, 50);
        cardEl.style.top = `${topPos}px`;
        cardEl.style.bottom = 'auto';
        const spaceBelow = viewportHeight - topPos - 16;
        cardEl.style.maxHeight = `${Math.max(260, spaceBelow)}px`;
      }
    } else {
      // Centered dialog
      spotlightBox.style.opacity = '0';
      spotlightBox.style.top = '50%';
      spotlightBox.style.left = '50%';
      spotlightBox.style.width = '0px';
      spotlightBox.style.height = '0px';

      cardEl.style.top = '50%';
      cardEl.style.bottom = 'auto';
      cardEl.style.transform = 'translateY(-50%)';
      cardEl.style.maxHeight = 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 32px)';
    }
  }

  function renderStep() {
    const step = steps[currentStep];
    const isFirst = currentStep === 0;
    const isLast = currentStep === steps.length - 1;
    const stepContent = step.getContent ? step.getContent() : step.content;

    cardEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: var(--border-thick); padding-bottom: 8px; margin-bottom: 12px;">
        <div>
          <span class="quicktour-badge">${step.badge}</span>
          <h3 style="margin-top: 4px; font-size: 1.05rem; display: flex; align-items: center; gap: 6px;">
            <span style="color: var(--color-accent);">${step.icon}</span>
            <span>${step.title}</span>
          </h3>
        </div>
        <button id="quicktour-btn-close" class="btn btn--icon btn--sm" aria-label="Tour schliessen">
          ${PixelCancel}
        </button>
      </div>

      <div class="quicktour-body">
        ${stepContent}
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; border-top: var(--border); padding-top: 12px; margin-top: 14px;">
        <div style="display: flex; gap: 4px; align-items: center;">
          ${steps.map((_, i) => `
            <div style="width: 8px; height: 8px; border: 1.5px solid var(--color-text); background: ${i === currentStep ? 'var(--color-accent)' : 'transparent'};"></div>
          `).join('')}
        </div>

        <div style="display: flex; gap: 8px;">
          ${!isFirst ? `
            <button id="quicktour-btn-prev" class="btn btn--sm" style="font-size: 0.78rem;">
              Zurück
            </button>
          ` : `
            <button id="quicktour-btn-skip" class="btn btn--sm" style="font-size: 0.78rem; opacity: 0.75;">
              Überspringen
            </button>
          `}
          <button id="quicktour-btn-next" class="btn btn--sm ${isLast ? 'btn--black' : 'btn--primary'}" style="font-size: 0.78rem; font-weight: 800;">
            ${isLast ? 'Tour beenden & Loslegen' : 'Weiter →'}
          </button>
        </div>
      </div>
    `;

    // Bind event listeners
    const btnClose = cardEl.querySelector('#quicktour-btn-close');
    if (btnClose) btnClose.addEventListener('click', finishTour);

    const btnSkip = cardEl.querySelector('#quicktour-btn-skip');
    if (btnSkip) btnSkip.addEventListener('click', finishTour);

    const btnPrev = cardEl.querySelector('#quicktour-btn-prev');
    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        if (currentStep > 0) {
          currentStep--;
          renderStep();
        }
      });
    }

    const btnNext = cardEl.querySelector('#quicktour-btn-next');
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        if (currentStep < steps.length - 1) {
          currentStep++;
          renderStep();
        } else {
          finishTour();
        }
      });
    }

    // Bind direct notification activation button on Step 3
    const notifBtn = cardEl.querySelector('#quicktour-btn-enable-notif');
    const notifBtnText = cardEl.querySelector('#quicktour-notif-btn-text');
    const notifFeedback = cardEl.querySelector('#quicktour-notif-feedback');

    if (notifBtn) {
      notifBtn.addEventListener('click', async () => {
        notifBtn.disabled = true;
        if (notifBtnText) notifBtnText.textContent = 'Wird aktiviert...';
        try {
          const res = await pushService.subscribe(activeUser);
          if (res.success) {
            if (notifBtnText) notifBtnText.innerHTML = `${PixelCheck} Mitteilungen aktiviert!`;
            notifBtn.style.background = '#008744';
            notifBtn.style.borderColor = '#008744';
            setTimeout(() => {
              finishTour();
            }, 700);
          } else {
            notifBtn.disabled = false;
            if (notifBtnText) notifBtnText.textContent = 'Mitteilungen erlauben';
            if (notifFeedback) {
              notifFeedback.style.display = 'block';
              notifFeedback.style.color = 'var(--color-danger)';
              notifFeedback.textContent = res.error || 'Aktivierung nicht möglich.';
            }
          }
        } catch (err) {
          notifBtn.disabled = false;
          if (notifBtnText) notifBtnText.textContent = 'Mitteilungen erlauben';
          if (notifFeedback) {
            notifFeedback.style.display = 'block';
            notifFeedback.style.color = 'var(--color-danger)';
            notifFeedback.textContent = err.message || 'Fehler bei Aktivierung.';
          }
        }
      });
    }

    updatePosition();
  }

  window.addEventListener('resize', updatePosition);
  window.addEventListener('keydown', handleKeydown);

  // Initial render
  renderStep();
  // Double-check position once rendered
  setTimeout(updatePosition, 50);
}
