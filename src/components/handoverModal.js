/**
 * Chalet Alpenrose — Handover Modal Bottom Sheet
 * Prompts or allows the current guest to leave instructions/notices for the next reservation,
 * or edit/delete an existing handover note seamlessly.
 */

import { handoverService } from '../engine/handoverService.js';
import { reservationStore } from '../engine/reservationStore.js';
import { formatDateFriendly } from '../utils/dateUtils.js';
import { escapeHtml } from '../utils/htmlUtils.js';
import { showInlineError } from '../utils/errorUtils.js';
import { PixelCancel, PixelEdit } from '../data/pixelIcons.js';
import { notificationToast } from './notificationToast.js';
import { confirmDialog } from './confirmDialog.js';

const PRESETS = {
  garbage: {
    label: 'Kehricht',
    template: 'Kehrichtsack bitte am Abfuhrtag bereitstellen.'
  },
  missing: {
    label: 'Fehlendes',
    template: 'Folgendes geht im Chalet zur Neige oder sollte nachgekauft werden: '
  },
  broken: {
    label: 'Defekt',
    template: 'Folgendes ist beschädigt oder funktioniert nicht einwandfrei: '
  },
  custom: {
    label: 'Eigenes',
    template: ''
  }
};

export function openHandoverModal({ container, reservation = null, user, existingNote = null, onSubmitted, onClose }) {
  const isEditMode = !!existingNote;
  const resId = existingNote?.reservation_id || reservation?.id;
  const currentRes = reservation || reservationStore.reservations.find(r => r.id == resId) || {};

  // Find next upcoming reservation
  const currentEnd = currentRes.dateEnd || currentRes.date_end;
  const nextRes = currentEnd
    ? reservationStore.reservations
        .filter(r => r.id != resId && (r.dateStart || r.date_start) >= currentEnd && r.status !== 'cancelled')
        .sort((a, b) => (a.dateStart || a.date_start).localeCompare(b.dateStart || b.date_start))[0]
    : null;

  let nextGuestInfo = 'Nächster Gast im Chalet';
  if (existingNote?.target_user_name) {
    nextGuestInfo = existingNote.target_user_name;
  } else if (nextRes) {
    nextGuestInfo = `${nextRes.userName || nextRes.user_name} (ab ${formatDateFriendly(nextRes.dateStart || nextRes.date_start)})`;
  }

  let selectedCategory = existingNote?.category || 'garbage';
  const initialMessage = isEditMode ? (existingNote.message || '') : PRESETS.garbage.template;

  container.style.display = 'flex';
  container.innerHTML = `
    <div class="bottom-sheet" id="handover-sheet-content" style="max-height: 90vh; overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--color-accent); letter-spacing: 0.05em; display: inline-flex; align-items: center; gap: 4px;">
            ${isEditMode ? `${PixelEdit} Übergabe-Notiz anpassen` : 'Übergabe an nächsten Gast'}
          </span>
          <h3 style="margin-top: 2px;">${isEditMode ? 'Notiz bearbeiten' : 'Notiz hinterlassen'}</h3>
        </div>
        <button id="handover-close-btn" class="btn btn--icon btn--sm" aria-label="Schliessen">${PixelCancel}</button>
      </div>

      <div class="card" style="font-size: 0.82rem; padding: 10px 12px; border: var(--border); background: var(--color-surface); box-shadow: var(--shadow-brutal-sm);">
        <div style="font-weight: 800; text-transform: uppercase; color: var(--color-text-muted); font-size: 0.7rem; margin-bottom: 2px;">
          Empfänger
        </div>
        <div style="font-weight: 800; font-size: 0.95rem; color: var(--color-text);">
          ${escapeHtml(nextGuestInfo)}
        </div>
      </div>

      <!-- Category Selector Chips -->
      <div>
        <label class="input-label" style="margin-bottom: 6px; display: block;">Kategorie wählen</label>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;" id="handover-categories">
          ${Object.entries(PRESETS).map(([key, p]) => `
            <button type="button" class="btn btn--sm handover-cat-btn ${key === selectedCategory ? 'btn--primary' : ''}" data-cat="${key}" style="justify-content: flex-start;">
              ${p.label}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Message Input -->
      <div class="input-group" style="margin-bottom: 4px;">
        <label class="input-label" for="handover-message-input">Nachricht / Aufgabe</label>
        <textarea 
          id="handover-message-input" 
          class="input-text" 
          rows="4" 
          placeholder="Nachricht eingeben..."
          style="resize: none; font-size: 0.9rem; font-weight: 600; line-height: 1.4;"
        >${escapeHtml(initialMessage)}</textarea>
      </div>

      <div id="handover-error" class="error-banner" style="display: none;"></div>

      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
        <button id="handover-submit-btn" class="btn btn--block btn--primary">
          ${isEditMode ? 'Änderungen speichern' : 'Notiz an nächsten Gast senden'}
        </button>
        ${isEditMode ? `
          <button id="handover-delete-btn" type="button" class="btn btn--block btn--danger" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
            Notiz löschen
          </button>
        ` : ''}
        <button id="handover-cancel-btn" class="btn btn--block">
          Abbrechen
        </button>
      </div>
    </div>
  `;

  const closeBtn = container.querySelector('#handover-close-btn');
  const cancelBtn = container.querySelector('#handover-cancel-btn');
  const deleteBtn = container.querySelector('#handover-delete-btn');
  const submitBtn = container.querySelector('#handover-submit-btn');
  const textarea = container.querySelector('#handover-message-input');
  const errorEl = container.querySelector('#handover-error');
  const catButtons = container.querySelectorAll('.handover-cat-btn');

  function close() {
    container.style.display = 'none';
    container.innerHTML = '';
    if (onClose) onClose();
  }

  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);

  if (deleteBtn && isEditMode) {
    deleteBtn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Notiz löschen',
        message: 'Möchtest du diese Übergabe-Notiz wirklich unwiderruflich löschen?',
        confirmLabel: 'Löschen',
        cancelLabel: 'Abbrechen',
        isDanger: true
      });
      if (!confirmed) return;

      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Wird gelöscht...';
      errorEl.style.display = 'none';

      const delRes = await handoverService.deleteNote(existingNote.id);
      if (delRes.success) {
        notificationToast.show('Notiz gelöscht', 'Die Übergabe-Notiz wurde erfolgreich entfernt.');
        close();
        if (onSubmitted) onSubmitted(null);
      } else {
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Notiz löschen';
        showInlineError(errorEl, delRes.error || 'Fehler beim Löschen.', { reportable: false });
      }
    });
  }

  // Category switching
  catButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      catButtons.forEach(b => b.classList.remove('btn--primary'));
      btn.classList.add('btn--primary');
      selectedCategory = btn.dataset.cat;
      const tpl = PRESETS[selectedCategory]?.template || '';
      if (!isEditMode && (!textarea.value || Object.values(PRESETS).some(p => p.template === textarea.value))) {
        textarea.value = tpl;
      }
      textarea.focus();
    });
  });

  // Submit note
  submitBtn.addEventListener('click', async () => {
    const msg = textarea.value.trim();
    if (!msg) {
      showInlineError(errorEl, 'Bitte gib eine Nachricht ein.', { reportable: false });
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = isEditMode ? 'Wird gespeichert...' : 'Wird gesendet...';
    errorEl.style.display = 'none';

    let res;
    if (isEditMode) {
      res = await handoverService.updateNote({
        noteId: existingNote.id,
        category: selectedCategory,
        message: msg
      });
    } else {
      res = await handoverService.createNote({
        reservationId: resId,
        category: selectedCategory,
        message: msg
      });
    }

    if (res.success) {
      notificationToast.show(
        isEditMode ? 'Notiz aktualisiert' : 'Notiz gesendet',
        isEditMode
          ? 'Die Übergabe-Notiz wurde erfolgreich angepasst.'
          : `Übergabe-Notiz für ${nextGuestInfo} erfolgreich gespeichert!`
      );
      close();
      if (onSubmitted) onSubmitted(res.note);
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = isEditMode ? 'Änderungen speichern' : 'Notiz an nächsten Gast senden';
      showInlineError(errorEl, res.error || 'Fehler beim Speichern.', { reportable: res.isTechnical, category: 'Buchung' });
    }
  });
}
