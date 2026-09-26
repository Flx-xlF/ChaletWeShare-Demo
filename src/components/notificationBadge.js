/**
 * ChaletWeShare — Notification Badge & Drawer Component
 * Bauhaus style bell icon with unread count and slide-down drawer.
 */

import { PixelBell, PixelCalendar, PixelWarning, PixelCheck, PixelParty, PixelCancel, PixelChat, PixelWrench, PixelBroom, PixelLeaf, PixelVote, PixelStats, PixelTrash } from '../data/pixelIcons.js';
import { escapeHtml } from '../utils/htmlUtils.js';
import { notificationToast } from './notificationToast.js';
import { reservationEngine } from '../engine/reservationEngine.js';
import { reservationStore } from '../engine/reservationStore.js';
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
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const demoDate1 = `${curYear}-${curMonth}-25`;
    const demoDate2 = `${curYear}-${curMonth}-18`;

    const initial = [
      {
        id: 101,
        type: 'new_reservation',
        message: 'Neue Reservation von Beat: 25. – 28. Veto möglich.',
        is_read: false,
        related_reservation_id: 'res-demo-2',
        action_payload: {
          reservation_id: 'res-demo-2',
          date: demoDate1
        },
        created_at: new Date(Date.now() - 3600000).toISOString().replace('T', ' ').substring(0, 19)
      },
      {
        id: 102,
        type: 'auto_approved',
        message: 'Reservation von Anna: 18. – 21. ist fest gebucht.',
        is_read: true,
        related_reservation_id: 'res-demo-1',
        action_payload: {
          reservation_id: 'res-demo-1',
          date: demoDate2
        },
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

  /**
   * Resolves the logical deep-link destination and action label for any notification item.
   * Guarantees that every notification features a logical, functional target.
   * @param {Object} n
   * @returns {Object} Target descriptor
   */
  resolveDeepLinkTarget(n) {
    const payload = n.action_payload || {};
    let targetResId = n.related_reservation_id || payload.reservation_id || payload.target_reservation_id || null;
    let targetMaintId = payload.maintenance_id || null;
    let targetWdId = payload.working_day_id || null;
    let targetAction = payload.action || null;
    let targetRoute = payload.route || null;

    let extractedDate = null;
    if (payload.date) {
      extractedDate = payload.date;
    } else if (Array.isArray(payload.proposed_dates) && payload.proposed_dates[0]) {
      extractedDate = payload.proposed_dates[0];
    } else if (payload.date_start) {
      extractedDate = payload.date_start;
    } else if (payload.date_end) {
      extractedDate = payload.date_end;
    }

    if (!extractedDate && n.message) {
      // 1. Try ISO: YYYY-MM-DD
      const isoMatch = n.message.match(/\b\d{4}-\d{2}-\d{2}\b/);
      if (isoMatch) {
        extractedDate = isoMatch[0];
      } else {
        // 2. Try German full date: DD.MM.YYYY
        const deFullMatch = n.message.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
        if (deFullMatch) {
          const d = String(deFullMatch[1]).padStart(2, '0');
          const m = String(deFullMatch[2]).padStart(2, '0');
          const y = deFullMatch[3];
          extractedDate = `${y}-${m}-${d}`;
        } else {
          // 3. Try German short date: DD.MM. (assume current or next year)
          const deShortMatch = n.message.match(/\b(\d{1,2})\.(\d{1,2})\./);
          if (deShortMatch) {
            const d = String(deShortMatch[1]).padStart(2, '0');
            const m = String(deShortMatch[2]).padStart(2, '0');
            const now = new Date();
            let y = now.getFullYear();
            // If month is earlier than current month by >2, likely next year
            if (parseInt(m, 10) < now.getMonth() - 2) {
              y += 1;
            }
            extractedDate = `${y}-${m}-${d}`;
          }
        }
      }
    }

    // Secondary fallback from store if available
    if (!extractedDate && targetResId && typeof reservationStore !== 'undefined') {
      const res = reservationStore.reservations.find(r => r.id == targetResId);
      if (res && (res.dateStart || res.date_start)) {
        extractedDate = res.dateStart || res.date_start;
      }
    }
    if (!extractedDate && targetMaintId && typeof reservationStore !== 'undefined') {
      const mb = reservationStore.maintenanceBlocks.find(m => m.id == targetMaintId);
      if (mb && (mb.dateStart || mb.date_start)) {
        extractedDate = mb.dateStart || mb.date_start;
      }
    }
    if (!extractedDate && targetWdId && typeof reservationStore !== 'undefined') {
      const wd = reservationStore.workingDays.find(w => w.id == targetWdId);
      if (wd) {
        extractedDate = wd.date || (Array.isArray(wd.proposed_dates) ? wd.proposed_dates[0] : (Array.isArray(wd.proposedDates) ? wd.proposedDates[0] : null));
      }
    }

    // Determine intuitive and actionable link label based on notification type
    let linkLabel = 'Im Kalender öffnen →';
    switch (n.type) {
      case 'cancellation':
        linkLabel = 'Freie Tage buchen →';
        break;
      case 'veto':
        linkLabel = 'Konflikt lösen →';
        break;
      case 'conflict_proposal':
        linkLabel = 'Vorschlag prüfen →';
        break;
      case 'resolved':
        linkLabel = 'Lösung ansehen →';
        break;
      case 'new_reservation':
        linkLabel = 'Reservation prüfen →';
        break;
      case 'auto_approved':
      case 'all_approved':
      case 'approval':
        linkLabel = 'Buchung ansehen →';
        break;
      case 'working_day_proposal':
      case 'working_day_vote_reminder':
        linkLabel = 'Jetzt abstimmen →';
        break;
      case 'working_day_all_voted':
        linkLabel = 'Termin festlegen →';
        break;
      case 'working_day':
      case 'working_day_rsvp_reminder':
        linkLabel = 'Teilnahme rückmelden →';
        break;
      case 'working_day_finalized':
      case 'working_day_summary':
      case 'working_day_eve_reminder':
        linkLabel = 'Im Kalender vormerken →';
        break;
      case 'working_day_deleted':
        linkLabel = 'Kalender öffnen →';
        break;
      case 'maintenance_created':
      case 'maintenance_deleted':
      case 'overlap_approval':
        linkLabel = 'Unterhalt im Kalender →';
        break;
      case 'arrival_reminder':
        linkLabel = 'Anreise-Briefing →';
        break;
      case 'handover_reminder':
        linkLabel = 'Übergabe erfassen →';
        break;
      case 'handover_note':
        linkLabel = 'Übergabe-Notiz lesen →';
        break;
      case 'chat_message':
        linkLabel = 'Zum Chat →';
        break;
      case 'test':
        linkLabel = 'Profil öffnen →';
        break;
      default:
        linkLabel = 'Im Kalender öffnen →';
        break;
    }

    return {
      type: n.type,
      reservationId: targetResId,
      date: extractedDate,
      maintenanceId: targetMaintId,
      workingDayId: targetWdId,
      action: targetAction,
      route: targetRoute,
      linkLabel
    };
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
        const target = this.resolveDeepLinkTarget(n);
        const icon = this.getTypeIcon(n.type);
        const unreadCls = !n.is_read ? 'is-unread' : '';
        const timeFormatted = this.formatDate(n.created_at);
        const cleanMsg = this.cleanMessage(n.message);
        const targetJson = JSON.stringify(target).replace(/'/g, '&#39;');

        return `
          <div class="notif-item ${unreadCls}" data-id="${n.id}" data-target='${targetJson}' role="button" tabindex="0" aria-label="${this.escapeHtml(cleanMsg)} — ${this.escapeHtml(target.linkLabel)}" style="cursor: pointer;">
            <span class="notif-item__icon">${icon}</span>
            <div class="notif-item__body">
              <div class="notif-item__message">${this.escapeHtml(cleanMsg)}</div>
              <div class="notif-item__footer">
                <span class="notif-item__time">${timeFormatted}</span>
                <span class="notif-item__link-badge">${this.escapeHtml(target.linkLabel)}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('.notif-item').forEach((item) => {
      const handleAction = async () => {
        const notifId = item.dataset.id ? (parseInt(item.dataset.id, 10) || item.dataset.id) : null;
        let target = null;
        try {
          target = JSON.parse(item.dataset.target);
        } catch (e) {
          target = {};
        }

        if (item.classList.contains('is-unread')) {
          await this.markRead([notifId]);
        }

        this.closeDrawer();
        if (typeof this.options.onNotificationClick === 'function') {
          this.options.onNotificationClick(target);
        }
      };

      item.addEventListener('click', handleAction);
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleAction();
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
