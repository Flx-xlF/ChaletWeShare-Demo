/**
 * ChaletWeShare — Maintenance Bottom Sheet
 * All siblings can block maintenance or cleaning days.
 */

import { formatDateFriendly } from '../utils/dateUtils.js';
import { reservationEngine } from '../engine/reservationEngine.js';
import { PixelWrench, PixelCancel } from '../data/pixelIcons.js';
import { showInlineError } from '../utils/errorUtils.js';

export function openMaintenanceSheet({ container, startDate, endDate, user, existingMaintenance = null, onSuccess, onClose }) {
  const isEdit = !!existingMaintenance;
  const effectiveStart = isEdit ? (existingMaintenance.dateStart || existingMaintenance.date_start) : startDate;
  const effectiveEnd = isEdit ? (existingMaintenance.dateEnd || existingMaintenance.date_end) : (endDate || startDate);
  const friendlyStart = formatDateFriendly(effectiveStart);
  const friendlyEnd = formatDateFriendly(effectiveEnd);
  const isSingleDay = effectiveStart === effectiveEnd;
  const dateRangeLabel = isSingleDay ? friendlyStart : `${friendlyStart} – ${friendlyEnd}`;

  let selectedSlot = isEdit ? (existingMaintenance.halfDay || existingMaintenance.half_day || 'full') : 'full';
  const initialReason = isEdit ? (existingMaintenance.reason || 'Unterhalt') : 'Reinigung';

  let initialHint = 'Chalet ist für diesen Zeitraum vollständig blockiert.';
  if (selectedSlot === 'morning') {
    initialHint = 'Vormittagsarbeiten: Check-in am Nachmittag bleibt für Familie möglich!';
  } else if (selectedSlot === 'afternoon') {
    initialHint = 'Nachmittagsarbeiten: Abreise am Vormittag bleibt möglich.';
  }

  container.style.display = 'flex';
  container.innerHTML = `
    <div class="bottom-sheet" id="maint-sheet-content">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--color-accent); display: flex; align-items: center; gap: 4px;">
            ${PixelWrench} ${isEdit ? 'Unterhalt bearbeiten' : 'Unterhalt & Reinigung'}
          </span>
          <h3 style="margin-top: 2px;">${dateRangeLabel}</h3>
        </div>
        <button id="maint-close-btn" class="btn btn--icon btn--sm" aria-label="Schliessen">${PixelCancel}</button>
      </div>

      <div id="maint-sheet-error" class="error-banner" style="display: none;"></div>

      <div class="input-group">
        <label class="input-label">Zeitfenster</label>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
          <button type="button" class="btn btn--sm maint-slot-btn ${selectedSlot === 'full' ? 'is-active' : ''}" data-slot="full" ${selectedSlot === 'full' ? 'style="background-color: var(--color-accent); color: #FFFFFF;"' : ''}>
            Ganzer Tag
          </button>
          <button type="button" class="btn btn--sm maint-slot-btn ${selectedSlot === 'morning' ? 'is-active' : ''}" data-slot="morning" ${selectedSlot === 'morning' ? 'style="background-color: var(--color-accent); color: #FFFFFF;"' : ''}>
            Vormittag
          </button>
          <button type="button" class="btn btn--sm maint-slot-btn ${selectedSlot === 'afternoon' ? 'is-active' : ''}" data-slot="afternoon" ${selectedSlot === 'afternoon' ? 'style="background-color: var(--color-accent); color: #FFFFFF;"' : ''}>
            Nachmittag
          </button>
        </div>
        <span id="maint-slot-hint" style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px;">
          ${initialHint}
        </span>
      </div>

      <div class="input-group">
        <label class="input-label" for="maint-reason-input">Grund / Aufgabe</label>
        <input type="text" id="maint-reason-input" class="input-text" placeholder="z.B. Reinigung, Handwerker..." value="${initialReason.replace(/"/g, '&quot;')}">
        <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;">
          <button type="button" class="btn btn--sm maint-quick-btn" data-val="Reinigung">Reinigung</button>
          <button type="button" class="btn btn--sm maint-quick-btn" data-val="Handwerker / Reparatur">Handwerker / Reparatur</button>
          <button type="button" class="btn btn--sm maint-quick-btn" data-val="Garten & Rasenmähen">Garten & Rasenmähen</button>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
        <button id="maint-btn-submit" class="btn btn--block btn--black">
          ${isEdit ? 'Änderungen speichern' : 'Unterhalt blockieren'}
        </button>
        <button id="maint-btn-cancel" class="btn btn--block">
          Abbrechen
        </button>
      </div>
    </div>
  `;

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

    let res;
    if (isEdit) {
      res = await reservationEngine.updateMaintenance({
        maintenanceId: existingMaintenance.id,
        halfDay: selectedSlot,
        reason
      });
    } else {
      res = await reservationEngine.createMaintenance({
        startDate: effectiveStart,
        endDate: effectiveEnd,
        halfDay: selectedSlot,
        reason
      });
    }

    if (res.success) {
      close();
      if (onSuccess) onSuccess(res.maintenance);
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Änderungen speichern' : 'Unterhalt blockieren';
      showInlineError(errorEl, res.error || 'Fehler beim Speichern des Unterhalts.', { reportable: res.isTechnical, category: 'Buchung' });
    }
  });
}
