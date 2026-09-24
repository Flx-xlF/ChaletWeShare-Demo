/**
 * ChaletWeShare — Booking Confirmation Bottom Sheet
 */

import { formatDateFriendly, countNights } from '../utils/dateUtils.js';
import { renderAvatarMarkup } from '../data/avatars.js';
import { reservationStore } from '../engine/reservationStore.js';
import { reservationEngine } from '../engine/reservationEngine.js';
import { playRocketCelebration } from './rocketAnimation.js';
import { playConfettiCelebration } from './confettiAnimation.js';
import { playSwanCelebration } from './swanAnimation.js';
import { PixelClock, PixelInfo, PixelLightning, PixelCheck, PixelCancel } from '../data/pixelIcons.js';
import { escapeHtml } from '../utils/htmlUtils.js';
import { showInlineError } from '../utils/errorUtils.js';

/**
 * Render and mount the booking confirmation sheet
 * @param {Object} options
 * @param {HTMLElement} options.container - Modal backdrop container
 * @param {string} options.startDate - YYYY-MM-DD
 * @param {string} options.endDate - YYYY-MM-DD
 * @param {Object} options.user - Current user object
 * @param {Function} options.onSuccess - Called on successful booking
 * @param {Function} options.onClose - Called when closed/cancelled
 */
