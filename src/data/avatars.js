/**
 * ChaletWeShare — 2-Tone High-Resolution Bauhaus Pixel Art Avatars (32x32 Grid)
 * Strict Neo-Brutalist design system: Heavy Ink (#0D0D0D) on Stark White (#FFFFFF)
 * Razor-sharp rendering on all screens via SVG shape-rendering="crispEdges"
 */

export const AVATAR_OPTIONS = [
  { id: 'swan', label: 'Schwan' },
  { id: 'fox', label: 'Fuchs' },
  { id: 'bear', label: 'Bär' },
  { id: 'marmot', label: 'Murmeltier' },
  { id: 'owl', label: 'Eule' },
  { id: 'ibex', label: 'Steinbock' },
  { id: 'pinetree', label: 'Tanne' },
  { id: 'cowbell', label: 'Kuhglocke' },
  { id: 'cheese', label: 'Käse' },
  { id: 'edelweiss', label: 'Edelweiss' },
  { id: 'mug', label: 'Kaffeebecher' },
  { id: 'fire', label: 'Lagerfeuer' },
  { id: 'lantern', label: 'Laterne' },
];

export function getAvatarInfo(avatarId) {
  return AVATAR_OPTIONS.find(a => a.id === avatarId) || AVATAR_OPTIONS[0];
}

/**
 * High-definition 32x32 Pixel Art SVG definitions
 */
