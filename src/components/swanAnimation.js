/**
 * Chalet Zahler — Swan Celebration Animation
 * Powered by anime.js: Glides a majestic Thunersee swan across the screen with water ripples.
 */
import anime from 'animejs';
import { escapeHtml } from '../utils/htmlUtils.js';

export function playSwanCelebration({
  text = 'Reservation eingereicht!',
  subtext = 'Chalet Zahler — Thunersee'
} = {}) {
  return new Promise((resolve) => {
    // Remove existing if any
    const existing = document.getElementById('swan-celebration-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'swan-celebration-overlay';
    overlay.className = 'swan-overlay';
    overlay.innerHTML = `
      <div class="swan-lake">
        <div class="swan-lake__ripples"></div>
        <div class="swan-unit">
          <img src="./sprites/swan.png" alt="Schwan" class="swan-sprite pixel-art" />
          <div class="swan-wake"></div>
        </div>
      </div>
      <div class="swan-banner">
        <div class="swan-banner__title">${escapeHtml(text)}</div>
        <div class="swan-banner__sub">${escapeHtml(subtext)}</div>
      </div>
      <div class="animation-skip-hint">Überspringen</div>
    `;

    document.body.appendChild(overlay);

    const swanUnit = overlay.querySelector('.swan-unit');
    const banner = overlay.querySelector('.swan-banner');
    const ripples = overlay.querySelector('.swan-lake__ripples');

    const tl = anime.timeline({
      easing: 'easeInOutQuad',
      complete: () => {
        if (document.body.contains(overlay)) overlay.remove();
        resolve();
      }
    });

    overlay.addEventListener('click', () => {
      tl.pause();
      if (document.body.contains(overlay)) overlay.remove();
      resolve();
    });

    // 1. Banner pops in
    tl.add({
      targets: banner,
      opacity: [0, 1],
      translateY: [20, 0],
      scale: [0.9, 1],
      duration: 350,
      easing: 'easeOutBack'
    });

    // 2. Swan glides across the screen from left to right with water bobbing
    tl.add({
      targets: swanUnit,
      translateX: ['-120px', `${window.innerWidth + 40}px`],
      translateY: [
        { value: -8, duration: 450 },
        { value: 4, duration: 500 },
        { value: -10, duration: 500 },
        { value: 2, duration: 500 },
        { value: -6, duration: 550 }
      ],
      duration: 2500,
      easing: 'linear'
    }, '-=200');

    // 3. Water ripples pulse
    tl.add({
      targets: ripples,
      opacity: [0, 0.8, 0],
      duration: 2200,
      easing: 'linear'
    }, '-=2400');

    // 4. Banner stays, then fades out
    tl.add({
      targets: banner,
      opacity: [1, 0],
      translateY: [0, -15],
      duration: 400,
      delay: 1000,
      easing: 'easeInQuad'
    });
  });
}
