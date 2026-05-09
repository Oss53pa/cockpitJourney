/**
 * Rasterize public/cj-icon.svg into the PNG sizes the manifest references
 * (192×192 and 512×512). The PWA spec recommends both sizes as maskable
 * icons; Android adaptive icons crop the central 80%, so we feed the
 * source SVG directly (which has 25% padding around the "CJ" content
 * — well inside the safe zone).
 *
 * Run:  node scripts/pwa/generate-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const SVG = readFileSync(resolve(REPO, 'public', 'cj-icon.svg'), 'utf8');

for (const size of [192, 512]) {
  const png = new Resvg(SVG, { fitTo: { mode: 'width', value: size } }).render().asPng();
  const out = resolve(REPO, 'public', `cj-icon-${size}.png`);
  writeFileSync(out, png);
  console.log(`PNG → ${out}  (${png.length} bytes, ${size}×${size})`);
}
