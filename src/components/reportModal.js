/**
 * ChaletWeShare — Bug & Feedback Report Modal
 * Allows users to report errors or send feedback directly to Discord.
 * Strict Bauhaus / Pixel Art Aesthetic.
 */

import { 
  PixelWarning, 
  PixelCalendar, 
  PixelBell, 
  PixelHandshake, 
  PixelRocket, 
  PixelChat, 
  PixelCancel, 
  PixelCheck,
  PixelProfile
} from '../data/pixelIcons.js';
import { profileManager } from '../engine/profileManager.js';
import { escapeHtml } from '../utils/htmlUtils.js';

const QUICK_CATEGORIES = [
  { id: 'buchung', label: 'Buchungsproblem', icon: PixelCalendar },
  { id: 'kalender', label: 'Kalender lädt nicht', icon: PixelWarning },
  { id: 'push', label: 'Push-Mitteilungen', icon: PixelBell },
  { id: 'profil', label: 'Profil / Kopplung', icon: PixelHandshake },
  { id: 'idee', label: 'Idee / Vorschlag', icon: PixelRocket },
  { id: 'sonstiges', label: 'Sonstiges', icon: PixelChat },
];

/**
 * Opens the Bug / Feedback Report bottom-sheet modal
 * @param {Object} [options]
 * @param {string} [options.prefillCategory] - Category to pre-select
 * @param {string} [options.prefillMessage] - Description to pre-fill in the textarea
 * @param {Function} [options.onClose] - Callback when modal is closed
 */
