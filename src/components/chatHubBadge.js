/**
 * ChaletWeShare — Smart Communication Hub (Chat & Conflict Badge / Session Manager)
 * Option B: Dynamic Bauhaus action button in header.
 * - Shows ⚡ (Red) when there are active conflicts requiring resolution.
 * - Shows 💬 (Primary Blue) when there are open chats & discussions.
 * - Completely hidden when there are 0 conflicts and 0 active chats.
 */

import { PixelLightning, PixelCancel, PixelHandshake, PixelDice, PixelChat } from '../data/pixelIcons.js';
import { renderAvatarMarkup } from '../data/avatars.js';
import { formatDateFriendly } from '../utils/dateUtils.js';
import { escapeHtml } from '../utils/htmlUtils.js';
import { reservationStore } from '../engine/reservationStore.js';
import { reservationEngine } from '../engine/reservationEngine.js';
import { confirmDialog } from './confirmDialog.js';
import { notificationToast } from './notificationToast.js';

export class ChatHubBadge {
  constructor(containerEl, user, options = {}) {
    this.containerEl = containerEl;
    this.user = user;
    this.options = options;
    this.activeConflicts = [];
    this.activeChats = [];
    this.isLoadingChats = false;
    this.overlayEl = null;
    this.handleVisibilityChange = null;
    this.handleFocus = null;
    this.handlePushReceived = null;
    this.unsubscribeStore = null;
    this.pollInterval = null;
  }

  render() {
    this.containerEl.innerHTML = `
      <button type="button" id="btn-chat-hub" class="notif-badge-btn chat-hub-btn is-hidden" title="Kommunikation & Konflikte" aria-label="Kommunikation & Konflikte" style="display: none;">
        <span class="notif-badge-btn__icon chat-hub-icon">${PixelLightning}</span>
        <span id="chat-hub-count-badge" class="notif-badge-count chat-hub-count is-hidden" style="border-color: #1A1A1A;">0</span>
      </button>
    `;

    const btn = this.containerEl.querySelector('#btn-chat-hub');
    if (btn) {
      btn.addEventListener('click', () => {
        this.openDrawer();
      });
    }

    this.refresh();
    this.setupListeners();
  }

