import anime from 'animejs';
import { profileManager } from '../engine/profileManager.js';
import { PixelLockEmoji } from '../data/pixelIcons.js';
import { escapeHtml } from '../utils/htmlUtils.js';
import { showInlineError } from '../utils/errorUtils.js';

export function renderAuthGate(container, onUnlocked) {
  container.innerHTML = `
    <div class="auth-gate">
      <div class="auth-gate__card">
        <div style="display: flex; align-items: center; justify-content: space-between; position: relative;">
          <div class="auth-gate__logo-box" aria-label="Sicherer Familienbereich">
            ${PixelLockEmoji(48)}
          </div>
        </div>

        <div>
          <h1 style="margin-bottom: 4px; letter-spacing: -0.02em;">CHALET ZAHLER</h1>
          <p style="color: var(--color-text-muted); font-family: var(--font-mono); font-size: 0.85rem; font-weight: 600;">
            Hilterfingen – Oberhofen
          </p>
        </div>

        <div id="auth-error-container" class="error-banner" style="display: none; margin-bottom: 12px;"></div>

        <form id="auth-gate-form" style="display: flex; flex-direction: column; gap: 14px;">
          <div class="input-group" style="margin-bottom: 0;">
            <label class="input-label" for="gate-password">Familien-Passwort</label>
            <input 
              type="password" 
              id="gate-password" 
              class="input-text" 
              placeholder="Passwort eingeben..."
              autocomplete="current-password"
              required 
              autofocus
            />
          </div>

          <button type="submit" id="auth-submit-btn" class="btn btn--primary btn--block" style="margin-top: 6px;">
            Login
          </button>
        </form>

      </div>
    </div>
  `;

  const form = container.querySelector('#auth-gate-form');
  const passwordInput = container.querySelector('#gate-password');
  const submitBtn = container.querySelector('#auth-submit-btn');
  const errorContainer = container.querySelector('#auth-error-container');
  const cardEl = container.querySelector('.auth-gate__card');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = passwordInput.value;
    if (!password) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Prüfen...';
    errorContainer.style.display = 'none';

    const result = await profileManager.unlockGate(password);
    if (result.success) {
      if (typeof onUnlocked === 'function') {
        onUnlocked();
      }
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Login';
      showInlineError(errorContainer, result.error || 'Falsches Passwort', { reportable: false });
      if (cardEl) {
        anime({
          targets: cardEl,
          translateX: [-10, 10, -7, 7, -4, 4, 0],
          duration: 380,
          easing: 'easeInOutSine'
        });
      }
      passwordInput.select();
    }
  });
}
