/**
 * ChaletWeShare — Notification Badge & Drawer Component
 * Bauhaus style bell icon with unread count and slide-down drawer.
 */

import { PixelBell, PixelCalendar, PixelWarning, PixelCheck, PixelParty, PixelCancel, PixelChat, PixelWrench, PixelBroom, PixelLeaf, PixelVote, PixelStats, PixelTrash } from '../data/pixelIcons.js';
import { escapeHtml } from '../utils/htmlUtils.js';
import { notificationToast } from './notificationToast.js';
import { reservationEngine } from '../engine/reservationEngine.js';
import { activeMicroChatContext } from './microChat.js';

export class NotificationBadge {
  constructor(containerEl, user, options = {}) {
    this.containerEl = containerEl;
    this.user = user;
    this.options = options;
    this.unreadCount = 0;
    this.overlayEl = null;
    this.currentTab = 'unread'; // 'unread' or 'read'
    this.notificationsCache = [];
    this.handleVisibilityChange = null;
    this.handleFocus = null;
    this.handlePushReceived = null;
    this.pollInterval = null;
  }

  render() {
    this.containerEl.innerHTML = `
      <button type="button" id="btn-notifications" class="notif-badge-btn" title="Mitteilungen" aria-label="Mitteilungen">
        <span class="notif-badge-btn__icon">${PixelBell}</span>
        <span id="notif-count-badge" class="notif-badge-count is-hidden">0</span>
      </button>
    `;

    this.containerEl.querySelector('#btn-notifications').addEventListener('click', () => {
      this.openDrawer();
    });

    this.fetchCount();
    this.setupListeners();
  }

  setupListeners() {
    this.stopPolling();
    this.handleVisibilityChange = () => {
      if (!document.hidden) {
        this.fetchCount();
        this.pollInterval = setInterval(() => this.fetchCount(), 25000);
      } else {
        if (this.pollInterval) {
          clearInterval(this.pollInterval);
          this.pollInterval = null;
        }
      }
    };
    this.handleFocus = () => {
      this.fetchCount();
    };
    this.handlePushReceived = (e) => {
      const data = e.detail || {};
      const payload = data.data || {};

      // Anti-Spam / Context Awareness:
      // If this push relates to a chat message and user is actively in that exact microChat,
      // suppress the distracting banner toast over their screen/keyboard.
      if (payload.type === 'chat_message') {
        if (activeMicroChatContext) {
          const sameRes = payload.reservation_id && String(payload.reservation_id) === String(activeMicroChatContext.resId);
          const sameMaint = payload.maintenance_id && String(payload.maintenance_id) === String(activeMicroChatContext.maintId);
          if (sameRes || sameMaint) {
            return;
          }
        }
      }

      this.fetchCount();
      reservationEngine.loadCalendarData();
      notificationToast.show(data.title || 'ChaletWeShare', data.body || 'Neue Mitteilung', () => this.openDrawer());
    };

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('focus', this.handleFocus);
    window.addEventListener('chaletPushReceived', this.handlePushReceived);

    if (!document.hidden) {
      this.pollInterval = setInterval(() => this.fetchCount(), 25000);
    }
  }

  startPolling() {
    // Retained for backward-compat; delegates to event-driven listeners
    this.setupListeners();
  }

  stopPolling() {
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
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  refresh() {
    return this.fetchCount();
  }

  async fetchCount() {
    if (!this.user || !this.user.id || !this.user.sync_token) return;

    try {
      const res = await fetch('./api/notifications.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'count_unread',
          user_id: this.user.id,
          sync_token: this.user.sync_token,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          this.updateBadge(data.count);
          return;
        }
      }
    } catch (err) {
      // Gracefully ignore network errors on poll, fall through to local fallback
    }

    const notifs = this._getLocalNotifications();
    const unread = notifs.filter((n) => !n.is_read).length;
    this.updateBadge(unread);
  }

  updateBadge(count) {
    const previousCount = this.unreadCount;
    this.unreadCount = count;
    // When new notifications arrive, reload calendar data
    if (count > previousCount) {
      reservationEngine.loadCalendarData();
    }
    const badgeEl = this.containerEl.querySelector('#notif-count-badge');
    if (badgeEl) {
      if (count > 0) {
        badgeEl.textContent = count > 99 ? '99+' : count;
        badgeEl.classList.remove('is-hidden');
      } else {
        badgeEl.textContent = '0';
        badgeEl.classList.add('is-hidden');
      }
    }

    // App Badging API (iOS Safari 16.4+ / desktop PWA)
    if ('setAppBadge' in navigator) {
      try {
        if (count > 0) {
          navigator.setAppBadge(count).catch(() => {});
        } else {
          navigator.clearAppBadge().catch(() => {});
        }
      } catch (e) {
        // Silently ignore if badging is not permitted or fails
      }
    }
  }

