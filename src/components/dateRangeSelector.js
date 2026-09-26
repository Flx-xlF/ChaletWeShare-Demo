/**
 * ChaletWeShare — Date Range Selector
 * Supports both touch-drag selection and dual-tap (Start -> End) selection.
 */

import { parseDateISO, formatDateISO, isDateInRange } from '../utils/dateUtils.js';

export class DateRangeSelector {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - The calendar grid container element
   * @param {Function} options.onRangeChange - Called during drag/change (startISO, endISO)
   * @param {Function} options.onRangeSelected - Called when range is settled (startISO, endISO)
   * @param {Function} options.onDayClick - Called when an existing booked/maint day is tapped
   */
  constructor({ container, onRangeChange, onRangeSelected, onDayClick }) {
    this.container = container;
    this.onRangeChange = onRangeChange;
    this.onRangeSelected = onRangeSelected;
    this.onDayClick = onDayClick;

    this.startDate = null; // ISO string 'YYYY-MM-DD'
    this.endDate = null;   // ISO string 'YYYY-MM-DD'

    this.isDragging = false;
    this.dragStartISO = null;
    this.hasMoved = false;

    // Touch gesture disambiguation
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.lastTouchProcessTime = 0;
    this.isScrolling = false;
    this.pendingTouchCellData = null;

    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onPointerCancel = this._handlePointerCancel.bind(this);

    this.attach();
  }

