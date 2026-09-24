/**
 * ChaletWeShare — Date Utilities & Booking Window Rules
 *
 * Rules:
 * - Monday is first day of week (ISO 8601 standard for Switzerland).
 * - Booking window rule: Bookings allowed until October 31 of the FOLLOWING year.
 *   Window shifts forward by one year every January 1.
 */

export const MONTH_NAMES_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
];

export const MONTH_NAMES_SHORT_DE = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'
];

export const WEEKDAY_NAMES_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/**
 * Format a Date object to YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
export function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse a YYYY-MM-DD string into a local midnight Date
 * @param {string} isoStr
 * @returns {Date}
 */
export function parseDateISO(isoStr) {
  if (!isoStr) return null;
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Format date for friendly Swiss-German display (e.g. "15. Sep 2026")
 * @param {string|Date} dateOrStr
 * @returns {string}
 */
export function formatDateFriendly(dateOrStr) {
  const d = typeof dateOrStr === 'string' ? parseDateISO(dateOrStr) : dateOrStr;
  if (!d) return '';
  const day = d.getDate();
  const month = MONTH_NAMES_SHORT_DE[d.getMonth()];
  const year = d.getFullYear();
  return `${day}. ${month} ${year}`;
}

/**
 * Compare two dates ignoring time
 * @param {Date} d1
 * @param {Date} d2
 * @returns {boolean}
 */
export function isSameDay(d1, d2) {
  if (!d1 || !d2) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Check if date is within [start, end] inclusive
 * @param {string|Date} target
 * @param {string|Date} start
 * @param {string|Date} end
 * @returns {boolean}
 */
export function isDateInRange(target, start, end) {
  const t = typeof target === 'string' ? parseDateISO(target).getTime() : target.getTime();
  const s = typeof start === 'string' ? parseDateISO(start).getTime() : start.getTime();
  const e = typeof end === 'string' ? parseDateISO(end).getTime() : end.getTime();
  return t >= Math.min(s, e) && t <= Math.max(s, e);
}

/**
 * Calculate difference in nights between two ISO dates
 * @param {string} startISO
 * @param {string} endISO
 * @returns {number}
 */
export function countNights(startISO, endISO) {
  const s = parseDateISO(startISO);
  const e = parseDateISO(endISO);
  const diffMs = Math.abs(e.getTime() - s.getTime());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Returns number of days in month (year, 0-indexed month)
 * @param {number} year
 * @param {number} month
 * @returns {number}
 */
export function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Returns weekday index of 1st day of month (0 = Monday, 6 = Sunday)
 * @param {number} year
 * @param {number} month
 * @returns {number}
 */
export function getFirstDayOfWeek(year, month) {
  const jsDay = new Date(year, month, 1).getDay(); // 0 is Sunday in JS
  return (jsDay + 6) % 7; // Convert so 0 = Monday, 6 = Sunday
}

/**
 * Compute the Chalet booking window limits:
 * - Starts today (midnight)
 * - Ends October 31 of following year (e.g. In 2026 -> 2027-10-31; in 2027 -> 2028-10-31)
 * @param {Date} [referenceDate]
 * @returns {{ minDate: Date, maxDate: Date, minISO: string, maxISO: string }}
 */
export function getBookingWindowLimits(referenceDate = new Date()) {
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    0, 0, 0, 0
  );

  const currentYear = today.getFullYear();
  // Allowed until October 31 of the following year
  const maxDate = new Date(currentYear + 1, 9, 31, 23, 59, 59, 999); // Month 9 is October (0-indexed)

  return {
    minDate: today,
    maxDate,
    minISO: formatDateISO(today),
    maxISO: formatDateISO(maxDate)
  };
}

/**
 * Checks if a given ISO date is within the legal booking window
 * @param {string} dateISO
 * @param {Date} [referenceDate]
 * @returns {boolean}
 */
export function isDateInBookingWindow(dateISO, referenceDate = new Date()) {
  const limits = getBookingWindowLimits(referenceDate);
  const target = parseDateISO(dateISO);
  if (!target) return false;
  return target.getTime() >= limits.minDate.getTime() && target.getTime() <= limits.maxDate.getTime();
}

/**
 * Format month header text: e.g. "SEPTEMBER 2026"
 * @param {number} year
 * @param {number} month
 * @returns {string}
 */
export function formatMonthYear(year, month) {
  return `${MONTH_NAMES_DE[month].toUpperCase()} ${year}`;
}

/**
 * Add days to an ISO date string
 * @param {string} isoStr
 * @param {number} [days=1]
 * @returns {string}
 */
export function addDays(isoStr, days = 1) {
  const d = parseDateISO(isoStr);
  if (!d) return isoStr;
  d.setDate(d.getDate() + days);
  return formatDateISO(d);
}

/**
 * Format remaining time until deadline into a friendly countdown object
 * @param {string|Date} deadline
 * @returns {{ expired: boolean, text: string, hours: number, minutes: number, seconds: number, cutoffFormatted: string }}
 */
export function getVetoCountdown(deadline) {
  if (!deadline) {
    return { expired: true, text: 'Sofortige Bestätigung', days: 0, hours: 0, minutes: 0, seconds: 0, cutoffFormatted: '' };
  }
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();

  const hoursNum = String(d.getHours()).padStart(2, '0');
  const minutesNum = String(d.getMinutes()).padStart(2, '0');
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  let cutoffFormatted = `${hoursNum}:${minutesNum} Uhr`;
  if (isToday) {
    cutoffFormatted = `Heute, ${hoursNum}:${minutesNum} Uhr`;
  } else if (isTomorrow) {
    cutoffFormatted = `Morgen, ${hoursNum}:${minutesNum} Uhr`;
  } else {
    const dayLabel = d.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' });
    cutoffFormatted = `${dayLabel}, ${hoursNum}:${minutesNum} Uhr`;
  }

  if (diffMs <= 0) {
    return {
      expired: true,
      text: 'Veto-Frist abgelaufen (Wird bestätigt)',
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      cutoffFormatted
    };
  }

  const totalSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;

  let text = '';
  if (days > 0) {
    text = `Noch ${days} ${days === 1 ? 'Tag' : 'Tage'} ${remHours} Std.`;
  } else if (hours > 0) {
    text = `Noch ${hours} Std. ${minutes} Min.`;
  } else if (minutes > 0) {
    text = `Noch ${minutes} Min. ${seconds} Sek.`;
  } else {
    text = `Noch ${seconds} Sek.`;
  }

  return {
    expired: false,
    text,
    days,
    hours,
    minutes,
    seconds,
    cutoffFormatted
  };
}
