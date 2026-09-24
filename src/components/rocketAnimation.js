/**
 * Chalet Alpenrose — Rocket Celebration Animation
 * Powered by anime.js: Shoots a Bauhaus pixel rocket upward with smoke and particle trails.
 */
import anime from 'animejs';
import { escapeHtml } from '../utils/htmlUtils.js';
import { PixelRocket } from '../data/pixelIcons.js';

export function playRocketCelebration({
  text = 'Anfrage gestartet!',
  subtext = 'Veto-Frist für Geschwister läuft'
} = {}) {
  return new Promise((resolve) => {
    // Remove existing if any
    const existing = document.getElementById('rocket-celebration-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'rocket-celebration-overlay';
    overlay.className = 'rocket-overlay';
    overlay.innerHTML = `
      <div class="rocket-launchpad">
        <div class="rocket-trail"></div>
        <div class="rocket-unit">
          <div class="rocket-icon-wrap">
            ${PixelRocket}
          </div>
          <div class="rocket-flame"></div>
        </div>
      </div>
      <div class="rocket-banner">
        <div class="rocket-banner__title">${escapeHtml(text)}</div>
        <div class="rocket-banner__sub">${escapeHtml(subtext)}</div>
      </div>
      <div class="animation-skip-hint">Überspringen</div>
    `;

    document.body.appendChild(overlay);

    const rocketUnit = overlay.querySelector('.rocket-unit');
    const banner = overlay.querySelector('.rocket-banner');
    const trail = overlay.querySelector('.rocket-trail');
    const flame = overlay.querySelector('.rocket-flame');

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
      translateY: [24, 0],
      scale: [0.88, 1],
      duration: 350,
      easing: 'easeOutBack'
    });

    // 2. Flame pulses
    tl.add({
      targets: flame,
      scaleY: [0.7, 1.4, 0.9, 1.5],
      opacity: [0.7, 1, 0.8, 1],
      duration: 1200,
      direction: 'alternate',
      loop: 2
    }, '-=300');

    // 3. Rocket lifts off and accelerates up through the sky
    tl.add({
      targets: rocketUnit,
      translateY: ['60vh', '-120vh'],
      translateX: [
        { value: -4, duration: 200 },
        { value: 5, duration: 200 },
        { value: -3, duration: 200 },
        { value: 2, duration: 300 },
        { value: 0, duration: 500 }
      ],
      duration: 1700,
      easing: 'easeInQuad'
    }, '-=1000');

    // 4. Smoke / trail fades
    tl.add({
      targets: trail,
      height: ['0px', '100vh'],
      opacity: [0, 0.9, 0],
      duration: 1400,
      easing: 'easeOutQuad'
    }, '-=1400');

    // 5. Banner fades out
    tl.add({
      targets: banner,
      opacity: [1, 0],
      translateY: [0, -20],
      duration: 400,
      delay: 600,
      easing: 'easeInQuad'
    });
  });
}
