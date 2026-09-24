/**
 * ChaletWeShare — Local Reservation & Maintenance Store (Frontend State)
 * Synchronizes with API when available, falls back to localStorage.
 */

import { formatDateISO } from '../utils/dateUtils.js';

const STORAGE_KEY_RESERVATIONS = 'chalet_reservations_data';
const STORAGE_KEY_MAINTENANCE = 'chalet_maintenance_data';
const STORAGE_KEY_WORKING_DAYS = 'chalet_working_days_data';

export class ReservationStore {
  constructor() {
    this.reservations = [];
    this.maintenance = [];
    this.workingDays = [];
    this.userCount = 4;
    this._loadInitial();
  }

  _loadInitial() {
    const rawRes = localStorage.getItem(STORAGE_KEY_RESERVATIONS);
    const rawMaint = localStorage.getItem(STORAGE_KEY_MAINTENANCE);
    const rawWd = localStorage.getItem(STORAGE_KEY_WORKING_DAYS);

    if (rawWd) {
      try {
        this.workingDays = JSON.parse(rawWd);
      } catch (e) {
        this.workingDays = [];
      }
    }

    if (rawRes) {
      try {
        this.reservations = JSON.parse(rawRes);
      } catch (e) {
        this.reservations = [];
      }
    } else {
      // Seed realistic demo data for initial exploration
      const today = new Date();
      const y = today.getFullYear();
      const m = today.getMonth();

      // Sample booking 1: Booked weekend
      const dBookedStart = new Date(y, m, 18);
      const dBookedEnd = new Date(y, m, 21);

      // Sample booking 2: Pending request
      const dPendingStart = new Date(y, m, 25);
      const dPendingEnd = new Date(y, m, 28);

      this.reservations = [
        {
          id: 'res-demo-1',
          userId: 1,
          userName: 'Anna',
          userAvatar: 'swan',
          dateStart: formatDateISO(dBookedStart),
          dateEnd: formatDateISO(dBookedEnd),
          status: 'booked',
          createdAt: new Date().toISOString()
        },
        {
          id: 'res-demo-2',
          userId: 2,
          userName: 'Beat',
          userAvatar: 'fox',
          dateStart: formatDateISO(dPendingStart),
          dateEnd: formatDateISO(dPendingEnd),
          status: 'pending',
          vetoDeadline: new Date(Date.now() + 10 * 3600 * 1000).toISOString(),
          approvals: [],
          createdAt: new Date().toISOString()
        }
      ];
      this._saveReservations();
    }

    if (rawMaint) {
      try {
        this.maintenance = JSON.parse(rawMaint);
      } catch (e) {
        this.maintenance = [];
      }
    } else {
      const today = new Date();
      const y = today.getFullYear();
      const m = today.getMonth();

      // Sample maintenance 1: Afternoon cleaning on Monday after Anna's stay
      const dClean = new Date(y, m, 21);
      // Sample maintenance 2: Full day chimney sweep
      const dSweep = new Date(y, m, 10);

      this.maintenance = [
        {
          id: 'maint-demo-1',
          dateStart: formatDateISO(dClean),
          dateEnd: formatDateISO(dClean),
          halfDay: 'afternoon',
          reason: 'Endreinigung Chalet',
          userId: 1,
          userName: 'Anna'
        },
        {
          id: 'maint-demo-2',
          dateStart: formatDateISO(dSweep),
          dateEnd: formatDateISO(dSweep),
          halfDay: 'full',
          reason: 'Kaminfeger & Heizungskontrolle',
          userId: 1,
          userName: 'Anna'
        }
      ];
      this._saveMaintenance();
    }
  }

  _saveReservations() {
    localStorage.setItem(STORAGE_KEY_RESERVATIONS, JSON.stringify(this.reservations));
  }

  _saveMaintenance() {
    localStorage.setItem(STORAGE_KEY_MAINTENANCE, JSON.stringify(this.maintenance));
  }

  _saveWorkingDays() {
    localStorage.setItem(STORAGE_KEY_WORKING_DAYS, JSON.stringify(this.workingDays));
  }