  setupListeners() {
    this.stopPolling();

    this.handleVisibilityChange = () => {
      if (!document.hidden) {
        this.refresh();
        this.pollInterval = setInterval(() => this.fetchActiveChats(), 25000);
      } else {
        this.stopPolling();
      }
    };
    this.handleFocus = () => {
      this.refresh();
    };
    this.handlePushReceived = () => {
      this.refresh();
    };

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('focus', this.handleFocus);
    window.addEventListener('chaletPushReceived', this.handlePushReceived);

    if (typeof reservationEngine.subscribe === 'function') {
      this.unsubscribeStore = reservationEngine.subscribe(() => {
        this.activeConflicts = this.getActiveConflicts();
        this.updateBadgeUI();
        this.fetchActiveChats();
      });
    }

    if (!document.hidden) {
      this.pollInterval = setInterval(() => this.fetchActiveChats(), 25000);
    }
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  destroy() {
    this.stopPolling();
    if (this.handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.handleVisibilityChange = null;
    }
    if (this.handleFocus) {
      window.removeEventListener('focus', this.handleFocus);
      this.handleFocus = null;
    }
    if (this.handlePushReceived) {
      window.removeEventListener('chaletPushReceived', this.handlePushReceived);
      this.handlePushReceived = null;
    }
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    this.closeDrawer();
  }

  getActiveConflicts() {
    if (!this.user) return [];
    const currentUserId = Number(this.user.id);
    const currentUserName = this.user.name;

    return (reservationStore.reservations || []).filter((r) => {
      const isConflict = r.status === 'vetoed' || r.status === 'conflict';
      const hasVetoes = Array.isArray(r.vetoes) && r.vetoes.length > 0;
      if (!isConflict && !hasVetoes) return false;
      if (r.status === 'cancelled' || r.status === 'booked') return false;

      const isRequester = Number(r.userId || r.user_id) === currentUserId || (r.userName || r.user_name) === currentUserName;
      const isVetoer = hasVetoes && r.vetoes.some((v) =>
        Number(v.user_id || v.userId) === currentUserId || (v.user_name || v.userName) === currentUserName
      );

      return isRequester || isVetoer;
    });
  }

  getFilteredChats() {
    const conflictIds = this.activeConflicts.map((c) => Number(c.id));
    return (this.activeChats || []).filter((chat) => {
      if (chat.type === 'reservation' && conflictIds.includes(Number(chat.target_id))) {
        return false;
      }
      return true;
    });
  }

  updateBadgeUI() {
    const btn = this.containerEl.querySelector('#btn-chat-hub');
    const icon = this.containerEl.querySelector('.chat-hub-icon');
    const badge = this.containerEl.querySelector('#chat-hub-count-badge');
    if (!btn || !icon || !badge) return;

    const conflictCount = this.activeConflicts.length;
    const filteredChats = this.getFilteredChats();
    const chatCount = filteredChats.length;

    if (conflictCount > 0) {
      // Urgent conflict mode: Red Lightning
      btn.style.display = 'flex';
      btn.classList.remove('is-hidden');
      btn.classList.remove('is-chat-mode');
      btn.classList.add('is-conflict-mode');
      btn.title = `Aktive Konflikte (${conflictCount}) & Diskussionen`;

      icon.style.color = 'var(--color-danger)';
      icon.innerHTML = PixelLightning;

      badge.classList.remove('is-hidden');
      badge.classList.remove('is-chat-mode');
      badge.classList.add('is-conflict-mode');
      badge.textContent = conflictCount > 99 ? '99+' : String(conflictCount);
    } else if (chatCount > 0) {
      // Active discussion mode: Bauhaus Blue Chat Bubble
      btn.style.display = 'flex';
      btn.classList.remove('is-hidden');
      btn.classList.remove('is-conflict-mode');
      btn.classList.add('is-chat-mode');
      btn.title = `Offene Diskussionen & Chats (${chatCount})`;

      icon.style.color = 'var(--color-primary)';
      icon.innerHTML = PixelChat;

      badge.classList.remove('is-hidden');
      badge.classList.remove('is-conflict-mode');
      badge.classList.add('is-chat-mode');
      badge.textContent = chatCount > 99 ? '99+' : String(chatCount);
    } else {
      // Clean state: Completely hidden
      btn.style.display = 'none';
      btn.classList.add('is-hidden');
      btn.classList.remove('is-conflict-mode', 'is-chat-mode');
      badge.classList.add('is-hidden');
      if (this.overlayEl && !this.isLoadingChats) {
        this.closeDrawer();
      }
    }
  }

  refresh() {
    this.activeConflicts = this.getActiveConflicts();
    this.updateBadgeUI();
    this.fetchActiveChats();
  }

  async fetchActiveChats() {
    this.isLoadingChats = true;
    try {
      const profileId = localStorage.getItem('chalet_profile_id') || '';
      const syncToken = localStorage.getItem('chalet_sync_token') || '';
      if (!profileId || !syncToken) {
        this.activeChats = [];
        return;
      }
      const response = await fetch(
        `./api/chat.php?action=my_active_chats&profile_id=${encodeURIComponent(profileId)}&sync_token=${encodeURIComponent(syncToken)}`
      );
      const data = await response.json();
      if (data.success && Array.isArray(data.chats)) {
        this.activeChats = data.chats;
      } else {
        this.activeChats = [];
      }
    } catch (e) {
      console.error('Failed to fetch active chats', e);
      this.activeChats = [];
    } finally {
      this.isLoadingChats = false;
      this.updateBadgeUI();
      if (this.overlayEl) {
        this.renderDrawerList();
      }
    }
  }

  openDrawer() {
    if (this.overlayEl) return;

    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'notif-drawer-overlay chat-hub-drawer-overlay';
    this.overlayEl.setAttribute('role', 'dialog');
    this.overlayEl.setAttribute('aria-modal', 'true');
    this.overlayEl.setAttribute('aria-label', 'Diskussionen und Konflikte');

    const conflictCount = this.activeConflicts.length;
    const isConflictMode = conflictCount > 0;
    const accentColor = isConflictMode ? 'var(--color-danger)' : 'var(--color-primary)';
    const headerTitle = isConflictMode ? `${PixelLightning} DISKUSSIONEN & KONFLIKTE` : `${PixelChat} OFFENE DISKUSSIONEN & CHATS`;

    this.overlayEl.innerHTML = `
      <div class="notif-drawer chat-hub-drawer" style="border-top: 4px solid ${accentColor};">
        <div class="notif-drawer__header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="notif-drawer__title" style="display: flex; align-items: center; gap: 6px; color: ${accentColor};">
              ${headerTitle}
            </span>
            <span id="chat-hub-unread-tag" style="font-size: 0.72rem; font-weight: 800; background: ${accentColor}; color: #ffffff; border: 1px solid var(--color-border); padding: 2px 6px;">
              ...
            </span>
          </div>
          <button id="btn-close-chat-hub" class="btn btn--icon" aria-label="Schliessen">
            ${PixelCancel}
          </button>
        </div>
        <div class="notif-drawer__list" style="padding: 10px 12px; gap: 10px; display: flex; flex-direction: column;">
          <!-- Conflicts Section -->
          <div id="chat-hub-conflicts-section" style="${isConflictMode ? '' : 'display: none;'}">
            <div style="font-size: 0.75rem; font-weight: 800; color: var(--color-danger); text-transform: uppercase; margin-bottom: 6px;">
              Konflikte (Aktion erforderlich)
            </div>
            <div id="chat-hub-conflicts-container" style="display: flex; flex-direction: column; gap: 10px;"></div>
            <div style="height: 1px; background: var(--color-border); margin: 10px 0;"></div>
          </div>
          
          <!-- Chats Section -->
          <div id="chat-hub-chats-section">
            <div id="chat-hub-chats-header" style="font-size: 0.75rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase; margin-bottom: 6px;">
              ${isConflictMode ? 'Weitere Offene Chats' : 'Laufende Chats & Absprachen'}
            </div>
            <div id="chat-hub-chats-container" style="display: flex; flex-direction: column; gap: 10px;">
              <div style="text-align: center; font-size: 0.8rem; color: var(--color-text-muted); padding: 10px;">Lade Chats...</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const containerEl = document.getElementById('global-overlays') || document.body;
    containerEl.appendChild(this.overlayEl);

    this.overlayEl.addEventListener('click', (e) => {
      if (e.target === this.overlayEl) {
        this.closeDrawer();
      }
    });

    this.overlayEl.querySelector('#btn-close-chat-hub').addEventListener('click', () => {
      this.closeDrawer();
    });

    this.renderDrawerList();
    this.fetchActiveChats();
  }

  closeDrawer() {
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
  }

  renderDrawerList() {
    if (!this.overlayEl) return;
    const conflictsSection = this.overlayEl.querySelector('#chat-hub-conflicts-section');
    const conflictsContainer = this.overlayEl.querySelector('#chat-hub-conflicts-container');
    const chatsContainer = this.overlayEl.querySelector('#chat-hub-chats-container');
    const chatsHeader = this.overlayEl.querySelector('#chat-hub-chats-header');
    const tagEl = this.overlayEl.querySelector('#chat-hub-unread-tag');
    const drawerEl = this.overlayEl.querySelector('.notif-drawer');
    const titleEl = this.overlayEl.querySelector('.notif-drawer__title');

    const conflictCount = this.activeConflicts.length;
    const filteredChats = this.getFilteredChats();
    const chatCount = filteredChats.length;

    // Dynamic Header Styling
    if (conflictCount > 0) {
      if (drawerEl) drawerEl.style.borderTop = '4px solid var(--color-danger)';
      if (titleEl) {
        titleEl.style.color = 'var(--color-danger)';
        titleEl.innerHTML = `${PixelLightning} DISKUSSIONEN & KONFLIKTE`;
      }
      if (tagEl) {
        tagEl.style.background = 'var(--color-danger)';
        tagEl.textContent = `${conflictCount} Konflikt${conflictCount !== 1 ? 'e' : ''}`;
      }
      if (conflictsSection) conflictsSection.style.display = 'block';
      if (chatsHeader) chatsHeader.textContent = 'Weitere Offene Chats';
    } else {
      if (drawerEl) drawerEl.style.borderTop = '4px solid var(--color-primary)';
      if (titleEl) {
        titleEl.style.color = 'var(--color-primary)';
        titleEl.innerHTML = `${PixelChat} OFFENE DISKUSSIONEN & CHATS`;
      }
      if (tagEl) {
        tagEl.style.background = 'var(--color-primary)';
        tagEl.textContent = `${chatCount} Chat${chatCount !== 1 ? 's' : ''}`;
      }
      if (conflictsSection) conflictsSection.style.display = 'none';
      if (chatsHeader) chatsHeader.textContent = 'Laufende Chats & Absprachen';
    }

    if (!conflictsContainer || !chatsContainer) return;

    // 1. Render Conflicts
    if (conflictCount === 0) {
      conflictsContainer.innerHTML = '';
    } else {
      const currentUserId = Number(this.user.id);
      const currentUserName = this.user.name;

      conflictsContainer.innerHTML = this.activeConflicts
        .map((c) => {
          const friendlyDates = `${formatDateFriendly(c.dateStart || c.date_start)} – ${formatDateFriendly(c.dateEnd || c.date_end)}`;
          const isRequester = Number(c.userId || c.user_id) === currentUserId || (c.userName || c.user_name) === currentUserName;

          const rawVetoes = c.vetoes || [];
          const firstVeto = rawVetoes.length > 0 ? rawVetoes[0] : null;

          let opponentName, opponentAvatar, roleLabel, roleStyle;
          if (isRequester) {
            opponentName = firstVeto ? (firstVeto.user_name || firstVeto.userName || 'Geschwister') : 'Veto-Partei';
            opponentAvatar = firstVeto ? (firstVeto.user_avatar || firstVeto.userAvatar || 'fox') : 'fox';
            roleLabel = 'Deine Erstanfrage';
            roleStyle = 'background: #DCFCE7; color: #166534; border: 1px solid #86EFAC;';
          } else {
            opponentName = c.userName || c.user_name || 'Geschwister';
            opponentAvatar = c.userAvatar || c.user_avatar || 'swan';
            roleLabel = 'Dein Veto';
            roleStyle = 'background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5;';
          }

          const activeProposal = c.conflictProposal || null;
          const hasProposalFromOpponent = activeProposal && Number(activeProposal.proposer_user_id) !== currentUserId;
          const proposalMarkup = hasProposalFromOpponent
            ? `<div style="margin-top: 6px; font-size: 0.75rem; background: #FEF3C7; color: #92400E; border: 1px solid #F59E0B; padding: 3px 6px; font-weight: 800; display: flex; align-items: center; gap: 4px;">
                ${activeProposal.proposal_type === 'shared' ? PixelHandshake : PixelDice} Neuer Vorschlag (${activeProposal.proposal_type === 'shared' ? 'Doppelnutzung' : 'Würfeln'}) von ${escapeHtml(opponentName)}!
              </div>`
            : '';

          return `
            <div class="card card-conflict-session" data-res-id="${c.id}" style="border: var(--border); border-left: 6px solid var(--color-danger); padding: 10px 12px; cursor: pointer; background: var(--color-surface); box-shadow: var(--shadow-brutal-sm); transition: transform 0.1s ease;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; padding: 2px 6px; ${roleStyle}">
                  ${roleLabel}
                </span>
                <span style="font-size: 0.76rem; font-weight: 700; color: var(--color-text-muted);">
                  ${friendlyDates}
                </span>
              </div>

              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                  ${renderAvatarMarkup(opponentAvatar, 32)}
                  <div style="min-width: 0;">
                    <div style="font-size: 0.85rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      Konflikt mit ${escapeHtml(opponentName)}
                    </div>
                    <div style="font-size: 0.75rem; color: var(--color-text-muted); display: flex; align-items: center; gap: 4px;">
                      ${PixelChat} Chat & Einigung ansehen
                    </div>
                  </div>
                </div>
                <button class="btn btn--sm btn--primary" style="font-size: 0.72rem; padding: 6px 10px; white-space: nowrap; flex-shrink: 0;" tabindex="-1">
                  Öffnen →
                </button>
              </div>

              ${proposalMarkup}
            </div>
          `;
        })
        .join('');
    }

    // Bind conflict clicks
    conflictsContainer.querySelectorAll('.card-conflict-session').forEach((el) => {
      el.addEventListener('click', () => {
        const resId = el.dataset.resId;
        this.closeDrawer();
        if (typeof this.options.onConflictClick === 'function') {
          this.options.onConflictClick(resId);
        }
      });
    });

    // 2. Render Chats
    if (this.isLoadingChats) {
      chatsContainer.innerHTML = `<div style="text-align: center; font-size: 0.8rem; color: var(--color-text-muted); padding: 10px;">Lade Chats...</div>`;
    } else {
      if (filteredChats.length === 0) {
        chatsContainer.innerHTML = `
          <div class="notif-empty" style="padding: 12px 12px; text-align: center; color: var(--color-text-muted); font-size: 0.85rem;">
            ${conflictCount > 0 ? 'Keine weiteren offenen Chats gefunden.' : 'Aktuell keine offenen Chats vorhanden.'}
          </div>
        `;
      } else {
        chatsContainer.innerHTML = filteredChats
          .map((chat) => {
            const friendlyDates = `${formatDateFriendly(chat.date_start)} – ${formatDateFriendly(chat.date_end)}`;
            const chatTitle = chat.type === 'maintenance' ? `Unterhalt (${chat.owner_name})` : `Reservation (${chat.owner_name})`;

            let cleanMessage = chat.latest_message || '';
            if (cleanMessage.length > 50) cleanMessage = cleanMessage.substring(0, 47) + '...';

            return `
              <div class="card card-chat-session" data-type="${chat.type}" data-target-id="${chat.target_id}" data-date="${chat.date_start}" style="border: var(--border); padding: 10px 12px; cursor: pointer; background: var(--color-surface); box-shadow: var(--shadow-brutal-sm); transition: transform 0.1s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; background: #F1F5F9; color: #475569; padding: 2px 6px; border: 1px solid #CBD5E1;">
                    ${chatTitle}
                  </span>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 0.76rem; font-weight: 700; color: var(--color-text-muted);">
                      ${friendlyDates}
                    </span>
                    <button class="btn btn--icon btn--sm btn-dismiss-chat" data-type="${chat.type}" data-target-id="${chat.target_id}" data-owner="${escapeHtml(chat.owner_name)}" title="Chat schliessen / verlassen" aria-label="Chat schliessen / verlassen" style="width: 22px; height: 22px; min-height: 22px; padding: 0; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: none;">
                      ${PixelCancel}
                    </button>
                  </div>
                </div>
                
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                  ${renderAvatarMarkup(chat.latest_message_avatar, 24)}
                  <div style="font-size: 0.8rem; font-style: italic; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">
                    ${chat.latest_message_author}: "${escapeHtml(cleanMessage)}"
                  </div>
                </div>
              </div>
            `;
          })
          .join('');

        // Bind dismiss clicks
        chatsContainer.querySelectorAll('.btn-dismiss-chat').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const type = btn.dataset.type;
            const targetId = Number(btn.dataset.targetId);
            const ownerName = btn.dataset.owner;
            const isOwner = (ownerName === this.user.name);

            const confirmed = await confirmDialog({
              title: isOwner ? 'Chat abschliessen' : 'Chat verlassen',
              message: isOwner
                ? 'Möchtest du diesen Chat für alle als erledigt markieren und aus den aktiven Diskussionen entfernen?'
                : 'Möchtest du diesen Chat aus deinen aktiven Diskussionen entfernen? Du kannst ihn bei Bedarf jederzeit über das Datum im Kalender wieder aufrufen.',
              confirmLabel: isOwner ? 'Abschliessen' : 'Verlassen',
              cancelLabel: 'Abbrechen',
              isDanger: false
            });

            if (!confirmed) return;

            const res = await reservationEngine.dismissChat({
              reservationId: type === 'reservation' ? targetId : null,
              maintenanceId: type === 'maintenance' ? targetId : null,
              scope: isOwner ? 'all' : 'user'
            });

            if (res.success) {
              notificationToast.show('ChaletWeShare', res.message || 'Chat entfernt.');
              await this.fetchActiveChats();
            } else {
              notificationToast.show('ChaletWeShare', res.error || 'Fehler beim Schliessen.', { isError: true });
            }
          });
        });

        // Bind chat clicks
        chatsContainer.querySelectorAll('.card-chat-session').forEach((el) => {
          el.addEventListener('click', (e) => {
            if (e.target.closest('.btn-dismiss-chat')) return;
            const dateStr = el.dataset.date;
            const type = el.dataset.type;
            const targetId = el.dataset.targetId;
            this.closeDrawer();
            if (typeof this.options.onChatClick === 'function') {
              this.options.onChatClick(dateStr, { type, targetId });
            }
          });
        });
      }
    }
  }
}
