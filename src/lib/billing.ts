/**
 * Billing client — READ-ONLY surface.
 *
 * Atlas Studio centralizes ALL billing (Stripe, CinetPay, Mobile Money,
 * invoicing, customer portal) on its own portal at
 * https://atlas-studio.org/portal. CockpitJourney never hosts a checkout
 * UI itself — it just reads the subscription row from the shared
 * `subscriptions` table and links out to the central portal when the
 * user wants to subscribe, upgrade, or cancel.
 *
 * Why this matters:
 *   - Single billing dashboard for users who own multiple Atlas Studio
 *     products (CockpitJourney + Cockpit F&A + Atlas Compta…)
 *   - One legal entity issuing the invoices (Atlas Studio SAS, not
 *     CockpitJourney as a standalone brand)
 *   - Payment provider choice (Stripe / CinetPay / virement) and tax
 *     handling stay in one place
 *   - When a user cancels via Atlas Studio portal, every Atlas product
 *     sees the new status on the next snapshot load
 */

import { supabase } from './supabase';

export const APP_ID = 'cockpit-journey';

/**
 * Base URL of the Atlas Studio billing portal. The portal accepts a
 * `?app=` query string to deep-link directly to the CockpitJourney plan
 * picker / management screen.
 */
const ATLAS_PORTAL_URL = 'https://atlas-studio.org/portal';

/** URL to send the user to when they want to subscribe / manage billing. */
export function atlasPortalUrl(action: 'subscribe' | 'manage' = 'manage'): string {
  return `${ATLAS_PORTAL_URL}?app=${APP_ID}&action=${action}`;
}

export type PlanId = 'particulier' | 'equipe' | 'entreprise';

export interface PlanDescriptor {
  id: PlanId;
  label: string;
  price: number | null; // null = "sur devis"
  currency: 'FCFA';
  period: string;
  seats: number | 'unlimited';
  tagline: string;
}

export const PLANS: PlanDescriptor[] = [
  {
    id: 'particulier',
    label: 'Particulier',
    price: 15_000,
    currency: 'FCFA',
    period: 'mois',
    seats: 1,
    tagline: 'pour le dirigeant solo',
  },
  {
    id: 'equipe',
    label: 'Équipe',
    price: 15_000,
    currency: 'FCFA',
    period: 'mois · forfait',
    seats: 10,
    tagline: 'jusqu’à 10 collaborateurs inclus',
  },
  {
    id: 'entreprise',
    label: 'Entreprise',
    price: null,
    currency: 'FCFA',
    period: '10 000 FCFA / mois / utilisateur > 10',
    seats: 'unlimited',
    tagline: 'au-delà de 10 collaborateurs · devis personnalisé',
  },
];

/**
 * Current subscription row from cj_subscriptions. Null = no active sub.
 */
export interface SubscriptionState {
  plan: PlanId;
  status: 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
  seats: number;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  provider: 'stripe' | 'cinetpay' | 'manual';
}

/**
 * Read the current user's subscription from the shared Atlas Studio
 * `subscriptions` table. RLS already filters to `auth.uid() = user_id`,
 * and we further scope by `app_id = 'cockpit-journey'` to ignore subs
 * for sibling Atlas Studio products.
 *
 * We pick the most-recent non-cancelled row in case the user has churned
 * + resubscribed (rare but possible).
 */
export async function getCurrentSubscription(): Promise<SubscriptionState | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(
      'plan, status, seats_limit, trial_ends_at, current_period_end, cancel_at_period_end, payment_method'
    )
    .eq('app_id', APP_ID)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[billing] getCurrentSubscription failed', error);
    return null;
  }
  if (!data) return null;
  // Atlas Studio uses a few legacy status values; map them to our union.
  const rawStatus = String(data.status ?? '').toLowerCase();
  const status: SubscriptionState['status'] = (
    ['incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'] as const
  ).includes(rawStatus as never)
    ? (rawStatus as SubscriptionState['status'])
    : rawStatus === 'pending'
      ? 'incomplete'
      : rawStatus === 'cancelled'
        ? 'canceled'
        : 'incomplete';
  const provider: SubscriptionState['provider'] =
    data.payment_method === 'cinetpay' ? 'cinetpay' : data.payment_method === 'stripe' ? 'stripe' : 'manual';
  return {
    plan: (data.plan as PlanId) ?? 'particulier',
    status,
    seats: (data.seats_limit as number) ?? 1,
    trialEndsAt: data.trial_ends_at as string | null,
    currentPeriodEnd: data.current_period_end as string | null,
    cancelAtPeriodEnd: !!data.cancel_at_period_end,
    provider,
  };
}

/**
 * Returns true if the subscription unlocks paid features. Trialing
 * counts as active for our gating purposes.
 */
export function isSubscriptionActive(s: SubscriptionState | null): boolean {
  if (!s) return false;
  return s.status === 'active' || s.status === 'trialing';
}

/**
 * Format a XOF amount with thin-space thousands separator and a "FCFA"
 * suffix. Designed to match how the landing page renders prices.
 */
export function formatXof(amount: number): string {
  // Non-breaking thin space U+202F for FR readability.
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';
}
