/**
 * ChaletWeShare — Day Detail Bottom Sheet
 */

import { formatDateFriendly, getVetoCountdown } from '../utils/dateUtils.js';
import { renderAvatarMarkup } from '../data/avatars.js';
import { reservationStore } from '../engine/reservationStore.js';
import { reservationEngine } from '../engine/reservationEngine.js';
import { profileManager } from '../engine/profileManager.js';
import { openConflictModal } from './conflictModal.js';
import { handoverService } from '../engine/handoverService.js';
import { openHandoverModal } from './handoverModal.js';
import { playConfettiCelebration } from './confettiAnimation.js';
import { playThunderstormAnimation } from './sillyAnimations.js';
import { PixelClipboard, PixelClock, PixelWrench, PixelWarning, PixelCheck, PixelBroom, PixelLeaf, PixelCalendar, PixelHourglass, PixelCancel, PixelChat, PixelEdit, PixelVote } from '../data/pixelIcons.js';
import { escapeHtml } from '../utils/htmlUtils.js';
import { exportWorkingDayToCalendar, exportReservationToCalendar } from '../utils/icsUtils.js';
import { showInlineError } from '../utils/errorUtils.js';
import { confirmDialog } from './confirmDialog.js';
import { openMicroChat } from './microChat.js';

export async function openDayDetailSheet({ container, dateISO, user, onSelectAsStart, onUpdated, onClose }) {
  const dayData = reservationStore.getDayStatus(dateISO);
  const info = dayData.info || {};
  const friendlyDate = formatDateFriendly(dateISO);

  const isOwnReservation = info.userId == user.id || info.userName === user.name;

  // Fetch handover notes if reservation exists
  let handoverNotes = [];
  if (info.id) {
    handoverNotes = await handoverService.getNotesForReservation(info.id);
  }

  container.style.display = 'flex';

  let headerTag = 'Freier Tag';
  let tagColor = 'var(--color-text-muted)';
  let title = 'Chalet ist frei';
  let bodyHtml = '';
  let actionsHtml = '';

  const renderHandoverSection = () => {
    if (!handoverNotes || handoverNotes.length === 0) return '';
    return `
      <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
        <div style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-accent); display: flex; align-items: center; gap: 6px;">
          <span>${PixelClipboard}</span>
          <span>Übergabe-Notizen (${handoverNotes.length})</span>
        </div>
        ${handoverNotes.map(n => {
          const catLabels = { garbage: 'Kehricht', missing: 'Fehlendes', broken: 'Defekt', custom: 'Notiz' };
          const badge = catLabels[n.category] || 'Notiz';
          const isAuthor = user && (n.author_user_id == user.id || n.author_name === user.name);
          return `
            <div class="card" style="padding: 10px 12px; border: var(--border); background: var(--color-surface); box-shadow: var(--shadow-brutal-sm); position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  ${renderAvatarMarkup(n.author_avatar || 'swan', 24)}
                  <span style="font-weight: 800; font-size: 0.85rem;">${escapeHtml(n.author_name || 'Gast')}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 0.68rem; font-weight: 800; background: var(--color-accent); color: #fff; padding: 2px 6px; text-transform: uppercase;">
                    ${badge}
                  </span>
                  ${isAuthor ? `
                    <button type="button" class="btn btn--icon btn--sm btn-edit-handover" data-note-id="${n.id}" title="Notiz bearbeiten" aria-label="Notiz bearbeiten" style="padding: 2px 6px; height: 24px; min-height: 24px; width: 24px; border: var(--border); background: var(--color-surface); box-shadow: none; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                      ${PixelEdit}
                    </button>
                  ` : ''}
                </div>
              </div>
              <p style="font-size: 0.85rem; font-weight: 600; line-height: 1.35; color: var(--color-text); margin: 0;">
                ${escapeHtml(n.message)}
              </p>
            </div>
          `;
        }).join('')}
      </div>
    `;
  };

  if (dayData.status === 'shared') {
    const outRes = dayData.checkoutInfo || {};
    const inRes = dayData.checkinInfo || {};
    headerTag = 'Wechseltag';
    tagColor = 'var(--color-accent)';
    title = 'Wechseltag im Chalet';

    const isOwnOut = outRes.userId == user.id || outRes.userName === user.name;
    const isOwnIn = inRes.userId == user.id || inRes.userName === user.name;

    bodyHtml = `
      <div style="display: flex; flex-direction: column; gap: 10px; margin: 12px 0;">
        <div class="card" style="padding: 10px; border: var(--border); background: var(--color-surface);">
          <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 6px;">
            Vormittag
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            ${renderAvatarMarkup(outRes.userAvatar, 36)}
            <div>
              <div style="font-weight: 700; font-size: 0.95rem;">${escapeHtml(outRes.userName)}</div>
              <div style="font-size: 0.8rem; color: var(--color-text-muted);">
                ${formatDateFriendly(outRes.dateStart)} – ${formatDateFriendly(outRes.dateEnd)}
                (${outRes.status === 'booked' ? 'Gebucht' : 'Ausstehend'})
              </div>
            </div>
          </div>
          ${isOwnOut ? `
            <button class="btn btn--sm btn--danger btn-cancel-res" data-id="${outRes.id}" style="margin-top: 8px; width: 100%;">
              Meine Abreise stornieren
            </button>
          ` : ''}
        </div>

        <div class="card" style="padding: 10px; border: var(--border); background: var(--color-surface);">
          <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--color-accent); margin-bottom: 6px;">
            Nachmittag
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            ${renderAvatarMarkup(inRes.userAvatar, 36)}
            <div>
              <div style="font-weight: 700; font-size: 0.95rem;">${escapeHtml(inRes.userName)}</div>
              <div style="font-size: 0.8rem; color: var(--color-text-muted);">
                ${formatDateFriendly(inRes.dateStart)} – ${formatDateFriendly(inRes.dateEnd)}
                (${inRes.status === 'booked' ? 'Gebucht' : 'Ausstehend'})
              </div>
            </div>
          </div>
          ${isOwnIn ? `
            <button class="btn btn--sm btn--danger btn-cancel-res" data-id="${inRes.id}" style="margin-top: 8px; width: 100%;">
              Meine Anreise stornieren
            </button>
          ` : ''}
        </div>
      </div>
      ${renderHandoverSection()}
    `;

    actionsHtml = `
      <button id="day-sheet-btn-handover" class="btn btn--block btn--black" style="margin-top: 8px;">
        ${PixelClipboard} Notiz an nächsten Gast hinterlassen
      </button>
    `;
  } else if (dayData.status === 'booked') {
    const isCheckout = dayData.bookingSlot === 'checkout';
    const isCheckin = dayData.bookingSlot === 'checkin';
    headerTag = isCheckout ? 'Abreisetag' : (isCheckin ? 'Anreisetag' : 'Bestätigte Reservation');
    tagColor = 'var(--color-booked)';
    title = isCheckout
      ? `Abreise von ${escapeHtml(info.userName || 'Familie')}`
      : (isCheckin ? `Anreise von ${escapeHtml(info.userName || 'Familie')}` : `Gebucht von ${escapeHtml(info.userName || 'Familie')}`);

    const slotNote = isCheckout
      ? `<div class="card" style="background: #F0FFF4; border-color: #008000; font-size: 0.85rem; margin-top: 8px;">
           <strong>Abreisetag:</strong> Vormittags belegt, <strong>Nachmittag frei</strong> für Check-in!
         </div>`
      : (isCheckin
        ? `<div class="card" style="background: var(--color-surface); border: var(--border); font-size: 0.85rem; margin-top: 8px;">
             <strong>Anreisetag:</strong> Check-in ab Nachmittag.
           </div>`
        : `<div class="card" style="background: var(--color-surface); border: var(--border); font-size: 0.85rem; margin-top: 8px;">
             Feste Buchung im Chalet Alpenrose.
           </div>`);

    bodyHtml = `
      <div style="display: flex; align-items: center; gap: 12px; margin: 12px 0;">
        ${renderAvatarMarkup(info.userAvatar, 44)}
        <div>
          <div style="font-weight: 700; font-size: 1.05rem;">${escapeHtml(info.userName)}</div>
          <div style="font-size: 0.85rem; color: var(--color-text-muted);">
            ${formatDateFriendly(info.dateStart)} – ${formatDateFriendly(info.dateEnd)}
          </div>
        </div>
      </div>
      ${slotNote}
      ${renderHandoverSection()}
    `;

    actionsHtml = `
      ${isCheckout ? `
        <button id="day-sheet-btn-select" class="btn btn--block btn--primary" style="margin-top: 8px;">
          Diesen Tag auswählen (Nachmittag)
        </button>
      ` : ''}
      <button id="day-sheet-btn-export-ics" class="btn btn--block btn--outline" style="margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
        ${PixelCalendar} In Kalender eintragen (.ics)
      </button>
      <button id="day-sheet-btn-handover" class="btn btn--block btn--black" style="margin-top: 8px;">
        ${PixelClipboard} Notiz an nächsten Gast hinterlassen
      </button>
      ${isOwnReservation ? `
        <button id="day-sheet-btn-cancel" class="btn btn--block btn--danger" style="margin-top: 8px;">
          Reservation stornieren
        </button>
      ` : ''}
    `;
  } else if (dayData.status === 'pending') {
    const isCheckout = dayData.bookingSlot === 'checkout';
    const isCheckin = dayData.bookingSlot === 'checkin';
    headerTag = isCheckout ? 'Abreisetag (Ausstehend)' : (isCheckin ? 'Anreisetag (Ausstehend)' : 'Ausstehende Anfrage');
    tagColor = 'var(--color-accent)';
    title = isCheckout
      ? `Abreise von ${escapeHtml(info.userName || 'Familie')}`
      : (isCheckin ? `Anreise von ${escapeHtml(info.userName || 'Familie')}` : `Anfrage von ${escapeHtml(info.userName || 'Familie')}`);

    const slotNote = isCheckout
      ? `<div class="card" style="background: #F0FFF4; border-color: #008000; font-size: 0.85rem; margin-top: 8px;">
           <strong>Abreisetag:</strong> Nach Veto-Frist Nachmittag frei!
         </div>`
      : '';

    const approvals = info.approvals || [];
    const hasUserApproved = approvals.some((a) => (a.user_id || a.userId) == user.id);
    const requiredApprovals = (reservationStore.userCount || 4) - 1;

    // Build Sibling Approval Roster
    const familyProfiles = profileManager.getProfiles();
    const effectiveProfiles = familyProfiles.length > 0 ? familyProfiles : [
      { id: 1, name: 'Elena', avatar: 'swan' },
      { id: 2, name: 'Lucas', avatar: 'fox' },
      { id: 3, name: 'Sophie', avatar: 'bear' },
      { id: 4, name: 'Nico', avatar: 'ibex' }
    ];

    const rosterItems = effectiveProfiles.map((p) => {
      const isRequester = (p.id && p.id == info.userId) || (p.profile_id && p.profile_id == info.userId) || (p.name === info.userName);
      const hasApproved = approvals.some((a) => (a.user_id && a.user_id == p.id) || (a.userId && a.userId == p.id) || (a.user_name === p.name) || (a.userName === p.name));

      let badgeHtml = '';
      if (isRequester) {
        badgeHtml = `<span style="font-size: 0.68rem; font-weight: 800; background: var(--color-bg); border: var(--border); padding: 2px 6px; color: var(--color-text);">Anfragesteller</span>`;
      } else if (hasApproved) {
        badgeHtml = `<span style="font-size: 0.68rem; font-weight: 800; background: #E8F5E9; border: 1.5px solid #2ECC71; padding: 2px 6px; color: #2E7D32; display: inline-flex; align-items: center; gap: 4px;">${PixelCheck} Genehmigt</span>`;
      } else {
        badgeHtml = `<span style="font-size: 0.68rem; font-weight: 800; background: #FFFDE7; border: 1.5px solid #FBC02D; padding: 2px 6px; color: #F57F17; display: inline-flex; align-items: center; gap: 4px;">${PixelHourglass} Ausstehend</span>`;
      }

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border: var(--border); background: var(--color-surface); box-shadow: var(--shadow-brutal-sm);">
          <div style="display: flex; align-items: center; gap: 8px;">
            ${renderAvatarMarkup(p.avatar, 26)}
            <span style="font-weight: 800; font-size: 0.85rem;">${escapeHtml(p.name)}</span>
          </div>
          ${badgeHtml}
        </div>
      `;
    }).join('');

    const cd = getVetoCountdown(info.vetoDeadline);

    bodyHtml = `
      <div style="display: flex; align-items: center; gap: 12px; margin: 12px 0;">
        ${renderAvatarMarkup(info.userAvatar, 44)}
        <div>
          <div style="font-weight: 700; font-size: 1.05rem;">${escapeHtml(info.userName)}</div>
          <div style="font-size: 0.85rem; color: var(--color-text-muted);">
            ${formatDateFriendly(info.dateStart)} – ${formatDateFriendly(info.dateEnd)}
          </div>
        </div>
      </div>

      <!-- Live Countdown Card -->
      <div class="card" style="background: #FFF9E6; border: var(--border-thick); border-left: 6px solid var(--color-accent); padding: 12px; margin-top: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--color-accent); display: flex; align-items: center; gap: 4px;">
            ${PixelClock} Veto-Frist aktiv
          </span>
          <span style="font-size: 0.72rem; font-family: var(--font-mono); font-weight: 800; color: var(--color-text-muted);">
            ${cd.cutoffFormatted ? `Cutoff: ${cd.cutoffFormatted}` : 'Zurich 20:15'}
          </span>
        </div>
        <div id="live-veto-countdown-box" style="font-size: 1.15rem; font-weight: 900; font-family: var(--font-mono); color: var(--color-accent); margin: 6px 0; display: flex; align-items: center; gap: 6px;">
          ${cd.expired ? `${PixelCheck} Veto-Frist abgelaufen` : `${PixelHourglass} ${cd.text}`}
        </div>
        <div style="font-size: 0.75rem; color: var(--color-text-muted); line-height: 1.35;">
          ${cd.expired ? 'Die Buchung wird automatisch bestätigt.' : 'Erhebt bis zum Ablauf niemand Einspruch, gilt die Buchung als bestätigt.'}
        </div>
      </div>

      <!-- Sibling Roster Card -->
      <div class="card" style="padding: 10px 12px; margin-top: 10px; border: var(--border); background: var(--color-surface);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted);">
            Rückmeldungen der Familie
          </span>
          <span style="font-size: 0.75rem; font-weight: 800; color: ${approvals.length >= requiredApprovals ? '#2E7D32' : 'var(--color-accent)'};">
            ${approvals.length} / ${requiredApprovals} Zustimmungen
          </span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${rosterItems}
        </div>
      </div>
      ${slotNote}
    `;

    if (isOwnReservation) {
      actionsHtml = `
        <button id="day-sheet-btn-cancel" class="btn btn--block btn--danger" style="margin-top: 8px;">
          Anfrage zurückziehen
        </button>
      `;
    } else {
      actionsHtml = `
        ${isCheckout ? `
          <button id="day-sheet-btn-select" class="btn btn--block btn--primary" style="margin-top: 8px;">
            Diesen Tag auswählen (Nachmittag)
          </button>
        ` : ''}
        ${!hasUserApproved ? `
          <button id="day-sheet-btn-approve" class="btn btn--block btn--primary" style="margin-top: 8px; background: #008000; border-color: #008000;">
            ${PixelCheck} Anfrage genehmigen (OK)
          </button>
        ` : `
          <div class="card" style="background: #F0FFF4; border-color: #008000; color: #008000; font-weight: 800; font-size: 0.85rem; text-align: center; margin-top: 8px;">
            ${PixelCheck} Du hast dieser Anfrage bereits zugestimmt!
          </div>
        `}
        <button id="day-sheet-btn-veto" class="btn btn--block" style="margin-top: 8px;">
          Veto einlegen / Konflikt
        </button>
      `;
    }
  } else if (dayData.status === 'conflict') {
    headerTag = 'Konflikt / Veto';
    tagColor = 'var(--color-danger)';
    title = `Konflikt: ${escapeHtml(info.userName || 'Familie')}`;

    bodyHtml = `
      <div style="display: flex; align-items: center; gap: 12px; margin: 12px 0;">
        ${renderAvatarMarkup(info.userAvatar, 44)}
        <div>
          <div style="font-weight: 700; font-size: 1.05rem;">${escapeHtml(info.userName)}</div>
          <div style="font-size: 0.85rem; color: var(--color-text-muted);">
            ${formatDateFriendly(info.dateStart)} – ${formatDateFriendly(info.dateEnd)}
          </div>
        </div>
      </div>
      <div class="card" style="background: #FFF0F5; border-color: var(--color-danger); font-size: 0.85rem;">
        <strong style="color: var(--color-danger);">Veto eingelegt!</strong> Diese Reservation blockiert eine andere. Bitte klärt die Doppelnutzung.
      </div>
    `;

    actionsHtml = `
      <button id="day-sheet-btn-resolve-conflict" class="btn btn--block btn--danger" style="margin-top: 8px;">
        Konflikt lösen
      </button>
    `;
  } else if (dayData.status === 'working_day' || dayData.status === 'working_day_proposal') {
    const wd = dayData.workingDay || info;
    const isSpring = wd.season !== 'autumn';
    const seasonLabel = isSpring ? 'Frühjahrsputz' : 'Einwintern';
    const seasonDesc = isSpring ? 'Saisoneröffnung: Chalet putzen & herrichten' : 'Saisonabschluss: Wasser abstellen & winterfest machen';
    const iconSvg = isSpring ? PixelBroom : PixelLeaf;
    const isProposal = dayData.status === 'working_day_proposal' || wd.status === 'proposed';
    const isWdCreator = Number(user.id) === Number(wd.userId || wd.user_id);
    const allProfiles = profileManager.getProfiles() || [];

    if (isProposal) {
      headerTag = `<span style="display: inline-flex; align-items: center; gap: 6px;">${PixelVote} Terminvorschlag: ${seasonLabel}</span>`;
      tagColor = '#B45309';
      title = `Terminfindung: ${seasonLabel}`;

      const proposedDates = (Array.isArray(wd.proposed_dates) && wd.proposed_dates.length > 0)
        ? [...wd.proposed_dates]
        : (Array.isArray(wd.proposedDates) && wd.proposedDates.length > 0 ? [...wd.proposedDates] : [dateISO]);
      proposedDates.sort();

      const rsvps = wd.rsvps || [];
      const userRsvp = rsvps.find(r => (r.user_id == user.id || r.userId == user.id));
      const userVotes = userRsvp?.votes || {};

      // Determine leading date
      let maxYesCount = -1;
      let leadingDate = null;
      proposedDates.forEach(pDate => {
        const yesC = rsvps.filter(r => r.votes?.[pDate] === 'yes').length;
        if (yesC > maxYesCount) {
          maxYesCount = yesC;
          leadingDate = pDate;
        }
      });

      const totalProfiles = allProfiles.length || 4;
      const votedProfilesCount = rsvps.filter(r => r.votes && Object.keys(r.votes).length > 0).length;

      bodyHtml = `
        <div style="margin: 12px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <p style="font-size: 0.86rem; color: var(--color-text-muted); line-height: 1.35; margin: 0;">
              Von <strong>${escapeHtml(wd.userName || wd.user_name || 'Familie')}</strong> zur Abstimmung vorgeschlagen.
            </p>
            <span style="font-size: 0.72rem; font-weight: 800; background: #FEF3C7; border: 1px solid #D97706; padding: 2px 6px; color: #B45309; text-transform: uppercase;">
              ${votedProfilesCount} / ${totalProfiles} haben abgestimmt
            </span>
          </div>

          <!-- Proposed Dates Cards -->
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
            ${proposedDates.map((pDate, idx) => {
              const friendlyPDate = formatDateFriendly(pDate);
              const isLead = (pDate === leadingDate && maxYesCount > 0);
              const isTapped = (pDate === dateISO);
              const curVote = userVotes[pDate] || null;

              const yesC = rsvps.filter(r => r.votes?.[pDate] === 'yes').length;
              const maybeC = rsvps.filter(r => r.votes?.[pDate] === 'maybe').length;
              const noC = rsvps.filter(r => r.votes?.[pDate] === 'no').length;

              return `
                <div class="wd-vote-card ${isLead ? 'wd-vote-card--leader' : ''}" style="${isTapped ? 'outline: 2px solid #1A1A1A; outline-offset: 1px;' : ''}">
                  <div class="wd-vote-card__header">
                    <div>
                      <span style="font-size: 0.68rem; font-weight: 800; text-transform: uppercase; color: var(--color-accent); display: flex; align-items: center; gap: 4px;">
                        OPTION ${idx + 1} ${isLead ? '• 🏆 FAVORIT' : ''} ${isTapped ? '• (DIESER TAG)' : ''}
                      </span>
                      <div class="wd-vote-card__date">${friendlyPDate}</div>
                    </div>
                    <div style="display: flex; gap: 4px; font-size: 0.72rem; font-weight: 800;">
                      <span style="background: #2ECC71; color: #fff; padding: 2px 6px; border: 1px solid #1A1A1A;">${yesC} ✓</span>
                      ${maybeC > 0 ? `<span style="background: #F59E0B; color: #fff; padding: 2px 6px; border: 1px solid #1A1A1A;">${maybeC} ~</span>` : ''}
                      ${noC > 0 ? `<span style="background: var(--color-danger); color: #fff; padding: 2px 6px; border: 1px solid #1A1A1A;">${noC} ✕</span>` : ''}
                    </div>
                  </div>

                  <!-- Mini Sibling Avatars for this date -->
                  <div style="display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; align-items: center;">
                    ${allProfiles.map(p => {
                      const r = rsvps.find(x => (x.user_id == p.id || x.userId == p.id));
                      const v = r?.votes?.[pDate] || null;
                      let badgeDot = '#9CA3AF';
                      let dotText = '?';
                      let dotColor = '#fff';
                      if (v === 'yes') { badgeDot = '#2ECC71'; dotText = '✓'; }
                      else if (v === 'maybe') { badgeDot = '#F59E0B'; dotText = '~'; }
                      else if (v === 'no') { badgeDot = 'var(--color-danger)'; dotText = '✕'; }

                      return `
                        <div style="position: relative; display: inline-flex;" title="${escapeHtml(p.name)}: ${v || 'ausstehend'}">
                          ${renderAvatarMarkup(p.avatar || 'swan', 22)}
                          <span style="position: absolute; bottom: -3px; right: -3px; width: 11px; height: 11px; border-radius: 50%; background: ${badgeDot}; color: ${dotColor}; font-size: 0.5rem; font-weight: 900; display: flex; align-items: center; justify-content: center; border: 1px solid #1A1A1A;">
                            ${dotText}
                          </span>
                        </div>
                      `;
                    }).join('')}
                  </div>

                  <!-- 3-Way Vote Buttons -->
                  <div class="wd-vote-toggle-group">
                    <button type="button" class="wd-vote-btn ${curVote === 'yes' ? 'is-active-yes' : ''}" data-date="${pDate}" data-vote="yes">
                      ${PixelCheck} Dabei
                    </button>
                    <button type="button" class="wd-vote-btn ${curVote === 'maybe' ? 'is-active-maybe' : ''}" data-date="${pDate}" data-vote="maybe">
                      ~ Eventuell
                    </button>
                    <button type="button" class="wd-vote-btn ${curVote === 'no' ? 'is-active-no' : ''}" data-date="${pDate}" data-vote="no">
                      ✕ Keine Zeit
                    </button>
                  </div>

                  <!-- Finalize Date Action (Organizer or if consensus) -->
                  ${isWdCreator ? `
                    <button type="button" class="btn btn--block btn--sm wd-finalize-btn" data-finalize-date="${pDate}" style="margin-top: 8px; background: #FFFDF0; border: 2px solid #1A1A1A; font-weight: 800; color: #000; box-shadow: 1px 1px 0px #1A1A1A;">
                      🎯 Diesen Termin festlegen
                    </button>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      actionsHtml = `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
          ${isWdCreator ? `
            <button id="day-sheet-btn-del-working-day" class="btn btn--block btn--danger btn--sm" style="margin-top: 4px;">
              Terminvorschlag aufheben
            </button>
          ` : ''}
        </div>
      `;
    } else {
      // Finalized Working Day
      headerTag = `<span style="display: inline-flex; align-items: center; gap: 6px;">${iconSvg} Arbeitstag ${seasonLabel}</span>`;
      tagColor = '#000000';
      title = `Arbeitstag: ${seasonLabel}`;

      const rsvps = wd.rsvps || [];
      const userRsvp = rsvps.find(r => (r.user_id == user.id || r.userId == user.id));
      const userStatus = userRsvp ? userRsvp.status : null; // 'yes', 'no', or null

      const yesList = rsvps.filter(r => r.status === 'yes');
      const noList = rsvps.filter(r => r.status === 'no');
      const totalProfiles = allProfiles.length || (yesList.length + noList.length) || 4;
      const pctYes = Math.round((yesList.length / totalProfiles) * 100);

      bodyHtml = `
        <div style="margin: 12px 0;">
          <p style="font-size: 0.9rem; color: var(--color-text-muted); line-height: 1.4;">
            ${seasonDesc}. Angesetzt von <strong>${escapeHtml(wd.userName || wd.user_name || 'Familie')}</strong>.
          </p>

          <!-- Bauhaus Progress Bar -->
          <div style="margin: 12px 0 10px 0;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 0.75rem; font-weight: 800; text-transform: uppercase;">
              <span>TEAM (${yesList.length} / ${totalProfiles} DABEI)</span>
              <span style="color: #15803D;">${pctYes}% ZUSAGEN</span>
            </div>
            <div style="height: 10px; width: 100%; background: #E5E7EB; border: 2px solid #1A1A1A; margin-top: 4px; box-shadow: 1px 1px 0px #1A1A1A; overflow: hidden;">
              <div style="height: 100%; width: ${pctYes}%; background: #2ECC71; border-right: ${pctYes > 0 && pctYes < 100 ? '2px solid #1A1A1A' : 'none'}; transition: width 0.3s ease;"></div>
            </div>
          </div>

          <!-- Visual Family Roster with Avatars & Badges -->
          <div class="card" style="margin-top: 8px; padding: 10px 12px; border: var(--border); background: var(--color-surface); box-shadow: var(--shadow-brutal-sm);">
            <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--color-accent); margin-bottom: 8px;">
              Rückmeldungen der Geschwister
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
              ${allProfiles.map(p => {
                const r = rsvps.find(x => (x.user_id == p.id || x.userId == p.id));
                const st = r ? r.status : 'pending';
                let borderColor = '#9CA3AF';
                let badgeBg = '#E5E7EB';
                let badgeText = '?';
                let badgeColor = '#4B5563';
                let statusLabel = 'Ausstehend';
                let statusColor = 'var(--color-text-muted)';
                let opacity = '1';

                if (st === 'yes') {
                  borderColor = '#2ECC71';
                  badgeBg = '#2ECC71';
                  badgeText = '✓';
                  badgeColor = '#FFFFFF';
                  statusLabel = 'Dabei';
                  statusColor = '#15803D';
                } else if (st === 'no') {
                  borderColor = 'var(--color-danger)';
                  badgeBg = 'var(--color-danger)';
                  badgeText = '✕';
                  badgeColor = '#FFFFFF';
                  statusLabel = 'Leider nein';
                  statusColor = 'var(--color-danger)';
                  opacity = '0.6';
                }

                return `
                  <div style="display: flex; align-items: center; justify-content: space-between; background: var(--color-bg); border: 2px solid ${borderColor}; padding: 4px 6px; box-shadow: 1px 1px 0px #1A1A1A; opacity: ${opacity};">
                    <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                      <div style="position: relative; flex-shrink: 0;">
                        ${renderAvatarMarkup(p.avatar || 'swan', 22)}
                        <span style="position: absolute; bottom: -3px; right: -3px; width: 12px; height: 12px; border-radius: 50%; background: ${badgeBg}; color: ${badgeColor}; font-size: 0.52rem; font-weight: 900; display: flex; align-items: center; justify-content: center; border: 1px solid #1A1A1A;">
                          ${badgeText}
                        </span>
                      </div>
                      <span style="font-size: 0.78rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${escapeHtml(p.name)}
                      </span>
                    </div>
                    <span style="font-size: 0.68rem; font-weight: 800; color: ${statusColor}; flex-shrink: 0; margin-left: 4px;">
                      ${statusLabel}
                    </span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          ${userStatus === 'yes' ? `
            <div class="card" style="background: #F0FFF4; border-color: #008000; color: #008000; font-weight: 800; font-size: 0.85rem; text-align: center; margin-top: 10px;">
              ${PixelCheck} Du bist für diesen Arbeitstag angemeldet!
            </div>
          ` : (userStatus === 'no' ? `
            <div class="card" style="background: #FFF5F5; border-color: var(--color-danger); color: var(--color-danger); font-weight: 800; font-size: 0.85rem; text-align: center; margin-top: 10px;">
              Du hast für diesen Arbeitstag abgesagt.
            </div>
          ` : `
            <div class="card" style="background: var(--color-yellow); border: var(--border); font-size: 0.85rem; margin-top: 10px; color: #000; font-weight: 700; text-align: center; box-shadow: var(--shadow-brutal-sm);">
              Bist du am Arbeitstag dabei? Bitte gib Bescheid:
            </div>
          `)}
        </div>
      `;

      actionsHtml = `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
          <!-- Brutalist Segmented RSVP Control -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button id="day-sheet-btn-rsvp-yes" class="btn ${userStatus === 'yes' ? 'btn--primary' : ''}" style="${userStatus === 'yes' ? 'background: #2ECC71; color: #fff; font-weight: 800; border-color: #1A1A1A;' : 'background: #fff; font-weight: 700;'}">
              ${PixelCheck} DABEI
            </button>
            <button id="day-sheet-btn-rsvp-no" class="btn ${userStatus === 'no' ? 'btn--danger' : ''}" style="${userStatus === 'no' ? 'background: var(--color-danger); color: #fff; font-weight: 800; border-color: #1A1A1A;' : 'background: #fff; color: var(--color-text-muted); font-weight: 700;'}">
              ✕ LEIDER NEIN
            </button>
          </div>

          ${userStatus === 'yes' ? `
            <button id="day-sheet-btn-add-calendar" class="btn btn--block btn--black" style="display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 800; box-shadow: var(--shadow-brutal-sm);">
              ${PixelCalendar} In Kalender eintragen (.ics)
            </button>
          ` : ''}

          ${isWdCreator ? `
            <button id="day-sheet-btn-del-working-day" class="btn btn--block btn--danger btn--sm" style="margin-top: 4px;">
              Arbeitstag absagen
            </button>
          ` : ''}
        </div>
      `;
    }
  } else if (dayData.status === 'maintenance') {
    const isOwner = Number(user.id) === Number(info.userId || info.user_id);
    const hasApproval = Array.isArray(info.approvals) && info.approvals.some(a => (a.allowed_user_id == user.id || a.allowedUserId == user.id));

    headerTag = `${PixelWrench} Unterhalt & Reinigung`;
    tagColor = '#000000';
    title = escapeHtml(info.reason || 'Unterhalt');
    const slotLabel = info.halfDay === 'morning' ? 'Vormittag (Anreise ab Nachmittag möglich)' : (info.halfDay === 'afternoon' ? 'Nachmittag (Abreise bis Vormittag möglich)' : 'Ganzer Tag gesperrt');
    
    bodyHtml = `
      <div style="margin: 12px 0;">
        <div style="font-weight: 700;">Zeitfenster: ${slotLabel}</div>
        <div style="font-size: 0.9rem; color: var(--color-text-muted); margin-top: 4px;">
          Eingetragen von: <strong>${escapeHtml(info.userName || 'Familie')}</strong>
        </div>

        ${hasApproval ? `
          <div class="card" style="background: #F0FFF4; border-color: #008000; color: #008000; font-weight: 800; font-size: 0.85rem; margin-top: 10px;">
            ${PixelCheck} Doppelnutzung erlaubt! Du darfst trotz Unterhalt für diese Tage reservieren.
          </div>
        ` : (!isOwner ? `
          <div class="card" style="background: #FDF2F8; border-color: #E5609B; font-size: 0.85rem; margin-top: 10px;">
            <strong>Parallel nutzen?</strong> Kläre mit ${escapeHtml(info.userName || 'dem Organisator')}, ob eine Doppelnutzung während des Unterhalts möglich ist.
          </div>
        ` : (info.approvals && info.approvals.length > 0 ? `
          <div class="card" style="background: #F0FFF4; border-color: #008000; color: #008000; font-weight: 800; font-size: 0.85rem; margin-top: 10px;">
            ${PixelCheck} ${info.approvals.length} Geschwister für Doppelnutzung freigegeben (${info.approvals.map(a => a.allowed_user_name || 'Geschwister').join(', ')}).
          </div>
        ` : ''))}
      </div>
    `;

    actionsHtml = `
      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
        ${hasApproval || info.halfDay === 'morning' ? `
          <button id="day-sheet-btn-select" class="btn btn--block btn--primary">
            ${hasApproval ? 'Trotzdem reservieren (Doppelnutzung)' : 'Ab Nachmittag anreisen'}
          </button>
        ` : ''}

        <button id="day-sheet-btn-maint-chat" class="btn btn--block btn--secondary" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
          ${PixelChat} ${isOwner ? 'Absprachen & Chat' : 'Nachfragen (Micro-Chat)'}
        </button>

        ${isOwner ? `
          <button id="day-sheet-btn-del-maint" class="btn btn--block btn--danger btn--sm">
            Unterhalt aufheben
          </button>
        ` : ''}
      </div>
    `;
  } else {
    bodyHtml = `
      <p style="margin: 12px 0; font-size: 0.95rem; color: var(--color-text-muted);">
        Dieser Tag am Thunersee ist frei und kann reserviert werden.
      </p>
    `;
    actionsHtml = `
      <button id="day-sheet-btn-select" class="btn btn--block btn--primary" style="margin-top: 8px;">
        Diesen Tag auswählen
      </button>
    `;
  }

  container.innerHTML = `
    <div class="bottom-sheet" id="day-sheet-content">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: ${tagColor};">
            ${headerTag} · ${friendlyDate}
          </span>
          <h3 style="margin-top: 2px;">${title}</h3>
        </div>
        <button id="day-sheet-close-btn" class="btn btn--icon btn--sm" aria-label="Schliessen">${PixelCancel}</button>
      </div>

      <div id="day-sheet-error" class="error-banner" style="display: none;"></div>

      ${bodyHtml}
      ${actionsHtml}

      <button id="day-sheet-btn-dismiss" class="btn btn--block" style="margin-top: 4px;">
        Schliessen
      </button>
    </div>
  `;

  let countdownTimer = null;
  if (dayData.status === 'pending' && info.vetoDeadline) {
    countdownTimer = setInterval(() => {
      const cdEl = container.querySelector('#live-veto-countdown-box');
      if (!cdEl) {
        clearInterval(countdownTimer);
        return;
      }
      const currentCd = getVetoCountdown(info.vetoDeadline);
      cdEl.innerHTML = currentCd.expired ? `${PixelCheck} ${currentCd.text}` : `${PixelHourglass} ${currentCd.text}`;
    }, 1000);
  }

  function close() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    container.style.display = 'none';
    container.innerHTML = '';
    if (onClose) onClose();
  }

  const closeBtn = container.querySelector('#day-sheet-close-btn');
  const dismissBtn = container.querySelector('#day-sheet-btn-dismiss');
  const errorEl = container.querySelector('#day-sheet-error');

  if (closeBtn) closeBtn.addEventListener('click', close);
  if (dismissBtn) dismissBtn.addEventListener('click', close);

  // Select day action
  const selectBtn = container.querySelector('#day-sheet-btn-select');
  if (selectBtn) {
    selectBtn.addEventListener('click', () => {
      close();
      if (onSelectAsStart) onSelectAsStart(dateISO);
    });
  }

  const selectMaintStartBtn = container.querySelector('#day-sheet-btn-select-maint-start');
  if (selectMaintStartBtn) {
    selectMaintStartBtn.addEventListener('click', () => {
      close();
      if (onSelectAsStart) onSelectAsStart(dateISO);
    });
  }

  // Cancel reservation action
  const cancelBtn = container.querySelector('#day-sheet-btn-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Reservation stornieren', message: 'Möchtest du diese Reservation wirklich stornieren?', confirmLabel: 'Stornieren', isDanger: true }))) return;
      if (navigator.vibrate) navigator.vibrate(10);
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Wird storniert...';
      const res = await reservationEngine.cancelReservation(info.id);
      if (res.success) {
        close();
        playThunderstormAnimation({
          text: 'STORNIERT',
          subtext: `${friendlyDate} freigegeben`
        });
        if (onUpdated) onUpdated();
      } else {
        cancelBtn.disabled = false;
        cancelBtn.textContent = 'Reservation stornieren';
        showInlineError(errorEl, res.error || 'Fehler beim Stornieren.', { reportable: res.isTechnical, category: 'Buchung' });
      }
    });
  }

  // Cancel buttons on shared changeover days
  const multiCancelBtns = container.querySelectorAll('.btn-cancel-res');
  multiCancelBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const resId = btn.getAttribute('data-id');
      if (!(await confirmDialog({ title: 'Reservation stornieren', message: 'Möchtest du diese Reservation wirklich stornieren?', confirmLabel: 'Stornieren', isDanger: true }))) return;
      if (navigator.vibrate) navigator.vibrate(10);
      btn.disabled = true;
      btn.textContent = 'Wird storniert...';
      const res = await reservationEngine.cancelReservation(resId);
      if (res.success) {
        close();
        playThunderstormAnimation({
          text: 'STORNIERT',
          subtext: 'Reservation freigegeben'
        });
        if (onUpdated) onUpdated();
      } else {
        btn.disabled = false;
        btn.textContent = 'Stornieren fehlgeschlagen';
        showInlineError(errorEl, res.error || 'Fehler beim Stornieren.', { reportable: res.isTechnical, category: 'Buchung' });
      }
    });
  });

  // Handover note action
  const handoverBtn = container.querySelector('#day-sheet-btn-handover');
  if (handoverBtn) {
    handoverBtn.addEventListener('click', () => {
      openHandoverModal({
        container,
        reservation: info,
        user,
        onSubmitted: () => {
          // Re-render day sheet to show the newly added note
          openDayDetailSheet({ container, dateISO, user, onSelectAsStart, onUpdated, onClose });
        },
        onClose: () => {
          openDayDetailSheet({ container, dateISO, user, onSelectAsStart, onUpdated, onClose });
        }
      });
    });
  }

  // Edit existing handover note
  container.querySelectorAll('.btn-edit-handover').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const noteId = btn.dataset.noteId;
      const note = handoverNotes.find((n) => n.id == noteId);
      if (!note) return;

      openHandoverModal({
        container,
        reservation: info,
        user,
        existingNote: note,
        onSubmitted: () => {
          openDayDetailSheet({ container, dateISO, user, onSelectAsStart, onUpdated, onClose });
        },
        onClose: () => {
          openDayDetailSheet({ container, dateISO, user, onSelectAsStart, onUpdated, onClose });
        }
      });
    });
  });

  // Maintenance chat action
  const maintChatBtn = container.querySelector('#day-sheet-btn-maint-chat');
  if (maintChatBtn) {
    maintChatBtn.addEventListener('click', () => {
      close();
      openMicroChat({
        container,
        maintenance: info,
        user,
        onOverlapAllowed: () => {
          if (onUpdated) onUpdated();
        },
        onClose: () => {
          openDayDetailSheet({ container, dateISO, user, onSelectAsStart, onUpdated, onClose });
        }
      });
    });
  }

  // Delete maintenance action
  const delMaintBtn = container.querySelector('#day-sheet-btn-del-maint');
  if (delMaintBtn) {
    delMaintBtn.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Unterhalt aufheben', message: 'Unterhalt für diesen Tag aufheben?', confirmLabel: 'Aufheben', isDanger: true }))) return;
      if (navigator.vibrate) navigator.vibrate(10);
      delMaintBtn.disabled = true;
      delMaintBtn.textContent = 'Wird entfernt...';
      const res = await reservationEngine.deleteMaintenance(info.id);
      if (res.success) {
        close();
        if (onUpdated) onUpdated();
      } else {
        delMaintBtn.disabled = false;
        delMaintBtn.textContent = 'Unterhalt aufheben';
        showInlineError(errorEl, res.error || 'Fehler beim Aufheben.', { reportable: res.isTechnical, category: 'Buchung' });
      }
    });
  }

  // Veto button (triggers conflict modal)
  const vetoBtn = container.querySelector('#day-sheet-btn-veto');
  if (vetoBtn) {
    vetoBtn.addEventListener('click', async () => {
      vetoBtn.disabled = true;
      vetoBtn.textContent = 'Veto wird eingetragen...';
      await reservationEngine.castVeto(info.id);
      close();
      playThunderstormAnimation({
        text: 'VETO EINGELEGT!',
        subtext: 'Konfliktlösungs-Modus aktiv'
      });
      const freshRes = reservationStore.reservations.find(r => r.id == info.id) || info;
      openConflictModal({
        container,
        reservation: freshRes,
        user,
        onResolved: () => {
          if (onUpdated) onUpdated();
        }
      });
    });
  }

  // Resolve conflict button (triggers conflict modal)
  const resolveBtn = container.querySelector('#day-sheet-btn-resolve-conflict');
  if (resolveBtn) {
    resolveBtn.addEventListener('click', () => {
      close();
      const freshRes = reservationStore.reservations.find(r => r.id == info.id) || info;
      openConflictModal({
        container,
        reservation: freshRes,
        user,
        onResolved: () => {
          if (onUpdated) onUpdated();
        }
      });
    });
  }

  // Sibling Approve button
  const approveBtn = container.querySelector('#day-sheet-btn-approve');
  if (approveBtn) {
    approveBtn.addEventListener('click', async () => {
      approveBtn.disabled = true;
      approveBtn.textContent = 'Wird genehmigt...';
      const res = await reservationEngine.approveReservation(info.id);
      if (res.success) {
        close();
        if (res.allApproved) {
          // Everyone approved! Confetti!
          playConfettiCelebration({
            text: 'Alle Geschwister einverstanden!',
            subtext: `Feste Buchung für ${friendlyDate} bestätigt!`
          });
        } else {
          playConfettiCelebration({
            text: 'Zustimmung erteilt!',
            subtext: `${res.approvalsCount}/${res.requiredApprovals} Geschwister haben zugestimmt`
          });
        }
        if (onUpdated) onUpdated();
      } else {
        approveBtn.disabled = false;
        approveBtn.textContent = 'Anfrage genehmigen (OK)';
        showInlineError(errorEl, res.error || 'Fehler beim Genehmigen.', { reportable: res.isTechnical, category: 'Buchung' });
      }
    });
  }

  // Working Day Proposal: 3-way Vote Buttons
  const voteBtns = container.querySelectorAll('.wd-vote-btn');
  voteBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const pDate = btn.getAttribute('data-date');
      const vVal = btn.getAttribute('data-vote');
      const wd = dayData.workingDay || info;
      if (navigator.vibrate) navigator.vibrate(10);

      const userRsvp = wd.rsvps?.find(r => (r.user_id == user.id || r.userId == user.id));
      const currentVotes = userRsvp?.votes ? { ...userRsvp.votes } : {};
      currentVotes[pDate] = vVal;

      btn.disabled = true;
      const res = await reservationEngine.voteWorkingDay({
        workingDayId: wd.id,
        votes: currentVotes
      });

      if (res.success) {
        openDayDetailSheet({ container, dateISO, user, onSelectAsStart, onUpdated, onClose });
        if (onUpdated) onUpdated();
      } else {
        btn.disabled = false;
        showInlineError(errorEl, res.error || 'Fehler beim Abstimmen.', { reportable: res.isTechnical, category: 'Buchung' });
      }
    });
  });

  // Working Day Proposal: Finalize Selected Date Button
  const finalizeBtns = container.querySelectorAll('.wd-finalize-btn');
  finalizeBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetDate = btn.getAttribute('data-finalize-date');
      const wd = dayData.workingDay || info;
      const friendlyTarget = formatDateFriendly(targetDate);

      const confirmed = await confirmDialog({
        title: 'Termin final fixieren',
        message: `Möchtest du den ${friendlyTarget} als offiziellen Arbeitstag für die ganze Familie festlegen?`,
        confirmLabel: 'Datum fixieren',
        isDanger: false
      });
      if (!confirmed) return;

      if (navigator.vibrate) navigator.vibrate(15);
      btn.disabled = true;
      btn.textContent = 'Wird fixiert...';

      const res = await reservationEngine.finalizeWorkingDay({
        workingDayId: wd.id,
        selectedDate: targetDate
      });

      if (res.success) {
        playConfettiCelebration({
          text: 'Arbeitstag steht fest!',
          subtext: `${friendlyTarget} im Kalender eingetragen.`
        });
        openDayDetailSheet({ container, dateISO: targetDate, user, onSelectAsStart, onUpdated, onClose });
        if (onUpdated) onUpdated();
      } else {
        btn.disabled = false;
        btn.textContent = '🎯 Diesen Termin festlegen';
        showInlineError(errorEl, res.error || 'Fehler beim Fixieren.', { reportable: res.isTechnical, category: 'Buchung' });
      }
    });
  });

  // Working Day RSVP Yes
  const rsvpYesBtn = container.querySelector('#day-sheet-btn-rsvp-yes');
  if (rsvpYesBtn) {
    rsvpYesBtn.addEventListener('click', async () => {
      const wd = dayData.workingDay || info;
      rsvpYesBtn.disabled = true;
      rsvpYesBtn.textContent = 'Wird gespeichert...';
      const res = await reservationEngine.rsvpWorkingDay({ workingDayId: wd.id, status: 'yes' });
      if (res.success) {
        playConfettiCelebration({
          text: 'Super! Du bist dabei!',
          subtext: `${friendlyDate}`
        });
        openDayDetailSheet({ container, dateISO, user, onSelectAsStart, onUpdated, onClose });
        if (onUpdated) onUpdated();
      } else {
        rsvpYesBtn.disabled = false;
        rsvpYesBtn.innerHTML = `${PixelCheck} Ich bin dabei!`;
        showInlineError(errorEl, res.error || 'Fehler beim Antworten.', { reportable: res.isTechnical, category: 'Buchung' });
      }
    });
  }

  // Working Day RSVP No
  const rsvpNoBtn = container.querySelector('#day-sheet-btn-rsvp-no');
  if (rsvpNoBtn) {
    rsvpNoBtn.addEventListener('click', async () => {
      const wd = dayData.workingDay || info;
      rsvpNoBtn.disabled = true;
      rsvpNoBtn.textContent = 'Wird gespeichert...';
      const res = await reservationEngine.rsvpWorkingDay({ workingDayId: wd.id, status: 'no' });
      if (res.success) {
        openDayDetailSheet({ container, dateISO, user, onSelectAsStart, onUpdated, onClose });
        if (onUpdated) onUpdated();
      } else {
        rsvpNoBtn.disabled = false;
        rsvpNoBtn.textContent = 'Leider keine Zeit (Absagen)';
        showInlineError(errorEl, res.error || 'Fehler beim Antworten.', { reportable: res.isTechnical, category: 'Buchung' });
      }
    });
  }

  // Reservation Add to Calendar (.ics)
  const exportResIcsBtn = container.querySelector('#day-sheet-btn-export-ics');
  if (exportResIcsBtn) {
    exportResIcsBtn.addEventListener('click', () => {
      exportReservationToCalendar({
        reservation: info,
        user
      });
    });
  }

  // Working Day Add to Calendar (.ics)
  const addCalBtn = container.querySelector('#day-sheet-btn-add-calendar');
  if (addCalBtn) {
    addCalBtn.addEventListener('click', () => {
      const wd = dayData.workingDay || info;
      exportWorkingDayToCalendar({
        dateISO: wd.date || dateISO,
        season: wd.season || 'spring',
        creatorName: wd.userName || wd.user_name || 'Familie'
      });
    });
  }

  // Working Day Delete
  const delWdBtn = container.querySelector('#day-sheet-btn-del-working-day');
  if (delWdBtn) {
    delWdBtn.addEventListener('click', async () => {
      const wd = dayData.workingDay || info;
      const isProp = wd.status === 'proposed';
      const confirmTitle = isProp ? 'Terminvorschlag aufheben' : 'Arbeitstag absagen';
      const confirmMsg = isProp
        ? 'Möchtest du diese Termin-Abstimmung wirklich löschen?'
        : 'Möchtest du diesen Arbeitstag wirklich absagen und aufheben?';

      if (!(await confirmDialog({ title: confirmTitle, message: confirmMsg, confirmLabel: 'Aufheben', isDanger: true }))) return;
      if (navigator.vibrate) navigator.vibrate(10);
      delWdBtn.disabled = true;
      delWdBtn.textContent = 'Wird gelöscht...';
      const res = await reservationEngine.deleteWorkingDay(wd.id);
      if (res.success) {
        close();
        playThunderstormAnimation({
          text: isProp ? 'VORSCHLAG GELÖSCHT' : 'ARBEITSTAG ABGESAGT',
          subtext: `${friendlyDate} freigegeben`
        });
        if (onUpdated) onUpdated();
      } else {
        delWdBtn.disabled = false;
        delWdBtn.textContent = isProp ? 'Terminvorschlag aufheben' : 'Arbeitstag absagen';
        showInlineError(errorEl, res.error || 'Fehler beim Löschen.', { reportable: res.isTechnical, category: 'Buchung' });
      }
    });
  }
}
