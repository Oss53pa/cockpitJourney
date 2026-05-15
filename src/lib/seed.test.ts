import { describe, it, expect } from 'vitest';
import { extractNameFromEmail, computeInitials } from './seed';

describe('extractNameFromEmail', () => {
  it('handles dot-separated locals', () => {
    expect(extractNameFromEmail('jean.dupont@example.com')).toBe('Jean Dupont');
  });

  it('handles underscore-separated locals', () => {
    expect(extractNameFromEmail('marie_curie@example.com')).toBe('Marie Curie');
  });

  it('handles hyphen-separated locals', () => {
    expect(extractNameFromEmail('marie-curie@example.com')).toBe('Marie Curie');
  });

  it('appends a dot to single-letter parts (initial style)', () => {
    expect(extractNameFromEmail('j.dupont@example.com')).toBe('J. Dupont');
    expect(extractNameFromEmail('a.b.c@example.com')).toBe('A. B. C.');
  });

  it('falls back to "Vous" for empty input', () => {
    expect(extractNameFromEmail('')).toBe('Vous');
  });

  it('returns "Vous" if local part is only separators', () => {
    expect(extractNameFromEmail('___@x.com')).toBe('Vous');
  });

  it('handles a single-word local', () => {
    expect(extractNameFromEmail('admin@example.com')).toBe('Admin');
  });

  it('handles African names with multiple parts', () => {
    expect(extractNameFromEmail('pamela.atokouna@yahoo.com')).toBe('Pamela Atokouna');
    expect(extractNameFromEmail('koffi.jean@ci.example')).toBe('Koffi Jean');
  });
});

describe('computeInitials', () => {
  it('takes first letter of first and last word for multi-word names', () => {
    expect(computeInitials('Pamela Atokouna')).toBe('PA');
    expect(computeInitials('Jean Dupont')).toBe('JD');
  });

  it('returns the first 2 chars upcased for single-word names', () => {
    expect(computeInitials('Admin')).toBe('AD');
    expect(computeInitials('Vous')).toBe('VO');
  });

  it('handles three-word names (first + last)', () => {
    expect(computeInitials('Marie Antoinette Curie')).toBe('MC');
  });

  it('returns "V" for empty input (matches the seed default)', () => {
    expect(computeInitials('')).toBe('V');
    expect(computeInitials('   ')).toBe('V');
  });

  it('upcases lowercase input', () => {
    expect(computeInitials('pamela atokouna')).toBe('PA');
  });

  it('preserves capitalization-only diff', () => {
    expect(computeInitials('PAMELA ATOKOUNA')).toBe('PA');
  });

  it('handles single-char single-word edge case (slice).toUpperCase)', () => {
    expect(computeInitials('X')).toBe('X');
  });
});
