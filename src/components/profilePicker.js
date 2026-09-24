/**
 * ChaletWeShare — Profile Picker (Smart Fast-Pass, Device Linked Profiles & Family Roster)
 */

import { profileManager } from '../engine/profileManager.js';
import { AVATAR_OPTIONS, renderAvatarMarkup } from '../data/avatars.js';
import { PixelLock, PixelHandshake, PixelKey, PixelCheck, PixelCancel } from '../data/pixelIcons.js';
import { escapeHtml } from '../utils/htmlUtils.js';
import { playSunAndBirdAnimation } from './sillyAnimations.js';
import { showInlineError } from '../utils/errorUtils.js';
import { confirmDialog } from './confirmDialog.js';

export async function renderProfilePicker(container, onProfileSelected, options = {}) {
  let profiles = await profileManager.fetchProfiles();
  let isCreating = false;
  let showFullRoster = options.forceRoster || false;
  let selectedAvatarId = AVATAR_OPTIONS[0].id;

  function getDeviceProfilesState() {
    const lastActiveId = profileManager.getLastActiveProfileId();
    const linkedIds = profileManager.getLinkedProfileIds();

    let primary = null;
    if (lastActiveId) {
      primary = profiles.find(p => p.profile_id === lastActiveId) || null;
    }
    if (!primary && linkedIds.length > 0) {
      primary = profiles.find(p => linkedIds.includes(p.profile_id)) || null;
    }

    const otherLinked = profiles.filter(p =>
      linkedIds.includes(p.profile_id) && (!primary || p.profile_id !== primary.profile_id)
    );

    const unlinked = profiles.filter(p =>
      !linkedIds.includes(p.profile_id) && (!primary || p.profile_id !== primary.profile_id)
    );

    return { primary, otherLinked, unlinked };
  }

  function render() {
    const { primary, otherLinked, unlinked } = getDeviceProfilesState();
    const atMax = profiles.length >= 12;
    const shouldShowRoster = !primary || showFullRoster || options.forceRoster;

    let headerTitle = 'Wer bist du?';
    if (options.forceRoster) {
      headerTitle = 'Profil wechseln';
    } else if (primary) {
      headerTitle = 'Willkommen zurück!';
    }

    container.innerHTML = `
      <div class="app-content" style="max-width: var(--max-width); margin: 0 auto; padding-top: 24px;">
        <header style="margin-bottom: 24px; border-bottom: var(--border-thick); padding-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
          <div>
            <div style="font-size: 0.75rem; font-weight: 800; letter-spacing: 0.05em; color: var(--color-accent); text-transform: uppercase;">
              Chalet Alpenrose
            </div>
            <h1 style="margin-top: 2px;">${headerTitle}</h1>
          </div>
          <div style="font-size: 0.8rem; font-weight: 700; background: var(--color-surface); border: var(--border); padding: 4px 8px; box-shadow: var(--shadow-brutal-sm);">
            ${profiles.length} / 12 Profile
          </div>
        </header>

        <div id="picker-feedback"></div>

        <!-- Primary Profile Card -->
        ${primary ? (
          options.forceRoster ? `
            <div class="card" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; margin-bottom: 20px; border: var(--border-thick); background: var(--color-surface); box-shadow: var(--shadow-brutal-sm);">
              <div style="display: flex; align-items: center; gap: 12px;">
                ${renderAvatarMarkup(primary.avatar, 40)}
                <div>
                  <div style="font-size: 0.7rem; font-weight: 800; color: #008744; text-transform: uppercase;">Auf diesem Gerät aktiv</div>
                  <div style="font-size: 1.05rem; font-weight: 900;">${escapeHtml(primary.name)}</div>
                </div>
              </div>
              <button id="btn-fastpass-continue" class="btn btn--primary btn--sm" style="padding: 6px 12px; font-size: 0.8rem; font-weight: 800;">
                Weiter als ${escapeHtml(primary.name)} →
              </button>
            </div>
          ` : `
            <div class="card" style="border: var(--border-thick); box-shadow: var(--shadow-brutal); text-align: center; padding: 24px 20px; margin-bottom: 20px; background: var(--color-surface);">
              <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <div style="display: inline-block; padding: 8px; background: var(--color-bg); border: var(--border); box-shadow: var(--shadow-brutal-sm);">
                  ${renderAvatarMarkup(primary.avatar, 64)}
                </div>
                <div>
                  <div style="font-size: 1.35rem; font-weight: 900; letter-spacing: -0.01em;">
                    ${escapeHtml(primary.name)}
                  </div>
                  <div style="font-size: 0.75rem; font-weight: 800; color: #008744; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">
                    ${PixelCheck} Auf diesem Gerät aktiv
                  </div>
                </div>
              </div>

              <button id="btn-fastpass-continue" class="btn btn--primary btn--block" style="margin-top: 20px; font-size: 1.05rem; padding: 12px; font-weight: 800;">
                Weiter als ${escapeHtml(primary.name)} →
              </button>

              <div style="margin-top: 12px; display: flex; justify-content: center;">
                <button id="btn-unlink-primary" class="btn btn--sm" style="font-size: 0.7rem; border: none; background: transparent; color: var(--color-text-muted); text-decoration: underline; cursor: pointer;">
                  Vom Gerät trennen
                </button>
              </div>
            </div>
          `
        ) : ''}

        <!-- Other Linked Profiles on this Device (e.g. shared tablet) -->
        ${otherLinked.length > 0 ? `
          <div style="margin-bottom: 20px;">
            <div style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); margin-bottom: 8px;">
              Ebenfalls auf diesem Gerät gekoppelt:
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${otherLinked.map(p => `
                <div class="card" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    ${renderAvatarMarkup(p.avatar, 36)}
                    <span style="font-weight: 800; font-size: 0.95rem;">${escapeHtml(p.name)}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <button class="btn btn--sm btn--primary select-linked-btn" data-profile-id="${p.profile_id}" style="padding: 4px 10px; font-size: 0.75rem;">
                      Auswählen →
                    </button>
                    <button class="btn btn--icon btn--sm unlink-device-btn" data-profile-id="${p.profile_id}" style="font-size: 0.7rem; color: var(--color-text-muted);" title="Vom Gerät trennen">
                      ${PixelCancel}
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Expander Button (Only shown if primary profile exists and NOT in forced roster mode) -->
        ${primary && !options.forceRoster ? `
          <div style="margin-bottom: 20px; text-align: center;">
            <button id="btn-toggle-roster" class="btn btn--sm" style="background: var(--color-surface); border: var(--border); font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
              <span>${showFullRoster ? '▲' : '▾'}</span>
              <span>${showFullRoster ? 'Familien-Optionen ausblenden' : 'Anderes Profil wählen oder neu erstellen'}</span>
            </button>
          </div>
        ` : ''}

        <!-- Secondary Section: Create New or Pick from Family -->
        ${shouldShowRoster ? `
          <div id="roster-section">
            <!-- Add Profile Button or Creation Sheet -->
            ${!isCreating ? `
              <button id="btn-show-create" class="btn btn--primary btn--block" ${atMax ? 'disabled' : ''} style="margin-bottom: 20px;">
                ${atMax ? 'Limit erreicht (12 Profile)' : '+ Neues Profil erstellen'}
              </button>
            ` : `
              <div class="card" style="border: var(--border-thick); margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                  <h2>Neues Profil erstellen</h2>
                  <button id="btn-cancel-create" class="btn btn--sm">Abbrechen</button>
                </div>

                <form id="create-profile-form">
                  <!-- Live Profile Preview Card -->
                  <div id="create-profile-preview" style="background: #FFFFFF; border: var(--border); box-shadow: var(--shadow-brutal-sm); padding: 12px 14px; margin-bottom: 16px; display: flex; align-items: center; gap: 14px;">
                    <div id="preview-avatar-wrap">
                      ${renderAvatarMarkup(selectedAvatarId, 48)}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                      <div style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted);">
                        Profil-Vorschau
                      </div>
                      <div id="preview-name-label" style="font-size: 1.15rem; font-weight: 800; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        Dein Name
                      </div>
                    </div>
                  </div>

                  <div class="input-group">
                    <label class="input-label" for="new-profile-name">Name</label>
                    <input type="text" id="new-profile-name" class="input-text" placeholder="Z.B. Elena" required maxlength="30" autofocus />
                  </div>

                  <div class="input-group">
                    <label class="input-label">Pixel-Avatar wählen</label>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 6px;">
                      ${AVATAR_OPTIONS.map(a => `
                        <div class="avatar-select-cell ${a.id === selectedAvatarId ? 'is-selected' : ''}" data-avatar-choice="${a.id}" style="border: ${a.id === selectedAvatarId ? '3px solid var(--color-accent)' : 'var(--border)'}; padding: 8px 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--color-surface); box-shadow: var(--shadow-brutal-sm); transition: transform 0.1s ease;" title="${a.label}">
                          ${renderAvatarMarkup(a.id, 42)}
                        </div>
                      `).join('')}
                    </div>
                  </div>

                  <button type="submit" id="btn-submit-profile" class="btn btn--black btn--block" style="margin-top: 16px;">
                    Profil speichern & loslegen
                  </button>
                </form>
              </div>
            `}

            <!-- Family Roster Grid -->
            ${(primary ? unlinked : profiles).length > 0 && !isCreating ? `
              <div style="margin-bottom: 24px;">
                <div style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); margin-bottom: 10px;">
                  ${primary ? 'Weitere Profile der Familie verknüpfen:' : 'Bestehendes Profil mit diesem Gerät koppeln:'}
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                  ${(primary ? unlinked : profiles).map(p => {
                    const hasToken = !!(profileManager.getStoredToken(p.profile_id) || p.sync_token);
                    return `
                      <div class="card profile-card" data-profile-id="${p.profile_id}" style="cursor: pointer; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 12px; position: relative;">
                        ${renderAvatarMarkup(p.avatar, 48)}
                        <div style="font-weight: 800; font-size: 0.95rem; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                          ${escapeHtml(p.name)}
                        </div>
                        <div style="font-size: 0.7rem; font-weight: 700; ${hasToken ? 'color: #008744;' : 'color: var(--color-accent);'} display: flex; align-items: center; justify-content: center; gap: 4px;">
                          ${hasToken ? `${PixelCheck} Gekoppelt` : `${PixelKey} Gerät koppeln`}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <div style="text-align: center; margin-top: 30px;">
          <button id="btn-relock" class="btn btn--sm" style="opacity: 0.7; display: inline-flex; align-items: center; gap: 4px;">
            ${PixelLock} Abmelden
          </button>
        </div>
      </div>
    `;

    attachEvents();
  }

  function attachEvents() {
    const { primary } = getDeviceProfilesState();

    // Fast-pass continue
    const fastpassBtn = container.querySelector('#btn-fastpass-continue');
    if (fastpassBtn && primary) {
      fastpassBtn.addEventListener('click', () => {
        const storedToken = profileManager.getStoredToken(primary.profile_id) || primary.sync_token;
        const userWithToken = { ...primary, sync_token: storedToken };
        profileManager.setActiveProfile(userWithToken);
        if (typeof onProfileSelected === 'function') {
          onProfileSelected(userWithToken);
        }
      });
    }

    // Unlink primary profile from this device
    const unlinkPrimaryBtn = container.querySelector('#btn-unlink-primary');
    if (unlinkPrimaryBtn && primary) {
      unlinkPrimaryBtn.addEventListener('click', async () => {
        if (await confirmDialog({
          title: 'Profil trennen',
          message: `Möchtest du das Profil "${primary.name}" von diesem Gerät trennen?\n\n(Das Profil bleibt im Chalet-System für andere Geräte erhalten)`,
          confirmLabel: 'Trennen',
          isDanger: true
        })) {
          if (navigator.vibrate) navigator.vibrate(10);
          profileManager.unlinkDevice(primary.profile_id);
          showFullRoster = true;
          render();
        }
      });
    }

    // Quick select other linked profiles on this device
    container.querySelectorAll('.select-linked-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const profileId = btn.dataset.profileId;
        const p = profiles.find(x => x.profile_id === profileId);
        if (!p) return;
        const storedToken = profileManager.getStoredToken(profileId) || p.sync_token;
        const userWithToken = { ...p, sync_token: storedToken };
        profileManager.setActiveProfile(userWithToken);
        if (typeof onProfileSelected === 'function') {
          onProfileSelected(userWithToken);
        }
      });
    });

    // Unlink secondary linked profiles from this device
    container.querySelectorAll('.unlink-device-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const profileId = btn.dataset.profileId;
        const p = profiles.find(x => x.profile_id === profileId);
        const name = p ? p.name : 'dieses Profil';
        if (await confirmDialog({
          title: 'Profil trennen',
          message: `Möchtest du das Profil "${name}" von diesem Gerät trennen?`,
          confirmLabel: 'Trennen',
          isDanger: true
        })) {
          if (navigator.vibrate) navigator.vibrate(10);
          profileManager.unlinkDevice(profileId);
          render();
        }
      });
    });

    // Toggle roster expander
    const toggleRosterBtn = container.querySelector('#btn-toggle-roster');
    if (toggleRosterBtn) {
      toggleRosterBtn.addEventListener('click', () => {
        showFullRoster = !showFullRoster;
        render();
      });
    }

    // Select/Link from family roster
    container.querySelectorAll('.profile-card').forEach(card => {
      card.addEventListener('click', () => {
        const profileId = card.dataset.profileId;
        const profile = profiles.find(p => p.profile_id === profileId);
        if (!profile) return;

        const storedToken = profileManager.getStoredToken(profileId) || profile.sync_token;
        if (storedToken) {
          const userWithToken = { ...profile, sync_token: storedToken };
          profileManager.setActiveProfile(userWithToken);
          if (typeof onProfileSelected === 'function') {
            onProfileSelected(userWithToken);
          }
        } else {
          openLinkModal(profile);
        }
      });
    });

    // Toggle create form
    const showCreateBtn = container.querySelector('#btn-show-create');
    if (showCreateBtn) {
      showCreateBtn.addEventListener('click', () => {
        isCreating = true;
        render();
      });
    }

    const cancelCreateBtn = container.querySelector('#btn-cancel-create');
    if (cancelCreateBtn) {
      cancelCreateBtn.addEventListener('click', () => {
        isCreating = false;
        render();
      });
    }

    // Live Profile Preview syncing
    const newNameInput = container.querySelector('#new-profile-name');
    const previewNameLabel = container.querySelector('#preview-name-label');
    const previewAvatarWrap = container.querySelector('#preview-avatar-wrap');

    if (newNameInput && previewNameLabel) {
      newNameInput.addEventListener('input', () => {
        previewNameLabel.textContent = newNameInput.value.trim() || 'Dein Name';
      });
    }

    // Avatar pick
    container.querySelectorAll('.avatar-select-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        selectedAvatarId = cell.dataset.avatarChoice;
        container.querySelectorAll('.avatar-select-cell').forEach(c => {
          if (c.dataset.avatarChoice === selectedAvatarId) {
            c.classList.add('is-selected');
            c.style.border = '3px solid var(--color-accent)';
          } else {
            c.classList.remove('is-selected');
            c.style.border = 'var(--border)';
          }
        });
        if (previewAvatarWrap) {
          previewAvatarWrap.innerHTML = renderAvatarMarkup(selectedAvatarId, 48);
        }
      });
    });

    // Submit new profile
    const form = container.querySelector('#create-profile-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = container.querySelector('#new-profile-name');
        const name = nameInput.value.trim();
        if (!name) return;

        const submitBtn = container.querySelector('#btn-submit-profile');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Speichern...';

        const result = await profileManager.createProfile(name, selectedAvatarId);
        if (result.success) {
          isCreating = false;
          profiles = await profileManager.fetchProfiles();
          playSunAndBirdAnimation({
            text: `WILLKOMMEN, ${result.user.name.toUpperCase()}!`,
            subtext: 'Dein Profil im Chalet Alpenrose ist bereit'
          });
          if (typeof onProfileSelected === 'function') {
            onProfileSelected(result.user);
          } else {
            render();
          }
        } else {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Profil speichern & loslegen';
          const feedback = container.querySelector('#picker-feedback');
          if (feedback) {
            feedback.innerHTML = `<div class="error-banner" style="margin-bottom: 12px;"></div>`;
            const banner = feedback.querySelector('.error-banner');
            showInlineError(banner, result.error || 'Fehler beim Erstellen des Profils.', {
              reportable: !!result.isTechnical,
              category: 'Profil'
            });
            feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      });
    }

    // Lock gate button
    const relockBtn = container.querySelector('#btn-relock');
    if (relockBtn) {
      relockBtn.addEventListener('click', () => {
        profileManager.lockGate();
        location.reload();
      });
    }
  }

  function openLinkModal(profile) {
    const existing = document.querySelector('.modal-backdrop');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal card" style="max-width: 400px; width: 90%; border: var(--border-thick); box-shadow: var(--shadow-brutal-lg); animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="font-size: 1.15rem; display: flex; align-items: center; gap: 8px;">
            ${PixelHandshake} Profil verknüpfen
          </h2>
          <button id="btn-close-link-modal" class="btn btn--icon btn--sm" aria-label="Schliessen">${PixelCancel}</button>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; background: var(--color-surface); padding: 10px; border: var(--border);">
          ${renderAvatarMarkup(profile.avatar, 44)}
          <div>
            <div style="font-weight: 800; font-size: 1.05rem;">${escapeHtml(profile.name)}</div>
            <div style="font-size: 0.75rem; color: var(--color-text-muted);">Dieses Profil ist auf diesem Gerät noch nicht gekoppelt.</div>
          </div>
        </div>

        <p style="font-size: 0.85rem; color: var(--color-text-muted); line-height: 1.4; margin-bottom: 14px;">
          Gib bitte den <strong>6-stelligen Koppel-Code</strong> ein. Du findest ihn auf deinem anderen Gerät unter <em>Profil → Geräte-Kopplung</em>.
        </p>

        <form id="link-device-form">
          <div id="link-modal-error" style="display: none; margin-bottom: 12px;"></div>

          <div class="input-group" style="margin-bottom: 16px;">
            <label class="input-label" for="link-sync-code">6-stelliger Koppel-Code</label>
            <input 
              type="text" 
              id="link-sync-code" 
              class="input-text" 
              placeholder="z.B. A3F9B2" 
              maxlength="6" 
              required 
              autofocus 
              autocomplete="off" 
              style="font-family: var(--font-mono); font-size: 1.4rem; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; text-align: center;" 
            />
          </div>

          <div style="display: flex; gap: 8px;">
            <button type="button" id="btn-cancel-link" class="btn btn--block">Abbrechen</button>
            <button type="submit" id="btn-submit-link" class="btn btn--primary btn--block">Verknüpfen</button>
          </div>

          <div style="margin-top: 14px; padding-top: 12px; border-top: var(--border); text-align: center;">
            <div style="font-size: 0.72rem; color: var(--color-text-muted); margin-bottom: 6px;">
              Anderes Gerät gerade nicht zur Hand?
            </div>
            <button type="button" id="btn-instant-link-fallback" class="btn btn--sm btn--block" style="font-size: 0.74rem; padding: 6px 8px; background: var(--color-surface); border: var(--border); display: flex; align-items: center; justify-content: center; gap: 6px;">
              ${PixelKey} Sofort auf diesem Gerät aktivieren
            </button>
          </div>
        </form>
      </div>
    `;

    const containerEl = document.getElementById('global-overlays') || document.body;
    containerEl.appendChild(modal);

    const close = () => {
      modal.remove();
    };

    modal.querySelector('#btn-close-link-modal').addEventListener('click', close);
    modal.querySelector('#btn-cancel-link').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    const form = modal.querySelector('#link-device-form');
    const inputCode = modal.querySelector('#link-sync-code');
    const errorEl = modal.querySelector('#link-modal-error');
    const submitBtn = modal.querySelector('#btn-submit-link');
    const instantBtn = modal.querySelector('#btn-instant-link-fallback');

    if (instantBtn) {
      instantBtn.addEventListener('click', async () => {
        if (!(await confirmDialog({
          title: 'Profil aktivieren',
          message: `Möchtest du das Profil "${profile.name}" direkt auf diesem Gerät aktivieren?\n\n(Es wird ein neuer Koppel-Code für dieses Gerät erstellt)`,
          confirmLabel: 'Aktivieren'
        }))) return;
        instantBtn.disabled = true;
        instantBtn.textContent = 'Wird aktiviert...';
        const res = await profileManager.resetSyncToken(profile.profile_id);
        const token = res.sync_token || ('token_' + Math.random().toString(36).substring(2, 16));
        profileManager.saveStoredToken(profile.profile_id, token);
        const userWithToken = { ...profile, sync_token: token };
        profileManager.setActiveProfile(userWithToken);
        close();
        playSunAndBirdAnimation({
          text: 'ERFOLGREICH AKTIVIERT!',
          subtext: `Willkommen zurück, ${profile.name}`
        });
        if (typeof onProfileSelected === 'function') {
          onProfileSelected(userWithToken);
        } else {
          render();
        }
      });
    }

    inputCode.focus();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = inputCode.value.trim();
      if (code.length < 4) {
        showInlineError(errorEl, 'Bitte gib den vollständigen Koppel-Code ein.', { reportable: false });
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Prüfen...';
      errorEl.style.display = 'none';

      const result = await profileManager.linkDevice(profile.profile_id, code);
      if (result.success) {
        close();
        playSunAndBirdAnimation({
          text: 'ERFOLGREICH GEKOPPELT!',
          subtext: `Willkommen zurück, ${result.user.name}`
        });
        if (typeof onProfileSelected === 'function') {
          onProfileSelected(result.user);
        } else {
          render();
        }
      } else {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Verknüpfen';
        showInlineError(errorEl, result.error || 'Ungültiger Code.', { reportable: false });
      }
    });
  }

  render();
}
