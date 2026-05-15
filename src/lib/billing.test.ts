import { describe, it, expect } from 'vitest';
import {
  PLANS,
  APP_ID,
  isSubscriptionActive,
  atlasPortalUrl,
  formatXof,
  type SubscriptionState,
} from './billing';

describe('PLANS', () => {
  it('exposes the three CockpitJourney plans', () => {
    expect(PLANS.map((p) => p.id)).toEqual(['particulier', 'equipe', 'entreprise']);
  });

  it('prices Particulier and Équipe at 15 000 FCFA / month', () => {
    expect(PLANS.find((p) => p.id === 'particulier')?.price).toBe(15_000);
    expect(PLANS.find((p) => p.id === 'equipe')?.price).toBe(15_000);
  });

  it('marks Entreprise as null price (sur devis)', () => {
    expect(PLANS.find((p) => p.id === 'entreprise')?.price).toBeNull();
  });

  it('caps Équipe at 10 seats, Particulier at 1, Entreprise unlimited', () => {
    expect(PLANS.find((p) => p.id === 'particulier')?.seats).toBe(1);
    expect(PLANS.find((p) => p.id === 'equipe')?.seats).toBe(10);
    expect(PLANS.find((p) => p.id === 'entreprise')?.seats).toBe('unlimited');
  });
});

describe('isSubscriptionActive', () => {
  it('returns false for null subscription', () => {
    expect(isSubscriptionActive(null)).toBe(false);
  });

  it('returns true for active status', () => {
    const sub: SubscriptionState = {
      plan: 'particulier',
      status: 'active',
      seats: 1,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      provider: 'stripe',
    };
    expect(isSubscriptionActive(sub)).toBe(true);
  });

  it('returns true for trialing status (paid features unlocked during trial)', () => {
    const sub: SubscriptionState = {
      plan: 'equipe',
      status: 'trialing',
      seats: 10,
      trialEndsAt: '2026-06-01T00:00:00Z',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      provider: 'stripe',
    };
    expect(isSubscriptionActive(sub)).toBe(true);
  });

  it.each(['incomplete', 'past_due', 'canceled', 'unpaid'] as const)(
    'returns false for %s status',
    (status) => {
      const sub: SubscriptionState = {
        plan: 'particulier',
        status,
        seats: 1,
        trialEndsAt: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        provider: 'stripe',
      };
      expect(isSubscriptionActive(sub)).toBe(false);
    }
  );
});

describe('atlasPortalUrl', () => {
  it('defaults to manage action', () => {
    expect(atlasPortalUrl()).toBe(`https://atlas-studio.org/portal?app=${APP_ID}&action=manage`);
  });

  it('builds a subscribe URL', () => {
    expect(atlasPortalUrl('subscribe')).toBe(
      `https://atlas-studio.org/portal?app=${APP_ID}&action=subscribe`
    );
  });

  it('always tags app=cockpit-journey', () => {
    expect(atlasPortalUrl('subscribe')).toContain('app=cockpit-journey');
    expect(atlasPortalUrl('manage')).toContain('app=cockpit-journey');
  });
});

describe('formatXof', () => {
  // U+202F NARROW NO-BREAK SPACE — French typography standard for
  // thousands separators. Kept as a constant so the assertions read
  // cleanly and a future contributor doesn't accidentally paste a
  // regular space.
  const NNBSP = ' ';

  it('inserts thin-space thousands separators', () => {
    expect(formatXof(15_000)).toBe(`15${NNBSP}000 FCFA`);
    expect(formatXof(1_500_000)).toBe(`1${NNBSP}500${NNBSP}000 FCFA`);
  });

  it('renders amounts under 1000 unchanged', () => {
    expect(formatXof(500)).toBe('500 FCFA');
    expect(formatXof(0)).toBe('0 FCFA');
  });

  it('handles the documented plan prices', () => {
    expect(formatXof(15000)).toBe(`15${NNBSP}000 FCFA`);
    expect(formatXof(10000)).toBe(`10${NNBSP}000 FCFA`);
  });

  it('uses NARROW NO-BREAK SPACE (U+202F), not a regular space', () => {
    const out = formatXof(1234567);
    expect(out.charCodeAt(1)).toBe(0x202f); // between "1" and "234"
  });
});