  async openDrawer() {
    if (this.overlayEl) return;

    this.currentTab = 'unread';

    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'notif-drawer-overlay';
    this.overlayEl.setAttribute('role', 'dialog');
    this.overlayEl.setAttribute('aria-modal', 'true');
    this.overlayEl.setAttribute('aria-label', 'Mitteilungen');
    this.overlayEl.innerHTML = `
      <div class="notif-drawer">
        <div class="notif-drawer__header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="notif-drawer__title">MITTEILUNGEN</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <button id="btn-mark-all-read" class="btn" style="padding: 6px 10px; font-size: 0.72rem; min-height: 32px; display: none;">
              Alle gelesen
            </button>
            <button id="btn-close-drawer" class="btn btn--icon" aria-label="Schliessen">
              ${PixelCancel}
            </button>
          </div>
        </div>
        <div class="notif-tabs" role="tablist">
          <button type="button" class="notif-tab is-active" data-tab="unread" id="notif-tab-unread" role="tab" aria-selected="true">
            <span>Neu</span>
            <span class="notif-tab__badge" id="tab-unread-count" style="display: none;">0</span>
          </button>
          <button type="button" class="notif-tab" data-tab="read" id="notif-tab-read" role="tab" aria-selected="false">
            <span>Bisherige</span>
            <span class="notif-tab__badge" id="tab-read-count" style="display: none;">0</span>
          </button>
          <button type="button" id="btn-clear-read" class="btn btn--icon notif-tab-action" title="Bisherige löschen" aria-label="Bisherige Mitteilungen löschen" style="display: none; padding: 6px; min-height: 32px; border: var(--border); box-shadow: 1px 1px 0px #000;">
            ${PixelTrash}
          </button>
        </div>
        <div class="notif-drawer__list" id="notif-list-container">
          <div style="display: flex; flex-direction: column; gap: 10px; padding: 8px 0;">
            <div class="skeleton skeleton-card" style="height: 60px; box-shadow: var(--shadow-brutal-sm);"></div>
            <div class="skeleton skeleton-card" style="height: 60px; box-shadow: var(--shadow-brutal-sm);"></div>
            <div class="skeleton skeleton-card" style="height: 60px; box-shadow: var(--shadow-brutal-sm); width: 80%;"></div>
          </div>
        </div>
      </div>
    `;

    const containerEl = document.getElementById('global-overlays') || document.body;
    containerEl.appendChild(this.overlayEl);

    // Event listeners
    this.overlayEl.addEventListener('click', (e) => {
      if (e.target === this.overlayEl) {
        this.closeDrawer();
      }
    });

    this.overlayEl.querySelector('#btn-close-drawer').addEventListener('click', () => {
      this.closeDrawer();
    });

    this.overlayEl.querySelector('#notif-tab-unread').addEventListener('click', () => {
      this.switchTab('unread');
    });

    this.overlayEl.querySelector('#notif-tab-read').addEventListener('click', () => {
      this.switchTab('read');
    });

    this.overlayEl.querySelector('#btn-mark-all-read').addEventListener('click', async () => {
      await this.markAllRead();
    });

    this.overlayEl.querySelector('#btn-clear-read').addEventListener('click', async () => {
      await this.clearRead();
    });

    await this.loadNotifications();
  }

  closeDrawer() {
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
  }

  switchTab(tab) {
    this.currentTab = tab;
    if (!this.overlayEl) return;

    const unreadTabBtn = this.overlayEl.querySelector('#notif-tab-unread');
    const readTabBtn = this.overlayEl.querySelector('#notif-tab-read');

    if (tab === 'unread') {
      unreadTabBtn?.classList.add('is-active');
      unreadTabBtn?.setAttribute('aria-selected', 'true');
      readTabBtn?.classList.remove('is-active');
      readTabBtn?.setAttribute('aria-selected', 'false');
    } else {
      readTabBtn?.classList.add('is-active');
      readTabBtn?.setAttribute('aria-selected', 'true');
      unreadTabBtn?.classList.remove('is-active');
      unreadTabBtn?.setAttribute('aria-selected', 'false');
    }

    this.updateTabBadges();
    this.renderCurrentList();
  }

