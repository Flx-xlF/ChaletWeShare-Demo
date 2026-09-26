/**
 * ChaletWeShare — Day Cell Component
 * Strict Bauhaus Aesthetic: 2px solid black borders, high contrast, zero radius.
 */

import { renderAvatarMarkup } from '../data/avatars.js';
import { PixelWrench, PixelBroom, PixelLeaf, PixelCheck, PixelVote, PixelClipboard, PixelHandshake } from '../data/pixelIcons.js';

/**
 * Render markup for a single calendar day cell
 *
 * @param {Object} options
 * @param {string} options.dateISO - YYYY-MM-DD
 * @param {number} options.dayNumber - 1..31
 * @param {boolean} options.isCurrentMonth - whether belongs to current month
 * @param {boolean} options.isToday - whether date is today
 * @param {boolean} options.isDisabled - whether date is disabled (past or beyond window)
 * @param {string} [options.status='free'] - 'free' | 'pending' | 'booked' | 'maintenance' | 'shared' | 'collision' | 'doppelnutzung'
 * @param {string} [options.maintSlot='full'] - 'full' | 'morning' | 'afternoon'
 * @param {Object} [options.reservation] - reservation or maintenance info { userName, userAvatar, reason, etc. }
 * @param {boolean} [options.isSelectedStart=false]
 * @param {boolean} [options.isSelectedEnd=false]
 * @param {boolean} [options.isInRange=false]
 * @param {boolean} [options.hasHandoverNotes=false]
 * @returns {string} HTML string for the day cell
 */