  attach() {
    this.container.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove, { passive: false });
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerCancel);
  }

  destroy() {
    this.container.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerCancel);
  }

  setRange(startISO, endISO, emit = true) {
    this.startDate = startISO;
    this.endDate = endISO;
    this.updateCellHighlighting();
    if (emit && this.onRangeSelected) {
      this.onRangeSelected(this.startDate, this.endDate);
    }
  }

  clearRange() {
    this.startDate = null;
    this.endDate = null;
    this.dragStartISO = null;
    this.isDragging = false;
    this.updateCellHighlighting();
    if (this.onRangeSelected) {
      this.onRangeSelected(null, null);
    }
  }

  _getCellFromEvent(e) {
    let target = e.target;
    while (target && target !== this.container) {
      if (target.classList && target.classList.contains('day-cell')) {
        return target;
      }
      target = target.parentElement;
    }
    return null;
  }

  _getCellFromPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    let target = el;
    while (target && target !== document.body) {
      if (target.classList && target.classList.contains('day-cell')) {
        return target;
      }
      target = target.parentElement;
    }
    return null;
  }

  _handlePointerDown(e) {
    const cell = this._getCellFromEvent(e);
    if (!cell) return;

    // Suppress synthetic mouse events dispatched by WebKit/Safari after a touch gesture
    if (e.pointerType !== 'touch' && (Date.now() - this.lastTouchProcessTime < 450)) {
      return;
    }

    const dateISO = cell.getAttribute('data-date');
    const isDisabled = cell.getAttribute('data-disabled') === 'true';
    const status = cell.getAttribute('data-status');
    const bookingSlot = cell.getAttribute('data-booking-slot');

    if (!dateISO) return;

    // For touch pointers, defer selection until pointerup to differentiate between tap and scroll
    const maintSlot = cell.getAttribute('data-maint-slot');
    if (e.pointerType === 'touch') {
      this.touchStartX = e.clientX;
      this.touchStartY = e.clientY;
      this.touchStartTime = Date.now();
      this.isScrolling = false;
      this.pendingTouchCellData = { dateISO, isDisabled, status, bookingSlot, maintSlot };
      return;
    }

    // Mouse / Pen: handle immediately and allow drag selection
    this._processDateSelection(dateISO, isDisabled, status, bookingSlot, maintSlot, true);
  }

  _handlePointerMove(e) {
    // Touch interactions: check movement threshold to detect scrolling
    if (e.pointerType === 'touch') {
      if (this.pendingTouchCellData && !this.isScrolling) {
        const deltaX = Math.abs(e.clientX - this.touchStartX);
        const deltaY = Math.abs(e.clientY - this.touchStartY);
        if (deltaX > 8 || deltaY > 8) {
          this.isScrolling = true;
          this.pendingTouchCellData = null;
        }
      }
      // Never block native scroll on touch
      return;
    }

    if (!this.isDragging || !this.dragStartISO) return;

    const cell = this._getCellFromPoint(e.clientX, e.clientY);
    if (!cell) return;

    const hoverISO = cell.getAttribute('data-date');
    const isDisabled = cell.getAttribute('data-disabled') === 'true';
    if (!hoverISO || isDisabled) return;

    if (hoverISO !== this.dragStartISO) {
      this.hasMoved = true;
      // Prevent text selection / native drag while dragging date range with mouse
      if (e.cancelable) e.preventDefault();

      const d1 = parseDateISO(this.dragStartISO).getTime();
      let d2 = parseDateISO(hoverISO).getTime();
      const diffDays = Math.abs(d2 - d1) / (1000 * 60 * 60 * 24);
      
      let finalHover = hoverISO;
      if (diffDays > 30) {
        const sign = d2 > d1 ? 1 : -1;
        d2 = d1 + sign * 30 * 24 * 60 * 60 * 1000;
        finalHover = formatDateISO(new Date(d2));
      }

      if (d2 >= d1) {
        this.startDate = this.dragStartISO;
        this.endDate = finalHover;
      } else {
        this.startDate = finalHover;
        this.endDate = this.dragStartISO;
      }

      this.updateCellHighlighting();
      if (this.onRangeChange) {
        this.onRangeChange(this.startDate, this.endDate);
      }
    }
  }

  _handlePointerUp(e) {
    if (e.pointerType === 'touch') {
      if (this.pendingTouchCellData && !this.isScrolling) {
        const deltaX = Math.abs(e.clientX - this.touchStartX);
        const deltaY = Math.abs(e.clientY - this.touchStartY);
        const elapsed = Date.now() - this.touchStartTime;

        // Clean tap: within threshold and duration under 500ms
        if (deltaX <= 10 && deltaY <= 10 && elapsed < 500) {
          this.lastTouchProcessTime = Date.now();
          const { dateISO, isDisabled, status, bookingSlot, maintSlot } = this.pendingTouchCellData;
          this._processDateSelection(dateISO, isDisabled, status, bookingSlot, maintSlot, false);
        }
      }
      this.pendingTouchCellData = null;
      this.isScrolling = false;
      return;
    }

    if (!this.isDragging) return;
    this.isDragging = false;

    if (this.hasMoved && this.startDate && this.endDate) {
      // Drag finished with valid multi-day range
      if (this.onRangeSelected) {
        this.onRangeSelected(this.startDate, this.endDate);
      }
    } else {
      // It was a single click: startDate is selected, waiting for second tap or single day choice
      if (this.onRangeChange) {
        this.onRangeChange(this.startDate, this.endDate);
      }
    }
  }

  _handlePointerCancel() {
    this.pendingTouchCellData = null;
    this.isScrolling = false;
    this.isDragging = false;
  }

  _processDateSelection(dateISO, isDisabled, status, bookingSlot, maintSlot, isMouse = false) {
    if (!dateISO) return;

    // Allow inspecting past days only if they contain a booking, conflict, or maintenance
    if (isDisabled) {
      if (status && status !== 'free' && this.onDayClick) {
        this.onDayClick(dateISO, status);
      }
      return;
    }

    // Working day proposal: open inspection modal to cast vote or review
    if (status === 'working_day_proposal') {
      if (this.onDayClick) {
        this.onDayClick(dateISO, status);
      }
      return;
    }

    const isWorkingDay = status === 'working_day';
    const isShared = status === 'shared';
    const isMaintenance = status === 'maintenance' || !!maintSlot;
    const isCollision = status === 'collision';
    const isDoppelnutzung = status === 'doppelnutzung';
    const isReservation = status === 'booked' || status === 'pending' || status === 'conflict' || isCollision || isDoppelnutzung;
    const isOccupiedDay = isWorkingDay || isShared || isMaintenance || isCollision || isDoppelnutzung || isReservation;

    // Morning block: no checkout / departure possible
    // (morning occupied by: reservation checkout, morning maintenance, or full block)
    const isMorningBlocked = isWorkingDay || isShared || isCollision || isDoppelnutzung ||
      (isReservation && (bookingSlot === 'full' || bookingSlot === 'checkout' || bookingSlot === 'collision' || bookingSlot === 'doppelnutzung')) ||
      (isMaintenance && (!maintSlot || maintSlot === 'full' || maintSlot === 'morning')) ||
      (bookingSlot === 'checkin' && maintSlot === 'morning');

    // Afternoon block: no checkin / arrival possible
    // (afternoon occupied by: reservation checkin, afternoon maintenance, or full block)
    const isAfternoonBlocked = isWorkingDay || isShared || isCollision || isDoppelnutzung ||
      (isReservation && (bookingSlot === 'full' || bookingSlot === 'checkin' || bookingSlot === 'collision' || bookingSlot === 'doppelnutzung')) ||
      (isMaintenance && (!maintSlot || maintSlot === 'full' || maintSlot === 'afternoon')) ||
      (bookingSlot === 'checkout' && maintSlot === 'afternoon');

    const isFullBlock = isMorningBlocked && isAfternoonBlocked;

    // 1. Full blocks: always trigger inspection if occupied
    if (isFullBlock && isOccupiedDay) {
      if (this.onDayClick) {
        this.onDayClick(dateISO, status);
      }
      return;
    }

    // 2. Both startDate and endDate already set: dynamic range refinement
    if (this.startDate && this.endDate) {
      // If tapping an occupied day that has blocked afternoon, trigger inspection
      if (isOccupiedDay && isAfternoonBlocked && dateISO !== this.startDate && dateISO !== this.endDate) {
        if (this.onDayClick) {
          this.onDayClick(dateISO, status);
        }
        return;
      }

      // Tapping the start date: toggle/clear range
      if (dateISO === this.startDate) {
        this.clearRange();
        return;
      }

      // Tapping the end date: collapse back to start date only (waiting for new checkout)
      if (dateISO === this.endDate) {
        this.endDate = null;
        if (navigator.vibrate) navigator.vibrate(10);
        this.updateCellHighlighting();
        if (this.onRangeChange) {
          this.onRangeChange(this.startDate, null);
        }
        return;
      }

      const d1 = parseDateISO(this.startDate).getTime();
      const dTarget = parseDateISO(dateISO).getTime();

      if (dTarget > d1) {
        // Tapping a later date: extend or shorten checkout!
        if (isMorningBlocked && isOccupiedDay) {
          if (this.onDayClick) this.onDayClick(dateISO, status);
          return;
        }
        this.endDate = dateISO;
        if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
        this.updateCellHighlighting();
        if (this.onRangeSelected) {
          this.onRangeSelected(this.startDate, this.endDate);
        } else if (this.onRangeChange) {
          this.onRangeChange(this.startDate, this.endDate);
        }
        return;
      } else {
        // Tapping an earlier date: shift check-in earlier
        if (isAfternoonBlocked && isOccupiedDay) {
          if (this.onDayClick) this.onDayClick(dateISO, status);
          return;
        }
        this.startDate = dateISO;
        if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
        this.updateCellHighlighting();
        if (this.onRangeSelected) {
          this.onRangeSelected(this.startDate, this.endDate);
        } else if (this.onRangeChange) {
          this.onRangeChange(this.startDate, this.endDate);
        }
        return;
      }
    }

    // 3. User already selected a startDate, now picking departure date (endDate)
    if (this.startDate && !this.endDate) {
      // Tapping the already selected start date: toggle / deselect (NEVER open empty modal on free day!)
      if (this.startDate === dateISO) {
        this.isDragging = false;
        if (isOccupiedDay && this.onDayClick) {
          this.onDayClick(dateISO, status);
        } else {
          this.clearRange();
        }
        return;
      }

      const d1 = parseDateISO(this.startDate).getTime();
      let d2 = parseDateISO(dateISO).getTime();
      const diffDays = Math.abs(d2 - d1) / (1000 * 60 * 60 * 24);

      let finalDate = dateISO;
      if (diffDays > 30) {
        const sign = d2 > d1 ? 1 : -1;
        d2 = d1 + sign * 30 * 24 * 60 * 60 * 1000;
        finalDate = formatDateISO(new Date(d2));
      }

      if (d2 > d1) {
        if (isMorningBlocked && isOccupiedDay) {
          // Cannot depart in the morning here; inspect day
          if (this.onDayClick) {
            this.onDayClick(dateISO, status);
          }
          return;
        }
        this.endDate = finalDate;
      } else if (d2 < d1) {
        // User tapped an earlier date: shift check-in to that earlier date
        if (!isAfternoonBlocked || !isOccupiedDay) {
          this.startDate = finalDate;
          this.endDate = null;
        } else {
          if (this.onDayClick) {
            this.onDayClick(dateISO, status);
          }
          return;
        }
      } else {
        this.endDate = null;
      }

      this.isDragging = false;
      if (navigator.vibrate && this.endDate) navigator.vibrate([10, 30, 10]);
      this.updateCellHighlighting();
      if (this.onRangeSelected && this.endDate) {
        this.onRangeSelected(this.startDate, this.endDate);
      } else if (this.onRangeChange) {
        this.onRangeChange(this.startDate, this.endDate);
      }
      return;
    }

    // 4. Initial check-in selection (startDate is null)
    // Any existing occupied day with blocked afternoon triggers inspection
    if (isOccupiedDay && (isMaintenance || isCollision || isDoppelnutzung || isWorkingDay || isShared || isAfternoonBlocked)) {
      if (this.onDayClick) {
        this.onDayClick(dateISO, status);
      }
      return;
    }

    if (isMouse) {
      this.isDragging = true;
      this.hasMoved = false;
      this.dragStartISO = dateISO;
    }

    this.startDate = dateISO;
    this.endDate = null;
    if (navigator.vibrate) navigator.vibrate(10);
    this.updateCellHighlighting();
    if (this.onRangeChange) {
      this.onRangeChange(this.startDate, this.endDate);
    }
    return;
  }

  updateCellHighlighting() {
    const cells = this.container.querySelectorAll('.day-cell');
    const s = this.startDate;
    const e = this.endDate;
    let defaultNextDay = null;
    if (s && !e) {
      const dObj = parseDateISO(s);
      dObj.setDate(dObj.getDate() + 1);
      defaultNextDay = formatDateISO(dObj);
    }

    cells.forEach((cell) => {
      const d = cell.getAttribute('data-date');
      cell.classList.remove('day-cell--selected-start');
      cell.classList.remove('day-cell--selected-end');
      cell.classList.remove('day-cell--in-range');
      cell.classList.remove('day-cell--selected-default-checkout');

      if (!d || !s || cell.classList.contains('day-cell--outside')) return;

      if (!e) {
        // Single date selected so far: Check-in on s, default checkout on next day
        if (d === s) {
          cell.classList.add('day-cell--selected-start');
        } else if (d === defaultNextDay) {
          cell.classList.add('day-cell--selected-default-checkout');
        }
      } else {
        // Range active
        if (d === s) {
          cell.classList.add('day-cell--selected-start');
        } else if (d === e) {
          cell.classList.add('day-cell--selected-end');
        } else if (isDateInRange(d, s, e)) {
          cell.classList.add('day-cell--in-range');
        }
      }
    });
  }
}
