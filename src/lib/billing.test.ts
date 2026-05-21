import { describe, it, expect } from 'vitest';
import {
  PLANS,
  APP_ID,
  isSubscriptionActive,
  atlasPortalUrl,
  formatXof,
  computeMonthlyBill,
  type SubscriptionState,
} from './billing';

describe('PLANS', () => {
  it('exposes two CockpitJourney plans (Solo + Entreprise)', () => {
    expect(PLANS.map((p) => p.id)).toEqual(['solo', 'entreprise']);
  });

  it('prices both plans at 25 000 FCFA base / month', () => {
    expect(PLANS.find((p) => p.id === 'solo')?.price).toBe(25_000);
    expect(PLANS.find((p) => p.id === 'entreprise')?.price).toBe(25_000);
  });

  it('includes 5 seats in the base price for both plans', () => {
    expect(PLANS.find((p) => p.id === 'solo')?.seats).toBe(5);
    expect(PLANS.find((p) => p.id === 'entreprise')?.seats).toBe(5);
  });

  it('caps Solo at exactly 5 seats (forfait pur)', () => {
    const solo = PLANS.find((p) => p.id === 'solo')!;
    expect(solo.seatsMax).toBe(5);
    expect(solo.perSeatOverage).toBe(0);
  });

  it('adds 15 000 FCFA / seat overage on Entreprise (no cap)', () => {
    const ent = PLANS.find((p) => p.id === 'entreprise')!;
    expect(ent.seatsMax).toBe('unlimited');
    expect(ent.perSeatOverage).toBe(15_000);
  });
});

describe('computeMonthlyBill', () => {
  it('returns the flat 25 000 base for a Solo plan, regardless of headcount ≤5', () => {
    expect(computeMonthlyBill('solo', 1)).toBe(25_000);
    expect(computeMonthlyBill('solo', 3)).toBe(25_000);
    expect(computeMonthlyBill('solo', 5)).toBe(25_000);
  });

  it('returns the flat 25 000 base for Entreprise when headcount ≤5', () => {
    expect(computeMonthlyBill('entreprise', 1)).toBe(25_000);
    expect(computeMonthlyBill('entreprise', 5)).toBe(25_000);
  });

  it('adds 15 000 per seat beyond 5 on Entreprise', () => {
    expect(computeMonthlyBill('entreprise', 6)).toBe(25_000 + 15_000); // 40 000
    expect(computeMonthlyBill('entreprise', 10)).toBe(25_000 + 5 * 15_000); // 100 000
    expect(computeMonthlyBill('entreprise', 20)).toBe(25_000 + 15 * 15_000); // 250 000
  });

  it('returns 0 for an unknown plan id', () => {
    // @ts-expect-error — testing the defensive branch
    expect(computeMonthlyBill('inexistant', 5)).toBe(0);
  });
});

describe('isSubscriptionActive', () => {
  it('returns false for null subscription', () => {
    expect(isSubscriptionActive(null)).toBe(false);
  });

  it('returns true for active status', () => {
    const sub: SubscriptionState = {
      plan: 'solo',
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
      plan: 'entreprise',
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
        plan: 'solo',
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
