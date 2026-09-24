import { PixelWarning } from '../data/pixelIcons.js';

/**
 * Helper to display inline error banners and optionally attach a report button.
 * @param {HTMLElement} errorEl The element with class "error-banner"
 * @param {string} message The error message to display
 * @param {Object} options Configuration options
 * @param {boolean} options.reportable Whether this is a technical error that should show the "Problem melden" button
 * @param {string} options.category The category prefilled in the report modal (e.g. 'Buchung', 'Profil')
 */
export function showInlineError(errorEl, message, options = {}) {
  if (!errorEl) return;
  
  const isReportable = !!options.reportable;
  const category = options.category || 'Sonstiges';

  errorEl.innerHTML = '';
  errorEl.style.display = 'block';

  const textNode = document.createElement('div');
  textNode.textContent = message;
  errorEl.appendChild(textNode);

  if (isReportable) {
    const reportBtn = document.createElement('button');
    reportBtn.className = 'toast-report-btn';
    reportBtn.type = 'button';
    reportBtn.style.marginTop = '10px';
    reportBtn.style.width = '100%';
    reportBtn.innerHTML = `${PixelWarning} <span>Problem melden</span>`;
    reportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window !== 'undefined' && window.openReportModal) {
        window.openReportModal({
          prefillCategory: category,
          prefillMessage: message
        });
      }
    });
    errorEl.appendChild(reportBtn);
  }
}
