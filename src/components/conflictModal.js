/**
 * ChaletWeShare — Fair Conflict Resolution Modal
 * Respects logical ownership:
 * - User A (original requester) holds decision authority.
 * - User B (vetoer) can propose Doppelnutzung / RNG, chat, or withdraw veto.
 * - Dice Roll includes Anime.js tumbling drama, haptic vibration, and swan celebration.
 */

import anime from 'animejs';
import { reservationEngine } from '../engine/reservationEngine.js';
import { formatDateFriendly } from '../utils/dateUtils.js';
import { renderAvatarMarkup } from '../data/avatars.js';
import { openMicroChat } from './microChat.js';
import { playSwanCelebration } from './swanAnimation.js';
import { PixelLightning, PixelHandshake, PixelDice, PixelChat, PixelParty, PixelCheck, PixelWarning, PixelCrown, PixelInfo, PixelCancel, PixelDiceFaces } from '../data/pixelIcons.js';
import { escapeHtml } from '../utils/htmlUtils.js';
import { showInlineError } from '../utils/errorUtils.js';
import { confirmDialog } from './confirmDialog.js';

export function openConflictModal({ container, reservation, user, onResolved, onClose }) {
  const resId = reservation.id;
  const friendlyDates = `${formatDateFriendly(reservation.dateStart || reservation.date_start)} – ${formatDateFriendly(reservation.dateEnd || reservation.date_end)}`;
  
  const requesterId = Number(reservation.userId || reservation.user_id);
  const isRequester = (Number(user.id) === requesterId);

  // Identify the vetoer party
  const rawVetoes = reservation.vetoes || [];
  const firstVeto = rawVetoes.length > 0 ? rawVetoes[0] : null;

  let requesterName, requesterAvatar, vetoerName, vetoerAvatar, opponentId, opponentName;

  if (isRequester) {
    requesterName = user.name;
    requesterAvatar = user.avatar;
    vetoerName = firstVeto ? (firstVeto.user_name || firstVeto.userName || 'Geschwister') : 'Veto-Partei';
    vetoerAvatar = firstVeto ? (firstVeto.user_avatar || firstVeto.userAvatar || 'fox') : 'fox';
    opponentId = firstVeto ? (firstVeto.user_id || firstVeto.userId) : null;
    opponentName = vetoerName;
  } else {
    requesterName = reservation.userName || reservation.user_name || 'Geschwister';
    requesterAvatar = reservation.userAvatar || reservation.user_avatar || 'swan';
    vetoerName = user.name;
    vetoerAvatar = user.avatar;
    opponentId = requesterId;
    opponentName = requesterName;
  }

  const activeProposal = reservation.conflictProposal || null;
  const hasProposalFromOpponent = activeProposal && Number(activeProposal.proposer_user_id) !== Number(user.id);
  const myActiveProposal = activeProposal && Number(activeProposal.proposer_user_id) === Number(user.id);

  container.style.display = 'flex';
  container.innerHTML = `
    <div class="bottom-sheet" style="max-height: 90vh; overflow-y: auto;" id="conflict-modal-content">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: var(--border); padding-bottom: 8px;">
        <div>
          <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--color-danger); display: flex; align-items: center; gap: 4px;">
            ${PixelLightning} Konfliktlösung
          </span>
          <h3 style="margin-top: 2px;">${friendlyDates}</h3>
        </div>
        <button id="conflict-close-btn" class="btn btn--icon btn--sm" aria-label="Schliessen">${PixelCancel}</button>
      </div>

      <div id="conflict-error-banner" class="error-banner" style="display: none; margin-top: 8px;"></div>

      <!-- Parties in conflict (Logical Roles) -->
      <div style="display: flex; align-items: center; justify-content: space-around; padding: 12px; background: #F6F6F4; border: var(--border); margin: 12px 0;">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center;">
          ${renderAvatarMarkup(requesterAvatar, 44)}
          <span style="font-weight: 700; font-size: 0.85rem;">${escapeHtml(requesterName)}</span>
          <span style="font-size: 0.7rem; color: #16A34A; font-weight: 800; background: #DCFCE7; padding: 2px 6px; border-radius: 0;">Erstanfrage ${isRequester ? '(Du)' : ''}</span>
        </div>
        <div style="font-size: 1.25rem; font-weight: 900; color: var(--color-danger);">VS</div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center;">
          ${renderAvatarMarkup(vetoerAvatar, 44)}
          <span style="font-weight: 700; font-size: 0.85rem;">${escapeHtml(vetoerName)}</span>
          <span style="font-size: 0.7rem; color: var(--color-accent); font-weight: 800; background: #FEE2E2; padding: 2px 6px; border-radius: 0;">Veto-Partei ${!isRequester ? '(Du)' : ''}</span>
        </div>
      </div>

      <!-- Role Explanation Banner -->
      ${isRequester ? `
        <div style="background: #F0FDF4; border: 1px solid #86EFAC; padding: 10px 12px; border-radius: 0; margin-bottom: 12px; font-size: 0.85rem; color: #166534; display: flex; align-items: flex-start; gap: 6px;">
          <span style="display: inline-flex; align-items: center; gap: 6px;">${PixelCrown} <strong>Entscheidungsbefugnis:</strong> Als Erstanfragende(r) hast du das Recht, die Konfliktlösung zu bestimmen oder anzunehmen.</span>
        </div>
      ` : `
        <div style="background: #EFF6FF; border: 1px solid #BFDBFE; padding: 10px 12px; border-radius: 0; margin-bottom: 12px; font-size: 0.85rem; color: #1E40AF; display: flex; align-items: flex-start; gap: 6px;">
          <span style="display: inline-flex; align-items: center; gap: 6px;">${PixelInfo} <strong>Veto-Beteiligter:</strong> Du kannst ${escapeHtml(requesterName)} Doppelnutzung oder Losentscheid vorschlagen. Die Bestätigung obliegt der Erstanfrage.</span>
        </div>
      `}

      <!-- Incoming Proposal Highlight -->
      ${hasProposalOpponentMarkup()}

      <!-- Option 1: Shared Stay (Doppelnutzung) -->
      <div class="card" style="border-left: 6px solid #2ECC71; margin-bottom: 10px;">
        <h4 style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span>${PixelHandshake} Option 1: ${isRequester ? 'Doppelnutzung' : 'Vorschlag: Doppelnutzung'}</span>
        </h4>
        <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 10px;">
          Ihr teilt euch das Chalet am Thunersee gemeinsam. Genügend Zimmer und Betten sind vorhanden.
        </p>
        ${renderSharedOptionButtons()}
      </div>

      <!-- Option 2: RNG Dice Roll (Losentscheid) -->
      <div class="card" style="border-left: 6px solid var(--color-accent); margin-bottom: 10px;">
        <h4 style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span>${PixelDice} Option 2: ${isRequester ? 'Losentscheid (RNG)' : 'Vorschlag: Losentscheid'}</span>
        </h4>
        <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 10px;">
          Der faire Zufallsgenerator entscheidet unwiderruflich, wer den Aufenthalt erhält.
        </p>
        <div id="dice-container" style="display: none; align-items: center; justify-content: center; flex-direction: column; padding: 12px 0;">
          <div id="dice-cube" style="width: 60px; height: 60px; background: #fff; border: 3px solid #1A1A1A; box-shadow: 4px 4px 0px #1A1A1A; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 900; border-radius: 0;">
            ${PixelDice}
          </div>
          <div id="dice-winner-text" style="font-size: 1rem; font-weight: 800; margin-top: 10px; color: var(--color-accent);"></div>
        </div>
        ${renderRngOptionButtons()}
      </div>

      <!-- Option 3: Micro-Chat -->
      <div class="card" style="border-left: 6px solid #1A1A1A; margin-bottom: 10px;">
        <h4 style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span>${PixelChat} Option 3: Diskussion</span>
        </h4>
        <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 10px;">
          Eröffnet eine kurze Unterhaltung, um herauszufinden, wer den Termin dringender benötigt.
        </p>
        <button id="btn-open-chat" class="btn btn--block btn--sm btn--black">
          Diskussion im Chat öffnen
        </button>
      </div>

      <!-- Option 4: Withdraw Action -->
      <div style="margin-top: 12px; border-top: var(--border); padding-top: 10px;">
        ${renderWithdrawButton()}
        <button id="btn-cancel-conflict" class="btn btn--block" style="margin-top: 6px;">
          Schliessen
        </button>
      </div>
    </div>
  `;

  function hasProposalOpponentMarkup() {
    if (!hasProposalFromOpponent) return '';
    const propType = activeProposal.proposal_type === 'shared' ? 'Doppelnutzung' : 'Losentscheid (RNG)';
    return `
      <div style="background: #FEF3C7; border: 2px solid #F59E0B; padding: 10px 12px; margin-bottom: 12px; font-size: 0.85rem;">
        <div style="font-weight: 800; color: #92400E; display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
          ${PixelWarning} Neuer Vorschlag von ${escapeHtml(opponentName)}:
        </div>
        <div style="color: #78350F;">
          <strong>${escapeHtml(propType)}</strong> vorgeschlagen. Du kannst diesen Vorschlag direkt annehmen!
        </div>
      </div>
    `;
  }

  function renderSharedOptionButtons() {
    if (isRequester) {
      if (hasProposalFromOpponent && activeProposal.proposal_type === 'shared') {
        return `
          <button id="btn-resolve-shared" class="btn btn--block btn--sm" style="background: #2ECC71; color: #fff; border-color: #1A1A1A; font-weight: 800;">
            ${PixelCheck} Vorschlag annehmen & Doppelnutzung bestätigen
          </button>
        `;
      }
      return `
        <button id="btn-resolve-shared" class="btn btn--block btn--sm" style="background: #2ECC71; color: #fff; border-color: #1A1A1A;">
          ${PixelHandshake} Doppelnutzung vereinbaren
        </button>
      `;
    } else {
      // Vetoer side
      if (hasProposalFromOpponent && activeProposal.proposal_type === 'shared') {
        return `
          <button id="btn-resolve-shared" class="btn btn--block btn--sm" style="background: #2ECC71; color: #fff; border-color: #1A1A1A; font-weight: 800;">
            ${PixelCheck} ${escapeHtml(requesterName)}s Angebot annehmen: Doppelnutzung bestätigen
          </button>
        `;
      }
      if (myActiveProposal && activeProposal.proposal_type === 'shared') {
        return `
          <button class="btn btn--block btn--sm" disabled style="background: #E5E7EB; color: #4B5563; font-weight: 700;">
            ${PixelCheck} Doppelnutzung vorgeschlagen (Warte auf ${escapeHtml(requesterName)})
          </button>
        `;
      }
      return `
        <button id="btn-propose-shared" class="btn btn--block btn--sm" style="background: #F0FDF4; border: 2px solid #2ECC71; color: #15803D; font-weight: 800;">
          ${PixelHandshake} Doppelnutzung vorschlagen
        </button>
      `;
    }
  }

  function renderRngOptionButtons() {
    if (isRequester) {
      const isProposed = hasProposalFromOpponent && activeProposal.proposal_type === 'rng';
      return `
        <button id="btn-resolve-rng" class="btn btn--block btn--sm btn--primary">
          ${isProposed ? `${PixelDice} Losentscheid-Vorschlag annehmen & würfeln` : `${PixelDice} Jetzt würfeln & entscheiden`}
        </button>
      `;
    } else {
      // Vetoer side
      if (myActiveProposal && activeProposal.proposal_type === 'rng') {
        return `
          <button class="btn btn--block btn--sm" disabled style="background: #E5E7EB; color: #4B5563; font-weight: 700;">
            ${PixelCheck} Losentscheid vorgeschlagen (Warte auf ${escapeHtml(requesterName)})
          </button>
        `;
      }
      return `
        <button id="btn-propose-rng" class="btn btn--block btn--sm btn--outline" style="border-color: var(--color-accent); color: var(--color-accent); font-weight: 800;">
          ${PixelDice} Losentscheid vorschlagen
        </button>
      `;
    }
  }

  function renderWithdrawButton() {
    if (isRequester) {
      return `
        <button id="btn-withdraw-res" class="btn btn--block btn--sm" style="background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; font-weight: 700;">
          ${PixelCancel} Eigene Reservation zurückziehen
        </button>
      `;
    } else {
      return `
        <button id="btn-withdraw-veto" class="btn btn--block btn--sm" style="background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; font-weight: 700;">
          ${PixelCancel} Mein Veto zurückziehen
        </button>
      `;
    }
  }

  function close() {
    container.style.display = 'none';
    container.innerHTML = '';
    if (onClose) onClose();
  }

  const closeBtn = container.querySelector('#conflict-close-btn');
  const cancelBtn = container.querySelector('#btn-cancel-conflict');
  const errorEl = container.querySelector('#conflict-error-banner');

  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);

  // 1. Shared stay handler (resolution by requester or accepting sibling)
  const sharedResolveBtn = container.querySelector('#btn-resolve-shared');
  if (sharedResolveBtn) {
    sharedResolveBtn.addEventListener('click', async () => {
      sharedResolveBtn.disabled = true;
      sharedResolveBtn.textContent = 'Wird gespeichert...';

      const res = await reservationEngine.resolveConflict({
        reservationId: resId,
        resolutionType: 'shared'
      });

      if (res.success) {
        close();
        playSwanCelebration({
          text: 'Doppelnutzung vereinbart!',
          subtext: `${friendlyDates}`
        });
        if (onResolved) onResolved('shared');
      } else {
        sharedResolveBtn.disabled = false;
        sharedResolveBtn.textContent = 'Doppelnutzung bestätigen';
        showInlineError(errorEl, res.error || 'Fehler beim Lösen.', { reportable: res.isTechnical, category: 'Buchung' });
      }
    });
  }

  // 1b. Propose shared stay (vetoer proposing to requester)
  const sharedProposeBtn = container.querySelector('#btn-propose-shared');
  if (sharedProposeBtn) {
    sharedProposeBtn.addEventListener('click', async () => {
      if (navigator.vibrate) navigator.vibrate(10);
      sharedProposeBtn.disabled = true;
      sharedProposeBtn.textContent = 'Wird übermittelt...';

      try {
        const res = await reservationEngine.proposeResolution({
          reservationId: resId,
          proposalType: 'shared'
        });
        if (res && res.success) {
          sharedProposeBtn.innerHTML = `${PixelCheck} Doppelnutzung vorgeschlagen`;
          sharedProposeBtn.disabled = true;
          sharedProposeBtn.style.background = '#E5E7EB';
          sharedProposeBtn.style.color = '#4B5563';
          sharedProposeBtn.style.borderColor = 'transparent';
          playSwanCelebration({
            title: 'Vorschlag gesendet!',
            subtext: `${escapeHtml(requesterName)} wurde über deinen Vorschlag informiert.`
          });
        } else {
          sharedProposeBtn.disabled = false;
          sharedProposeBtn.innerHTML = `${PixelHandshake} Doppelnutzung vorschlagen`;
          showInlineError(errorEl, res?.error || 'Fehler beim Senden des Vorschlags.', { reportable: res?.isTechnical, category: 'Buchung' });
        }
      } catch (err) {
        sharedProposeBtn.disabled = false;
        sharedProposeBtn.innerHTML = `${PixelHandshake} Doppelnutzung vorschlagen`;
        showInlineError(errorEl, err.message || 'Fehler beim Senden des Vorschlags.', { reportable: true, category: 'Buchung' });
      }
    });
  }

  // 2. RNG Dice roll handler (Requester authority)
  const diceBtn = container.querySelector('#btn-resolve-rng');
  const diceContainer = container.querySelector('#dice-container');
  const diceCube = container.querySelector('#dice-cube');
  const diceText = container.querySelector('#dice-winner-text');

  if (diceBtn) {
    diceBtn.addEventListener('click', async () => {
      diceBtn.disabled = true;
      diceContainer.style.display = 'flex';
      diceText.textContent = 'Würfel rollt...';

      // Haptic feedback start
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate([40, 60, 40, 80]); } catch (e) {}
      }

      let rollTick = 0;
      const interval = setInterval(() => {
        diceCube.innerHTML = PixelDiceFaces[rollTick % 6];
        rollTick++;
        if (typeof navigator !== 'undefined' && navigator.vibrate && rollTick % 3 === 0) {
          try { navigator.vibrate(30); } catch (e) {}
        }
      }, 90);

      // Anime.js tumbling animation
      anime({
        targets: diceCube,
        rotate: [0, 1080],
        scale: [1, 1.3, 1],
        duration: 1800,
        easing: 'easeInOutCubic',
        complete: async () => {
          clearInterval(interval);

          // Decide winner randomly: 50% chance between Requester and Vetoer
          const isWinnerRequester = Math.random() < 0.5;
          const winnerId = isWinnerRequester ? requesterId : (opponentId || user.id);
          const winnerName = isWinnerRequester ? requesterName : opponentName;
          const isWinnerMe = (Number(user.id) === Number(winnerId));

          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate([100, 50, 150]); } catch (e) {}
          }

          diceCube.innerHTML = isWinnerMe ? PixelParty : PixelCheck;
          diceText.textContent = `Gewinner: ${winnerName}!`;

          const res = await reservationEngine.resolveConflict({
            reservationId: resId,
            resolutionType: 'rng',
            winnerUserId: winnerId
          });

          if (res.success) {
            setTimeout(() => {
              close();
              playSwanCelebration({
                text: `${winnerName} hat gewonnen!`,
                subtext: `Losentscheid für ${friendlyDates}`
              });
              if (onResolved) onResolved('rng');
            }, 900);
          } else {
            showInlineError(errorEl, res.error || 'Fehler beim Speichern des Losentscheids.', { reportable: res.isTechnical, category: 'Buchung' });
            diceBtn.disabled = false;
          }
        }
      });
    });
  }

  // 2b. Propose RNG (Vetoer proposing to requester)
  const rngProposeBtn = container.querySelector('#btn-propose-rng');
  if (rngProposeBtn) {
    rngProposeBtn.addEventListener('click', async () => {
      rngProposeBtn.disabled = true;
      rngProposeBtn.textContent = 'Wird übermittelt...';

      try {
        const res = await reservationEngine.proposeResolution({
          reservationId: resId,
          proposalType: 'rng'
        });
        if (res && res.success) {
          rngProposeBtn.innerHTML = `${PixelCheck} Losentscheid vorgeschlagen`;
          rngProposeBtn.disabled = true;
          rngProposeBtn.style.background = '#E5E7EB';
          rngProposeBtn.style.color = '#4B5563';
          rngProposeBtn.style.borderColor = 'transparent';
          playSwanCelebration({
            title: 'Vorschlag gesendet!',
            subtext: `${escapeHtml(requesterName)} wurde über deinen Losentscheid-Vorschlag informiert.`
          });
        } else {
          rngProposeBtn.disabled = false;
          rngProposeBtn.innerHTML = `${PixelDice} Losentscheid vorschlagen`;
          showInlineError(errorEl, res?.error || 'Fehler beim Senden des Vorschlags.', { reportable: res?.isTechnical, category: 'Buchung' });
        }
      } catch (err) {
        rngProposeBtn.disabled = false;
        rngProposeBtn.innerHTML = `${PixelDice} Losentscheid vorschlagen`;
        showInlineError(errorEl, err.message || 'Fehler beim Senden des Vorschlags.', { reportable: true, category: 'Buchung' });
      }
    });
  }

  // 3. Chat handler
  container.querySelector('#btn-open-chat').addEventListener('click', () => {
    openMicroChat({
      container,
      reservation,
      user,
      onAction: (actionType) => {
        if (actionType === 'shared') {
          if (isRequester) {
            sharedResolveBtn?.click();
          } else {
            sharedProposeBtn?.click();
          }
        } else if (actionType === 'rng') {
          if (isRequester) {
            diceBtn?.click();
          } else {
            rngProposeBtn?.click();
          }
        } else if (actionType === 'withdraw') {
          if (isRequester) {
            container.querySelector('#btn-withdraw-res')?.click();
          } else {
            container.querySelector('#btn-withdraw-veto')?.click();
          }
        }
      },
      onClose: () => {
        openConflictModal({ container, reservation, user, onResolved, onClose });
      }
    });
  });

  // 4. Withdraw veto handler (Vetoer)
  const withdrawVetoBtn = container.querySelector('#btn-withdraw-veto');
  if (withdrawVetoBtn) {
    withdrawVetoBtn.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Veto zurückziehen', message: 'Möchtest du dein Veto wirklich zurückziehen?', confirmLabel: 'Veto zurückziehen' }))) return;
      if (navigator.vibrate) navigator.vibrate(10);
      withdrawVetoBtn.disabled = true;
      withdrawVetoBtn.textContent = 'Wird zurückgezogen...';

      try {
        await reservationEngine.withdrawVeto(resId);
        playSwanCelebration({
          title: 'Veto zurückgezogen!',
          subtext: 'Der Konflikt wurde gelöst. Die Reservation ist nun bestätigt.'
        });
        setTimeout(close, 2000);
      } catch (err) {
        withdrawVetoBtn.disabled = false;
        withdrawVetoBtn.innerHTML = `${PixelCancel} Mein Veto zurückziehen`;
        showInlineError(errorEl, err.message || 'Fehler beim Zurückziehen des Vetos.');
      }
    });
  }

  // 4b. Withdraw reservation handler (Requester)
  const withdrawResBtn = container.querySelector('#btn-withdraw-res');
  if (withdrawResBtn) {
    withdrawResBtn.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Reservation zurückziehen', message: 'Möchtest du deine Reservation wirklich stornieren und den Termin freigeben?', confirmLabel: 'Stornieren', isDanger: true }))) return;
      if (navigator.vibrate) navigator.vibrate(10);

      withdrawResBtn.disabled = true;
      withdrawResBtn.textContent = 'Wird zurückgezogen...';

      try {
        await reservationEngine.cancelReservation(resId);
        playSwanCelebration({
          title: 'Reservation zurückgezogen',
          subtext: 'Die Termine stehen der Familie nun wieder frei zur Verfügung.'
        });
        setTimeout(close, 2000);
      } catch (err) {
        withdrawResBtn.disabled = false;
        withdrawResBtn.innerHTML = `${PixelCancel} Eigene Reservation zurückziehen`;
        showInlineError(errorEl, err.message || 'Fehler beim Zurückziehen der Reservation.');
      }
    });
  }
}
