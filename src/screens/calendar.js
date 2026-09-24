/**
 * ChaletWeShare — Calendar Screen
 * Mobile-first 7-column Bauhaus Calendar Grid with Date Range Selection
 */

import {
  formatDateISO,
  parseDateISO,
  formatDateFriendly,
  formatMonthYear,
  getDaysInMonth,
  getFirstDayOfWeek,
  getBookingWindowLimits,
  isDateInBookingWindow,
  countNights,
  addDays,
  WEEKDAY_NAMES_DE
} from '../utils/dateUtils.js';
import { renderDayCell } from '../components/dayCell.js';
import { DateRangeSelector } from '../components/dateRangeSelector.js';
import { reservationStore } from '../engine/reservationStore.js';
import { reservationEngine } from '../engine/reservationEngine.js';
import { profileManager } from '../engine/profileManager.js';
import { openBookingConfirmSheet } from '../components/bookingConfirmSheet.js';
import { openMaintenanceSheet } from '../components/maintenanceSheet.js';
import { openWorkingDaySheet } from '../components/workingDaySheet.js';
import { openDayDetailSheet } from '../components/dayDetailSheet.js';
import { openConflictModal } from '../components/conflictModal.js';
import { handoverService } from '../engine/handoverService.js';
import { openHandoverModal } from '../components/handoverModal.js';
import { PixelHome, PixelWrench, PixelBroom, PixelWarning, PixelCalendar, PixelCheck, PixelCancel } from '../data/pixelIcons.js';
import { exportReservationToCalendar } from '../utils/icsUtils.js';
import { escapeHtml } from '../utils/htmlUtils.js';

let persistentViewedYear = null;
let persistentViewedMonth = null;