export function renderDayCell({
  dateISO,
  dayNumber,
  isCurrentMonth = true,
  isToday = false,
  isDisabled = false,
  status = 'free',
  bookingSlot = null,
  maintSlot = 'full',
  reservation = null,
  workingDay = null,
  checkoutInfo = null,
  checkinInfo = null,
  hasHandoverNotes = false,
  collidingReservations = null,
  isSelectedStart = false,
  isSelectedEnd = false,
  isInRange = false,
  isDefaultCheckout = false
}) {
  if (!isCurrentMonth) {
    return `
      <div class="day-cell day-cell--outside" data-date="${dateISO}" aria-hidden="true">
      </div>
    `;
  }

  const classes = ['day-cell'];

  if (isDisabled) classes.push('day-cell--disabled');
  if (isToday) classes.push('day-cell--today');
  if (isSelectedStart) classes.push('day-cell--selected-start');
  if (isSelectedEnd) classes.push('day-cell--selected-end');
  if (isInRange) classes.push('day-cell--in-range');
  if (isDefaultCheckout) classes.push('day-cell--selected-default-checkout');

  const wdObj = workingDay || (status === 'working_day' ? reservation : null);

  if (status === 'working_day') {
    classes.push('day-cell--working-day');
    if (wdObj?.season === 'autumn') {
      classes.push('day-cell--working-day-autumn');
    } else {
      classes.push('day-cell--working-day-spring');
    }
  } else if (status === 'working_day_proposal') {
    classes.push('day-cell--working-day-proposal');
    if (wdObj?.season === 'autumn') {
      classes.push('day-cell--working-day-autumn');
    } else {
      classes.push('day-cell--working-day-spring');
    }
  } else if (status === 'booked' || status === 'pending' || status === 'conflict') {
    if (bookingSlot === 'checkin') {
      classes.push('day-cell--checkin', `day-cell--checkin-${status}`);
    } else if (bookingSlot === 'checkout') {
      classes.push('day-cell--checkout', `day-cell--checkout-${status}`);
    } else {
      // Full day block
      classes.push(`day-cell--${status}`);
    }
  } else if (status === 'shared') {
    classes.push('day-cell--shared');
    if (checkoutInfo?.status === 'booked') {
      classes.push('day-cell--shared-checkout-booked');
    } else {
      classes.push('day-cell--shared-checkout-pending');
    }
    if (checkinInfo?.status === 'booked') {
      classes.push('day-cell--shared-checkin-booked');
    } else {
      classes.push('day-cell--shared-checkin-pending');
    }
  } else if (status === 'collision') {
    classes.push('day-cell--collision');
  } else if (status === 'doppelnutzung') {
    classes.push('day-cell--doppelnutzung');
  } else if (status === 'maintenance') {
    if (maintSlot === 'morning') {
      classes.push('day-cell--maint-morning');
    } else if (maintSlot === 'afternoon') {
      classes.push('day-cell--maint-afternoon');
    } else {
      classes.push('day-cell--maint-full');
    }
  }

  // Accessibility label
  let ariaStatus = 'Frei';
  if (status === 'working_day') {
    ariaStatus = `Arbeitstag: ${wdObj?.season === 'autumn' ? 'Einwintern' : 'Frühjahrsputz'}`;
  } else if (status === 'working_day_proposal') {
    ariaStatus = `Terminvorschlag Arbeitstag: ${wdObj?.season === 'autumn' ? 'Einwintern' : 'Frühjahrsputz'} (Abstimmung)`;
  } else if (status === 'shared') {
    ariaStatus = `Wechseltag: Abreise ${checkoutInfo?.userName || 'Gast'}, Anreise ${checkinInfo?.userName || 'Gast'}`;
  } else if (status === 'collision') {
    const collNames = (collidingReservations || []).map(r => r.userName).filter(Boolean).join(' und ') || 'Gäste';
    ariaStatus = `Tag ${dayNumber}. Achtung: Doppelbuchung! 2 kollidierende Buchungen von ${collNames}`;
  } else if (status === 'doppelnutzung') {
    const doppelNames = (collidingReservations || []).map(r => r.userName || (r.isMaintenance ? 'Unterhalt' : 'Gast')).filter(Boolean).join(' und ') || 'Familie';
    ariaStatus = `Tag ${dayNumber}. Doppelnutzung: Gemeinsamer Aufenthalt von ${doppelNames}`;
  } else if (status === 'booked') {
    if (bookingSlot === 'checkin') ariaStatus = `Anreise ab 14:00 (${reservation?.userName || 'Familie'})`;
    else if (bookingSlot === 'checkout') ariaStatus = `Abreise bis 11:00 (${reservation?.userName || 'Familie'})`;
    else ariaStatus = `Gebucht (${reservation?.userName || 'Familie'})`;
  } else if (status === 'pending') {
    if (bookingSlot === 'checkin') ariaStatus = `Anfrage Anreise (${reservation?.userName || 'Familie'})`;
    else if (bookingSlot === 'checkout') ariaStatus = `Anfrage Abreise (${reservation?.userName || 'Familie'})`;
    else ariaStatus = `Ausstehend (${reservation?.userName || 'Familie'})`;
  } else if (status === 'conflict') {
    ariaStatus = `Konflikt (${reservation?.userName || 'Familie'})`;
  } else if (status === 'maintenance') {
    ariaStatus = `Unterhalt (${reservation?.reason || 'Chalet'})`;
  }
  if (isDisabled) ariaStatus = 'Nicht verfügbar';

  // Sub-badge (Avatar or status symbol)
  let badgeHtml = '';
  if (status === 'shared') {
    const outInit = (checkoutInfo?.userName || 'A').charAt(0).toUpperCase();
    const inInit = (checkinInfo?.userName || 'B').charAt(0).toUpperCase();
    badgeHtml = `
      <div class="day-cell__shared-avatars">
        <span class="day-cell__initial day-cell__initial--out" title="Abreise: ${escapeAttr(checkoutInfo?.userName)}">${outInit}</span>
        <span class="day-cell__initial-sep">/</span>
        <span class="day-cell__initial day-cell__initial--in" title="Anreise: ${escapeAttr(checkinInfo?.userName)}">${inInit}</span>
      </div>
    `;
  } else if (status === 'collision') {
    const collList = Array.isArray(collidingReservations) && collidingReservations.length > 0 ? collidingReservations : [reservation || {}];
    const r1 = collList[0] || {};
    const r2 = collList[1] || {};
    const init1 = (r1.userName || 'A').charAt(0).toUpperCase();
    const init2 = (r2.userName || 'B').charAt(0).toUpperCase();
    badgeHtml = `
      <div class="day-cell__collision-wrapper">
        <div class="day-cell__collision-avatars">
          <span class="day-cell__initial day-cell__initial--collision" title="${escapeAttr(r1.userName)}">${init1}</span>
          <span class="day-cell__initial day-cell__initial--collision" title="${escapeAttr(r2.userName)}">${init2}</span>
        </div>
        <div class="day-cell__collision-badge" title="Doppelbuchung! 2 kollidierende Reservationen">
          <span class="day-cell__collision-icon">⚠️</span>
          <span class="day-cell__collision-text">2x</span>
        </div>
      </div>
    `;
  } else if (status === 'doppelnutzung') {
    const list = Array.isArray(collidingReservations) && collidingReservations.length > 0
      ? collidingReservations
      : [checkoutInfo || reservation || {}, checkinInfo || {}];
    const names = list.map(r => r.userName || (r.isMaintenance ? 'Unterhalt' : 'Gast')).filter(Boolean).join(' und ') || 'Familie';
    const r1 = list[0] || {};
    const r2 = list[1] || {};
    const init1 = (r1.userName || (r1.isMaintenance ? 'W' : 'A')).charAt(0).toUpperCase();
    const init2 = (r2.userName || (r2.isMaintenance ? 'W' : 'B')).charAt(0).toUpperCase();
    badgeHtml = `
      <div class="day-cell__doppelnutzung-badge" title="Doppelnutzung: ${escapeAttr(names)}">
        <span class="day-cell__initial day-cell__initial--doppel">${init1}</span>
        <span class="day-cell__handshake-icon">🤝</span>
        <span class="day-cell__initial day-cell__initial--doppel">${init2}</span>
      </div>
    `;
  } else if (status === 'booked' || status === 'pending') {
    if (bookingSlot === 'checkout' && maintSlot === 'afternoon') {
      const outInit = reservation?.userName ? reservation.userName.charAt(0).toUpperCase() : 'A';
      badgeHtml = `
        <div class="day-cell__shared-avatars">
          <span class="day-cell__initial day-cell__initial--out" title="Abreise: ${escapeAttr(reservation?.userName)}">${outInit}</span>
          <span class="day-cell__initial-sep">/</span>
          <span class="day-cell__maint-mini-badge" title="Unterhalt Nachmittag">${PixelWrench}</span>
        </div>
      `;
    } else if (bookingSlot === 'checkin' && maintSlot === 'morning') {
      const inInit = reservation?.userName ? reservation.userName.charAt(0).toUpperCase() : 'B';
      badgeHtml = `
        <div class="day-cell__shared-avatars">
          <span class="day-cell__maint-mini-badge" title="Unterhalt Vormittag">${PixelWrench}</span>
          <span class="day-cell__initial-sep">/</span>
          <span class="day-cell__initial day-cell__initial--in" title="Anreise: ${escapeAttr(reservation?.userName)}">${inInit}</span>
        </div>
      `;
    } else if (reservation?.userName) {
      const initial = reservation.userName.charAt(0).toUpperCase();
      let slotClass = '';
      if (bookingSlot === 'checkin') slotClass = 'day-cell__avatar--checkin';
      if (bookingSlot === 'checkout') slotClass = 'day-cell__avatar--checkout';
      badgeHtml = `
        <div class="day-cell__avatar ${slotClass}" title="${escapeAttr(reservation.userName)}">
          <span style="font-weight: 800; font-size: 0.8rem;">${initial}</span>
        </div>
      `;
    } else {
      badgeHtml = `<span class="day-cell__dot"></span>`;
    }
  } else if (status === 'working_day') {
    const isSpring = wdObj?.season !== 'autumn';
    const iconSvg = isSpring ? PixelBroom : PixelLeaf;
    const titleText = isSpring ? 'Frühjahrsputz' : 'Einwintern';
    const rsvps = wdObj?.rsvps || [];
    const yesCount = rsvps.filter(r => r.status === 'yes').length;
    badgeHtml = `
      <div class="day-cell__working-badge" title="Arbeitstag: ${titleText} (${yesCount} Zusage${yesCount === 1 ? '' : 'n'})">
        <span class="day-cell__working-icon-box">${iconSvg}</span>
        <span class="day-cell__working-count" style="display: inline-flex; align-items: center; gap: 2px;">${yesCount}<span style="font-size: 0.85em; display: inline-flex;">${PixelCheck}</span></span>
      </div>
    `;
  } else if (status === 'working_day_proposal') {
    const isSpring = wdObj?.season !== 'autumn';
    const iconSvg = isSpring ? PixelBroom : PixelLeaf;
    const titleText = isSpring ? 'Frühjahrsputz' : 'Einwintern';
    const rsvps = wdObj?.rsvps || [];
    const yesCount = rsvps.filter(r => r.votes && (r.votes[dateISO] === 'yes' || r.votes[dateISO] === 'maybe')).length;
    badgeHtml = `
      <div class="day-cell__working-badge day-cell__working-badge--proposal" title="Terminvorschlag ${titleText} (${yesCount} Stimme${yesCount === 1 ? '' : 'n'})">
        <span class="day-cell__working-icon-box">${iconSvg}</span>
        <span class="day-cell__working-count" style="display: inline-flex; align-items: center; gap: 2px;">${yesCount}<span style="font-size: 0.85em; display: inline-flex;">${PixelVote}</span></span>
      </div>
    `;
  } else if (status === 'maintenance') {
    badgeHtml = `<div class="day-cell__maint-icon" title="${escapeAttr(reservation?.reason || 'Unterhalt')}">${PixelWrench}</div>`;
  } else if (status === 'conflict') {
    badgeHtml = `<div class="day-cell__conflict-icon">!</div>`;
  }

  // Split-cell overlays for half-day states
  let splitOverlayHtml = '';
  if (status === 'shared') {
    const outStatus = checkoutInfo?.status === 'pending' ? 'pending' : (checkoutInfo?.status === 'conflict' || checkoutInfo?.status === 'vetoed' ? 'conflict' : 'booked');
    const inStatus = checkinInfo?.status === 'pending' ? 'pending' : (checkinInfo?.status === 'conflict' || checkinInfo?.status === 'vetoed' ? 'conflict' : 'booked');
    splitOverlayHtml = `
      <div class="day-cell__split-booking day-cell__split-booking--${outStatus} day-cell__split--left"></div>
      <div class="day-cell__split-booking day-cell__split-booking--${inStatus} day-cell__split--right"></div>
    `;
  } else if (bookingSlot === 'checkin') {
    const splitStatus = (status === 'conflict' || status === 'vetoed') ? 'conflict' : status;
    splitOverlayHtml = `
      <div class="day-cell__split-booking day-cell__split-booking--${splitStatus} day-cell__split--right"></div>
    `;
    if (maintSlot === 'morning') {
      splitOverlayHtml += `<div class="day-cell__split-maint day-cell__split--left" title="Unterhalt Vormittag"></div>`;
    } else if (isSelectedEnd || isDefaultCheckout) {
      splitOverlayHtml += `<div class="day-cell__split-booking day-cell__split-booking--selected-end day-cell__split--left"></div>`;
    }
  } else if (bookingSlot === 'checkout') {
    const splitStatus = (status === 'conflict' || status === 'vetoed') ? 'conflict' : status;
    splitOverlayHtml = `
      <div class="day-cell__split-booking day-cell__split-booking--${splitStatus} day-cell__split--left"></div>
    `;
    if (maintSlot === 'afternoon') {
      splitOverlayHtml += `<div class="day-cell__split-maint day-cell__split--right" title="Unterhalt Nachmittag"></div>`;
    } else if (isSelectedStart) {
      splitOverlayHtml += `<div class="day-cell__split-booking day-cell__split-booking--selected-start day-cell__split--right"></div>`;
    }
  } else if (status === 'maintenance' && maintSlot === 'morning') {
    splitOverlayHtml = `
      <div class="day-cell__split-maint day-cell__split--left"></div>
    `;
    if (isSelectedStart) {
      splitOverlayHtml += `<div class="day-cell__split-booking day-cell__split-booking--selected-start day-cell__split--right"></div>`;
    }
  } else if (status === 'maintenance' && maintSlot === 'afternoon') {
    splitOverlayHtml = `
      <div class="day-cell__split-maint day-cell__split--right"></div>
    `;
    if (isSelectedEnd || isDefaultCheckout) {
      splitOverlayHtml += `<div class="day-cell__split-booking day-cell__split-booking--selected-end day-cell__split--left"></div>`;
    }
  }

  return `
    <div class="${classes.join(' ')}"
         data-date="${dateISO}"
         data-status="${status}"
         data-booking-slot="${bookingSlot || ''}"
         data-maint-slot="${maintSlot || ''}"
         data-disabled="${isDisabled}"
         tabindex="${isDisabled ? '-1' : '0'}"
         role="gridcell"
         aria-label="${dayNumber}. ${ariaStatus}">
      ${splitOverlayHtml}
      <div class="day-cell__header">
        <span class="day-cell__num">${dayNumber}</span>
        <div style="display: flex; align-items: center; gap: 3px;">
          ${hasHandoverNotes ? `<span class="day-cell__handover-badge" title="Übergabe-Notiz vorhanden">${PixelClipboard}</span>` : ''}
          ${isToday ? '<span class="day-cell__today-tag">HEUTE</span>' : ''}
        </div>
      </div>
      <div class="day-cell__body">
        ${badgeHtml}
      </div>
    </div>
  `;
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;');
}