  updateTabBadges() {
    if (!this.overlayEl) return;
    const unreadCount = this.notificationsCache.filter((n) => !n.is_read).length;
    const readCount = this.notificationsCache.filter((n) => n.is_read).length;

    const unreadBadge = this.overlayEl.querySelector('#tab-unread-count');
    if (unreadBadge) {
      unreadBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      unreadBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    }

    const readBadge = this.overlayEl.querySelector('#tab-read-count');
    if (readBadge) {
      readBadge.textContent = readCount > 99 ? '99+' : readCount;
      readBadge.style.display = readCount > 0 ? 'inline-block' : 'none';
    }

    const markAllBtn = this.overlayEl.querySelector('#btn-mark-all-read');
    const clearReadBtn = this.overlayEl.querySelector('#btn-clear-read');

    if (this.currentTab === 'unread') {
      if (markAllBtn) markAllBtn.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
      if (clearReadBtn) clearReadBtn.style.display = 'none';
    } else {
      if (markAllBtn) markAllBtn.style.display = 'none';
      if (clearReadBtn) clearReadBtn.style.display = readCount > 0 ? 'inline-flex' : 'none';
    }
  }

  _getLocalNotifications() {
    const key = `chalet_notifs_${this.user ? this.user.id : 'guest'}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {}
    }
    const initial = [
      {
        id: 101,
        type: 'new_reservation',
        message: 'Neue Reservation von Lucas: 25. – 28. Veto möglich.',
        is_read: false,
        related_reservation_id: 'res-demo-2',
        created_at: new Date(Date.now() - 3600000).toISOString().replace('T', ' ').substring(0, 19)
      },
      {
        id: 102,
        type: 'auto_approved',
        message: 'Reservation von Elena: 18. – 21. ist fest gebucht.',
        is_read: true,
        related_reservation_id: 'res-demo-1',
        created_at: new Date(Date.now() - 86400000).toISOString().replace('T', ' ').substring(0, 19)
      }
    ];
    localStorage.setItem(key, JSON.stringify(initial));
    return initial;
  }

  _saveLocalNotifications(notifs) {
    const key = `chalet_notifs_${this.user ? this.user.id : 'guest'}`;
    localStorage.setItem(key, JSON.stringify(Array.isArray(notifs) ? notifs.slice(0, 30) : []));
  }

  async loadNotifications() {
    let notifications = [];
    let isServer = false;

    try {
      const res = await fetch('./api/notifications.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list',
          user_id: this.user.id,
          sync_token: this.user.sync_token,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.notifications)) {
          notifications = data.notifications;
          isServer = true;
        }
      }
    } catch (err) {
      // Fall through to local demo notifications
    }

    if (!isServer) {
      notifications = this._getLocalNotifications();
    }

    this.notificationsCache = Array.isArray(notifications) ? notifications : [];
    this.updateTabBadges();
    this.renderCurrentList();
  }

  renderCurrentList() {
    const listEl = this.overlayEl ? this.overlayEl.querySelector('#notif-list-container') : null;
    if (!listEl) return;

    const isUnreadTab = this.currentTab === 'unread';
    const items = this.notificationsCache.filter((n) => isUnreadTab ? !n.is_read : n.is_read);

    if (items.length === 0) {
      if (isUnreadTab) {
        listEl.innerHTML = `
          <div class="notif-empty notif-empty--inbox-zero">
            <div style="font-size: 1.6rem; color: var(--color-green); margin-bottom: 8px;">${PixelCheck}</div>
            <div style="font-weight: 800; font-size: 0.95rem; margin-bottom: 4px;">Alles erledigt!</div>
            <div style="font-size: 0.78rem; color: var(--color-text-muted);">Keine ungelesenen Mitteilungen vorhanden.</div>
          </div>
        `;
      } else {
        listEl.innerHTML = `
          <div class="notif-empty">
            <div style="font-size: 0.85rem; font-weight: 600; color: var(--color-text-muted);">Keine bisherigen Mitteilungen vorhanden.</div>
          </div>
        `;
      }
      return;
    }

    listEl.innerHTML = items
      .map((n) => {
        const icon = this.getTypeIcon(n.type);
        const unreadCls = !n.is_read ? 'is-unread' : '';
        const timeFormatted = this.formatDate(n.created_at);
        let extractedDate = '';
        if (n.action_payload && n.action_payload.date) {
          extractedDate = n.action_payload.date;
        } else if (n.action_payload && Array.isArray(n.action_payload.proposed_dates) && n.action_payload.proposed_dates[0]) {
          extractedDate = n.action_payload.proposed_dates[0];
        } else {
          const dateMatch = n.message?.match(/\b\d{4}-\d{2}-\d{2}\b/);
          extractedDate = dateMatch ? dateMatch[0] : '';
        }

        let targetResId = n.related_reservation_id || '';
        if (!targetResId && n.action_payload && n.action_payload.reservation_id) {
          targetResId = n.action_payload.reservation_id;
        }

        const isClickable = !!targetResId || !!extractedDate;
        const cleanMsg = this.cleanMessage(n.message);

        return `
          <div class="notif-item ${unreadCls}" data-id="${n.id}" data-res-id="${targetResId}" data-date="${extractedDate}" style="${isClickable ? 'cursor: pointer;' : ''}">
            <span class="notif-item__icon">${icon}</span>
            <div class="notif-item__body">
              <div class="notif-item__message">${this.escapeHtml(cleanMsg)}</div>
              <div class="notif-item__time">${timeFormatted}${isClickable ? ' · <span style="text-decoration: underline;">Im Kalender öffnen →</span>' : ''}</div>
            </div>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('.notif-item').forEach((item) => {
      item.addEventListener('click', async () => {
        const notifId = item.dataset.id ? (parseInt(item.dataset.id, 10) || item.dataset.id) : null;
        const resId = item.dataset.resId || null;
        const targetDate = item.dataset.date || null;

        if (item.classList.contains('is-unread')) {
          await this.markRead([notifId]);
        }

        if (typeof this.options.onNotificationClick === 'function') {
          if (resId || targetDate) {
            this.closeDrawer();
            this.options.onNotificationClick({ reservationId: resId, date: targetDate });
          }
        }
      });
    });
  }