export function openBookingConfirmSheet({ container, startDate, endDate, user, onSuccess, onClose }) {
  const nights = countNights(startDate, endDate) || 1;
  const friendlyStart = formatDateFriendly(startDate);
  const friendlyEnd = formatDateFriendly(endDate);

  const vetoPreview = reservationEngine.getVetoDeadlinePreview(new Date(), startDate);
  const isInstantBooking = vetoPreview === null;

  // Check if check-in day has morning maintenance
  const startDayStatus = reservationStore.getDayStatus(startDate);
  const hasMorningMaint = startDayStatus.status === 'maintenance' && startDayStatus.maintSlot === 'morning';

  // Check if departure day has afternoon maintenance
  const endDayStatus = reservationStore.getDayStatus(endDate);
  const hasAfternoonMaint = endDayStatus.status === 'maintenance' && endDayStatus.maintSlot === 'afternoon';

  let vetoCardHtml = '';
  let submitBtnText = 'Unverbindlich anfragen';
  let tagText = 'Reservation Anfragen';

  if (isInstantBooking) {
    tagText = 'Spontanbuchung (< 24h)';
    submitBtnText = 'Sofort verbindlich buchen';
    vetoCardHtml = `
      <div class="card" style="font-size: 0.85rem; border-left: 4px solid #008000; background: #F0FFF4;">
        <span style="margin-right: 4px;">${PixelCheck}</span> <strong>Sofort-Bestätigung (< 24h vor Anreise):</strong> Bei sehr kurzfristigen Buchungen entfällt die Veto-Frist. Dein Aufenthalt wird sofort fest gebucht!
      </div>
    `;
  } else {
    // Check veto tier
    const checkin = new Date(`${startDate}T14:00:00`);
    const diffHours = (checkin.getTime() - Date.now()) / (1000 * 3600);
    const isShortVeto = diffHours < 48;
    const isLongTermVeto = diffHours >= 720;

    if (isShortVeto) {
      tagText = 'Kurzfristige Anfrage (< 48h)';
      const shortTimeStr = `${vetoPreview.getHours().toString().padStart(2, '0')}:${vetoPreview.getMinutes().toString().padStart(2, '0')} Uhr`;
      vetoCardHtml = `
        <div class="card" style="font-size: 0.85rem; border-left: 4px solid var(--color-accent); background: #FFF9E6;">
          <span style="margin-right: 4px;">${PixelLightning}</span> <strong>Verkürzte 4h Veto-Frist:</strong> Da die Anreise in unter 48 Stunden liegt, haben Geschwister <strong>4 Stunden</strong> (bis ${shortTimeStr}) Zeit für Einwände oder Zustimmung.
        </div>
      `;
    } else if (isLongTermVeto) {
      tagText = 'Langfristige Buchung (> 30 Tage)';
      const dayLabel = vetoPreview.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' });
      const vetoTimeStr = `${dayLabel}, 20:15 Uhr`;
      vetoCardHtml = `
        <div class="card" style="font-size: 0.85rem; border-left: 4px solid #2563EB; background: #EFF6FF;">
          <span style="margin-right: 4px; color: #2563EB;">${PixelClock}</span> <strong>Erweiterte 3-Tage Veto-Frist (bis ${vetoTimeStr}):</strong> Da die Buchung mehr als 30 Tage im Voraus liegt, haben die Geschwister <strong>3 Tage</strong> Zeit für allfällige Abklärungen (Ferienanträge, Terminabsprachen).
        </div>
      `;
    } else {
      const vetoTimeStr = `${vetoPreview.getDate()}. ${vetoPreview.getMonth() + 1}. um 20:15 Uhr`;
      vetoCardHtml = `
        <div class="card" style="font-size: 0.85rem; border-left: 4px solid var(--color-accent);">
          <span style="margin-right: 4px;">${PixelClock}</span> <strong>Veto-Frist bis ${vetoTimeStr}:</strong> Nach dem Absenden haben alle Geschwister Zeit für Einwände oder Doppelnutzung. Wenn alle zustimmen oder die Frist abläuft, ist der Aufenthalt fix gebucht.
        </div>
      `;
    }
  }

  container.style.display = 'flex';
  container.innerHTML = `
    <div class="bottom-sheet" id="booking-sheet-content">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--color-accent);">
            ${tagText}
          </span>
          <h3 style="margin-top: 2px;">${friendlyStart} – ${friendlyEnd}</h3>
        </div>
        <button id="sheet-close-btn" class="btn btn--icon btn--sm" aria-label="Schliessen">${PixelCancel}</button>
      </div>

      <div id="booking-sheet-error" class="error-banner" style="display: none;"></div>

      <div style="display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--color-border);">
        ${renderAvatarMarkup(user.avatar, 40)}
        <div>
          <div style="font-weight: 700; font-size: 0.95rem;">${escapeHtml(user.name)}</div>
          <div style="font-size: 0.8rem; color: var(--color-text-muted);">
            ${nights} ${nights === 1 ? 'Nacht' : 'Nächte'} im Chalet Alpenrose
          </div>
        </div>
      </div>

      ${
        hasMorningMaint
          ? `
        <div class="card" style="background: var(--color-surface); border: var(--border); font-size: 0.85rem;">
          <span style="margin-right: 4px;">${PixelInfo}</span> <strong>Morgen-Reinigung am Anreisetag:</strong> Vormittags findet Chalet-Unterhalt statt. Check-in ist ab 14:00 Uhr möglich.
        </div>
      `
          : ''
      }

      ${
        hasAfternoonMaint
          ? `
        <div class="card" style="background: var(--color-surface); border: var(--border); font-size: 0.85rem;">
          <span style="margin-right: 4px;">${PixelInfo}</span> <strong>Nachmittags-Unterhalt am Abreisetag:</strong> Nachmittags findet Chalet-Unterhalt statt. Abreise bitte bis 11:00 Uhr.
        </div>
      `
          : ''
      }

      ${vetoCardHtml}

      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
        <button id="sheet-btn-submit" class="btn btn--block btn--primary">
          ${submitBtnText}
        </button>
        <button id="sheet-btn-cancel" class="btn btn--block">
          Abbrechen
        </button>
      </div>
    </div>
  `;

  const errorEl = container.querySelector('#booking-sheet-error');
  const submitBtn = container.querySelector('#sheet-btn-submit');
  const cancelBtn = container.querySelector('#sheet-btn-cancel');
  const closeBtn = container.querySelector('#sheet-close-btn');

  function close() {
    container.style.display = 'none';
    container.innerHTML = '';
    if (onClose) onClose();
  }

  cancelBtn.addEventListener('click', close);
  closeBtn.addEventListener('click', close);

  submitBtn.addEventListener('click', async () => {
    if (navigator.vibrate) navigator.vibrate(10);
    submitBtn.disabled = true;
    submitBtn.textContent = isInstantBooking ? 'Wird gebucht...' : 'Wird angefragt...';
    errorEl.style.display = 'none';

    const res = await reservationEngine.createReservation({
      startDate,
      endDate
    });

    if (res.success) {
      close();
      const isConfirmed = res.reservation && res.reservation.status === 'booked';
      if (isConfirmed) {
        // Instant booking -> Confetti or Swan celebration!
        if (Math.random() < 0.5) {
          playConfettiCelebration({
            text: 'Spontanbuchung bestätigt!',
            subtext: `${friendlyStart} – ${friendlyEnd}`
          });
        } else {
          playSwanCelebration({
            text: 'Spontanbuchung bestätigt!',
            subtext: `${friendlyStart} – ${friendlyEnd}`
          });
        }
      } else {
        // Inquiry sent -> Rocket or Swan celebration!
        if (Math.random() < 0.65) {
          playRocketCelebration({
            text: 'Anfrage gestartet!',
            subtext: `${friendlyStart} – ${friendlyEnd}`
          });
        } else {
          playSwanCelebration({
            text: 'Anfrage eingereicht!',
            subtext: `${friendlyStart} – ${friendlyEnd}`
          });
        }
      }
      if (onSuccess) onSuccess(res.reservation);
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = submitBtnText;
      showInlineError(errorEl, res.error || 'Fehler bei der Reservation.', { reportable: res.isTechnical, category: 'Buchung' });
    }
  });
}

