// Génère les icônes de l'app (PNG) à partir d'un dessin SVG : une fourchette et un verre de vin, sur le vert marché.
// Usage : node scripts/icons.mjs   (les PNG sont versionnés dans public/icons, à relancer seulement si le dessin change)
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = '#2C6A49';
const PAPER = '#F2EEE3';
const WINE = '#C9566A';

// Dessin dans un carré 100×100 : fourchette à gauche, verre à droite (le vin en rose bordeaux).
const art = `
  <g fill="${PAPER}">
    <rect x="27" y="22" width="3.2" height="17" rx="1.6"/><rect x="32.4" y="22" width="3.2" height="17" rx="1.6"/>
    <rect x="37.8" y="22" width="3.2" height="17" rx="1.6"/>
    <path d="M26 36h16v5.5c0 4-3.2 6.8-6.3 7.3v27.2a1.7 1.7 0 0 1-3.4 0V48.8c-3.1-.5-6.3-3.3-6.3-7.3z"/>
  </g>
  <path d="M55 22h22c1 9-.6 17.5-6.4 21.5-1.8 1.3-3.2 2-3.2 4.5v22.5h7.6a2 2 0 0 1 0 4H56a2 2 0 0 1 0-4h7.6V48c0-2.5-1.4-3.2-3.2-4.5C54.6 39.5 54 31 55 22z" fill="${PAPER}"/>
  <path d="M56.6 31h18.8c-.4 5.2-2 9.4-5.8 11.4-1.5.8-2.6 1.6-3.6 1.6s-2.1-.8-3.6-1.6c-3.8-2-5.4-6.2-5.8-11.4z" fill="${WINE}"/>`;

/** rounded : coins arrondis (icône « any ») ; scale : réduction du dessin (zone de sécurité des icônes « maskable »). */
const svg = ({ rounded, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" ${rounded ? 'rx="22"' : ''} fill="${BG}"/>
  <g transform="translate(50 50) scale(${scale}) translate(-50 -48)">${art}</g></svg>`;

mkdirSync('public/icons', { recursive: true });
const out = [
  ['icon-192.png', 192, { rounded: true, scale: 1 }],
  ['icon-512.png', 512, { rounded: true, scale: 1 }],
  ['maskable-512.png', 512, { rounded: false, scale: 0.72 }],
  ['apple-touch-icon.png', 180, { rounded: false, scale: 0.9 }],
];
for (const [name, size, opts] of out) {
  await sharp(Buffer.from(svg(opts))).resize(size, size).png({ compressionLevel: 9 }).toFile(`public/icons/${name}`);
  console.log('✓', name);
}
writeFileSync('public/favicon.svg', svg({ rounded: true, scale: 1 }).replace(/\n\s*/g, ''));
console.log('✓ favicon.svg');
