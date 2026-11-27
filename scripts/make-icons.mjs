// Draws the Beam Roller icon as SVG and renders the PNGs that
// `npx capacitor-assets generate --android` turns into every Android icon and splash size.
// Output: assets/ (Capacitor inputs) and assets/store-icon-512.png (Play Store listing icon).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const S = 1024; // icon design size

const BG = `
  <defs>
    <radialGradient id="sky" cx="50%" cy="30%" r="80%">
      <stop offset="0" stop-color="#26306a"/>
      <stop offset="0.55" stop-color="#121a3c"/>
      <stop offset="1" stop-color="#0b1020"/>
    </radialGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#sky)"/>
  ${[[150, 170, 3], [300, 110, 2], [820, 150, 3], [900, 300, 2], [130, 380, 2], [760, 90, 2], [560, 140, 2], [880, 520, 2]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#dfe4ff" opacity="0.7"/>`).join('')}`;

// Everything important stays inside the adaptive-icon safe circle (r ≈ 340 around the centre).
const FG = `
  <defs>
    <linearGradient id="beamTop" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#7f8cff"/>
      <stop offset="1" stop-color="#4654e0"/>
    </linearGradient>
    <linearGradient id="beamSide" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3341b8"/>
      <stop offset="1" stop-color="#1c2470"/>
    </linearGradient>
    <radialGradient id="ball" cx="36%" cy="32%" r="70%">
      <stop offset="0" stop-color="#ffe3a8"/>
      <stop offset="0.35" stop-color="#f0a04b"/>
      <stop offset="0.8" stop-color="#b4581c"/>
      <stop offset="1" stop-color="#6e3010"/>
    </radialGradient>
    <radialGradient id="goalGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#8dffbd" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#2ecc71" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="shadow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#05081a" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#05081a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- goal glow at the far end of the beam -->
  <circle cx="660" cy="300" r="110" fill="url(#goalGlow)"/>
  <ellipse cx="660" cy="318" rx="46" ry="14" fill="none" stroke="#5dff9e" stroke-width="9"/>
  <!-- beam: side face, then top face, in perspective toward the goal -->
  <polygon points="700,322 720,330 560,1024 470,1024" fill="url(#beamSide)"/>
  <polygon points="640,316 700,322 470,1024 170,1024" fill="url(#beamTop)"/>
  <polygon points="640,316 700,322 470,1024 170,1024" fill="none" stroke="#c3caff" stroke-width="5" stroke-linejoin="round" opacity="0.8"/>
  <!-- centre stripe -->
  <polygon points="668,330 674,330 330,1024 312,1024" fill="#c3caff" opacity="0.35"/>
  <!-- ball and its shadow -->
  <ellipse cx="478" cy="676" rx="150" ry="40" fill="url(#shadow)"/>
  <circle cx="470" cy="548" r="138" fill="url(#ball)"/>
  <ellipse cx="420" cy="480" rx="44" ry="26" fill="#fff6e0" opacity="0.75" transform="rotate(-30 420 480)"/>
  <!-- motion streaks trailing the ball, parallel to the beam -->
  <path d="M318 590 l-34 96 M282 520 l-48 134 M352 662 l-26 72" stroke="#c3caff" stroke-width="12" stroke-linecap="round" opacity="0.6"/>`;

const svg = (body, size = S, viewBox = `0 0 ${S} ${S}`) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">${body}</svg>`);

mkdirSync('assets', { recursive: true });
const full = `${BG}${FG}`;
await sharp(svg(full)).png().toFile('assets/icon-only.png');
await sharp(svg(BG)).png().toFile('assets/icon-background.png');
await sharp(svg(FG)).png().toFile('assets/icon-foreground.png');
await sharp(svg(full, 512)).png().toFile('assets/store-icon-512.png');

// Splash: the icon art, small and centred, on the game's background colour.
const SPL = 2732, ICON = 900;
const art = await sharp(svg(full, ICON)).png().toBuffer();
const rounded = await sharp(art)
  .composite([{ input: Buffer.from(`<svg width="${ICON}" height="${ICON}"><rect width="${ICON}" height="${ICON}" rx="200" fill="#fff"/></svg>`), blend: 'dest-in' }])
  .png().toBuffer();
for (const name of ['splash.png', 'splash-dark.png']) {
  await sharp({ create: { width: SPL, height: SPL, channels: 4, background: '#0b1020' } })
    .composite([{ input: rounded, gravity: 'center' }])
    .png().toFile(`assets/${name}`);
}
console.log('Wrote assets/icon-only.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png, store-icon-512.png');