export function openReportModal({ prefillCategory = '', prefillMessage = '', onClose = null } = {}) {
  let modalEl = document.getElementById('report-modal-container');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'report-modal-container';
    modalEl.className = 'bottom-sheet-backdrop modal-backdrop';
    const containerEl = document.getElementById('global-overlays') || document.body;
    containerEl.appendChild(modalEl);
  }

  modalEl.style.display = 'flex';

  const user = profileManager.getActiveProfile() || { name: 'Gast', profile_id: 'GAST' };
  let selectedCategory = prefillCategory || 'buchung';

  function closeModal() {
    modalEl.style.display = 'none';
    modalEl.innerHTML = '';
    if (typeof onClose === 'function') onClose();
  }

  modalEl.onclick = (e) => {
    if (e.target === modalEl) closeModal();
  };

  function renderForm() {
    modalEl.innerHTML = `
      <div class="bottom-sheet report-modal-sheet" style="max-height: 90vh; overflow-y: auto;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: var(--border); padding-bottom: 12px; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: var(--color-accent); display: inline-flex; align-items: center;">${PixelWarning}</span>
            <h3 style="font-size: 1rem; font-weight: 800; text-transform: uppercase; margin: 0;">Problem melden</h3>
          </div>
          <button id="report-modal-close" class="btn btn--icon btn--sm" style="background: transparent; border: none; padding: 4px; cursor: pointer; box-shadow: none;" title="Schliessen">
            ${PixelCancel}
          </button>
        </div>

        <p style="font-size: 0.82rem; color: var(--color-text-muted); line-height: 1.45; margin-bottom: 14px;">
          Etwas funktioniert nicht wie erwartet oder du hast einen Verbesserungsvorschlag? Wähle ein Thema oder beschreibe kurz dein Anliegen:
        </p>

        <!-- Quick Select Chips Grid -->
        <div class="input-label" style="margin-bottom: 8px;">Thema wählen</div>
        <div class="report-chips-grid" id="report-chips-container" style="margin-bottom: 16px;">
          ${QUICK_CATEGORIES.map(cat => {
            const isActive = (selectedCategory.toLowerCase() === cat.id || selectedCategory === cat.label);
            return `
              <button type="button" class="report-chip ${isActive ? 'report-chip--active' : ''}" data-category-id="${cat.id}" data-category-label="${cat.label}">
                <span class="report-chip__icon">${cat.icon}</span>
                <span class="report-chip__label">${cat.label}</span>
              </button>
            `;
          }).join('')}
        </div>

        <!-- Detail Message Input -->
        <div class="input-group" style="margin-bottom: 14px;">
          <label class="input-label" for="report-message-input">Beschreibung</label>
          <textarea 
            id="report-message-input" 
            class="report-textarea" 
            rows="3" 
            placeholder="Beschreibe kurz was passiert ist...">${escapeHtml(prefillMessage)}</textarea>
        </div>

        <!-- Technical Metadata Indicator -->
        <div style="background: var(--color-surface); border: var(--border); padding: 8px 10px; margin-bottom: 16px; font-size: 0.72rem; color: var(--color-text-muted); display: flex; align-items: center; justify-content: space-between;">
          <span style="display: inline-flex; align-items: center; gap: 4px;">${PixelProfile} ${escapeHtml(user.name)} (${escapeHtml(user.profile_id)})</span>
          <span style="font-family: var(--font-mono);">${window.innerWidth}x${window.innerHeight}</span>
        </div>

        <!-- Feedback message area -->
        <div id="report-feedback-area" style="display: none; margin-bottom: 12px; font-size: 0.82rem; font-weight: 700;"></div>

        <!-- Actions -->
        <div style="display: flex; gap: 10px;">
          <button id="report-submit-btn" class="btn btn--primary btn--block" style="flex: 1;">
            Meldung senden
          </button>
          <button id="report-cancel-btn" class="btn btn--outline" style="min-width: 90px;">
            Abbrechen
          </button>
        </div>
      </div>
    `;

    // Wire close and cancel
    modalEl.querySelector('#report-modal-close').onclick = closeModal;
    modalEl.querySelector('#report-cancel-btn').onclick = closeModal;

    // Wire Chip Selection
    const chipBtns = modalEl.querySelectorAll('.report-chip');
    chipBtns.forEach(btn => {
      btn.onclick = () => {
        chipBtns.forEach(b => b.classList.remove('report-chip--active'));
        btn.classList.add('report-chip--active');
        selectedCategory = btn.getAttribute('data-category-label');
      };
    });

    // Wire Submit
    const submitBtn = modalEl.querySelector('#report-submit-btn');
    const feedbackEl = modalEl.querySelector('#report-feedback-area');
    const messageInput = modalEl.querySelector('#report-message-input');

    submitBtn.onclick = async () => {
      const message = messageInput.value.trim();

      // Submit state
      submitBtn.disabled = true;
      submitBtn.textContent = 'Wird gesendet...';
      feedbackEl.style.display = 'none';

      try {
        const payload = {
          userName: user.name || 'Unbekannt',
          profileId: user.profile_id || 'LOCAL',
          category: selectedCategory,
          message: message,
          userAgent: navigator.userAgent,
          windowSize: `${window.innerWidth}x${window.innerHeight}`,
          appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.1',
          currentRoute: window.location.hash || '#/'
        };

        const res = await fetch('./api/report.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          renderSuccess();
        } else {
          throw new Error(data.error || 'Serverfehler beim Übermitteln');
        }
      } catch (err) {
        feedbackEl.style.display = 'block';
        feedbackEl.style.color = 'var(--color-danger)';
        feedbackEl.textContent = `Fehler: ${err.message || 'Meldung konnte nicht gesendet werden.'}`;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Erneut versuchen';
      }
    };
  }

  function renderSuccess() {
    modalEl.innerHTML = `
      <div class="bottom-sheet report-modal-sheet" style="text-align: center; padding: 24px 16px;">
        <div style="color: var(--color-accent); font-size: 2rem; margin-bottom: 12px; display: flex; justify-content: center;">
          ${PixelCheck}
        </div>
        <h3 style="font-size: 1.15rem; font-weight: 800; text-transform: uppercase; margin-bottom: 8px;">
          Meldung erhalten!
        </h3>
        <p style="font-size: 0.85rem; color: var(--color-text-muted); line-height: 1.5; margin-bottom: 20px;">
          Vielen Dank für deine Hilfe. Deine Rückmeldung wurde erfolgreich an die Entwickler übermittelt.
        </p>
        <button id="report-success-done-btn" class="btn btn--primary btn--block">
          Fertig
        </button>
      </div>
    `;

    const doneBtn = modalEl.querySelector('#report-success-done-btn');
    if (doneBtn) {
      doneBtn.onclick = closeModal;
    }
  }

  renderForm();
}

// Make globally accessible for contextual triggers across the app
if (typeof window !== 'undefined') {
  window.openReportModal = openReportModal;
}
