/**
 * ChaletWeShare — Micro-Chat for Conflict Discussions & Maintenance Overlap
 */

import { reservationEngine } from '../engine/reservationEngine.js';
import { formatDateFriendly } from '../utils/dateUtils.js';
import { PixelChat, PixelHandshake, PixelDice, PixelFlag, PixelCancel, PixelWrench, PixelCheck } from '../data/pixelIcons.js';
import { renderAvatarMarkup } from '../data/avatars.js';
import { escapeHtml } from '../utils/htmlUtils.js';
import { profileManager } from '../engine/profileManager.js';
import { confirmDialog } from './confirmDialog.js';
import { playConfettiCelebration } from './confettiAnimation.js';
import { notificationToast } from './notificationToast.js';

export let activeMicroChatContext = null;

export function openMicroChat({ container, reservation = null, maintenance = null, user, onAction, onClose, onOverlapAllowed }) {
  const isMaintenance = !!maintenance;
  const resId = reservation?.id || null;
  const maintId = maintenance?.id || null;

  activeMicroChatContext = { resId, maintId };

  const startDate = isMaintenance ? (maintenance.dateStart || maintenance.date_start) : (reservation.dateStart || reservation.date_start);
  const endDate = isMaintenance ? (maintenance.dateEnd || maintenance.date_end) : (reservation.dateEnd || reservation.date_end);
  const friendlyDates = `${formatDateFriendly(startDate)} – ${formatDateFriendly(endDate)}`;

  const isRequester = !isMaintenance && (Number(user.id) === Number(reservation.userId || reservation.user_id));
  const isOwner = isMaintenance && (Number(user.id) === Number(maintenance.userId || maintenance.user_id));

  let headerTag = `${PixelChat} Diskussion zu Konflikt`;
  let headerTitle = friendlyDates;
  let headerSubtitle = '';

  if (isMaintenance) {
    headerTag = `<span style="color: #E5609B; display: inline-flex; align-items: center; gap: 4px;">${PixelWrench} Unterhalt-Absprache</span>`;
    headerSubtitle = `<div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">Unterhalt: <strong>${escapeHtml(maintenance.reason || 'Unterhalt')}</strong> (von ${escapeHtml(maintenance.userName || maintenance.user_name || 'Familie')})</div>`;
  }

  // Quick Action Bar HTML
  let actionBarHtml = '';
  if (!isMaintenance) {
    const sharedLabel = isRequester ? 'Doppelnutzung' : 'Vorschlag: Doppelnutzung';
    const rngLabel = isRequester ? 'Würfeln' : 'Vorschlag: Würfeln';
    actionBarHtml = `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 8px 0; border-bottom: 1px solid rgba(26,26,26,0.1);">
        <button id="chat-act-shared" class="btn btn--sm" style="font-size: 0.7rem; padding: 4px 2px; display: flex; align-items: center; justify-content: center; gap: 4px; ${!isRequester ? 'background: #F0FDF4; border: 1px solid #2ECC71; color: #15803D;' : ''}">
          ${PixelHandshake} ${sharedLabel}
        </button>
        <button id="chat-act-rng" class="btn btn--sm" style="font-size: 0.7rem; padding: 4px 2px; display: flex; align-items: center; justify-content: center; gap: 4px; ${!isRequester ? 'background: #FEF3C7; border: 1px solid #F59E0B; color: #B45309;' : ''}">
          ${PixelDice} ${rngLabel}
        </button>
        <button id="chat-act-withdraw" class="btn btn--sm btn--danger" style="font-size: 0.7rem; padding: 4px 2px; display: flex; align-items: center; justify-content: center; gap: 4px;">
          ${PixelFlag} Zurückziehen
        </button>
      </div>
    `;
  } else {
    const userAlreadyApproved = Array.isArray(maintenance.approvals) && maintenance.approvals.some(a => (a.allowed_user_id == user.id || a.allowedUserId == user.id));
    if (isOwner) {
      actionBarHtml = `
        <div style="padding: 8px 0; border-bottom: 1px solid rgba(26,26,26,0.1);">
          <button id="chat-act-allow-overlap" class="btn btn--block btn--primary" style="background: #2ECC71; color: #FFFFFF; font-weight: 800; font-size: 0.78rem; border-color: #1A1A1A; display: flex; align-items: center; justify-content: center; gap: 6px;">
            ${PixelHandshake} Mitnutzung (Doppelnutzung) offiziell erlauben
          </button>
        </div>
      `;
    } else if (userAlreadyApproved) {
      actionBarHtml = `
        <div style="padding: 6px 0; border-bottom: 1px solid rgba(26,26,26,0.1);">
          <div style="background: #F0FFF4; border: 1px solid #008000; color: #008000; font-weight: 800; font-size: 0.75rem; text-align: center; padding: 4px 6px;">
            ${PixelCheck} Doppelnutzung erlaubt! Du kannst diesen Zeitraum im Kalender buchen.
          </div>
        </div>
      `;
    } else {
      actionBarHtml = `
        <div style="padding: 6px 0; border-bottom: 1px solid rgba(26,26,26,0.1);">
          <div style="background: #FFFBEB; border: 1px solid #F59E0B; color: #B45309; font-weight: 700; font-size: 0.75rem; text-align: center; padding: 4px 6px;">
            💬 Frage nach, ob du das Chalet während des Unterhalts mitnutzen kannst.
          </div>
        </div>
      `;
    }
  }

  container.style.display = 'flex';
  container.innerHTML = `
    <div class="bottom-sheet" style="max-height: 85vh; display: flex; flex-direction: column;" id="chat-sheet-content">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: var(--border); padding-bottom: 8px;">
        <div>
          <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--color-accent); display: flex; align-items: center; gap: 4px;">
            ${headerTag}
          </span>
          <h3 style="margin-top: 2px; font-size: 1rem;">${headerTitle}</h3>
          ${headerSubtitle}
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button id="chat-leave-btn" class="btn btn--sm" style="font-size: 0.72rem; padding: 4px 8px; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-muted);" title="${isOwner || isRequester ? 'Chat abschliessen' : 'Chat verlassen'}">
            ${isOwner || isRequester ? 'Abschliessen' : 'Verlassen'}
          </button>
          <button id="chat-close-btn" class="btn btn--icon btn--sm" aria-label="Schliessen">${PixelCancel}</button>
        </div>
      </div>

      <!-- Quick Resolution Action Bar -->
      ${actionBarHtml}

      <!-- Message History Container -->
      <div id="chat-messages-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 12px 0; min-height: 180px; max-height: 320px;">
        <div style="text-align: center; color: var(--color-text-muted); font-size: 0.8rem;">
          Lade Nachrichten...
        </div>
      </div>

      <!-- Message Input Form -->
      <form id="chat-form" style="display: flex; gap: 6px; border-top: var(--border); padding-top: 10px;">
        <input type="text" id="chat-input" class="input-text" placeholder="Nachricht schreiben..." style="flex: 1; min-height: 40px;" autocomplete="off" required>
        <button type="submit" class="btn btn--black btn--sm" style="min-width: 70px;">
          Senden
        </button>
      </form>
    </div>
  `;

  const msgList = container.querySelector('#chat-messages-list');
  const chatForm = container.querySelector('#chat-form');
  const chatInput = container.querySelector('#chat-input');
  const closeBtn = container.querySelector('#chat-close-btn');

  const ACTIVE_INTERVAL = 15000;
  const IDLE_INTERVAL = 60000;
  const IDLE_THRESHOLD = 120000;

  let pollTimer = null;
  let lastActivityTime = Date.now();
  let lastMessageCount = 0;
  let currentMessages = [];

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function getNextInterval() {
    const isIdle = Date.now() - lastActivityTime > IDLE_THRESHOLD;
    return isIdle ? IDLE_INTERVAL : ACTIVE_INTERVAL;
  }

  function scheduleNextPoll() {
    stopPolling();
    if (document.hidden) return;

    const delay = getNextInterval();
    pollTimer = setTimeout(async () => {
      await loadMessages();
      scheduleNextPoll();
    }, delay);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stopPolling();
    } else {
      loadMessages();
      scheduleNextPoll();
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);

  function handlePushReceived(e) {
    const payload = e?.detail;
    const notifResId = payload?.data?.reservation_id || payload?.reservation_id;
    const notifMaintId = payload?.data?.maintenance_id || payload?.maintenance_id;
    if ((resId && (!notifResId || String(notifResId) === String(resId))) ||
        (maintId && (!notifMaintId || String(notifMaintId) === String(maintId)))) {
      lastActivityTime = Date.now();
      loadMessages();
      scheduleNextPoll();
    }
  }

  window.addEventListener('chaletPushReceived', handlePushReceived);

  function handleBackdropClick(e) {
    if (e.target === container) {
      close();
    }
  }
  container.addEventListener('click', handleBackdropClick);

  function close() {
    activeMicroChatContext = null;
    stopPolling();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('chaletPushReceived', handlePushReceived);
    container.removeEventListener('click', handleBackdropClick);
    container.style.display = 'none';
    container.innerHTML = '';
    if (onClose) onClose();
  }

  closeBtn.addEventListener('click', close);

  const leaveBtn = container.querySelector('#chat-leave-btn');
  if (leaveBtn) {
    leaveBtn.addEventListener('click', async () => {
      const isOwnerRole = isMaintenance ? isOwner : isRequester;
      const confirmed = await confirmDialog({
        title: isOwnerRole ? 'Chat abschliessen' : 'Chat verlassen',
        message: isOwnerRole
          ? 'Möchtest du diesen Chat für alle als erledigt markieren und aus den aktiven Diskussionen entfernen?'
          : 'Möchtest du diesen Chat aus deinen aktiven Diskussionen entfernen? Du kannst ihn bei Bedarf jederzeit über das Datum im Kalender wieder aufrufen.',
        confirmLabel: isOwnerRole ? 'Abschliessen' : 'Verlassen',
        cancelLabel: 'Abbrechen',
        isDanger: false
      });

      if (!confirmed) return;

      const res = await reservationEngine.dismissChat({
        reservationId: resId,
        maintenanceId: maintId,
        scope: isOwnerRole ? 'all' : 'user'
      });

      if (res.success) {
        notificationToast.show('ChaletWeShare', res.message || 'Chat geschlossen.');
        close();
      } else {
        notificationToast.show('ChaletWeShare', res.error || 'Fehler beim Schliessen.', { isError: true });
      }
    });
  }

  async function loadMessages() {
    const messages = await reservationEngine.fetchChatMessages(resId, maintId);
    currentMessages = messages || [];

    if (!messages || messages.length === 0) {
      msgList.innerHTML = `
        <div style="text-align: center; color: var(--color-text-muted); font-size: 0.8rem; padding: 16px 0;">
          ${isMaintenance ? 'Noch keine Nachrichten. Schreib die erste Frage zur Mitnutzung!' : 'Noch keine Nachrichten. Schreib die erste Nachricht zur Einigung!'}
        </div>
      `;
      return;
    }

    if (messages.length > lastMessageCount) {
      lastActivityTime = Date.now();
      lastMessageCount = messages.length;
    }

    msgList.innerHTML = messages
      .map((m) => {
        const isMe = m.user_id == user.id || m.user_name === user.name;
        const timeStr = m.created_at ? m.created_at.substring(11, 16) : '';

        // Check for official approval system message
        if (m.message && m.message.includes('🤝') && m.message.includes('Mitnutzung')) {
          return `
            <div style="width: 100%; text-align: center; margin: 6px 0;">
              <span style="background: #DCFCE7; color: #15803D; border: 1px solid #2ECC71; font-weight: 800; font-size: 0.75rem; padding: 4px 10px; display: inline-block; box-shadow: 1px 1px 0px #1A1A1A;">
                ${escapeHtml(m.message)}
              </span>
            </div>
          `;
        }

        return `
          <div style="display: flex; gap: 8px; ${isMe ? 'align-self: flex-end; flex-direction: row-reverse;' : 'align-self: flex-start;'} max-width: 85%;">
            ${renderAvatarMarkup(m.user_avatar || 'swan', 28)}
            <div style="background: ${isMe ? '#EBDAD0' : 'var(--color-surface)'}; border: var(--border); padding: 6px 10px; font-size: 0.85rem; box-shadow: 1px 1px 0px #1A1A1A;">
              <div style="font-size: 0.7rem; font-weight: 800; color: ${isMe ? 'var(--color-accent)' : 'var(--color-text)'}; display: flex; justify-content: space-between; gap: 8px; margin-bottom: 2px;">
                <span>${escapeHtml(m.user_name)}</span>
                <span style="color: var(--color-text-muted); font-weight: 500;">${timeStr}</span>
              </div>
              <div style="word-break: break-word;">${escapeHtml(m.message)}</div>
            </div>
          </div>
        `;
      })
      .join('');

    msgList.scrollTop = msgList.scrollHeight;
  }

  loadMessages();
  scheduleNextPoll();

  // Send message
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    lastActivityTime = Date.now();
    await reservationEngine.sendChatMessage(resId, text, maintId);
    await loadMessages();
    scheduleNextPoll();
  });

  // Action buttons for reservation conflict
  const sharedBtn = container.querySelector('#chat-act-shared');
  if (sharedBtn) {
    sharedBtn.addEventListener('click', () => {
      close();
      if (onAction) onAction('shared');
    });
  }

  const rngBtn = container.querySelector('#chat-act-rng');
  if (rngBtn) {
    rngBtn.addEventListener('click', () => {
      close();
      if (onAction) onAction('rng');
    });
  }

  const withdrawBtn = container.querySelector('#chat-act-withdraw');
  if (withdrawBtn) {
    withdrawBtn.addEventListener('click', () => {
      close();
      if (onAction) onAction('withdraw');
    });
  }

  // Action button for maintenance owner: allow overlap
  const allowOverlapBtn = container.querySelector('#chat-act-allow-overlap');
  if (allowOverlapBtn) {
    allowOverlapBtn.addEventListener('click', async () => {
      // Find candidate sibling who is asking
      const interlocutor = currentMessages.find(m => m.user_id != user.id);
      const allProfiles = profileManager.getProfiles() || [];
      let targetSibling = null;

      if (interlocutor) {
        targetSibling = allProfiles.find(p => p.id == interlocutor.user_id || p.name === interlocutor.user_name);
      }
      if (!targetSibling) {
        // Fallback: pick the first other sibling
        targetSibling = allProfiles.find(p => p.id != user.id);
      }

      if (!targetSibling) return;

      const confirmed = await confirmDialog({
        title: 'Mitnutzung erlauben',
        message: `Möchtest du ${targetSibling.name} offiziell erlauben, das Chalet während deines Unterhalts parallel zu nutzen?`,
        confirmLabel: 'Erlauben (OK)',
        isDanger: false
      });

      if (!confirmed) return;

      allowOverlapBtn.disabled = true;
      allowOverlapBtn.textContent = 'Wird erlaubt...';

      const res = await reservationEngine.allowMaintenanceOverlap({
        maintenanceId: maintId,
        allowedUserId: targetSibling.id
      });

      if (res.success) {
        playConfettiCelebration({
          text: 'Mitnutzung erlaubt!',
          subtext: `${targetSibling.name} darf parallel buchen`
        });
        await loadMessages();
        if (onOverlapAllowed) onOverlapAllowed();
      } else {
        allowOverlapBtn.disabled = false;
        allowOverlapBtn.textContent = 'Mitnutzung offiziell erlauben';
        alert(res.error || 'Fehler beim Erlauben.');
      }
    });
  }
}
