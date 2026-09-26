/**
 * ChaletWeShare — Calendar Legend & Status Sheet
 * Strict Bauhaus/Neo-Brutalist Bottom Sheet explaining all calendar visual codes.
 */

import { PixelInfo, PixelCancel, PixelWrench, PixelBroom, PixelHandshake, PixelCheck, PixelVote, PixelClipboard } from '../data/pixelIcons.js';
import { openQuickTour } from './quickTourPrompt.js';

export function openLegendSheet({ user, onClose } = {}) {
  let globalOverlays = document.getElementById('global-overlays');
  if (!globalOverlays) {
    globalOverlays = document.createElement('div');
    globalOverlays.id = 'global-overlays';
    document.body.appendChild(globalOverlays);
  }

  // Remove existing sheet if open
  const existing = document.getElementById('chalet-legend-sheet-backdrop');
  if (existing) {
    existing.remove();
  }

  const backdrop = document.createElement('div');
  backdrop.id = 'chalet-legend-sheet-backdrop';
  backdrop.className = 'bottom-sheet-backdrop legend-sheet-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'legend-sheet-title');

  backdrop.innerHTML = `
    <div class="bottom-sheet legend-sheet" style="max-height: 88vh; overflow-y: auto;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; border-bottom: var(--border-thick); padding-bottom: 12px; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border: var(--border-thick); background: var(--color-accent); color: #fff; flex-shrink: 0; box-shadow: var(--shadow-brutal-sm);">
            ${PixelInfo}
          </div>
          <div>
            <span style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--color-accent); letter-spacing: 0.05em;">
              Hilfe & Erklärung
            </span>
            <h3 id="legend-sheet-title" style="margin: 0; font-size: 1.15rem; font-weight: 900; text-transform: uppercase; letter-spacing: -0.01em;">
              Kalender-Legende
            </h3>
          </div>
        </div>
        <button id="legend-sheet-close-btn" class="btn btn--icon btn--sm" aria-label="Schliessen" type="button">
          ${PixelCancel}
        </button>
      </div>

      <!-- Legend Sections -->
      <div class="legend-sheet__content" style="display: flex; flex-direction: column; gap: 16px;">
        
        <!-- Section 1: Reservation States -->
        <div class="legend-sheet__section">
          <div style="font-family: var(--font-mono); font-size: 0.76rem; font-weight: 900; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 8px; letter-spacing: 0.05em;">
            1. Buchungs-Status & Farben
          </div>
          <div class="legend-sheet__list" style="display: flex; flex-direction: column; gap: 8px;">
            
            <div class="legend-sheet__row">
              <div class="legend-sheet__swatch legend-swatch--free"></div>
              <div class="legend-sheet__info">
                <strong>Frei:</strong> Tag ist verfügbar und kann per Klick reserviert werden.
              </div>
            </div>

            <div class="legend-sheet__row">
              <div class="legend-sheet__swatch legend-swatch--pending"></div>
              <div class="legend-sheet__info">
                <strong>Ausstehend (Gelb gepunktet):</strong> Anfrage läuft in der Veto-Frist. <em>Wird sofort bestätigt, sobald alle Geschwister zustimmen!</em>
              </div>
            </div>

            <div class="legend-sheet__row">
              <div class="legend-sheet__swatch legend-swatch--booked"></div>
              <div class="legend-sheet__info">
                <strong>Gebucht (Schiefergrau):</strong> Feste, verbindlich bestätigte Belegung.
              </div>
            </div>

            <div class="legend-sheet__row">
              <div class="legend-sheet__swatch legend-swatch--conflict"></div>
              <div class="legend-sheet__info">
                <strong>Konflikt (Rote Streifen):</strong> Einspruch/Veto aktiv. Klärung via Chat, Doppelnutzung oder Losentscheid.
              </div>
            </div>

          </div>
        </div>

        <!-- Section 2: Maintenance, Work Days & Overlaps -->
        <div class="legend-sheet__section">
          <div style="font-family: var(--font-mono); font-size: 0.76rem; font-weight: 900; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 8px; letter-spacing: 0.05em;">
            2. Unterhalt & Spezielle Tage
          </div>
          <div class="legend-sheet__list" style="display: flex; flex-direction: column; gap: 8px;">
            
            <div class="legend-sheet__row">
              <div class="legend-sheet__swatch legend-swatch--maint">
                <span class="legend-swatch__maint-mini">${PixelWrench}</span>
              </div>
              <div class="legend-sheet__info">
                <strong>Unterhalt & Reinigung (Warnstreifen):</strong> Blockiert für Arbeiten/Putz. Über «Nachfragen» im Kalender kann eine parallele Mitnutzung direkt angefragt werden.
              </div>
            </div>

            <div class="legend-sheet__row">
              <div class="legend-sheet__swatch legend-swatch--working-day">
                <span class="legend-swatch__maint-mini">${PixelBroom}</span>
              </div>
              <div class="legend-sheet__info">
                <strong>Arbeitstag (Gelb mit Besen):</strong> Gemeinsamer Frühjahrsputz oder Einwintern mit RSVP-Teilnehmerliste und Kalenderexport.
              </div>
            </div>

            <div class="legend-sheet__row">
              <div class="legend-sheet__swatch legend-swatch--working-proposal">
                <span class="legend-swatch__maint-mini">${PixelVote}</span>
              </div>
              <div class="legend-sheet__info">
                <strong>Terminvorschlag (Abstimmung):</strong> Bis zu 3 Termine vorgeschlagen. Klicke auf den Tag zur Stimmabgabe («Dabei», «Eventuell», «Keine Zeit»).
              </div>
            </div>

            <div class="legend-sheet__row">
              <div class="legend-sheet__swatch legend-sheet__swatch--split"></div>
              <div class="legend-sheet__info">
                <strong>Wechseltag (Diagonalschnitt 45°):</strong> Vormittag Abreise (oben links), Nachmittag neue Anreise (unten rechts).
              </div>
            </div>

            <div class="legend-sheet__row">
              <div class="legend-sheet__swatch legend-swatch--collision">
                <span style="font-size: 0.65rem; font-weight: 900; color: #fff; background: #DC2626; padding: 1px 2px;">2x</span>
              </div>
              <div class="legend-sheet__info">
                <strong>Doppelbuchung / Kollision (⚠️ 2x):</strong> Ungewollte Überschneidung mehrerer Buchungen. Klicke darauf, um den Konflikt zu lösen oder die Buchung abzusprechen.
              </div>
            </div>

            <div class="legend-sheet__row">
              <div class="legend-sheet__swatch legend-swatch--doppelnutzung">
                <span style="color: #065F46; display: flex; align-items: center; justify-content: center;">${PixelHandshake}</span>
              </div>
              <div class="legend-sheet__info">
                <strong>Vereinbarte Doppelnutzung (🤝):</strong> Einvernehmliche gemeinsame Nutzung des Chalets durch mehrere Parteien.
              </div>
            </div>

            <div class="legend-sheet__row">
              <div class="legend-sheet__swatch legend-swatch--handover">
                <span style="color: var(--color-accent); display: flex; align-items: center; justify-content: center;">${PixelClipboard}</span>
              </div>
              <div class="legend-sheet__info">
                <strong>Übergabe-Notizen (📋):</strong> Aktuelle Hinweise zu Kehricht, Defekten oder Übergabe an den nächsten Gast vorhanden.
              </div>
            </div>

            <div class="legend-sheet__row">
              <div class="legend-sheet__swatch legend-sheet__swatch--overlap">
                <span class="legend-swatch__maint-mini" style="background: #22c55e; color: #fff;">${PixelCheck}</span>
              </div>
              <div class="legend-sheet__info">
                <strong>Mitnutzung erlaubt:</strong> Parallele Buchung während eines Unterhaltsblocks wurde vom Organisator genehmigt.
              </div>
            </div>

          </div>
        </div>

        <!-- Section 3: QuickTour Restart -->
        <div class="legend-sheet__section" style="border-top: var(--border); padding-top: 14px; margin-top: 4px;">
          <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: 10px; line-height: 1.35;">
            Möchtest du dir die Regeln für Buchungsfristen und Konfliktlösungen noch einmal schrittweise ansehen?
          </div>
          <button id="legend-sheet-btn-quicktour" type="button" class="btn btn--block btn--primary" style="font-weight: 800; font-size: 0.84rem; display: flex; align-items: center; justify-content: center; gap: 8px;">
            <span>${PixelHandshake}</span>
            <span>QuickTour (Onboarding) starten</span>
          </button>
        </div>

      </div>
    </div>
  `;

  globalOverlays.appendChild(backdrop);

  function closeSheet() {
    backdrop.classList.add('closing');
    backdrop.style.opacity = '0';
    setTimeout(() => {
      backdrop.remove();
      if (typeof onClose === 'function') onClose();
    }, 200);
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeSheet();
    }
  });

  const closeBtn = backdrop.querySelector('#legend-sheet-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeSheet);
  }

  const tourBtn = backdrop.querySelector('#legend-sheet-btn-quicktour');
  if (tourBtn) {
    tourBtn.addEventListener('click', () => {
      closeSheet();
      setTimeout(() => {
        openQuickTour({ user });
      }, 250);
    });
  }

  // Trigger smooth enter animation
  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
  });
}
