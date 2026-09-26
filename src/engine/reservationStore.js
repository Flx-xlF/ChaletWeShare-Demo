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
          userName: 'Elena',
          userAvatar: 'swan',
          dateStart: formatDateISO(dBookedStart),
          dateEnd: formatDateISO(dBookedEnd),
          status: 'booked',
          handover_count: 1,
          createdAt: new Date().toISOString()
        },
        {
          id: 'res-demo-2',
          userId: 2,
          userName: 'Lucas',
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

      if (!localStorage.getItem('chalet_handover_notes')) {
        localStorage.setItem('chalet_handover_notes', JSON.stringify([
          {
            id: 1,
            reservation_id: 'res-demo-1',
            author_user_id: 1,
            author_name: 'Elena',
            author_avatar: 'swan',
            target_reservation_id: 'res-demo-2',
            category: 'garbage',
            message: 'Kehrichtsack bereitgestellt und Kaminholz im Schuppen nachgefüllt.',
            is_acknowledged: 0,
            acknowledged_by_name: null,
            acknowledged_at: null,
            created_at: new Date().toISOString()
          }
        ]));
      }
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

      // Sample maintenance 1: Afternoon cleaning on Monday after Elena's stay
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
          userName: 'Elena'
        },
        {
          id: 'maint-demo-2',
          dateStart: formatDateISO(dSweep),
          dateEnd: formatDateISO(dSweep),
          halfDay: 'full',
          reason: 'Kaminfeger & Heizungskontrolle',
          userId: 1,
          userName: 'Elena'
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

    const hasHandover = (r) => {
      if (!r) return false;
      if (r.handover_count && r.handover_count > 0) return true;
      try {
        const raw = localStorage.getItem('chalet_handover_notes');
        if (raw) {
          const notes = JSON.parse(raw);
          if (notes.some((n) => n.reservation_id == r.id)) return true;
        }
      } catch (e) {}
      return false;
    };

    // Check maintenance blocks
    const maint = this.maintenance.find((m) => {
      const mStart = m.dateStart || m.date_start;
      const mEnd = m.dateEnd || m.date_end;
      return dateISO >= mStart && dateISO <= mEnd;
    });

    // Check reservations (can match multiple for changeovers, doppelnutzung or collisions)
    const matchingReservations = this.reservations.filter((r) => {
      const rStart = r.dateStart || r.date_start;
      const rEnd = r.dateEnd || r.date_end;
      return dateISO >= rStart && dateISO <= rEnd && r.status !== 'cancelled';
    });

    // True Doppelnutzung during full maintenance: don't eclipse the booking!
    if (maint && maint.halfDay === 'full') {
      if (matchingReservations.length > 0) {
        return {
          status: 'doppelnutzung',
          bookingSlot: 'full',
          info: matchingReservations[0],
          maintSlot: 'full',
          maintInfo: maint,
          hasHandoverNotes: hasHandover(matchingReservations[0])
        };
      }
      return { status: 'maintenance', maintSlot: 'full', info: maint, bookingSlot: null };
    }

    // Multiple reservations covering this date
    if (matchingReservations.length > 1) {
      const resOut = matchingReservations.find((r) => (r.dateEnd || r.date_end) === dateISO);
      const resIn = matchingReservations.find((r) => (r.dateStart || r.date_start) === dateISO);
      const isExactTurnover = (matchingReservations.length === 2 && resOut && resIn && resOut.id !== resIn.id);

      if (isExactTurnover) {
        const hasConflict = (resOut.status === 'vetoed') || (resIn.status === 'vetoed');
        return {
          status: hasConflict ? 'conflict' : 'shared',
          bookingSlot: 'shared',
          checkoutInfo: resOut,
          checkinInfo: resIn,
          info: resOut,
          hasHandoverNotes: hasHandover(resOut),
          maintSlot: maint ? maint.halfDay : null,
          maintInfo: maint || null
        };
      }

      // Check if officially agreed Doppelnutzung
      const isAgreedDoppelnutzung = matchingReservations.some((r) =>
        r.resolution?.resolution_type === 'shared' || r.is_shared || r.status === 'shared'
      );

      if (isAgreedDoppelnutzung) {
        return {
          status: 'doppelnutzung',
          bookingSlot: 'doppelnutzung',
          info: matchingReservations[0],
          checkoutInfo: matchingReservations[0],
          checkinInfo: matchingReservations[1] || matchingReservations[0],
          collidingReservations: matchingReservations,
          hasHandoverNotes: matchingReservations.some(hasHandover),
          maintSlot: maint ? maint.halfDay : null,
          maintInfo: maint || null
        };
      }

      // Actual collision / Doppelbuchung (unresolved clash)
      return {
        status: 'collision',
        bookingSlot: 'collision',
        info: matchingReservations[0],
        checkoutInfo: matchingReservations[0],
        checkinInfo: matchingReservations[1] || matchingReservations[0],
        collidingReservations: matchingReservations,
        hasHandoverNotes: matchingReservations.some(hasHandover),
        maintSlot: maint ? maint.halfDay : null,
        maintInfo: maint || null
      };
    }

    if (matchingReservations.length === 1) {
      const res = matchingReservations[0];
      const rStart = res.dateStart || res.date_start;
      const rEnd = res.dateEnd || res.date_end;
      let bookingSlot = 'full';
      if (dateISO === rStart) {
        bookingSlot = 'checkin';
      } else if (dateISO === rEnd) {
        bookingSlot = 'checkout';
      }

      const isDoppelnutzung = res.resolution?.resolution_type === 'shared';
      const effectiveStatus = res.status === 'vetoed' ? 'conflict' : (isDoppelnutzung ? 'doppelnutzung' : res.status);

      return {
        status: effectiveStatus,
        bookingSlot,
        info: res,
        hasHandoverNotes: (dateISO === rEnd) && hasHandover(res),
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

  updateMaintenanceLocally(maintenanceId, { halfDay, reason }) {
    const m = this.maintenance.find((item) => item.id == maintenanceId);
    if (m) {
      if (halfDay !== undefined) {
        m.halfDay = halfDay;
        m.half_day = halfDay;
      }
      if (reason !== undefined) {
        m.reason = reason;
      }
      this._saveMaintenance();
    }
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

