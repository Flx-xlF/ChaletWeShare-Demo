/**
 * Chalet Alpenrose — Silly Animations Suite
 * Bauhaus-inspired pixel animations with anime.js:
 * 1. Thunderstorm ("Thunersee Sommergewitter")
 * 2. Rocket Launch ("Gipfelstürmer")
 * 3. Sun & Bird ("Morgensonne & Bergdohle")
 * 4. Swan Parade ("Schwanen-Parade")
 * 5. Confetti ("Hüttengaudi")
 */
import anime from 'animejs';
import { escapeHtml } from '../utils/htmlUtils.js';
import { PixelSun, PixelBird, PixelThunder, PixelLightning, PixelRocket, PixelSwan, PixelConfetti } from '../data/pixelIcons.js';
import { playSwanCelebration } from './swanAnimation.js';
import { playRocketCelebration } from './rocketAnimation.js';
import { playConfettiCelebration } from './confettiAnimation.js';

export { playSwanCelebration, playRocketCelebration, playConfettiCelebration };

/**
 * 1. Thunderstorm: Dark skies, flash lightning, raindrops, and screen rumble.
 */
export function playThunderstormAnimation({
  text = 'DONNERWETTER!',
  subtext = 'Sommergewitter über dem Chalet Alpenrose'
} = {}) {
  return new Promise((resolve) => {
    const existing = document.getElementById('silly-thunderstorm-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'silly-thunderstorm-overlay';
    overlay.className = 'storm-overlay';

    // Generate 45 rain streaks
    let rainHtml = '';
    for (let i = 0; i < 45; i++) {
      const left = Math.random() * 100;
      const delay = Math.random() * 400;
      const duration = 400 + Math.random() * 300;
      const height = 18 + Math.random() * 24;
      rainHtml += `<div class="rain-drop" style="left: ${left}vw; top: -40px; height: ${height}px; animation-delay: ${delay}ms; animation-duration: ${duration}ms;"></div>`;
    }

    overlay.innerHTML = `
      <div class="storm-flash"></div>
      <div class="storm-clouds">
        <div class="storm-cloud-icon storm-cloud-1">${PixelThunder}</div>
        <div class="storm-cloud-icon storm-cloud-2">${PixelThunder}</div>
        <div class="storm-cloud-icon storm-cloud-3">${PixelThunder}</div>
      </div>
      <div class="storm-rain-container">${rainHtml}</div>
      <div class="storm-bolt-center">${PixelLightning}</div>
      <div class="storm-banner">
        <div class="storm-banner__title">${escapeHtml(text)}</div>
        <div class="storm-banner__sub">${escapeHtml(subtext)}</div>
      </div>
      <div class="animation-skip-hint">Überspringen</div>
    `;

    document.body.appendChild(overlay);

    const flash = overlay.querySelector('.storm-flash');
    const bolt = overlay.querySelector('.storm-bolt-center');
    const clouds = overlay.querySelectorAll('.storm-cloud-icon');
    const banner = overlay.querySelector('.storm-banner');

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

    // 1. Storm clouds drift in
    tl.add({
      targets: clouds,
      translateY: ['-60px', '0px'],
      opacity: [0, 0.95],
      duration: 400,
      delay: anime.stagger(80),
      easing: 'easeOutQuad'
    });

    // 2. Banner appears
    tl.add({
      targets: banner,
      opacity: [0, 1],
      scale: [0.85, 1],
      duration: 350,
      easing: 'easeOutBack'
    }, '-=150');

    // 3. Lightning flash sequence (strobe effect)
    tl.add({
      targets: flash,
      opacity: [
        { value: 0.9, duration: 60 },
        { value: 0.05, duration: 50 },
        { value: 0.95, duration: 80 },
        { value: 0.1, duration: 60 },
        { value: 0.85, duration: 100 },
        { value: 0, duration: 250 }
      ],
      easing: 'linear'
    }, '+=100');

    // 4. Central lightning bolt strike
    tl.add({
      targets: bolt,
      opacity: [
        { value: 1, duration: 100 },
        { value: 0, duration: 100 },
        { value: 1, duration: 120 },
        { value: 0, duration: 250 }
      ],
      scale: [
        { value: 1.2, duration: 100 },
        { value: 2.2, duration: 220 }
      ],
      duration: 570,
      easing: 'easeOutExpo'
    }, '-=500');

    // Screen rumble effect on banner
    tl.add({
      targets: banner,
      translateX: [
        { value: -12, duration: 45 },
        { value: 12, duration: 45 },
        { value: -8, duration: 50 },
        { value: 8, duration: 50 },
        { value: -4, duration: 50 },
        { value: 0, duration: 50 }
      ],
      easing: 'linear'
    }, '-=400');

    // Fade out after hold
    tl.add({
      targets: [overlay, banner],
      opacity: [1, 0],
      duration: 500,
      delay: 1600,
      easing: 'easeInQuad'
    });
  });
}

/**
 * 2. Sun & Bird: Golden Bauhaus sun rising and rotating with cute mountain bird swooping.
 */
export function playSunAndBirdAnimation({
  text = 'GUTEN MORGEN!',
  subtext = 'Kaiserwetter über dem Thunersee'
} = {}) {
  return new Promise((resolve) => {
    const existing = document.getElementById('silly-sun-bird-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'silly-sun-bird-overlay';
    overlay.className = 'sun-overlay';

    overlay.innerHTML = `
      <div class="sun-glow"></div>
      <div class="sun-mountains">
        <svg class="alps-silhouette" viewBox="0 0 500 120" preserveAspectRatio="none">
          <polygon points="0,120 70,40 140,120 220,20 310,120 400,35 500,120" fill="#000000" />
          <polygon points="50,120 110,60 180,120 270,45 350,120 430,65 500,120" fill="#FA0080" opacity="0.3" />
        </svg>
      </div>
      <div class="sun-unit">
        <div class="sun-icon-wrap">${PixelSun}</div>
      </div>
      <div class="bird-unit">
        <div class="bird-icon-wrap">${PixelBird}</div>
      </div>
      <div class="sun-banner">
        <div class="sun-banner__title">${escapeHtml(text)}</div>
        <div class="sun-banner__sub">${escapeHtml(subtext)}</div>
      </div>
      <div class="animation-skip-hint">Überspringen</div>
    `;

    document.body.appendChild(overlay);

    const sunUnit = overlay.querySelector('.sun-unit');
    const sunIcon = overlay.querySelector('.sun-icon-wrap');
    const birdUnit = overlay.querySelector('.bird-unit');
    const banner = overlay.querySelector('.sun-banner');
    const glow = overlay.querySelector('.sun-glow');

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

    // 1. Sun rises from mountain ridge
    tl.add({
      targets: sunUnit,
      translateY: ['80px', '0px'],
      scale: [0.7, 1.2],
      opacity: [0, 1],
      duration: 800,
      easing: 'easeOutCubic'
    });

    // Sun rays spin gracefully
    anime({
      targets: sunIcon,
      rotate: 360,
      duration: 6000,
      loop: true,
      easing: 'linear'
    });

    // Warm morning glow expands
    tl.add({
      targets: glow,
      opacity: [0, 0.85],
      scale: [0.8, 1.3],
      duration: 800,
      easing: 'easeOutQuad'
    }, '-=700');

    // 2. Banner pops in
    tl.add({
      targets: banner,
      opacity: [0, 1],
      translateY: [24, 0],
      scale: [0.88, 1],
      duration: 400,
      easing: 'easeOutBack'
    }, '-=400');

    // 3. Mountain bird swoops playfully across the sky
    tl.add({
      targets: birdUnit,
      translateX: ['-100px', `${window.innerWidth + 80}px`],
      translateY: [
        { value: 50, duration: 500 },
        { value: -30, duration: 600 },
        { value: 20, duration: 600 },
        { value: -20, duration: 500 }
      ],
      rotate: [
        { value: 15, duration: 500 },
        { value: -12, duration: 600 },
        { value: 8, duration: 600 },
        { value: -5, duration: 500 }
      ],
      duration: 2200,
      easing: 'easeInOutSine'
    }, '-=300');

    // Fade out after hold
    tl.add({
      targets: [overlay, banner],
      opacity: [1, 0],
      duration: 500,
      delay: 1400,
      easing: 'easeInQuad'
    });
  });
}

/**
 * 5 Animation Specs for Menu / Direct Trigger
 */
export const SILLY_ANIMATIONS = [
  {
    id: 'thunderstorm',
    name: 'Gewitter-Vibes',
    icon: PixelThunder,
    play: playThunderstormAnimation
  },
  {
    id: 'rocket',
    name: 'Feuerwerk des Todes',
    icon: PixelRocket,
    play: playRocketCelebration
  },
  {
    id: 'sun',
    name: 'Morgenrot am Limit',
    icon: PixelSun,
    play: playSunAndBirdAnimation
  },
  {
    id: 'swan',
    name: 'Schwanen-Flex',
    icon: PixelSwan,
    play: playSwanCelebration
  },
  {
    id: 'confetti',
    name: 'Hüttengaudi over 9000',
    icon: PixelConfetti,
    play: playConfettiCelebration
  }
];

/**
 * Play a random silly animation
 */
export function playRandomSillyAnimation() {
  const index = Math.floor(Math.random() * SILLY_ANIMATIONS.length);
  const choice = SILLY_ANIMATIONS[index];

  const presets = {
    thunderstorm: [
      { text: 'DONNERWETTER!', subtext: 'Sommergewitter über dem Chalet Alpenrose' },
      { text: 'BLITZ & DONNER!', subtext: 'Naturerlebnis am Thunersee' }
    ],
    rocket: [
      { text: 'GIPFELSTÜRMER!', subtext: 'Mit Vollgas Richtung Blüemlisalp' },
      { text: 'ABFLUG!', subtext: 'Raketenstart am Thunersee' }
    ],
    sun: [
      { text: 'GUTEN MORGEN!', subtext: 'Kaiserwetter & Bergdohlen' },
      { text: 'SONNENSCHEIN!', subtext: 'Ein herrlicher Tag im Chalet' }
    ],
    swan: [
      { text: 'SCHWANEN-PARADE!', subtext: 'Der König des Thunersees' },
      { text: 'MAJESTÄTISCH!', subtext: 'Ein Gruss von der Seepromenade' }
    ],
    confetti: [
      { text: 'HÜTTENGAUDI!', subtext: 'Das ganze Chalet feiert mit!' },
      { text: 'KONFETTI-ALARM!', subtext: 'Bauhaus-Party am Thunersee' }
    ]
  };

  const pool = presets[choice.id] || [{ text: choice.name, subtext: 'Chalet Alpenrose — Thunersee' }];
  const pickedText = pool[Math.floor(Math.random() * pool.length)];

  return choice.play(pickedText);
}
