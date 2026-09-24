/**
 * ChaletWeShare — Working Day Creation Bottom Sheet
 * Allows proposing up to 3 dates for Doodle-style voting or scheduling a single date.
 */

import { formatDateFriendly, addDays, parseDateISO, formatDateISO } from '../utils/dateUtils.js';
import { reservationEngine } from '../engine/reservationEngine.js';
import { reservationStore } from '../engine/reservationStore.js';
import { playConfettiCelebration } from './confettiAnimation.js';
import { PixelBroom, PixelLeaf, PixelCancel, PixelVote, PixelCalendar } from '../data/pixelIcons.js';
import { showInlineError } from '../utils/errorUtils.js';

export function openWorkingDaySheet({ container, date, user, onSuccess, onClose }) {
  // Auto-detect season based on month (March-July -> spring, August-November -> autumn)
  const month = parseInt(date.split('-')[1], 10);
  let initialSeason = (month >= 3 && month <= 7) ? 'spring' : 'autumn';

  // Smart proposal dates defaults: date, +7 days, +14 days
  const defaultDate1 = date;
  const defaultDate2 = addDays(date, 7);
  const defaultDate3 = addDays(date, 14);

  let isProposalMode = true;
  let selectedSeason = initialSeason;

  container.style.display = 'flex';

  function renderContent() {
    const friendlyDate = formatDateFriendly(defaultDate1);

    container.innerHTML = `
      <div class="bottom-sheet" id="working-day-sheet-content" style="max-height: 90vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--color-accent); display: flex; align-items: center; gap: 6px;">
              <span style="display: inline-flex; gap: 4px;">${PixelBroom} ${PixelLeaf}</span>
              <span>Gemeinsamer Arbeitstag</span>
            </span>
            <h3 style="margin-top: 2px;">${isProposalMode ? 'Terminfindung (Abstimmung)' : friendlyDate}</h3>
          </div>
          <button id="wd-sheet-close-btn" class="btn btn--icon btn--sm" aria-label="Schliessen">${PixelCancel}</button>
        </div>

        <div id="wd-sheet-error" class="error-banner" style="display: none; margin-top: 8px;"></div>

        <!-- Mode Selector: Proposal vs Fixed Date -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 12px; background: #E5E7EB; padding: 3px; border: 2px solid #1A1A1A;">
          <button type="button" id="wd-mode-proposal-btn" class="btn btn--sm" style="${isProposalMode ? 'background: #FFFFFF; font-weight: 800; border-color: #1A1A1A; box-shadow: 1px 1px 0px #1A1A1A;' : 'background: transparent; border: none; font-weight: 600; box-shadow: none;'}">
            ${PixelVote} 3 Termine (Wahl)
          </button>
          <button type="button" id="wd-mode-fixed-btn" class="btn btn--sm" style="${!isProposalMode ? 'background: #FFFFFF; font-weight: 800; border-color: #1A1A1A; box-shadow: 1px 1px 0px #1A1A1A;' : 'background: transparent; border: none; font-weight: 600; box-shadow: none;'}">
            ${PixelCalendar} 1 fester Tag
          </button>
        </div>

        <!-- Season Selector -->
        <div class="input-group" style="margin-top: 12px;">
          <label class="input-label">Anlass auswählen</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button type="button" class="btn btn--sm wd-season-btn ${selectedSeason === 'spring' ? 'is-active' : ''}" data-season="spring" style="${selectedSeason === 'spring' ? 'background: var(--color-yellow); color: #000; font-weight: 800; border-color: #000;' : ''}">
              <span style="display: inline-flex; align-items: center; gap: 6px;">${PixelBroom} Frühjahrsputz</span>
            </button>
            <button type="button" class="btn btn--sm wd-season-btn ${selectedSeason === 'autumn' ? 'is-active' : ''}" data-season="autumn" style="${selectedSeason === 'autumn' ? 'background: var(--color-yellow); color: #000; font-weight: 800; border-color: #000;' : ''}">
              <span style="display: inline-flex; align-items: center; gap: 6px;">${PixelLeaf} Einwintern</span>
            </button>
          </div>
          <span id="wd-season-hint" style="font-size: 0.78rem; color: var(--color-text-muted); margin-top: 6px; display: block; line-height: 1.35;">
            ${selectedSeason === 'spring' ? 'Saisoneröffnung: Chalet aus dem Winterschlaf wecken, putzen & herrichten.' : 'Saisonabschluss: Wasser abstellen, Chalet wetterfest machen & einwintern.'}
          </span>
        </div>

        <!-- Date Inputs -->
        ${isProposalMode ? `
          <div class="input-group" style="margin-top: 10px;">
            <label class="input-label">Vorgeschlagene Termine (bis zu 3 Optionen)</label>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <!-- Slot 1 -->
              <div style="background: var(--color-surface); border: 2px solid #1A1A1A; padding: 8px 10px; box-shadow: 1px 1px 0px #1A1A1A;">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; font-weight: 800; margin-bottom: 4px;">
                  <span>TERMIN 1 (HAUPTTERMIN)</span>
                  <span id="wd-warn-1" style="color: var(--color-danger); display: none; font-size: 0.7rem;">⚠️ Kollision!</span>
                </div>
                <input type="date" id="wd-date-1" class="input-field" value="${defaultDate1}" style="font-weight: 700; width: 100%;">
              </div>

              <!-- Slot 2 -->
              <div style="background: var(--color-surface); border: 2px solid #1A1A1A; padding: 8px 10px; box-shadow: 1px 1px 0px #1A1A1A;">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; font-weight: 800; margin-bottom: 4px;">
                  <span>TERMIN 2 (ALTERNATIVE)</span>
                  <span id="wd-warn-2" style="color: var(--color-danger); display: none; font-size: 0.7rem;">⚠️ Kollision!</span>
                </div>
                <div style="display: flex; gap: 6px;">
                  <input type="date" id="wd-date-2" class="input-field" value="${defaultDate2}" style="font-weight: 700; flex: 1;">
                  <button type="button" class="btn btn--sm wd-plus-week-btn" data-target="wd-date-2" title="+1 Woche">+1W</button>
                </div>
              </div>

              <!-- Slot 3 -->
              <div style="background: var(--color-surface); border: 2px solid #1A1A1A; padding: 8px 10px; box-shadow: 1px 1px 0px #1A1A1A;">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; font-weight: 800; margin-bottom: 4px;">
                  <span>TERMIN 3 (OPTION)</span>
                  <span id="wd-warn-3" style="color: var(--color-danger); display: none; font-size: 0.7rem;">⚠️ Kollision!</span>
                </div>
                <div style="display: flex; gap: 6px;">
                  <input type="date" id="wd-date-3" class="input-field" value="${defaultDate3}" style="font-weight: 700; flex: 1;">
                  <button type="button" class="btn btn--sm wd-plus-week-btn" data-target="wd-date-3" title="+2 Wochen">+2W</button>
                </div>
              </div>
            </div>
          </div>

          <div class="card" style="background: #FFFDF0; border: 2px solid #1A1A1A; font-size: 0.8rem; line-height: 1.4; padding: 10px 12px; margin-top: 10px; box-shadow: 1px 1px 0px #1A1A1A;">
            <strong>Doodle-Abstimmung für die Familie:</strong><br>
            Alle Geschwister erhalten genau 1 Push-Nachricht und stimmen in der App ab. Sobald alle abgestimmt haben, bestimmst du mit 1 Klick das finale Datum!
          </div>
        ` : `
          <div class="input-group" style="margin-top: 10px;">
            <label class="input-label">Datum für Arbeitstag</label>
            <input type="date" id="wd-date-single" class="input-field" value="${defaultDate1}" style="font-weight: 700; width: 100%;">
            <span id="wd-warn-single" style="color: var(--color-danger); display: none; font-size: 0.72rem; margin-top: 4px;">⚠️ An diesem Tag liegt bereits eine Buchung.</span>
          </div>

          <div class="card" style="background: #FFFDF0; border: 2px solid #1A1A1A; font-size: 0.8rem; line-height: 1.4; padding: 10px 12px; margin-top: 10px; box-shadow: 1px 1px 0px #1A1A1A;">
            <strong>Direkt ansetzen:</strong><br>
            Der Termin wird sofort fest im Kalender eingetragen. Alle Geschwister erhalten eine Benachrichtigung für die finale Zusage.
          </div>
        `}

        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 14px;">
          <button id="wd-btn-submit" class="btn btn--block btn--primary" style="background: var(--color-yellow); color: #000; font-weight: 800; border-color: #000; box-shadow: var(--shadow-brutal-sm);">
            ${isProposalMode ? 'Abstimmung starten (3 Termine)' : 'Arbeitstag ansetzen'}
          </button>
          <button id="wd-btn-cancel" class="btn btn--block">
            Abbrechen
          </button>
        </div>
      </div>
    `;

    bindEvents();
    checkCollisions();
  }

  function checkDateCollision(dateStr) {
    if (!dateStr) return false;
    return reservationStore.reservations.some(r => {
      return (r.status === 'booked' || r.status === 'pending') && dateStr >= r.dateStart && dateStr <= r.dateEnd;
    });
  }

  function checkCollisions() {
    if (isProposalMode) {
      const d1 = container.querySelector('#wd-date-1')?.value;
      const d2 = container.querySelector('#wd-date-2')?.value;
      const d3 = container.querySelector('#wd-date-3')?.value;

      const w1 = container.querySelector('#wd-warn-1');
      const w2 = container.querySelector('#wd-warn-2');
      const w3 = container.querySelector('#wd-warn-3');

      if (w1) w1.style.display = checkDateCollision(d1) ? 'inline' : 'none';
      if (w2) w2.style.display = checkDateCollision(d2) ? 'inline' : 'none';
      if (w3) w3.style.display = checkDateCollision(d3) ? 'inline' : 'none';
    } else {
      const d = container.querySelector('#wd-date-single')?.value;
      const w = container.querySelector('#wd-warn-single');
      if (w) w.style.display = checkDateCollision(d) ? 'block' : 'none';
    }
  }

  function bindEvents() {
    const closeBtn = container.querySelector('#wd-sheet-close-btn');
    const cancelBtn = container.querySelector('#wd-btn-cancel');
    const submitBtn = container.querySelector('#wd-btn-submit');
    const errorEl = container.querySelector('#wd-sheet-error');

    const propModeBtn = container.querySelector('#wd-mode-proposal-btn');
    const fixedModeBtn = container.querySelector('#wd-mode-fixed-btn');

    if (propModeBtn) {
      propModeBtn.addEventListener('click', () => {
        if (!isProposalMode) {
          isProposalMode = true;
          renderContent();
        }
      });
    }

    if (fixedModeBtn) {
      fixedModeBtn.addEventListener('click', () => {
        if (isProposalMode) {
          isProposalMode = false;
          renderContent();
        }
      });
    }

    const seasonBtns = container.querySelectorAll('.wd-season-btn');
    const seasonHint = container.querySelector('#wd-season-hint');

    seasonBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        seasonBtns.forEach((b) => {
          b.classList.remove('is-active');
          b.style.background = '';
          b.style.color = '';
          b.style.fontWeight = '';
        });
        btn.classList.add('is-active');
        btn.style.background = 'var(--color-yellow)';
        btn.style.color = '#000';
        btn.style.fontWeight = '800';
        selectedSeason = btn.getAttribute('data-season');

        if (seasonHint) {
          seasonHint.textContent = selectedSeason === 'spring'
            ? 'Saisoneröffnung: Chalet aus dem Winterschlaf wecken, putzen & herrichten.'
            : 'Saisonabschluss: Wasser abstellen, Chalet wetterfest machen & einwintern.';
        }
      });
    });

    const plusWeekBtns = container.querySelectorAll('.wd-plus-week-btn');
    plusWeekBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = container.querySelector(`#${targetId}`);
        if (input && input.value) {
          const daysToAdd = btn.textContent.includes('2') ? 14 : 7;
          input.value = addDays(input.value, daysToAdd);
          checkCollisions();
        }
      });
    });

    const dateInputs = container.querySelectorAll('input[type="date"]');
    dateInputs.forEach(inp => {
      inp.addEventListener('change', checkCollisions);
    });

    const closeSheet = () => {
      container.style.display = 'none';
      container.innerHTML = '';
      if (onClose) onClose();
    };

    if (closeBtn) closeBtn.addEventListener('click', closeSheet);
    if (cancelBtn) cancelBtn.addEventListener('click', closeSheet);

    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        if (errorEl) errorEl.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Wird gespeichert...';

        let datesToSubmit = [];
        if (isProposalMode) {
          const d1 = container.querySelector('#wd-date-1')?.value?.trim();
          const d2 = container.querySelector('#wd-date-2')?.value?.trim();
          const d3 = container.querySelector('#wd-date-3')?.value?.trim();
          if (d1) datesToSubmit.push(d1);
          if (d2 && !datesToSubmit.includes(d2)) datesToSubmit.push(d2);
          if (d3 && !datesToSubmit.includes(d3)) datesToSubmit.push(d3);
        } else {
          const dSingle = container.querySelector('#wd-date-single')?.value?.trim();
          if (dSingle) datesToSubmit.push(dSingle);
        }

        if (datesToSubmit.length === 0) {
          submitBtn.disabled = false;
          submitBtn.textContent = isProposalMode ? 'Abstimmung starten (3 Termine)' : 'Arbeitstag ansetzen';
          showInlineError(errorEl, 'Bitte mindestens ein gültiges Datum wählen.');
          return;
        }

        const res = await reservationEngine.createWorkingDay({
          dates: datesToSubmit,
          season: selectedSeason,
          isProposal: isProposalMode
        });

        submitBtn.disabled = false;
        submitBtn.textContent = isProposalMode ? 'Abstimmung starten (3 Termine)' : 'Arbeitstag ansetzen';

        if (res.success) {
          const seasonTitle = selectedSeason === 'spring' ? 'Frühjahrsputz' : 'Einwintern';
          const celebrateTitle = isProposalMode
            ? `Terminvorschlag für ${seasonTitle} gestartet!`
            : `${seasonTitle} angesetzt!`;
          const celebrateSub = isProposalMode
            ? 'Alle Geschwister wurden eingeladen abzustimmen.'
            : 'Alle Geschwister wurden benachrichtigt.';

          playConfettiCelebration({
            text: celebrateTitle,
            subtext: celebrateSub
          });
          closeSheet();
          if (onSuccess) onSuccess(res.workingDay);
        } else {
          showInlineError(errorEl, res.error || 'Fehler beim Eintragen des Arbeitstags.', { reportable: res.isTechnical, category: 'Buchung' });
        }
      });
    }
  }

  renderContent();
}

