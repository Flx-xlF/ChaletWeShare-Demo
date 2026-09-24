/**
 * ChaletWeShare — Maintenance Bottom Sheet
 * All siblings can block maintenance or cleaning days.
 */

import { formatDateFriendly } from '../utils/dateUtils.js';
import { reservationEngine } from '../engine/reservationEngine.js';
import { PixelWrench, PixelCancel } from '../data/pixelIcons.js';
import { showInlineError } from '../utils/errorUtils.js';

export function openMaintenanceSheet({ container, startDate, endDate, user, onSuccess, onClose }) {
  const friendlyStart = formatDateFriendly(startDate);
  const friendlyEnd = formatDateFriendly(endDate);
  const isSingleDay = startDate === endDate;
  const dateRangeLabel = isSingleDay ? friendlyStart : `${friendlyStart} – ${friendlyEnd}`;

  container.style.display = 'flex';
  container.innerHTML = `
    <div class="bottom-sheet" id="maint-sheet-content">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--color-text-muted); display: flex; align-items: center; gap: 4px;">
            ${PixelWrench} Unterhalt & Reinigung
          </span>
          <h3 style="margin-top: 2px;">${dateRangeLabel}</h3>
        </div>
        <button id="maint-close-btn" class="btn btn--icon btn--sm" aria-label="Schliessen">${PixelCancel}</button>
      </div>

      <div id="maint-sheet-error" class="error-banner" style="display: none;"></div>

      <div class="input-group">
        <label class="input-label">Zeitfenster</label>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
          <button type="button" class="btn btn--sm maint-slot-btn is-active" data-slot="full">
            Ganzer Tag
          </button>
          <button type="button" class="btn btn--sm maint-slot-btn" data-slot="morning">
            Vormittag
          </button>
          <button type="button" class="btn btn--sm maint-slot-btn" data-slot="afternoon">
            Nachmittag
          </button>
        </div>
        <span id="maint-slot-hint" style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px;">
          Chalet ist für diesen Tag vollständig blockiert.
        </span>
      </div>

      <div class="input-group">
        <label class="input-label" for="maint-reason-input">Grund / Aufgabe</label>
        <input type="text" id="maint-reason-input" class="input-text" placeholder="z.B. Reinigung, Handwerker..." value="Reinigung">
        <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;">
          <button type="button" class="btn btn--sm maint-quick-btn" data-val="Reinigung">Reinigung</button>
          <button type="button" class="btn btn--sm maint-quick-btn" data-val="Handwerker / Reparatur">Handwerker / Reparatur</button>
          <button type="button" class="btn btn--sm maint-quick-btn" data-val="Garten & Rasenmähen">Garten & Rasenmähen</button>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
        <button id="maint-btn-submit" class="btn btn--block btn--black">
          Unterhalt blockieren
        </button>
        <button id="maint-btn-cancel" class="btn btn--block">
          Abbrechen
        </button>
      </div>
    </div>
  `;

  let selectedSlot = 'full';
  const slotBtns = container.querySelectorAll('.maint-slot-btn');
  const slotHint = container.querySelector('#maint-slot-hint');
  const reasonInput = container.querySelector('#maint-reason-input');
  const errorEl = container.querySelector('#maint-sheet-error');
  const submitBtn = container.querySelector('#maint-btn-submit');
  const cancelBtn = container.querySelector('#maint-btn-cancel');
  const closeBtn = container.querySelector('#maint-close-btn');

  slotBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      slotBtns.forEach((b) => {
        b.classList.remove('is-active');
        b.style.backgroundColor = '';
        b.style.color = '';
      });
      btn.classList.add('is-active');
      btn.style.backgroundColor = 'var(--color-accent)';
      btn.style.color = '#FFFFFF';
      selectedSlot = btn.getAttribute('data-slot');

      if (selectedSlot === 'morning') {
        slotHint.textContent = 'Vormittagsarbeiten: Check-in am Nachmittag bleibt für Familie möglich!';
      } else if (selectedSlot === 'afternoon') {
        slotHint.textContent = 'Nachmittagsarbeiten: Abreise am Vormittag bleibt möglich.';
      } else {
        slotHint.textContent = 'Chalet ist für diesen Zeitraum vollständig blockiert.';
      }
    });
  });

  // Quick reason presets
  container.querySelectorAll('.maint-quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      reasonInput.value = btn.getAttribute('data-val');
    });
  });

  function close() {
    container.style.display = 'none';
    container.innerHTML = '';
    if (onClose) onClose();
  }

  cancelBtn.addEventListener('click', close);
  closeBtn.addEventListener('click', close);

  submitBtn.addEventListener('click', async () => {
    const reason = reasonInput.value.trim() || 'Unterhalt';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Wird gespeichert...';
    errorEl.style.display = 'none';

    const res = await reservationEngine.createMaintenance({
      startDate,
      endDate,
      halfDay: selectedSlot,
      reason
    });

    if (res.success) {
      close();
      if (onSuccess) onSuccess(res.maintenance);
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Unterhalt blockieren';
      showInlineError(errorEl, res.error || 'Fehler beim Blockieren des Unterhalts.', { reportable: res.isTechnical, category: 'Buchung' });
    }
  });
}