export const AVATAR_PIXEL_SVGS = {
  // 1. Schwan (Thunersee Swan)
  swan: `
    <rect width="32" height="32" fill="#FFFFFF"/>
    <path fill="#0D0D0D" d="
      M24 9h6v2h-6z M19 6h6v4h-6z M18 10h4v7h-4z
      M12 17h12v7H12z M8 19h16v5H8z M5 16h6v4H5z M3 19h6v3H3z
      M2 26h28v2H2z M6 29h20v1H6z
    "/>
    <path fill="#FFFFFF" d="
      M22 7h2v2h-2z M10 20h8v1h-8z M12 22h5v1h-5z
    "/>
  `,

  // 2. Fuchs (Alpine Fox)
  fox: `
    <rect width="32" height="32" fill="#FFFFFF"/>
    <path fill="#0D0D0D" d="
      M8 2h2v3H8z M6 4h4v7H6z M22 2h2v3h-2z M22 4h4v7h-4z
      M8 8h16v8H8z M4 15h24v6H4z M11 21h10v3h-10z M14 24h4v3h-4z
    "/>
    <path fill="#FFFFFF" d="
      M8 5h2v4H8z M22 5h2v4h-2z
      M5 18h5v3H5z M22 18h5v3h-5z
      M9 13h3v3H9z M20 13h3v3h-3z
      M12 21h8v2h-8z M13 23h6v1h-6z
    "/>
    <path fill="#0D0D0D" d="
      M10 14h2v2h-2z M20 14h2v2h-2z M15 24h2v2h-2z
    "/>
  `,

  // 3. Bär (Bernese Mountain Bear)
  bear: `
    <rect width="32" height="32" fill="#FFFFFF"/>
    <path fill="#0D0D0D" d="
      M5 4h6v6H5z M21 4h6v6h-6z M8 7h16v3H8z
      M6 9h20v16H6z M4 25h24v4H4z
    "/>
    <path fill="#FFFFFF" d="
      M7 6h3v3H7z M22 6h3v3h-3z
      M9 12h4v3H9z M19 12h4v3h-4z
      M11 16h10v8h-10z
    "/>
    <path fill="#0D0D0D" d="
      M10 13h2v2h-2z M20 13h2v2h-2z
      M14 17h4v3h-4z M15 20h2v3h-2z M13 22h6v1h-6z
    "/>
  `,

  // 4. Steinbock (Alpine Ibex with curved ridged horns & beard)
  ibex: `
    <rect width="32" height="32" fill="#FFFFFF"/>
    <path fill="#0D0D0D" d="
      M6 2h5v4H6z M5 4h2v2H5z M8 2h2v2H8z M9 5h4v5H9z M12 9h4v3h-4z
      M21 2h5v4h-5z M25 4h2v2h-2z M22 2h2v2h-2z M19 5h4v5h-4z M16 9h4v3h-4z
      M3 12h5v3H3z M24 12h5v3h-5z
      M11 10h10v12h-10z M13 22h6v3h-6z
      M14 25h4v5h-4z M15 30h2v2h-2z
    "/>
    <path fill="#FFFFFF" d="
      M8 5h2v1H8z M10 8h2v1h-2z M22 5h2v1h-2z M20 8h2v1h-2z
      M10 13h3v2h-3z M19 13h3v2h-3z
      M15 11h2v5h-2z M14 23h1v1h-1z M17 23h1v1h-1z
    "/>
  `,

  // 5. Eule (Wise Owl with large eyes)
  owl: `
    <rect width="32" height="32" fill="#FFFFFF"/>
    <path fill="#0D0D0D" d="
      M6 4h4v5H6z M22 4h4v5h-4z
      M6 8h20v19H6z
      M9 27h5v3H9z M18 27h5v3h-5z
    "/>
    <path fill="#FFFFFF" d="
      M7 10h8v8H7z M17 10h8v8h-8z
      M10 20h3v2h-3z M19 20h3v2h-3z M14 23h4v2h-4z
    "/>
    <path fill="#0D0D0D" d="
      M9 12h4v4H9z M19 12h4v4h-4z
      M14 16h4v3h-4z M15 15h2v5h-2z
    "/>
    <path fill="#FFFFFF" d="
      M10 13h1v1h-1z M20 13h1v1h-1z
    "/>
  `,

  // 6. Murmeltier (Alpine Marmot)
  marmot: `
    <rect width="32" height="32" fill="#FFFFFF"/>
    <path fill="#0D0D0D" d="
      M7 5h4v4H7z M21 5h4v4h-4z
      M7 8h18v19H7z M5 16h22v10H5z
      M8 27h5v3H8z M19 27h5v3h-5z
    "/>
    <path fill="#FFFFFF" d="
      M8 6h2v2H8z M22 6h2v2h-2z
      M9 11h3v3H9z M20 11h3v3h-3z
      M11 15h10v11h-10z
      M14 19h4v2h-4z
    "/>
    <path fill="#0D0D0D" d="
      M10 12h2v2h-2z M20 12h2v2h-2z
      M14 16h4v2h-4z M16 19h1v2h-1z
      M8 20h4v3H8z M20 20h4v3h-4z
    "/>
  `,

  // 7. Tanne (Swiss Pine Tree)
  pinetree: `
    <rect width="32" height="32" fill="#FFFFFF"/>
    <path fill="#0D0D0D" d="
      M15 2h2v3h-2z
      M13 5h6v3h-6z M11 8h10v3h-10z
      M9 11h14v3H9z M7 14h18v4H7z
      M5 18h22v3H5z M3 21h26v4H3z
      M13 25h6v5h-6z
    "/>
    <path fill="#FFFFFF" d="
      M15 3h2v1h-2z
      M13 5h6v1h-6z
      M10 11h12v1h-12z
      M6 18h20v1H6z
      M8 22h3v1H8z M21 22h3v1h-3z
    "/>
  `,

  // 8. Kuhglocke (Swiss Alpine Cowbell with cross)
  cowbell: `
    <rect width="32" height="32" fill="#FFFFFF"/>
    <path fill="#0D0D0D" d="
      M11 2h10v5h-10z
      M9 7h14v4H9z
      M6 11h20v12H6z
      M5 23h22v3H5z
      M14 26h4v3h-4z
    "/>
    <path fill="#FFFFFF" d="
      M13 3h6v3h-6z
      M11 15h10v2h-10z M15 12h2v8h-2z
      M6 23h20v1H6z
    "/>
  `,

  // 9. Käse (Swiss Emmentaler Cheese Wedge)
  cheese: `
    <rect width="32" height="32" fill="#FFFFFF"/>
    <path fill="#0D0D0D" d="
      M5 11h6v3H5z M10 8h8v3h-8z M17 5h9v4h-9z
      M5 14h22v13H5z
    "/>
    <path fill="#FFFFFF" d="
      M6 12h19v1H6z
      M13 16h6v5h-6z
      M7 18h4v4H7z
      M21 16h4v3h-4z
      M15 23h4v2h-4z
    "/>
    <path fill="#0D0D0D" d="
      M14 17h4v3h-4z M8 19h2v2H8z
    "/>
  `,

  // 10. Edelweiss (Alpine Star Flower)
  edelweiss: `
    <rect width="32" height="32" fill="#FFFFFF"/>
    <path fill="#0D0D0D" d="
      M14 3h4v9h-4z M14 20h4v9h-4z
      M3 14h9v4H3z M20 14h9v4h-9z
      M6 6h6v6H6z M20 6h6v6h-6z
      M6 20h6v6H6z M20 20h6v6h-6z
      M12 12h8v8h-8z
    "/>
    <path fill="#FFFFFF" d="
      M15 5h2v6h-2z M15 21h2v6h-2z
      M5 15h6v2H5z M21 15h6v2h-6z
      M8 8h3v3H8z M21 8h3v3h-3z
      M8 21h3v3H8z M21 21h3v3h-3z
      M14 14h1v1h-1z M17 14h1v1h-1z
      M14 17h1v1h-1z M17 17h1v1h-1z
    "/>
  `,

  // 11. Kaffeebecher (Chalet Mug with rising steam)
  mug: `
    <rect width="32" height="32" fill="#FFFFFF"/>
    <path fill="#0D0D0D" d="
      M11 3h3v2h-3z M12 5h2v3h-2z
      M17 2h3v2h-3z M16 4h2v3h-2z M18 7h2v2h-2z
      M7 10h17v16H7z M23 13h6v10h-6z
      M8 26h15v2H8z
    "/>
    <path fill="#FFFFFF" d="
      M8 11h15v1H8z
      M24 15h3v6h-3z
      M11 22h9v1h-9z M13 19h5v3h-5z M15 16h2v3h-2z
    "/>
  `,

  // 12. Lagerfeuer (Chalet Campfire)
  fire: `
    <rect width="32" height="32" fill="#FFFFFF"/>
    <path fill="#0D0D0D" d="
      M15 1h2v2h-2z M11 5h2v2h-2z M20 6h2v2h-2z
      M14 4h4v19h-4z M9 9h5v14H9z M18 10h5v13h-5z
      M6 23h20v2H6z M4 25h24v4H4z
    "/>
    <path fill="#FFFFFF" d="
      M13 14h6v8h-6z M14 11h4v4h-4z
      M5 26h6v1H5z M14 27h8v1h-8z
      M13 9h1v4h-1z M18 10h1v4h-1z
    "/>
  `,

  // 13. Laterne (Vintage Chalet Storm Lantern)
  lantern: `
    <rect width="32" height="32" fill="#FFFFFF"/>
    <path fill="#0D0D0D" d="
      M13 2h6v2h-6z M11 4h2v3h-2z M19 4h2v3h-2z
      M12 5h8v2h-8z M9 7h14v4H9z
      M8 11h16v13H8z M7 24h18v5H7z
    "/>
    <path fill="#FFFFFF" d="
      M10 12h4v11h-4z M18 12h4v11h-4z M14 12h4v11h-4z
      M8 25h16v1H8z
    "/>
    <path fill="#0D0D0D" d="
      M15 14h2v3h-2z M15 17h2v6h-2z
    "/>
  `,
};

/**
 * Returns raw SVG markup for the given avatar ID
 */
export function getAvatarSvg(avatarId) {
  const content = AVATAR_PIXEL_SVGS[avatarId] || AVATAR_PIXEL_SVGS.swan;
  return `<svg viewBox="0 0 32 32" width="100%" height="100%" shape-rendering="crispEdges" class="pixel-art-avatar" style="display: block; width: 100%; height: 100%;">${content}</svg>`;
}

/**
 * Returns a complete Bauhaus pixel avatar badge element
 */
export function renderAvatarMarkup(avatarId, size = 48) {
  const avatar = getAvatarInfo(avatarId);
  const svg = getAvatarSvg(avatar.id);
  
  return `
    <div class="avatar-badge pixel-art" style="width: ${size}px; height: ${size}px; background-color: #FFFFFF;" data-avatar-id="${avatar.id}" title="${avatar.label}">
      ${svg}
    </div>
  `;
}