  /**
   * Get status for a given ISO date
   * @param {string} dateISO
   * @returns {{ status: 'free'|'pending'|'booked'|'maintenance'|'shared'|'working_day'|'working_day_proposal', bookingSlot?: 'full'|'checkin'|'checkout'|'shared', maintSlot?: 'full'|'morning'|'afternoon'|null, info?: Object, checkoutInfo?: Object, checkinInfo?: Object, maintInfo?: Object, workingDay?: Object }}
   */
  getDayStatus(dateISO) {
    // Check finalized working days first (Frühjahrsputz / Einwintern)
    const workingDay = this.workingDays.find((w) => w.date === dateISO && (w.status === 'finalized' || !w.status));
    if (workingDay) {
      return {
        status: 'working_day',
        workingDay,
        info: workingDay,
        bookingSlot: null,
        maintSlot: null
      };
    }

    // Check proposed working days (Terminfindung in progress)
    const proposedWd = this.workingDays.find((w) => {
      if (w.status !== 'proposed') return false;
      const dates = Array.isArray(w.proposed_dates) ? w.proposed_dates : (Array.isArray(w.proposedDates) ? w.proposedDates : []);
      return dates.includes(dateISO);
    });
    if (proposedWd) {
      return {
        status: 'working_day_proposal',
        workingDay: proposedWd,
        info: proposedWd,
        bookingSlot: null,
        maintSlot: null
      };
    }

    // Check maintenance blocks first
    const maint = this.maintenance.find((m) => {
      return dateISO >= m.dateStart && dateISO <= m.dateEnd;
    });

    if (maint && maint.halfDay === 'full') {
      return { status: 'maintenance', maintSlot: 'full', info: maint, bookingSlot: null };
    }

    // Check reservations (can match up to 2 for shared changeover days)
    const matchingReservations = this.reservations.filter((r) => {
      return dateISO >= r.dateStart && dateISO <= r.dateEnd && r.status !== 'cancelled';
    });

    // Shared changeover day: 2 back-to-back reservations meeting on this date
    if (matchingReservations.length > 1) {
      const resOut = matchingReservations.find((r) => r.dateEnd === dateISO);
      const resIn = matchingReservations.find((r) => r.dateStart === dateISO);
      const hasConflict = (resOut && resOut.status === 'vetoed') || (resIn && resIn.status === 'vetoed');
      return {
        status: hasConflict ? 'conflict' : 'shared',
        bookingSlot: 'shared',
        checkoutInfo: resOut || matchingReservations[0],
        checkinInfo: resIn || matchingReservations[1],
        info: resOut || resIn,
        maintSlot: maint ? maint.halfDay : null,
        maintInfo: maint || null
      };
    }

    if (matchingReservations.length === 1) {
      const res = matchingReservations[0];
      let bookingSlot = 'full';
      if (dateISO === res.dateStart) {
        bookingSlot = 'checkin';
      } else if (dateISO === res.dateEnd) {
        bookingSlot = 'checkout';
      }
      return {
        status: res.status === 'vetoed' ? 'conflict' : res.status, // 'pending', 'booked' or 'conflict'
        bookingSlot,
        info: res,
        maintSlot: maint ? maint.halfDay : null,
        maintInfo: maint || null
      };
    }

    if (maint) {
      return { status: 'maintenance', maintSlot: maint.halfDay, info: maint, bookingSlot: null };
    }

    return { status: 'free', bookingSlot: null };
  }

  addReservation(resData) {
    this.reservations.push(resData);
    this._saveReservations();
  }

  updateReservationStatusLocally(reservationId, newStatus) {
    const res = this.reservations.find((r) => r.id == reservationId);
    if (res) {
      res.status = newStatus;
      this._saveReservations();
    }
  }

  addMaintenance(maintData) {
    this.maintenance.push(maintData);
    this._saveMaintenance();
  }

  addWorkingDay(workingDayData) {
    const idx = this.workingDays.findIndex((w) => w.id === workingDayData.id || (w.date && w.date === workingDayData.date));
    if (idx >= 0) {
      this.workingDays[idx] = workingDayData;
    } else {
      this.workingDays.push(workingDayData);
    }
    this._saveWorkingDays();
  }

  updateWorkingDayRSVP(workingDayId, userId, userName, userAvatar, status) {
    const wd = this.workingDays.find((w) => w.id == workingDayId);
    if (!wd) return;
    if (!wd.rsvps) wd.rsvps = [];
    const rsvpIdx = wd.rsvps.findIndex((r) => r.user_id == userId || r.userId == userId);
    const updatedObj = {
      user_id: userId,
      userId: userId,
      user_name: userName,
      userName: userName,
      user_avatar: userAvatar,
      userAvatar: userAvatar,
      status,
      updated_at: new Date().toISOString()
    };
    if (rsvpIdx >= 0) {
      wd.rsvps[rsvpIdx] = { ...wd.rsvps[rsvpIdx], ...updatedObj };
    } else {
      wd.rsvps.push(updatedObj);
    }
    this._saveWorkingDays();
  }

  updateWorkingDayVote(workingDayId, userId, userName, userAvatar, votes) {
    const wd = this.workingDays.find((w) => w.id == workingDayId);
    if (!wd) return;
    if (!wd.rsvps) wd.rsvps = [];
    const rsvpIdx = wd.rsvps.findIndex((r) => r.user_id == userId || r.userId == userId);
    const hasAnyYes = Object.values(votes).some(v => v === 'yes' || v === 'maybe');
    const updatedObj = {
      user_id: userId,
      userId: userId,
      user_name: userName,
      userName: userName,
      user_avatar: userAvatar,
      userAvatar: userAvatar,
      status: hasAnyYes ? 'yes' : 'no',
      votes: votes,
      updated_at: new Date().toISOString()
    };
    if (rsvpIdx >= 0) {
      wd.rsvps[rsvpIdx] = { ...wd.rsvps[rsvpIdx], ...updatedObj };
    } else {
      wd.rsvps.push(updatedObj);
    }
    this._saveWorkingDays();
  }

  finalizeWorkingDayLocally(workingDayId, selectedDate) {
    const wd = this.workingDays.find((w) => w.id == workingDayId);
    if (!wd) return;
    wd.date = selectedDate;
    wd.status = 'finalized';
    if (Array.isArray(wd.rsvps)) {
      wd.rsvps.forEach(r => {
        const v = r.votes?.[selectedDate] ?? 'no';
        r.status = (v === 'yes' || v === 'maybe') ? 'yes' : 'no';
      });
    }
    this._saveWorkingDays();
  }

  removeWorkingDay(workingDayId) {
    this.workingDays = this.workingDays.filter((w) => w.id != workingDayId);
    this._saveWorkingDays();
  }
}

export const reservationStore = new ReservationStore();