export class CalendarScreen {
  /**
   * @param {HTMLElement} mountEl
   * @param {Object} [options]
   */
  constructor(mountEl, options = {}) {
    this.mountEl = mountEl;
    this.options = options;

    const today = new Date();
    this.currentYear = persistentViewedYear !== null ? persistentViewedYear : today.getFullYear();
    this.currentMonth = persistentViewedMonth !== null ? persistentViewedMonth : today.getMonth(); // 0-indexed

    this.limits = getBookingWindowLimits(today);

    this.selectedStart = null;
    this.selectedEnd = null;

    this.rangeSelector = null;
    this.monthObserver = null;
    this.hasInitialScrolled = false;
    this.user = profileManager.getActiveProfile();

    // Subscribe to engine changes for real-time reactivity
    this.unsubscribe = reservationEngine.subscribe((event) => {
      this.render();
    });

    // Visibility & focus sync: ensure calendar reflects changes when returning to app
    this.handleVisibilityChange = () => {
      if (!document.hidden) {
        reservationEngine.loadCalendarData();
      }
    };
    this.handleFocus = () => {
      reservationEngine.loadCalendarData();
    };
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('focus', this.handleFocus);

    // Heartbeat sync: check for updates every 15s while calendar screen is active
    this.heartbeatInterval = setInterval(() => {
      if (!document.hidden) {
        reservationEngine.loadCalendarData();
      }
    }, 15000);

    // Initial load from server
    reservationEngine.loadCalendarData();
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.handleVisibilityChange = null;
    }
    if (this.handleFocus) {
      window.removeEventListener('focus', this.handleFocus);
      this.handleFocus = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.monthObserver) {
      this.monthObserver.disconnect();
      this.monthObserver = null;
    }
    if (this._scrollHandler && this._currentScrollTarget) {
      this._currentScrollTarget.removeEventListener('scroll', this._scrollHandler);
      this._scrollHandler = null;
      this._currentScrollTarget = null;
    }
    if (this.rangeSelector) {
      this.rangeSelector.destroy();
    }
    const overlays = document.getElementById('global-overlays');
    if (overlays) {
      overlays.innerHTML = '';
    }
    const navEl = document.querySelector('.app-nav');
    if (navEl) {
      navEl.classList.remove('is-hidden');
    }
  }

  render() {
    this.user = profileManager.getActiveProfile();

    const navEl = document.querySelector('.app-nav');
    if (navEl) {
      if (this.selectedStart) {
        navEl.classList.add('is-hidden');
      } else {
        navEl.classList.remove('is-hidden');
      }
    }

    this.mountEl.innerHTML = `
      <div class="calendar-screen">
        <div class="pull-refresh-indicator" id="pull-refresh-indicator">
          <span class="pull-refresh-indicator__text" id="pull-refresh-text">↓ LADEN…</span>
        </div>

        <!-- Proactive Arrival & Handover Briefing Container -->
        <div id="arrival-briefing-container"></div>

        <!-- Handover Checkout Prompt (Near End of Stay) -->
        <div id="handover-prompt-container"></div>


        <!-- Continuous Months Feed -->
        <div class="calendar-months-feed" id="calendar-months-feed">
          ${this._renderContinuousMonthsMarkup()}
        </div>


        <!-- Booking Window Rule Note -->
        <div class="calendar-rule-info">
          <span>Buchungsfenster: Bis 31. Oktober ${this.limits.maxDate.getFullYear()}</span>
        </div>

        <!-- Bottom Sheet Modal Backdrop Container is mounted in global overlays -->
      </div>
    `;

    const overlays = document.getElementById('global-overlays');
    if (overlays) {
      // Ensure #cal-sheet-modal exists without destroying active modals
      let modalContainer = document.getElementById('cal-sheet-modal');
      if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'cal-sheet-modal';
        modalContainer.className = 'bottom-sheet-backdrop';
        modalContainer.style.display = 'none';
        overlays.appendChild(modalContainer);

        modalContainer.addEventListener('click', (e) => {
          if (e.target === modalContainer) {
            modalContainer.style.display = 'none';
            modalContainer.innerHTML = '';
          }
        });
      }

      // Recreate or update selection bar
      let selectionBar = document.getElementById('cal-selection-bar');
      if (!selectionBar) {
        selectionBar = document.createElement('div');
        selectionBar.id = 'cal-selection-bar';
        overlays.insertBefore(selectionBar, modalContainer);
      }
      selectionBar.className = `selection-bar ${this.selectedStart ? 'is-visible' : ''}`;
      selectionBar.innerHTML = `
        <div class="selection-bar__content">
          <div class="selection-bar__header">
            <div class="selection-bar__info">
              <span class="selection-bar__dates" id="sel-dates-label">
                ${this._getSelectionLabel()}
              </span>
              <span class="selection-bar__duration" id="sel-duration-label">
                ${this._getDurationLabel()}
              </span>
            </div>
            <button id="sel-btn-cancel" type="button" class="btn btn--icon btn--sm selection-bar__close-btn" aria-label="Auswahl aufheben" title="Auswahl aufheben">
              ${PixelCancel}
            </button>
          </div>
          <div class="selection-bar__actions">
            <button id="sel-btn-book" type="button" class="btn btn--primary btn--sm selection-bar__action-btn">
              Reservieren
            </button>
            <button id="sel-btn-maint" type="button" class="btn btn--sm selection-bar__action-btn selection-bar__action-btn--maint">
              ${PixelWrench} <span>Unterhalt</span>
            </button>
            <button id="sel-btn-working-day" type="button" class="btn btn--sm selection-bar__action-btn selection-bar__action-btn--working-day">
              ${PixelBroom} <span>Arbeitstag</span>
            </button>
          </div>
        </div>
      `;
      // Recreate or update "HEUTE" Floating Action Button (FAB)
      let todayFab = document.getElementById('cal-btn-today-fab');
      if (!todayFab) {
        todayFab = document.createElement('button');
        todayFab.id = 'cal-btn-today-fab';
        todayFab.className = 'cal-today-fab';
        todayFab.setAttribute('aria-label', 'Zu heute springen');
        todayFab.innerHTML = `↑ HEUTE`;
        overlays.appendChild(todayFab);

        todayFab.addEventListener('click', () => {
          if (navigator.vibrate) navigator.vibrate(10);
          const now = new Date();
          this._scrollToMonth(now.getFullYear(), now.getMonth());
          const todayCell = this.mountEl.querySelector(`[data-date="${formatDateISO(now)}"]`);
          if (todayCell) {
            todayCell.classList.add('day-cell--state-transition');
            setTimeout(() => todayCell.classList.remove('day-cell--state-transition'), 1000);
          }
          this._updateTodayFabVisibility();
        });
      }
      this._updateTodayFabVisibility();
    }

    this._bindEvents();
  }

  _updateTodayFabVisibility() {
    const todayFab = document.getElementById('cal-btn-today-fab');
    if (!todayFab) return;

    if (this.selectedStart) {
      todayFab.classList.remove('is-visible');
      return;
    }

    const now = new Date();
    const isCurrentMonth = (this.currentYear === now.getFullYear() && this.currentMonth === now.getMonth());

    if (!isCurrentMonth) {
      todayFab.classList.add('is-visible');
    } else {
      todayFab.classList.remove('is-visible');
    }
  }

  _renderContinuousMonthsMarkup() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const startYear = currentYear;
    const startMonth = 0; // Jan of current year
    const maxYear = this.limits.maxDate.getFullYear();
    const maxMonth = this.limits.maxDate.getMonth(); // Oct of max year

    const sections = [];
    let y = startYear;
    let m = startMonth;

    while (y < maxYear || (y === maxYear && m <= maxMonth)) {
      sections.push(this._renderMonthSectionMarkup(y, m));
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }

    return sections.join('');
  }

  _renderMonthSectionMarkup(year, month) {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDayWeekday = getFirstDayOfWeek(year, month); // 0 = Mon, 6 = Sun
    const todayISO = formatDateISO(new Date());
    const daysMarkup = [];

    // Leading padding cells from previous month
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

    for (let i = firstDayWeekday - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const mStr = String(prevMonth + 1).padStart(2, '0');
      const dStr = String(dayNum).padStart(2, '0');
      const dateISO = `${prevYear}-${mStr}-${dStr}`;

      daysMarkup.push(
        renderDayCell({
          dateISO,
          dayNumber: dayNum,
          isCurrentMonth: false,
          isDisabled: true
        })
      );
    }

    // Days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      const dateISO = `${year}-${mStr}-${dStr}`;

      const isToday = dateISO === todayISO;
      const inBookingWindow = isDateInBookingWindow(dateISO);
      const isPast = dateISO < todayISO;
      const isDisabled = isPast || !inBookingWindow;

      const dayData = reservationStore.getDayStatus(dateISO);

      const isSelectedStart = this.selectedStart === dateISO;
      const isSelectedEnd = this.selectedEnd === dateISO;
      let isInRange = false;
      let isDefaultCheckout = false;

      if (this.selectedStart && this.selectedEnd) {
        isInRange = dateISO > this.selectedStart && dateISO < this.selectedEnd;
      } else if (this.selectedStart && !this.selectedEnd) {
        const nextDayISO = addDays(this.selectedStart, 1);
        isDefaultCheckout = dateISO === nextDayISO;
      }

      daysMarkup.push(
        renderDayCell({
          dateISO,
          dayNumber: day,
          isCurrentMonth: true,
          isToday,
          isDisabled,
          status: dayData.status,
          bookingSlot: dayData.bookingSlot,
          maintSlot: dayData.maintSlot || 'full',
          reservation: dayData.info,
          workingDay: dayData.workingDay,
          checkoutInfo: dayData.checkoutInfo,
          checkinInfo: dayData.checkinInfo,
          isSelectedStart,
          isSelectedEnd,
          isInRange,
          isDefaultCheckout
        })
      );
    }

    // Trailing padding cells to complete the 7-column row
    const totalFilled = firstDayWeekday + daysInMonth;
    const trailingCount = (7 - (totalFilled % 7)) % 7;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;

    for (let day = 1; day <= trailingCount; day++) {
      const mStr = String(nextMonth + 1).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      const dateISO = `${nextYear}-${mStr}-${dStr}`;

      daysMarkup.push(
        renderDayCell({
          dateISO,
          dayNumber: day,
          isCurrentMonth: false,
          isDisabled: true
        })
      );
    }

    return `
      <section class="calendar-month-section" id="month-${year}-${month}" data-year="${year}" data-month="${month}">
        <div class="calendar-month-section__header">
          <h3 class="calendar-month-section__title">
            ${formatMonthYear(year, month)}
          </h3>
        </div>
        <div class="calendar-month-section__body">
          <div class="calendar-month-weekdays" role="row">
            ${WEEKDAY_NAMES_DE.map((d) => `<div class="calendar-month-weekday" role="columnheader">${d}</div>`).join('')}
          </div>
          <div class="calendar-month-grid" role="grid" aria-label="${formatMonthYear(year, month)}">
            ${daysMarkup.join('')}
          </div>
        </div>
      </section>
    `;
  }

  _bindEvents() {
    const feedEl = this.mountEl.querySelector('#calendar-months-feed');
    const modalContainer = document.getElementById('cal-sheet-modal');

    // FAB Scroll Listener
    const scrollTarget = this.mountEl.closest('.app-content') || this.mountEl;
    if (this._scrollHandler && this._currentScrollTarget) {
      this._currentScrollTarget.removeEventListener('scroll', this._scrollHandler);
    }
    this._currentScrollTarget = scrollTarget;
    this._scrollHandler = () => {
      this._updateTodayFabVisibility();
    };
    if (scrollTarget) {
      scrollTarget.addEventListener('scroll', this._scrollHandler, { passive: true });
    }

    // Initialize DateRangeSelector on the continuous feed
    if (this.rangeSelector) {
      this.rangeSelector.destroy();
    }

    if (feedEl) {
      this.rangeSelector = new DateRangeSelector({
        container: feedEl,
        onRangeChange: (start, end) => {
          this.selectedStart = start;
          this.selectedEnd = end;
          this._updateSelectionBarUI();
        },
        onRangeSelected: (start, end) => {
          this.selectedStart = start;
          this.selectedEnd = end;
          this._updateSelectionBarUI();
        },
        onDayClick: (dateISO) => {
          this._openDayDetailModal(dateISO);
        }
      });

      if (this.selectedStart) {
        this.rangeSelector.setRange(this.selectedStart, this.selectedEnd, false);
      }
    }

    // IntersectionObserver to update sticky title and button state as user scrolls
    if (this.monthObserver) {
      this.monthObserver.disconnect();
    }
    const scrollRoot = this.mountEl.closest('.app-content') || null;
    this.monthObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const year = parseInt(entry.target.getAttribute('data-year'), 10);
          const month = parseInt(entry.target.getAttribute('data-month'), 10);
          if (!isNaN(year) && !isNaN(month)) {
            this.currentYear = year;
            this.currentMonth = month;
            persistentViewedYear = year;
            persistentViewedMonth = month;
            this._updateTodayFabVisibility();
          }
        }
      });
    }, {
      root: scrollRoot,
      rootMargin: '-15% 0px -70% 0px',
      threshold: 0
    });

    const sections = this.mountEl.querySelectorAll('.calendar-month-section');
    sections.forEach(sec => this.monthObserver.observe(sec));


    // Selection Bar Actions
    const cancelBtn = document.getElementById('sel-btn-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._clearSelection();
      });
    }

    const bookBtn = document.getElementById('sel-btn-book');
    if (bookBtn) {
      bookBtn.addEventListener('click', () => {
        if (!this.selectedStart) return;
        const startDate = this.selectedStart;
        const endDate = (this.selectedEnd && this.selectedEnd !== this.selectedStart)
          ? this.selectedEnd
          : addDays(this.selectedStart, 1);

        openBookingConfirmSheet({
          container: modalContainer,
          startDate,
          endDate,
          user: this.user,
          onSuccess: (res) => {
            this._clearSelection();
            this.render();
          }
        });
      });
    }

    const maintBtn = document.getElementById('sel-btn-maint');
    if (maintBtn) {
      maintBtn.addEventListener('click', () => {
        if (!this.selectedStart) return;
        const startDate = this.selectedStart;
        const endDate = (this.selectedEnd && this.selectedEnd !== this.selectedStart)
          ? this.selectedEnd
          : this.selectedStart;

        if (startDate === endDate && this.rangeSelector) {
          this.rangeSelector.setRange(startDate, startDate, false);
        }

        document.body.classList.add('is-maintenance-mode');

        openMaintenanceSheet({
          container: modalContainer,
          startDate,
          endDate,
          user: this.user,
          onSuccess: (maint) => {
            document.body.classList.remove('is-maintenance-mode');
            this._clearSelection();
            this.render();
          },
          onClose: () => {
            document.body.classList.remove('is-maintenance-mode');
          }
        });
      });
    }

    const wdBtn = document.getElementById('sel-btn-working-day');
    if (wdBtn) {
      wdBtn.addEventListener('click', () => {
        if (!this.selectedStart) return;
        const date = this.selectedStart;

        if (this.rangeSelector) {
          this.rangeSelector.setRange(date, date, false);
        }

        document.body.classList.add('is-working-day-mode');

        openWorkingDaySheet({
          container: modalContainer,
          date,
          user: this.user,
          onSuccess: (wd) => {
            document.body.classList.remove('is-working-day-mode');
            this._clearSelection();
            this.render();
          },
          onClose: () => {
            document.body.classList.remove('is-working-day-mode');
          }
        });
      });
    }

    this._checkArrivalBriefing();
    this._checkHandoverPrompt();
    this._initPullToRefresh();

    // Auto-scroll to currently viewed month on initial render
    if (!this.hasInitialScrolled) {
      this.hasInitialScrolled = true;
      requestAnimationFrame(() => {
        const target = this.mountEl.querySelector(`#month-${this.currentYear}-${this.currentMonth}`);
        if (target) {
          target.scrollIntoView({ block: 'start' });
        }
      });
    }
  }

  _scrollToMonth(year, month) {
    const target = this.mountEl.querySelector(`#month-${year}-${month}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.currentYear = year;
      this.currentMonth = month;
      persistentViewedYear = year;
      persistentViewedMonth = month;
      this._updateTodayFabVisibility();
    }
  }

  _initPullToRefresh() {
    const scrollTarget = this.mountEl.closest('.app-content') || this.mountEl;
    const indicator = this.mountEl.querySelector('#pull-refresh-indicator');
    const textEl = this.mountEl.querySelector('#pull-refresh-text');
    if (!scrollTarget || !indicator) return;

    let startY = 0;
    let pulling = false;
    const THRESHOLD = 70;

    scrollTarget.addEventListener('touchstart', (e) => {
      if (scrollTarget.scrollTop <= 0) {
        startY = e.touches[0].clientY;
        pulling = true;
        indicator.classList.add('is-pulling');
      }
    }, { passive: true });

    scrollTarget.addEventListener('touchmove', (e) => {
      if (!pulling) return;
      if (scrollTarget.scrollTop > 0) {
        pulling = false;
        indicator.classList.remove('is-pulling');
        indicator.style.height = '0';
        return;
      }
      const dy = Math.max(0, e.touches[0].clientY - startY);
      const clamped = Math.min(dy * 0.4, THRESHOLD);
      indicator.style.height = `${clamped}px`;
      if (textEl) {
        textEl.textContent = clamped >= THRESHOLD ? '↑ LOSLASSEN' : '↓ LADEN…';
      }
    }, { passive: true });

    const endPull = async () => {
      if (!pulling) return;
      const currentHeight = parseInt(indicator.style.height) || 0;
      pulling = false;
      indicator.classList.remove('is-pulling');

      if (currentHeight >= THRESHOLD) {
        indicator.classList.add('is-refreshing');
        if (textEl) textEl.textContent = 'SYNCHRONISIERE…';
        if (navigator.vibrate) navigator.vibrate(10);
        await reservationEngine.loadCalendarData();
        setTimeout(() => {
          indicator.classList.remove('is-refreshing');
          indicator.style.height = '0';
          this.render();
        }, 600);
      } else {
        indicator.style.height = '0';
      }
    };

    scrollTarget.addEventListener('touchend', endPull, { passive: true });
    scrollTarget.addEventListener('touchcancel', endPull, { passive: true });
  }

  async _checkArrivalBriefing() {
    const container = this.mountEl.querySelector('#arrival-briefing-container');
    if (!container) return;

    if (sessionStorage.getItem('chalet_dismiss_briefing_' + (this.user?.id || 'guest'))) {
      container.innerHTML = '';
      return;
    }

    const data = await handoverService.getArrivalBriefing();
    if (data && data.has_arrival && data.reservation) {
      const res = data.reservation;
      const isOngoing = data.is_ongoing;
      const hoursUntil = data.hours_until_checkin;
      const minutesUntil = data.minutes_until_checkin || 0;
      const notes = data.notes_from_prev || [];

      let timingLabel = isOngoing ? 'Aufenthalt aktiv' : `Anreise in ${hoursUntil} Std.`;
      if (!isOngoing) {
        if (hoursUntil === 0 && minutesUntil <= 0) {
          timingLabel = 'Anreise heute ab 15:00 Uhr';
        } else if (hoursUntil > 0 && minutesUntil > 0) {
          timingLabel = `Anreise in ${hoursUntil} Std. ${minutesUntil} Min.`;
        } else if (hoursUntil > 0) {
          timingLabel = `Anreise in ${hoursUntil} Std.`;
        } else if (minutesUntil > 0) {
          timingLabel = `Anreise in ${minutesUntil} Min.`;
        }
      }

      container.innerHTML = `
        <div class="card" style="border: 2px solid #1A1A1A; background: #FFFDF0; box-shadow: var(--shadow-brutal); padding: 12px 14px; margin-bottom: 12px; position: relative;">
          <!-- Close / Dismiss button -->
          <button id="btn-dismiss-briefing" class="btn btn--icon btn--sm" style="position: absolute; top: 8px; right: 8px;" title="Ausblenden">
            ${PixelCancel}
          </button>

          <!-- Header badge -->
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
            <span style="font-size: 0.7rem; font-weight: 800; background: #1A1A1A; color: #fff; padding: 2px 8px; text-transform: uppercase; letter-spacing: 0.05em; display: inline-flex; align-items: center; gap: 4px;">
              ${PixelHome} ${timingLabel}
            </span>
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted);">
              ${formatDateFriendly(res.dateStart || res.date_start)} – ${formatDateFriendly(res.dateEnd || res.date_end)}
            </span>
          </div>

          <div style="font-size: 0.95rem; font-weight: 800; color: var(--color-text); margin-bottom: 8px;">
            ${isOngoing ? 'Gute Erholung im Chalet Zahler!' : 'Anreise-Briefing & Check-in Details:'}
          </div>

          <!-- Notes from Previous Sibling / Departure -->
          ${notes.length > 0 ? `
            <div style="background: #FEF3C7; border: 2px solid #F59E0B; padding: 8px 10px; margin-bottom: 10px;">
              <div style="font-weight: 800; font-size: 0.75rem; color: #92400E; display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">
                ${PixelWarning} WICHTIG: Notizen des vorherigen Gastes:
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                ${notes.map(n => `
                  <div style="font-size: 0.8rem; color: #78350F; background: rgba(255,255,255,0.7); padding: 4px 8px;">
                    <strong>${escapeHtml(n.author_name || 'Vorheriger Gast')}:</strong> "${escapeHtml(n.message)}"
                  </div>
                `).join('')}
              </div>
            </div>
          ` : `
            <div style="background: #F0FDF4; border: 1.5px solid #86EFAC; padding: 8px 10px; margin-bottom: 10px; font-size: 0.78rem; color: #166534; font-weight: 700; display: flex; align-items: center; gap: 6px;">
              ${PixelCheck} <span>Keine offenen Mängel oder Notizen vom vorherigen Gast gemeldet.</span>
            </div>
          `}

          <!-- Bottom Action Buttons -->
          <div>
            <button id="btn-briefing-ics" class="btn btn--sm btn--primary" style="width: 100%; font-size: 0.75rem; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px;">
              ${PixelCalendar} KALENDER EXPORT
            </button>
          </div>
        </div>
      `;

      // Event listeners
      const icsBtn = container.querySelector('#btn-briefing-ics');
      if (icsBtn) {
        icsBtn.addEventListener('click', () => {
          exportReservationToCalendar({ reservation: res, user: this.user });
        });
      }

      const dismissBtn = container.querySelector('#btn-dismiss-briefing');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          sessionStorage.setItem('chalet_dismiss_briefing_' + (this.user?.id || 'guest'), 'true');
          container.innerHTML = '';
        });
      }
    } else {
      container.innerHTML = '';
    }
  }

  async _checkHandoverPrompt() {
    const promptContainer = this.mountEl.querySelector('#handover-prompt-container');
    if (!promptContainer) return;

    const data = await handoverService.checkPrompt();
    if (data && data.should_prompt && data.reservation) {
      promptContainer.innerHTML = `
        <div class="card" style="border: 2px solid var(--color-accent); background: var(--color-surface); box-shadow: var(--shadow-brutal-sm); padding: 10px 12px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <div>
            <div style="font-size: 0.7rem; font-weight: 800; color: var(--color-accent); text-transform: uppercase; display: flex; align-items: center; gap: 4px;">
              ${PixelHome} Abreise steht bevor
            </div>
            <div style="font-size: 0.82rem; font-weight: 700; color: var(--color-text); margin-top: 1px;">
              Notiz an den nächsten Gast hinterlassen?
            </div>
          </div>
          <button id="btn-open-prompt-handover" class="btn btn--sm btn--primary" style="white-space: nowrap; font-size: 0.75rem;">
            Notiz erfassen
          </button>
        </div>
      `;

      const btn = promptContainer.querySelector('#btn-open-prompt-handover');
      if (btn) {
        btn.addEventListener('click', () => {
          const modalContainer = document.getElementById('cal-sheet-modal');
          openHandoverModal({
            container: modalContainer,
            reservation: data.reservation,
            user: this.user,
            onSubmitted: () => {
              promptContainer.innerHTML = '';
            }
          });
        });
      }
    }
  }

  _clearSelection() {
    document.body.classList.remove('is-maintenance-mode', 'is-working-day-mode');
    if (this.rangeSelector) {
      this.rangeSelector.clearRange();
    }
    this.selectedStart = null;
    this.selectedEnd = null;
    this._updateSelectionBarUI();
  }

  _openDayDetailModal(dateISO) {
    const modalContainer = document.getElementById('cal-sheet-modal');
    openDayDetailSheet({
      container: modalContainer,
      dateISO,
      user: this.user,
      onSelectAsStart: (date) => {
        this.selectedStart = date;
        this.selectedEnd = null;
        if (this.rangeSelector) {
          this.rangeSelector.setRange(date, null);
        }
        this._updateSelectionBarUI();
      },
      onUpdated: () => {
        this.render();
      }
    });
  }

  _updateSelectionBarUI() {
    const barEl = document.getElementById('cal-selection-bar');
    const navEl = document.querySelector('.app-nav');

    if (this.selectedStart) {
      if (barEl) barEl.classList.add('is-visible');
      if (navEl) navEl.classList.add('is-hidden');
      const datesLabel = document.getElementById('sel-dates-label');
      const durationLabel = document.getElementById('sel-duration-label');
      if (datesLabel) datesLabel.innerHTML = this._getSelectionLabel();
      if (durationLabel) durationLabel.innerHTML = this._getDurationLabel();
    } else {
      if (barEl) barEl.classList.remove('is-visible');
      if (navEl) navEl.classList.remove('is-hidden');
    }
    this._updateTodayFabVisibility();
  }

  _getSelectionLabel() {
    if (!this.selectedStart) return '';
    if (!this.selectedEnd || this.selectedStart === this.selectedEnd) {
      const defaultEnd = addDays(this.selectedStart, 1);
      return `${formatDateFriendly(this.selectedStart)} – ${formatDateFriendly(defaultEnd)}`;
    }
    return `${formatDateFriendly(this.selectedStart)} – ${formatDateFriendly(this.selectedEnd)}`;
  }

  _getDurationLabel() {
    if (!this.selectedStart) return '';
    if (!this.selectedEnd || this.selectedStart === this.selectedEnd) {
      return '1 Nacht (Check-out Folgetag)';
    }
    const nights = countNights(this.selectedStart, this.selectedEnd);
    return `${nights} Nächte`;
  }

  /**
   * Navigate calendar to a specific date (YYYY-MM-DD)
   * @param {string} dateISO
   */
  async openDate(dateISO) {
    if (!dateISO) return;
    const targetCell = this.mountEl.querySelector(`[data-date="${dateISO}"]`);
    if (targetCell) {
      targetCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetCell.classList.add('day-cell--state-transition');
      setTimeout(() => {
        targetCell.classList.remove('day-cell--state-transition');
        this._openDayDetailModal(dateISO);
      }, 800);
    } else {
      const targetDate = new Date(dateISO);
      if (!isNaN(targetDate.getTime())) {
        this.currentYear = targetDate.getFullYear();
        this.currentMonth = targetDate.getMonth();
        persistentViewedYear = this.currentYear;
        persistentViewedMonth = this.currentMonth;
        this.render();
        requestAnimationFrame(() => {
          const cell = this.mountEl.querySelector(`[data-date="${dateISO}"]`);
          if (cell) {
            cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
            cell.classList.add('day-cell--state-transition');
            setTimeout(() => {
              cell.classList.remove('day-cell--state-transition');
              this._openDayDetailModal(dateISO);
            }, 800);
          }
        });
      }
    }
  }

  /**
   * Open details or conflict resolution modal for a specific reservation ID
   * @param {number|string} reservationId
   */
  async openReservation(reservationId) {
    let res = reservationStore.reservations.find((r) => r.id == reservationId);
    if (!res) {
      await reservationEngine.loadCalendarData();
      res = reservationStore.reservations.find((r) => r.id == reservationId);
    }
    if (!res) return;

    // Scroll to the reservation in the continuous feed
    const targetCell = this.mountEl.querySelector(`[data-date="${res.dateStart}"]`);
    if (targetCell) {
      targetCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetCell.classList.add('day-cell--state-transition');
      setTimeout(() => {
        targetCell.classList.remove('day-cell--state-transition');
      }, 800);
    }

    const modalContainer = document.getElementById('cal-sheet-modal');
    if (!modalContainer) return;

    if (res.status === 'vetoed' || res.status === 'conflict' || (Array.isArray(res.vetoes) && res.vetoes.length > 0)) {
      openConflictModal({
        container: modalContainer,
        reservation: res,
        user: this.user,
        onResolved: () => {
          this.render();
        },
        onClose: () => {
          modalContainer.style.display = 'none';
          modalContainer.innerHTML = '';
        }
      });
    } else {
      openDayDetailSheet({
        container: modalContainer,
        dateISO: res.dateStart,
        user: this.user,
        onSelectAsStart: (date) => {
          this.selectedStart = date;
          this.selectedEnd = null;
          if (this.rangeSelector) {
            this.rangeSelector.setRange(date, null);
          }
          this._updateSelectionBarUI();
        },
        onUpdated: () => {
          this.render();
        },
        onClose: () => {
          modalContainer.style.display = 'none';
          modalContainer.innerHTML = '';
        }
      });
    }
  }
}
