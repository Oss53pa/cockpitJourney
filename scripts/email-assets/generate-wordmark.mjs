/**
 * Generate the CockpitJourney email wordmark as PNG (text outlined to
 * Bezier paths so it renders pixel-perfect Grand Hotel even where the
 * font isn't installed — i.e. every email client on earth).
 *
 * Usage:
 *   1. Download the font (gitignored, pulled on demand):
 *        curl -sL https://github.com/google/fonts/raw/main/ofl/grandhotel/GrandHotel-Regular.ttf \
 *          -o scripts/email-assets/GrandHotel-Regular.ttf
 *   2. node scripts/email-assets/generate-wordmark.mjs
 *
 * Outputs:
 *   public/cj-wordmark.png       — main email logo (full word)
 *   public/cj-wordmark@2x.png    — retina version
 *   public/cj-wordmark.svg       — sources / for the marketing site
 *
 * Once committed + pushed to main, the PNG is served by the jsDelivr
 * CDN at:
 *   https://cdn.jsdelivr.net/gh/Oss53pa/cockpitJourney@main/public/cj-wordmark.png
 *
 * That's the URL the e-mail template references.
 *
 * Brand: "Cockpit" in atlas-fg-1 (#1A1D17), "Journey" in atlas-sage-deep
 * (#6E8B58). Matches the in-app navbar logo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// Brand colors (mirror tailwind.config.js)
const COLOR_FG = '#1A1D17';        // atlas-fg-1
const COLOR_SAGE = '#6E8B58';      // atlas-sage-deep

// Geometry — chosen so the rendered text @ 1× looks great at 240px wide
// in the e-mail (which is the max width we serve, with @2x for retina).
const FONT_SIZE = 88;              // ascent target ~ 88px Grand Hotel
const PADDING_X = 6;               // breathing room either side
const PADDING_Y = 4;
const RENDER_SCALE_2X = 2;

const fontPath = resolve(__dirname, 'GrandHotel-Regular.ttf');
// opentype.js >= 1.3.4 deprecates loadSync — use parse(Buffer) instead.
const font = opentype.parse(readFileSync(fontPath).buffer);

/** Render text → SVG path data + measured advance width. */
function textToPath(text, x, y, color) {
  const path = font.getPath(text, x, y, FONT_SIZE);
  const advance = font.getAdvanceWidth(text, FONT_SIZE);
  return {
    d: path.toPathData(2),
    advance,
    color,
  };
}

// Compose "Cockpit" + "Journey" with a subtle visual seam — same as the
// in-app logo treatment.
const cockpit = textToPath('Cockpit', 0, 0, COLOR_FG);
// Slight negative letterspacing-style offset so "Journey" tucks into the
// trailing curve of the "t" in Cockpit, like the navbar word does.
const KERN = -2;
const journey = textToPath('Journey', cockpit.advance + KERN, 0, COLOR_SAGE);

const totalAdvance = cockpit.advance + KERN + journey.advance;

// Use the font's bounding box to figure out the canvas height.
const bbox = font.getPath('CockpitJourney', 0, 0, FONT_SIZE).getBoundingBox();
const ascent = -bbox.y1; // y1 is negative for ascenders
const descent = bbox.y2;
const textHeight = ascent + descent;

// SVG canvas
const svgWidth = Math.ceil(totalAdvance + PADDING_X * 2);
const svgHeight = Math.ceil(textHeight + PADDING_Y * 2);
const baselineY = ascent + PADDING_Y;

const svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" role="img" aria-label="CockpitJourney">
  <title>CockpitJourney</title>
  <g transform="translate(${PADDING_X}, ${baselineY})">
    <path fill="${cockpit.color}" d="${cockpit.d}"/>
    <path fill="${journey.color}" d="${journey.d}"/>
  </g>
</svg>
`;

// Write SVG source
const svgOut = resolve(REPO_ROOT, 'public', 'cj-wordmark.svg');
writeFileSync(svgOut, svg, 'utf8');
console.log(`SVG  → ${svgOut} (${svgWidth}×${svgHeight})`);

/** Render SVG → PNG at the given device-pixel ratio. */
function renderPng(scale) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: scale },
    background: 'rgba(0,0,0,0)', // transparent
  });
  return resvg.render().asPng();
}

const png1x = renderPng(1);
const png2x = renderPng(RENDER_SCALE_2X);

const png1xOut = resolve(REPO_ROOT, 'public', 'cj-wordmark.png');
const png2xOut = resolve(REPO_ROOT, 'public', 'cj-wordmark@2x.png');
writeFileSync(png1xOut, png1x);
writeFileSync(png2xOut, png2x);
console.log(`PNG  → ${png1xOut}     (${png1x.length} bytes)`);
console.log(`PNG² → ${png2xOut}    (${png2x.length} bytes, 2x retina)`);

console.log('\nDone. Commit /public/cj-wordmark.{png,@2x.png,svg} and the e-mail template can reference them via jsDelivr.');
