/**
 * ChaletWeShare — iCalendar (.ics) Generator & Downloader
 * Generates RFC 5545 compliant calendar events for Working Days.
 */

import { addDays } from './dateUtils.js';

/**
 * Generate iCalendar content for a working day
 *
 * @param {Object} options
 * @param {string} options.dateISO - YYYY-MM-DD
 * @param {string} options.season - 'spring' | 'autumn'
 * @param {string} [options.creatorName='Familie']
 * @returns {string} ICS file content with \r\n line breaks
 */
export function generateWorkingDayICS({ dateISO, season, creatorName = 'Familie' }) {
  const isSpring = season === 'spring';
  const title = isSpring ? 'Arbeitstag: Frühjahrsputz' : 'Arbeitstag: Einwintern';
  const summary = `${title} (Chalet Alpenrose)`;
  const description = `Gemeinsamer Arbeitstag im Chalet Alpenrose (Thunersee) zum ${isSpring ? 'Frühjahrsputz & Saisoneröffnung' : 'Einwintern & Saisonabschluss'}. Angesetzt von ${creatorName}.`;
  const location = 'Chalet Alpenrose, Thunersee';

  // Format date as YYYYMMDD
  const dtStart = dateISO.replace(/-/g, '');
  // For all-day event, RFC 5545 requires DTEND to be the day after
  const nextDayISO = addDays(dateISO, 1);
  const dtEnd = nextDayISO.replace(/-/g, '');

  const now = new Date();
  const dtStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `workingday-${dateISO}-${season}-${Date.now()}@chaletweshare.schoolyard.ch`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ChaletWeShare//Arbeitstag//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

/**
 * Trigger download of an ICS calendar file
 *
 * @param {string} filename - e.g. "arbeitstag-chalet-alpenrose.ics"
 * @param {string} icsContent
 */
export function downloadICSFile(filename, icsContent) {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * One-click helper to export working day directly to user's device calendar
 */
export function exportWorkingDayToCalendar({ dateISO, season, creatorName = 'Familie' }) {
  const content = generateWorkingDayICS({ dateISO, season, creatorName });
  const seasonSlug = season === 'spring' ? 'fruehjahrsputz' : 'einwintern';
  const filename = `arbeitstag-${seasonSlug}-${dateISO}.ics`;
  downloadICSFile(filename, content);
}

/**
 * Generate iCalendar content for a confirmed stay / reservation
 *
 * @param {Object} options
 * @param {Object} options.reservation
 * @param {Object} [options.user]
 * @returns {string} ICS file content with \r\n line breaks
 */
export function generateReservationICS({ reservation, user }) {
  const startDate = reservation.dateStart || reservation.date_start;
  const endDate = reservation.dateEnd || reservation.date_end;
  const guestName = reservation.userName || reservation.user_name || user?.name || 'Familie';

  const title = `Chalet Alpenrose — Aufenthalt (${guestName})`;
  const summary = title;
  const location = 'Chalet Alpenrose, Thunersee, Schweiz';
  const description = [
    `Aufenthalt im Chalet Alpenrose von ${guestName}.`,
    `Check-in: ab 15:00 Uhr (${startDate})`,
    `Check-out: bis 11:00 Uhr (${endDate})`,
    `Vor Abreise: Kehricht entsorgen (blaue AVAG-Säcke) und Übergabe-Notiz erfassen.`
  ].join('\\n');

  const dtStart = startDate.replace(/-/g, '') + 'T150000';
  const dtEnd = endDate.replace(/-/g, '') + 'T110000';

  const now = new Date();
  const dtStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `chalet-res-${reservation.id || startDate}-${Date.now()}@chaletweshare.schoolyard.ch`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ChaletWeShare//Aufenthalt//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

/**
 * One-click helper to export reservation directly to user's device calendar
 */
export function exportReservationToCalendar({ reservation, user }) {
  const content = generateReservationICS({ reservation, user });
  const startDate = reservation.dateStart || reservation.date_start;
  const filename = `chalet-aufenthalt-${startDate}.ics`;
  downloadICSFile(filename, content);
}

