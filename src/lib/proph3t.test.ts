import { describe, it, expect } from 'vitest';
import { normalizeBlock, PROVIDERS, ProphClient, ProphNotConfiguredError } from './proph3t';

describe('normalizeBlock', () => {
  it('parses a valid block', () => {
    const out = normalizeBlock({
      startTime: '08:00',
      durationMinutes: 90,
      label: 'Deep Work · Daily Brief Q3 plan',
      kind: 'focus',
      taskId: 't-123',
      rationale: 'High-priority customer impact',
    });
    expect(out).not.toBeNull();
    expect(out!.startTime).toBe('08:00');
    expect(out!.durationMinutes).toBe(90);
    expect(out!.kind).toBe('focus');
    expect(out!.taskId).toBe('t-123');
  });

  it('left-pads single-digit hours', () => {
    const out = normalizeBlock({
      startTime: '9:00',
      durationMinutes: 30,
      label: 'Quick task',
      kind: 'task',
    });
    expect(out!.startTime).toBe('09:00');
  });

  it('clamps hours > 23 to 23', () => {
    const out = normalizeBlock({
      startTime: '99:00',
      durationMinutes: 30,
      label: 'X',
      kind: 'task',
    });
    expect(out!.startTime).toBe('23:00');
  });

  it('clamps minutes > 59 to 59', () => {
    const out = normalizeBlock({
      startTime: '12:99',
      durationMinutes: 30,
      label: 'X',
      kind: 'task',
    });
    expect(out!.startTime).toBe('12:59');
  });

  it('clamps positive but tiny durations to 5 minutes', () => {
    expect(
      normalizeBlock({ startTime: '08:00', durationMinutes: 3, label: 'X', kind: 'focus' })!.durationMinutes
    ).toBe(5);
  });

  it('clamps huge durations to 240 minutes', () => {
    expect(
      normalizeBlock({ startTime: '08:00', durationMinutes: 9999, label: 'X', kind: 'focus' })!
        .durationMinutes
    ).toBe(240);
  });

  it('rejects 0-duration blocks as null (treated as "missing")', () => {
    // The current implementation treats `0` as missing via `!durationMinutes`.
    // This is documented behavior; the LLM should never propose zero-minute
    // blocks, and if it does we'd rather drop them than render a 5-min stub.
    expect(normalizeBlock({ startTime: '08:00', durationMinutes: 0, label: 'X', kind: 'focus' })).toBeNull();
  });

  it('falls back to "admin" for unknown kinds (defensive against new LLM outputs)', () => {
    const out = normalizeBlock({
      startTime: '10:00',
      durationMinutes: 30,
      label: 'X',
      kind: 'made-up-kind-by-llm',
    });
    expect(out!.kind).toBe('admin');
  });

  it('returns null when startTime is missing', () => {
    expect(normalizeBlock({ durationMinutes: 30, label: 'X', kind: 'task' })).toBeNull();
  });

  it('returns null when duration is missing', () => {
    expect(normalizeBlock({ startTime: '08:00', label: 'X', kind: 'task' })).toBeNull();
  });

  it('returns null when label is missing', () => {
    expect(normalizeBlock({ startTime: '08:00', durationMinutes: 30, kind: 'task' })).toBeNull();
  });

  it("returns null when startTime doesn't match HH:MM", () => {
    expect(
      normalizeBlock({ startTime: 'eight am', durationMinutes: 30, label: 'X', kind: 'task' })
    ).toBeNull();
  });

  it('truncates labels to 80 chars', () => {
    const longLabel = 'A'.repeat(200);
    const out = normalizeBlock({
      startTime: '08:00',
      durationMinutes: 30,
      label: longLabel,
      kind: 'task',
    });
    expect(out!.label.length).toBe(80);
  });

  it('truncates rationale to 120 chars', () => {
    const longRationale = 'B'.repeat(500);
    const out = normalizeBlock({
      startTime: '08:00',
      durationMinutes: 30,
      label: 'X',
      kind: 'task',
      rationale: longRationale,
    });
    expect(out!.rationale!.length).toBe(120);
  });

  it('omits taskId when not a string', () => {
    const out = normalizeBlock({
      startTime: '08:00',
      durationMinutes: 30,
      label: 'X',
      kind: 'task',
      taskId: 42,
    });
    expect(out!.taskId).toBeUndefined();
  });
});

describe('PROVIDERS', () => {
  it('exposes the three documented LLM providers', () => {
    expect(Object.keys(PROVIDERS)).toEqual(['groq', 'openrouter', 'ollama-cloud']);
  });

  it('points groq at the api.groq.com endpoint', () => {
    expect(PROVIDERS.groq.baseUrl).toContain('api.groq.com');
  });

  it('recommends llama-3.3-70b for groq', () => {
    expect(PROVIDERS.groq.defaultModel).toBe('llama-3.3-70b-versatile');
  });
});

describe('ProphClient', () => {
  it('marks itself unconfigured without an API key (non-ollama)', () => {
    const client = new ProphClient({ provider: 'groq', apiKey: '', model: '' });
    expect(client.isConfigured()).toBe(false);
  });

  it('marks itself configured when an API key is set', () => {
    const client = new ProphClient({ provider: 'groq', apiKey: 'gsk_x', model: '' });
    expect(client.isConfigured()).toBe(true);
  });

  it('marks ollama as configured even without API key (self-hosted)', () => {
    const client = new ProphClient({ provider: 'ollama-cloud', apiKey: '', model: '' });
    expect(client.isConfigured()).toBe(true);
  });

  it('throws ProphNotConfiguredError when chat() is called on an unconfigured client', async () => {
    const client = new ProphClient({ provider: 'groq', apiKey: '', model: '' });
    await expect(client.chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(
      ProphNotConfiguredError
    );
  });
});
