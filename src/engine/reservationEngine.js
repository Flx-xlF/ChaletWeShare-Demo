/**
 * ChaletWeShare — Client-Side Reservation Engine
 * Connects to /api/reservations.php with graceful local fallback.
 */

import { profileManager } from './profileManager.js';
import { reservationStore } from './reservationStore.js';
import { formatDateISO } from '../utils/dateUtils.js';

class ReservationEngine {
  constructor() {
    this.listeners = [];
    if (typeof window !== 'undefined') {
      window.addEventListener('chaletPushReceived', () => {
        this.loadCalendarData();
      });
    }
  }

  subscribe(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  _notify(event, data) {
    this.listeners.forEach((fn) => {
      try {
        fn(event, data);
      } catch (e) {
        console.error('ReservationEngine listener error', e);
      }
    });
  }

  /**
   * Preview veto deadline on the client side:
   * - < 24h before check-in (14:00): null (Instant confirmation)
   * - < 48h before check-in: 4 hours from now
   * - >= 30 days (720h) before check-in: 3 days at 20:15 (Zurich rule)
   * - standard: Zurich 20:15 rule (1 day)
   * @param {Date} [time]
   * @param {string} [startDate] - YYYY-MM-DD
   * @returns {Date|null}
   */
  getVetoDeadlinePreview(time = new Date(), startDate = null) {
    const d = new Date(time);
    let daysOffset = 1;
    if (startDate) {
      const checkin = new Date(`${startDate}T14:00:00`);
      const diffHours = (checkin.getTime() - d.getTime()) / (1000 * 3600);
      if (diffHours < 24) {
        return null; // Instant confirmation
      }
      if (diffHours < 48) {
        const shortDeadline = new Date(d.getTime() + 4 * 3600 * 1000);
        return shortDeadline;
      }
      if (diffHours >= 720) {
        daysOffset = 3;
      }
    }

    const hour = d.getHours();
    if (hour < 8) {
      const offset = Math.max(0, daysOffset - 1);
      if (offset > 0) {
        d.setDate(d.getDate() + offset);
      }
      d.setHours(20, 15, 0, 0);
    } else {
      d.setDate(d.getDate() + daysOffset);
      d.setHours(20, 15, 0, 0);
    }
    return d;
  }

  /**
   * Fetch calendar reservations and maintenance blocks
   */
  async loadCalendarData() {
    try {
      const gateToken = profileManager.getGateToken();
      const active = profileManager.getActiveProfile();
      const headers = {
        ...(gateToken ? { 'X-Gate-Token': gateToken } : {}),
      };
      const queryParams = new URLSearchParams({ action: 'list' });
      if (gateToken) queryParams.set('gate_token', gateToken);
      if (active?.profile_id && active?.sync_token) {
        queryParams.set('profile_id', active.profile_id);
        queryParams.set('sync_token', active.sync_token);
      }
      const res = await fetch(`/api/reservations.php?${queryParams.toString()}`, { 
        headers, 
        cache: 'no-store' 
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // Sync server data into local store for instant reactive rendering
          reservationStore.reservations = data.reservations.map((r) => ({
            id: r.id,
            userId: r.user_id,
            userName: r.user_name,
            userAvatar: r.user_avatar,
            dateStart: r.date_start,
            dateEnd: r.date_end,
            status: r.status,
            vetoDeadline: r.veto_deadline,
            approvals: r.approvals || [],
            vetoes: r.vetoes || [],
            conflictProposal: r.conflict_proposal || null,
            createdAt: r.created_at
          }));
          reservationStore.userCount = data.user_count || 4;
          reservationStore.maintenance = data.maintenance.map((m) => ({
            id: m.id,
            userId: m.user_id,
            userName: m.user_name,
            dateStart: m.date_start,
            dateEnd: m.date_end,
            halfDay: m.half_day,
            reason: m.reason,
            createdAt: m.created_at,
            approvals: m.approvals || []
          }));
          reservationStore._saveReservations();
          reservationStore._saveMaintenance();

          if (Array.isArray(data.working_days)) {
            reservationStore.workingDays = data.working_days.map((w) => ({
              id: w.id,
              userId: w.user_id,
              userName: w.user_name,
              userAvatar: w.user_avatar,
              date: w.date || null,
              season: w.season,
              status: w.status || 'finalized',
              proposed_dates: w.proposed_dates || [],
              proposedDates: w.proposed_dates || [],
              vote_tallies: w.vote_tallies || null,
              voteTallies: w.vote_tallies || null,
              createdAt: w.created_at,
              rsvps: (w.rsvps || []).map((r) => ({
                userId: r.user_id,
                user_id: r.user_id,
                userName: r.user_name,
                user_name: r.user_name,
                userAvatar: r.user_avatar,
                user_avatar: r.user_avatar,
                status: r.status,
                votes: r.votes || null,
                updatedAt: r.updated_at
              }))
            }));
            reservationStore._saveWorkingDays();
          }

          this._notify('data_loaded', null);
          return {
            reservations: reservationStore.reservations,
            maintenance: reservationStore.maintenance,
            workingDays: reservationStore.workingDays
          };
        }
      }
    } catch (e) {
      // Local fallback
    }

    return {
      reservations: reservationStore.reservations,
      maintenance: reservationStore.maintenance,
      workingDays: reservationStore.workingDays
    };
  }

  /**
   * Request a new pending reservation
   * @param {Object} params
   * @param {string} params.startDate - YYYY-MM-DD
   * @param {string} params.endDate - YYYY-MM-DD
   * @returns {Promise<{ success: boolean, reservation?: Object, error?: string }>}
   */
  async createReservation({ startDate, endDate }) {
    const profile = profileManager.getActiveProfile();
    if (!profile) {
      return { success: false, error: 'Kein aktives Profil.' };
    }

    try {
      const res = await fetch('/api/reservations.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
          date_start: startDate,
          date_end: endDate
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await this.loadCalendarData();
        this._notify('reservation_created', data.reservation);
        return { success: true, reservation: data.reservation };
      } else {
        return { success: false, error: data.error || 'Fehler beim Erstellen der Reservation.', isTechnical: !data.error };
      }
    } catch (e) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * Cancel an existing reservation
   * @param {string|number} reservationId
   */
  async cancelReservation(reservationId) {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { success: false, error: 'Nicht autorisiert.' };

    try {
      const res = await fetch('/api/reservations.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
          reservation_id: reservationId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await this.loadCalendarData();
        this._notify('reservation_cancelled', reservationId);
        return { success: true };
      } else {
        return { success: false, error: data?.error || 'Fehler beim Stornieren.', isTechnical: !data?.error };
      }
    } catch (e) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * Create a maintenance block
   * @param {Object} params
   * @param {string} params.startDate
   * @param {string} params.endDate
   * @param {string} params.halfDay - 'full' | 'morning' | 'afternoon'
   * @param {string} params.reason
   */
  async createMaintenance({ startDate, endDate, halfDay = 'full', reason = 'Unterhalt' }) {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { success: false, error: 'Nicht autorisiert.' };

    try {
      const res = await fetch('/api/reservations.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_maintenance',
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
          date_start: startDate,
          date_end: endDate,
          half_day: halfDay,
          reason
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await this.loadCalendarData();
        this._notify('maintenance_created', data.maintenance);
        return { success: true, maintenance: data.maintenance };
      } else {
        return { success: false, error: data.error || 'Fehler beim Unterhalt.', isTechnical: !data.error };
      }
    } catch (e) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * Update an existing maintenance block
   * @param {Object} params
   * @param {string|number} params.maintenanceId
   * @param {string} params.halfDay - 'full' | 'morning' | 'afternoon'
   * @param {string} params.reason
   */
  async updateMaintenance({ maintenanceId, halfDay = 'full', reason = 'Unterhalt' }) {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { success: false, error: 'Nicht autorisiert.' };

    try {
      const res = await fetch('/api/reservations.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_maintenance',
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
          maintenance_id: maintenanceId,
          half_day: halfDay,
          reason
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        reservationStore.updateMaintenanceLocally(maintenanceId, { halfDay, reason });
        await this.loadCalendarData();
        this._notify('maintenance_updated', data.maintenance);
        return { success: true, maintenance: data.maintenance };
      } else {
        return { success: false, error: data?.error || 'Fehler beim Aktualisieren des Unterhalts.', isTechnical: !data?.error };
      }
    } catch (e) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * Delete a maintenance block
   * @param {string|number} maintenanceId
   */
  async deleteMaintenance(maintenanceId) {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { success: false, error: 'Nicht autorisiert.' };

    try {
      const res = await fetch('/api/reservations.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_maintenance',
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
          maintenance_id: maintenanceId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await this.loadCalendarData();
        this._notify('maintenance_deleted', maintenanceId);
        return { success: true };
      } else {
        return { success: false, error: data?.error || 'Fehler beim Löschen des Unterhalts.', isTechnical: !data?.error };
      }
    } catch (e) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * Cast a veto against a pending reservation
   * @param {string|number} reservationId
   */
  async castVeto(reservationId) {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { success: false, error: 'Nicht autorisiert.' };

    // Optimistic UI Update: immediately change status to 'vetoed' so pattern updates in 0ms
    const prevRes = reservationStore.reservations.find((r) => r.id == reservationId);
    const prevStatus = prevRes?.status;
    reservationStore.updateReservationStatusLocally(reservationId, 'vetoed');
    this._notify('data_loaded');
    this._notify('veto_cast', reservationId);

    try {
      const res = await fetch('/api/reservations.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'veto',
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
          reservation_id: reservationId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await this.loadCalendarData();
        return { success: true };
      } else {
        // Rollback on server error
        if (prevStatus) {
          reservationStore.updateReservationStatusLocally(reservationId, prevStatus);
          this._notify('data_loaded');
        }
        return { success: false, error: data.error || 'Fehler beim Veto.', isTechnical: !data.error };
      }
    } catch (e) {
      // Rollback on network error
      if (prevStatus) {
        reservationStore.updateReservationStatusLocally(reservationId, prevStatus);
        this._notify('data_loaded');
      }
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * Withdraw a previously cast veto
   * @param {string|number} reservationId
   */
  async withdrawVeto(reservationId) {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { success: false, error: 'Nicht autorisiert.' };

    try {
      const res = await fetch('/api/reservations.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'withdraw_veto',
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
          reservation_id: reservationId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await this.loadCalendarData();
        this._notify('veto_withdrawn', reservationId);
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data.error || 'Fehler beim Zurückziehen des Vetos.', isTechnical: !data.error };
      }
    } catch (e) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * Propose a resolution for a vetoed reservation ('shared' | 'rng')
   * @param {Object} params
   * @param {string|number} params.reservationId
   * @param {string} params.proposalType - 'shared' | 'rng'
   */
  async proposeResolution({ reservationId, proposalType }) {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { success: false, error: 'Nicht autorisiert.' };

    try {
      const res = await fetch('/api/reservations.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'propose_resolution',
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
          reservation_id: reservationId,
          proposal_type: proposalType
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await this.loadCalendarData();
        this._notify('conflict_proposal_sent', { reservationId, proposal: data.proposal });
        return { success: true, proposal: data.proposal };
      } else {
        return { success: false, error: data.error || 'Fehler beim Übermitteln des Vorschlags.', isTechnical: !data.error };
      }
    } catch (e) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * Alias for proposeResolution
   */
  async proposeConflictResolution(args) {
    return this.proposeResolution(args);
  }

  /**
   * Sibling approval for a pending reservation
   * @param {string|number} reservationId
   * @returns {Promise<{ success: boolean, allApproved?: boolean, status?: string, error?: string }>}
   */
  async approveReservation(reservationId) {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { success: false, error: 'Nicht autorisiert.' };

    // Optimistic update: record approval locally
    const targetRes = reservationStore.reservations.find((r) => r.id == reservationId);
    let originalResSnapshot = targetRes ? JSON.parse(JSON.stringify(targetRes)) : null;

    if (targetRes) {
      if (!Array.isArray(targetRes.approvals)) targetRes.approvals = [];
      const alreadyApproved = targetRes.approvals.some((a) => a.user_id == profile.id || a.userId == profile.id);
      if (!alreadyApproved) {
        targetRes.approvals.push({
          user_id: profile.id,
          userId: profile.id,
          user_name: profile.name,
          userName: profile.name,
          user_avatar: profile.avatar,
          userAvatar: profile.avatar
        });
      }
      // If all other users (reservationStore.userCount - 1) have now approved, status becomes 'booked'
      const required = (reservationStore.userCount || 4) - 1;
      if (targetRes.approvals.length >= required) {
        targetRes.status = 'booked';
      }
      reservationStore._saveReservations();
      this._notify('data_loaded');
      this._notify('reservation_approved', {
        reservationId,
        allApproved: targetRes.status === 'booked',
        status: targetRes.status
      });
    }

    try {
      const res = await fetch('/api/reservations.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
          reservation_id: reservationId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await this.loadCalendarData();
        return {
          success: true,
          allApproved: data.all_approved,
          status: data.status,
          approvalsCount: data.approvals_count,
          requiredApprovals: data.required_approvals,
          message: data.message
        };
      } else {
        // Rollback
        if (originalResSnapshot) {
          const idx = reservationStore.reservations.findIndex((r) => r.id == reservationId);
          if (idx !== -1) {
            reservationStore.reservations[idx] = originalResSnapshot;
            reservationStore._saveReservations();
            this._notify('data_loaded');
          }
        }
        return { success: false, error: data.error || 'Fehler bei der Genehmigung.', isTechnical: !data.error };
      }
    } catch (e) {
      if (originalResSnapshot) {
        const idx = reservationStore.reservations.findIndex((r) => r.id == reservationId);
        if (idx !== -1) {
          reservationStore.reservations[idx] = originalResSnapshot;
          reservationStore._saveReservations();
          this._notify('data_loaded');
        }
      }
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * Resolve a conflict (shared, rng, or withdraw)
   * @param {Object} params
   * @param {string|number} params.reservationId
   * @param {string} params.resolutionType - 'shared' | 'rng' | 'withdraw'
   * @param {number} [params.winnerUserId]
   */
  async resolveConflict({ reservationId, resolutionType, winnerUserId }) {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { success: false, error: 'Nicht autorisiert.' };

    try {
      const res = await fetch('/api/reservations.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve',
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
          reservation_id: reservationId,
          resolution_type: resolutionType,
          winner_user_id: winnerUserId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await this.loadCalendarData();
        this._notify('conflict_resolved', { reservationId, resolutionType });
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Fehler beim Lösen.', isTechnical: !data.error };
      }
    } catch (e) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * Fetch micro-chat messages for a reservation or maintenance block
   */
  async fetchChatMessages(reservationId, maintenanceId = null) {
    let resId = reservationId;
    let maintId = maintenanceId;
    if (typeof reservationId === 'object' && reservationId !== null) {
      resId = reservationId.reservationId || reservationId.reservation_id || null;
      maintId = reservationId.maintenanceId || reservationId.maintenance_id || null;
    }
    const profile = profileManager.getActiveProfile();
    try {
      const payload = {
        action: 'list',
        profile_id: profile ? profile.profile_id : null,
        sync_token: profile ? profile.sync_token : null
      };
      if (resId) payload.reservation_id = resId;
      if (maintId) payload.maintenance_id = maintId;

      const res = await fetch('./api/chat.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) return data.messages || [];
      }
    } catch (e) {}

    // Local fallback store for chat
    const localKey = resId ? `chalet_chat_${resId}` : `chalet_chat_maint_${maintId}`;
    const raw = localStorage.getItem(localKey);
    return raw ? JSON.parse(raw) : [];
  }

  /**
   * Dismiss/close a chat thread from the active chats list
   * @param {Object} params
   * @param {number} [params.reservationId]
   * @param {number} [params.maintenanceId]
   * @param {string} [params.scope='user'] - 'user' | 'all'
   */
  async dismissChat({ reservationId = null, maintenanceId = null, scope = 'user' } = {}) {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { success: false, error: 'Nicht autorisiert.' };

    try {
      const payload = {
        action: 'dismiss_chat',
        profile_id: profile.profile_id,
        sync_token: profile.sync_token,
        scope
      };
      if (reservationId) payload.reservation_id = reservationId;
      if (maintenanceId) payload.maintenance_id = maintenanceId;

      const res = await fetch('./api/chat.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this._notify('chat_dismissed', { reservationId, maintenanceId, scope });
        return { success: true, message: data.message };
      }
      return { success: false, error: data.error || 'Fehler beim Schliessen.' };
    } catch (e) {
      return { success: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * Send a micro-chat message
   */
  async sendChatMessage(reservationId, message, maintenanceId = null) {
    let resId = reservationId;
    let maintId = maintenanceId;
    let msg = message;
    if (typeof reservationId === 'object' && reservationId !== null) {
      resId = reservationId.reservationId || reservationId.reservation_id || null;
      maintId = reservationId.maintenanceId || reservationId.maintenance_id || null;
      msg = reservationId.message !== undefined ? reservationId.message : message;
    }
    const profile = profileManager.getActiveProfile();
    if (!profile) return { success: false, error: 'Nicht autorisiert.' };

    try {
      const payload = {
        action: 'send',
        profile_id: profile.profile_id,
        sync_token: profile.sync_token,
        message: msg
      };
      if (resId) payload.reservation_id = resId;
      if (maintId) payload.maintenance_id = maintId;

      const res = await fetch('/api/chat.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data?.error || 'Fehler beim Senden der Nachricht.', isTechnical: !data?.error };
      }
    } catch (e) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * Allow another sibling to book during a maintenance block (True Doppelnutzung)
   */
  async allowMaintenanceOverlap({ maintenanceId, allowedUserId }) {
    const profile = profileManager.getActiveProfile();
    if (!profile) return { success: false, error: 'Nicht autorisiert.' };

    try {
      const res = await fetch('/api/chat.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'allow_maintenance_overlap',
          profile_id: profile.profile_id,
          sync_token: profile.sync_token,
          maintenance_id: maintenanceId,
          allowed_user_id: allowedUserId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await this.loadCalendarData();
        this._notify('maintenance_overlap_allowed', { maintenanceId, allowedUserId });
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data?.error || 'Fehler beim Erlauben der Mitnutzung.', isTechnical: !data?.error };
      }
    } catch (e) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * Fetch statistics for a year
   */
  async fetchStats(year = new Date().getFullYear()) {
    const profile = profileManager.getActiveProfile();
    try {
      const res = await fetch('./api/stats.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get',
          year,
          profile_id: profile ? profile.profile_id : null,
          sync_token: profile ? profile.sync_token : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) return data;
      }
    } catch (e) {}

    // Local tally fallback
    let profiles = profileManager.getProfiles();
    if (!profiles || profiles.length === 0) {
      profiles = [
        { id: 1, name: 'Anna', avatar: 'swan' },
        { id: 2, name: 'Beat', avatar: 'fox' },
        { id: 3, name: 'Clara', avatar: 'bear' },
        { id: 4, name: 'David', avatar: 'owl' }
      ];
    }

    const tally = profiles.map((p) => {
      let total = 0;
      let weekend = 0;
      reservationStore.reservations.forEach((r) => {
        if (r.status === 'booked' && (r.userId == p.id || r.userName === p.name)) {
          total += 4;
          weekend += 2;
        }
      });
      return {
        user_id: p.id,
        name: p.name,
        avatar: p.avatar,
        weekend_days: weekend,
        total_days: total
      };
    });

    let maxDays = 0;
    tally.forEach((t) => { if (t.total_days > maxDays) maxDays = t.total_days; });

    return { success: true, year, available_years: [year], max_days: maxDays, stats: tally };
  }

  /**
   * Schedule a new Working Day or Propose up to 3 dates
   * @param {Object} params
   * @param {string} [params.date] - Single YYYY-MM-DD
   * @param {string[]} [params.dates] - Array of up to 3 YYYY-MM-DD
   * @param {string} params.season - 'spring' | 'autumn'
   * @param {boolean} [params.isProposal]
   * @returns {Promise<{ success: boolean, workingDay?: Object, error?: string }>}
   */
  async createWorkingDay({ date, dates, season, isProposal = false }) {
    const profile = profileManager.getActiveProfile();
    if (!profile) {
      return { success: false, error: 'Kein aktives Profil.' };
    }

    try {
      const gateToken = profileManager.getGateToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(gateToken ? { 'X-Gate-Token': gateToken } : {})
      };

      const payload = {
        action: 'create',
        profile_id: profile.profile_id,
        user_id: profile.id,
        sync_token: profile.sync_token,
        gate_token: gateToken,
        season,
        is_proposal: isProposal
      };

      if (Array.isArray(dates) && dates.length > 0) {
        payload.dates = dates;
      } else if (date) {
        payload.date = date;
      }

      const res = await fetch('/api/working_days.php', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success && data.working_day) {
        const wd = {
          id: data.working_day.id,
          userId: data.working_day.user_id,
          userName: data.working_day.user_name,
          userAvatar: data.working_day.user_avatar,
          date: data.working_day.date || null,
          season: data.working_day.season,
          status: data.working_day.status || 'finalized',
          proposed_dates: data.working_day.proposed_dates || [],
          proposedDates: data.working_day.proposed_dates || [],
          createdAt: data.working_day.created_at,
          rsvps: data.working_day.rsvps || []
        };
        reservationStore.addWorkingDay(wd);
        await this.loadCalendarData();
        this._notify('working_day_created', wd);
        return { success: true, workingDay: wd };
      } else {
        return { success: false, error: data?.error || 'Fehler beim Erstellen des Arbeitstags.', isTechnical: !data?.error };
      }
    } catch (e) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * Vote on proposed dates for a Working Day (Doodle-style voting)
   * @param {Object} params
   * @param {number|string} params.workingDayId
   * @param {Object.<string, 'yes'|'maybe'|'no'>} params.votes - Map of date => vote
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async voteWorkingDay({ workingDayId, votes }) {
    const profile = profileManager.getActiveProfile();
    if (!profile) {
      return { success: false, error: 'Kein aktives Profil.' };
    }

    // Optimistic UI update
    reservationStore.updateWorkingDayVote(workingDayId, profile.id, profile.name, profile.avatar, votes);
    this._notify('working_day_vote', { workingDayId, votes, user: profile });

    try {
      const gateToken = profileManager.getGateToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(gateToken ? { 'X-Gate-Token': gateToken } : {})
      };

      const res = await fetch('/api/working_days.php', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'vote',
          profile_id: profile.profile_id,
          user_id: profile.id,
          sync_token: profile.sync_token,
          gate_token: gateToken,
          working_day_id: workingDayId,
          votes
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await this.loadCalendarData();
        return { success: true };
      } else {
        await this.loadCalendarData();
        return { success: false, error: data?.error || 'Fehler beim Abstimmen.', isTechnical: !data?.error };
      }
    } catch (e) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * Finalize a Working Day proposal by selecting the final date
   * @param {Object} params
   * @param {number|string} params.workingDayId
   * @param {string} params.selectedDate - YYYY-MM-DD
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async finalizeWorkingDay({ workingDayId, selectedDate }) {
    const profile = profileManager.getActiveProfile();
    if (!profile) {
      return { success: false, error: 'Kein aktives Profil.' };
    }

    // Optimistic UI update
    reservationStore.finalizeWorkingDayLocally(workingDayId, selectedDate);
    this._notify('data_loaded');
    this._notify('working_day_finalized', { workingDayId, selectedDate });

    try {
      const gateToken = profileManager.getGateToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(gateToken ? { 'X-Gate-Token': gateToken } : {})
      };

      const res = await fetch('/api/working_days.php', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'finalize',
          profile_id: profile.profile_id,
          user_id: profile.id,
          sync_token: profile.sync_token,
          gate_token: gateToken,
          working_day_id: workingDayId,
          selected_date: selectedDate
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await this.loadCalendarData();
        return { success: true, message: data.message };
      } else {
        await this.loadCalendarData();
        return { success: false, error: data?.error || 'Fehler beim Festlegen des Arbeitstags.', isTechnical: !data?.error };
      }
    } catch (e) {
      await this.loadCalendarData();
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * RSVP for a Working Day
   * @param {Object} params
   * @param {number|string} params.workingDayId
   * @param {'yes'|'no'} params.status
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async rsvpWorkingDay({ workingDayId, status }) {
    const profile = profileManager.getActiveProfile();
    if (!profile) {
      return { success: false, error: 'Kein aktives Profil.' };
    }

    try {
      const gateToken = profileManager.getGateToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(gateToken ? { 'X-Gate-Token': gateToken } : {})
      };

      const res = await fetch('/api/working_days.php', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'rsvp',
          profile_id: profile.profile_id,
          user_id: profile.id,
          sync_token: profile.sync_token,
          gate_token: gateToken,
          working_day_id: workingDayId,
          status
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        reservationStore.updateWorkingDayRSVP(workingDayId, profile.id, profile.name, profile.avatar, status);
        this._notify('working_day_rsvp', { workingDayId, status, user: profile });
        return { success: true };
      } else {
        return { success: false, error: data?.error || 'Fehler beim Antworten.', isTechnical: !data?.error };
      }
    } catch (e) {
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }

  /**
   * Delete / cancel a working day
   * @param {number|string} workingDayId
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async deleteWorkingDay(workingDayId) {
    const profile = profileManager.getActiveProfile();
    if (!profile) {
      return { success: false, error: 'Kein aktives Profil.' };
    }

    // Optimistic UI update: remove working day immediately from store
    const prevWd = reservationStore.workingDays.find((w) => w.id == workingDayId);
    reservationStore.removeWorkingDay(workingDayId);
    this._notify('data_loaded');
    this._notify('working_day_deleted', { workingDayId });

    try {
      const gateToken = profileManager.getGateToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(gateToken ? { 'X-Gate-Token': gateToken } : {})
      };

      const res = await fetch('/api/working_days.php', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'delete',
          profile_id: profile.profile_id,
          user_id: profile.id,
          sync_token: profile.sync_token,
          gate_token: gateToken,
          working_day_id: workingDayId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true };
      } else {
        // Rollback
        if (prevWd) {
          reservationStore.addWorkingDay(prevWd);
          this._notify('data_loaded');
        }
        return { success: false, error: data?.error || 'Fehler beim Löschen des Arbeitstags.', isTechnical: !data?.error };
      }
    } catch (e) {
      if (prevWd) {
        reservationStore.addWorkingDay(prevWd);
        this._notify('data_loaded');
      }
      return { success: false, error: 'Netzwerkfehler oder Server nicht erreichbar.', isTechnical: true };
    }
  }
}

export const reservationEngine = new ReservationEngine();
