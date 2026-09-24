/**
 * Chalet Alpenrose — Bauhaus Confetti Celebration Animation
 * Powered by anime.js: Shoots colorful geometric confetti across the viewport.
 */
import anime from 'animejs';
import { escapeHtml } from '../utils/htmlUtils.js';

export function playConfettiCelebration({
  text = 'Reservation bestätigt!',
  subtext = 'Chalet Alpenrose — Thunersee'
} = {}) {
  return new Promise((resolve) => {
    // Remove existing if any
    const existing = document.getElementById('confetti-celebration-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'confetti-celebration-overlay';
    overlay.className = 'confetti-overlay';

    // Generate 50 Bauhaus confetti shapes: squares, bars, crosses
    const colors = ['#FA0080', '#000000', '#2ECC71', '#3498DB', '#F1C40F', '#E74C3C'];
    let particlesHtml = '';
    for (let i = 0; i < 55; i++) {
      const color = colors[i % colors.length];
      const isCircle = i % 4 === 0;
      const isBar = i % 3 === 0;
      const size = Math.floor(Math.random() * 8) + 8; // 8 to 16px
      const radius = isCircle ? '50%' : '0px';
      const width = isBar ? `${size * 2}px` : `${size}px`;
      const height = `${size}px`;

      particlesHtml += `
        <div class="confetti-particle" style="
          position: absolute;
          left: ${Math.random() * 96 + 2}vw;
          top: -20px;
          width: ${width};
          height: ${height};
          background-color: ${color};
          border-radius: ${radius};
          border: 1px solid rgba(0,0,0,0.3);
          transform: rotate(${Math.random() * 360}deg);
        "></div>
      `;
    }

    overlay.innerHTML = `
      <div class="confetti-sky">${particlesHtml}</div>
      <div class="confetti-banner">
        <div class="confetti-banner__title">${escapeHtml(text)}</div>
        <div class="confetti-banner__sub">${escapeHtml(subtext)}</div>
      </div>
      <div class="animation-skip-hint">Überspringen</div>
    `;

    document.body.appendChild(overlay);

    const banner = overlay.querySelector('.confetti-banner');
    const particles = overlay.querySelectorAll('.confetti-particle');

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
      scale: [0.85, 1],
      duration: 380,
      easing: 'easeOutBack'
    });

    // 2. Confetti rains down and tumbles
    tl.add({
      targets: particles,
      translateY: () => [0, window.innerHeight + 60],
      translateX: () => [0, (Math.random() - 0.5) * 160],
      rotate: () => (Math.random() - 0.5) * 720,
      opacity: [1, 1, 0.9, 0],
      duration: () => Math.random() * 1000 + 1600,
      delay: anime.stagger(18),
      easing: 'easeOutSine'
    }, '-=300');

    // 3. Banner fades out
    tl.add({
      targets: banner,
      opacity: [1, 0],
      translateY: [0, -20],
      duration: 400,
      delay: 800,
      easing: 'easeInQuad'
    });
  });
}
