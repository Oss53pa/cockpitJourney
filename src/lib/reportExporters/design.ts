/**
 * Shared design system for the 4 export formats.
 *
 * The goal: every PDF/DOCX/PPTX/XLSX produced by CockpitJourney looks
 * like the same family of executive deliverables — a Big-4 style report
 * with cover, table of contents, section dividers, running header/footer,
 * and a thank-you closing page. This module concentrates all the colors,
 * type scale, margin, copy strings, and a few helpers so the format-
 * specific exporters stay focused on layout.
 */
import type { Report } from '../../stores/appStore';
import type { SectionKey } from './types';
import { SECTION_LABELS } from './types';

/* ───────── Brand colors (mirrors tailwind.config.js) ───────── */
export const C = {
  // Hex (with #), used by jsPDF/pptxgenjs `setFillColor` / `color` props
  brand: '#52693F', // atlas-sage-deeper — primary brand
  brandSoft: '#6E8B58', // atlas-sage-deep
  brandLight: '#95B07D', // atlas-sage
  brandGlow: '#C8DBAE', // atlas-sage-glow
  cream: '#F4F2E9', // atlas-cream
  creamLight: '#FBFAF4', // atlas-ink
  panel: '#F8F6EE', // atlas-panel-2
  line: '#DCD9CB', // atlas-line
  lineSoft: '#E8E3D0', // softer line
  fg1: '#1A1D17', // atlas-fg-1 (primary text)
  fg2: '#3F443A', // atlas-fg-2
  fg3: '#7A8071', // atlas-fg-3 (muted)
  fg4: '#B5AB8E', // very muted (footer text)
  red: '#B85B4D',
  yellow: '#B69248',
  green: '#4D9A6A',
  blue: '#5C7BA1',
};

/** Same colors as `C` but without the leading #, suitable for `docx` and `pptxgenjs` */
export const HX = Object.fromEntries(
  Object.entries(C).map(([k, v]) => [k, v.startsWith('#') ? v.slice(1) : v])
) as Record<keyof typeof C, string>;

/* ───────── Type scale (in points, jsPDF-style) ───────── */
export const TYPE = {
  brandTag: 9, // small "COCKPITJOURNEY · ATLAS STUDIO"
  eyebrow: 9, // section eyebrow uppercase
  micro: 8, // footer / running header
  small: 9,
  body: 10,
  bodyBold: 10.5,
  h3: 13,
  h2: 16,
  h1: 22,
  cover: 36,
  coverBig: 48,
};

/* ───────── Page geometry (jsPDF, pt) ───────── */
export const PAGE = {
  marginTop: 96, // breathing room — same on cover and body
  marginBottom: 72,
  marginLeft: 64,
  marginRight: 64,
  // Running header height + footer height reserved on body pages
  runningHeader: 28,
  runningFooter: 24,
};

/* ───────── Copy strings (FR) ───────── */
export const COPY = {
  brand: 'CockpitJourney',
  studio: 'Atlas Studio',
  brandLong: 'CockpitJourney · Atlas Studio',
  confidential: 'Document confidentiel · ne pas redistribuer',
  thanks: 'Merci.',
  thanksSub:
    'Vos retours rendent ce cockpit meilleur. Pour toute question sur ce rapport, contactez votre référent Atlas Studio.',
  contact: 'support@atlas-studio.org',
  website: 'cockpitjourney.app',
  studioWebsite: 'atlas-studio.org',
  toc: 'Sommaire',
  preparedBy: 'Préparé par',
  generatedOn: 'Généré le',
  reportFor: 'Rapport pour',
  classification: 'CONFIDENTIEL',
  poweredBy: "Propulsé par PROPH3T · l'IA d'Atlas Studio",
  legal:
    'Ce document contient des informations confidentielles destinées exclusivement aux destinataires désignés. Toute reproduction, distribution ou utilisation non autorisée est strictement interdite.',
};

/* ───────── Helpers ───────── */

/**
 * Build a numbered table of contents from the chosen sections.
 * The cover, sommaire and closing pages are not in the TOC themselves.
 */
export function buildToc(sections: SectionKey[]): { number: string; label: string; key: SectionKey }[] {
  // Filter out non-content sections from the TOC
  const contentKeys = sections.filter((k) => k !== 'cover');
  return contentKeys.map((k, i) => ({
    number: String(i + 1).padStart(2, '0'),
    label: SECTION_LABELS[k],
    key: k,
  }));
}

/**
 * Stable "doc reference" string used in the running footer + closing
 * page. Format: CJ-2026-W19-A1B2 — looks like a real document ID.
 */
export function buildDocRef(report: Report): string {
  const date = new Date(report.generatedAt);
  const yr = date.getFullYear();
  const w = isoWeek(date);
  const hash = report.id
    .replace(/[^a-z0-9]/gi, '')
    .slice(-4)
    .toUpperCase()
    .padEnd(4, 'X');
  const kindLetter = report.kind[0].toUpperCase();
  return `CJ-${yr}-${kindLetter}${w.toString().padStart(2, '0')}-${hash}`;
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/**
 * Fetch the CockpitJourney wordmark PNG from /cj-wordmark.png and return
 * it as a base64 data URL. Used by exporters that can embed images
 * (PDF + PPTX). Cached after first load.
 */
let wordmarkCache: Promise<string> | null = null;

export function loadWordmarkDataUrl(): Promise<string> {
  if (wordmarkCache) return wordmarkCache;
  wordmarkCache = (async () => {
    try {
      const res = await fetch('/cj-wordmark.png');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch {
      return ''; // gracefully degrade — exporter falls back to text-only
    }
  })();
  return wordmarkCache;
}

/** Strip markdown to plain text for prose blocks. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '');
}

/** Convert "#RRGGBB" → [r,g,b] tuple for jsPDF setFillColor / setTextColor. */
export function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const expanded =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(expanded, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