  async markAllRead() {
    try {
      await fetch('./api/notifications.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_all_read',
          user_id: this.user.id,
          sync_token: this.user.sync_token,
        }),
      });
    } catch (err) {
      console.warn('markAllRead server fallback:', err);
    }

    this.notificationsCache.forEach((n) => {
      n.is_read = true;
    });

    const notifs = this._getLocalNotifications().map((n) => ({ ...n, is_read: true }));
    this._saveLocalNotifications(notifs);

    this.updateBadge(0);
    this.updateTabBadges();
    this.renderCurrentList();
  }

  async clearRead() {
    const hasRead = this.notificationsCache.some((n) => n.is_read);
    if (!hasRead) return;

    if (!confirm('Alle bisherigen Mitteilungen unwiderruflich löschen?')) {
      return;
    }

    try {
      await fetch('./api/notifications.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear_read',
          user_id: this.user.id,
          sync_token: this.user.sync_token,
        }),
      });
    } catch (err) {
      console.warn('clearRead server fallback:', err);
    }

    this.notificationsCache = this.notificationsCache.filter((n) => !n.is_read);
    const localRemaining = this._getLocalNotifications().filter((n) => !n.is_read);
    this._saveLocalNotifications(localRemaining);

    this.updateTabBadges();
    this.renderCurrentList();
    notificationToast.show('Verlauf geleert', 'Bisherige Mitteilungen wurden entfernt.');
  }

  async markRead(ids) {
    try {
      await fetch('./api/notifications.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_read',
          user_id: this.user.id,
          sync_token: this.user.sync_token,
          notification_ids: ids,
        }),
      });
    } catch (err) {
      console.warn('markRead server fallback:', err);
    }

    this.notificationsCache.forEach((n) => {
      if (ids.includes(n.id) || ids.includes(String(n.id))) {
        n.is_read = true;
      }
    });

    const notifs = this._getLocalNotifications().map((n) => {
      if (ids.includes(n.id) || ids.includes(String(n.id))) {
        return { ...n, is_read: true };
      }
      return n;
    });
    this._saveLocalNotifications(notifs);

    const unreadCount = this.notificationsCache.filter((n) => !n.is_read).length;
    this.updateBadge(unreadCount);
    this.updateTabBadges();
    this.renderCurrentList();
  }

  getTypeIcon(type) {
    switch (type) {
      case 'new_reservation':
        return PixelCalendar;
      case 'veto':
        return PixelWarning;
      case 'resolved':
        return PixelCheck;
      case 'all_approved':
      case 'auto_approved':
        return PixelParty;
      case 'approval':
        return PixelCheck;
      case 'cancellation':
      case 'working_day_deleted':
        return PixelCancel;
      case 'working_day_created':
        return PixelBroom;
      case 'working_day_rsvp':
        return PixelCheck;
      case 'working_day_proposal':
      case 'working_day_vote_reminder':
        return PixelVote;
      case 'working_day_all_voted':
        return PixelStats;
      case 'working_day_finalized':
        return PixelParty;
      case 'chat_message':
        return PixelChat;
      case 'maintenance_created':
      case 'maintenance_deleted':
      case 'handover_note':
      case 'handover_reminder':
        return PixelWrench;
      case 'arrival_reminder':
        return PixelCalendar;
      default:
        return PixelBell;
    }
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr.replace(' ', 'T'));
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const time = d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });

      if (isToday) {
        return `Heute, ${time} Uhr`;
      }
      return `${d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })}, ${time} Uhr`;
    } catch (e) {
      return dateStr;
    }
  }

  escapeHtml(str) {
    return escapeHtml(str);
  }

  cleanMessage(msg) {
    if (!msg) return '';
    return msg.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '').trim();
  }
}
