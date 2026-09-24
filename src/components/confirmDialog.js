import { escapeHtml } from '../utils/htmlUtils.js';
import { PixelWarning, PixelCheck, PixelCancel } from '../data/pixelIcons.js';

/**
 * Bauhaus-styled confirmation bottom sheet dialog to replace native confirm() and alert().
 *
 * @param {Object} options
 * @param {string} options.title - Dialog title (e.g. "Reservation stornieren")
 * @param {string} options.message - Body text explaining the action
 * @param {string} [options.confirmLabel='Bestätigen'] - Confirm button label
 * @param {string} [options.cancelLabel='Abbrechen'] - Cancel button label
 * @param {boolean} [options.isDanger=false] - If true, confirm button uses danger styling
 * @returns {Promise<boolean>} - Resolves true if confirmed, false if cancelled
 */
export function confirmDialog({
  title,
  message,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  isDanger = false
}) {
  return new Promise((resolve) => {
    let globalOverlays = document.getElementById('global-overlays');
    if (!globalOverlays) {
      globalOverlays = document.createElement('div');
      globalOverlays.id = 'global-overlays';
      document.body.appendChild(globalOverlays);
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'bottom-sheet-backdrop confirm-dialog-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'confirm-dialog-title');

    const icon = isDanger ? PixelWarning : PixelCheck;
    const formattedMessage = escapeHtml(message).replace(/\n/g, '<br>');

    backdrop.innerHTML = `
      <div class="bottom-sheet confirm-dialog" style="max-height: 90vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: var(--border-thick); background: ${isDanger ? 'var(--color-danger)' : 'var(--color-accent)'}; color: #fff; flex-shrink: 0; box-shadow: var(--shadow-brutal-sm);">
              ${icon}
            </div>
            <div>
              <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: ${isDanger ? 'var(--color-danger)' : 'var(--color-accent)'}; letter-spacing: 0.05em;">
                ${isDanger ? 'Achtung' : 'Bestätigung'}
              </span>
              <h3 id="confirm-dialog-title" style="margin: 0; font-size: 1.15rem; font-weight: 900; text-transform: uppercase; letter-spacing: -0.01em;">
                ${escapeHtml(title)}
              </h3>
            </div>
          </div>
          <button id="confirm-dialog-close" class="btn btn--icon btn--sm" aria-label="Schliessen" type="button">
            ${PixelCancel}
          </button>
        </div>

        <div class="confirm-dialog__message">
          ${formattedMessage}
        </div>

        <div class="confirm-dialog__actions">
          <button id="confirm-dialog-btn-confirm" class="btn btn--block ${isDanger ? 'btn--danger' : 'btn--primary'}" type="button">
            ${escapeHtml(confirmLabel)}
          </button>
          <button id="confirm-dialog-btn-cancel" class="btn btn--block" type="button">
            ${escapeHtml(cancelLabel)}
          </button>
        </div>
      </div>
    `;

    let settled = false;

    function cleanup(result) {
      if (settled) return;
      settled = true;
      window.removeEventListener('keydown', handleKeyDown);
      if (backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }
      resolve(result);
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        cleanup(false);
      }
    }

    const closeBtn = backdrop.querySelector('#confirm-dialog-close');
    const cancelBtn = backdrop.querySelector('#confirm-dialog-btn-cancel');
    const confirmBtn = backdrop.querySelector('#confirm-dialog-btn-confirm');

    closeBtn.addEventListener('click', () => cleanup(false));
    cancelBtn.addEventListener('click', () => cleanup(false));
    confirmBtn.addEventListener('click', () => cleanup(true));

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        cleanup(false);
      }
    });

    window.addEventListener('keydown', handleKeyDown);
    globalOverlays.appendChild(backdrop);

    // Focus confirm button for accessibility
    setTimeout(() => {
      confirmBtn.focus();
    }, 50);
  });
}
