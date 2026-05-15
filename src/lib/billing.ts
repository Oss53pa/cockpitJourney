/**
 * Billing client — talks to the shared Atlas Studio Edge Functions for
 * Stripe checkout, customer portal, plan changes, and cancellation.
 *
 * The backend lives at supabase project `vgtmljfayiysuvrcmunt` and is
 * shared with the other Atlas Studio products (Cockpit F&A, Atlas Compta,
 * TableSmart…). Every endpoint takes an `appId: "cockpit-journey"` so
 * subscriptions are scoped per-product.
 *
 * Stripe is configured to bill in **XOF (FCFA)** natively — no
 * EUR/USD conversion needed. The user sees "15 000 FCFA / mois" at
 * checkout exactly as they see it on the landing page.
 */

import { supabase } from './supabase';

export const APP_ID = 'cockpit-journey';

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
 * Start the Stripe Checkout flow for a given plan. Resolves with the
 * checkout URL — the caller is expected to `window.location.href = url`.
 *
 * The shared `create-checkout` Edge Function:
 *   - Verifies the user is authenticated (`requireUser`)
 *   - Gets-or-creates a Stripe customer attached to the user's profile
 *   - Validates the optional promo code
 *   - Creates an ad-hoc Stripe Price in XOF (FCFA)
 *   - Returns the Checkout Session URL
 */
export async function startCheckout(plan: PlanId, promoCode?: string): Promise<string> {
  const planDesc = PLANS.find((p) => p.id === plan);
  if (!planDesc || planDesc.price === null) {
    throw new Error(`Plan "${plan}" non commercialisable via Stripe (contact direct requis)`);
  }
  const { data, error } = await supabase.functions.invoke<{
    url: string;
    discount?: number;
    finalPrice?: number;
  }>('create-checkout', {
    body: {
      appId: APP_ID,
      plan,
      priceAmount: planDesc.price,
      promoCode: promoCode?.trim() || undefined,
    },
  });
  if (error || !data?.url) {
    throw new Error(error?.message || 'Création du checkout échouée');
  }
  return data.url;
}

/**
 * Open the Stripe Customer Portal (manage payment method, view invoices,
 * cancel subscription). The shared `portal-session` Edge Function creates
 * a one-time URL.
 */
export async function openCustomerPortal(): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>('portal-session', {
    body: { appId: APP_ID },
  });
  if (error || !data?.url) {
    throw new Error(error?.message || 'Ouverture du portail échouée');
  }
  return data.url;
}

/**
 * Switch to a different plan WITHOUT going through Stripe Checkout
 * again. The shared `change-plan` Edge Function pro-rates the diff
 * server-side and updates the Stripe subscription in place.
 */
export async function changePlan(plan: PlanId): Promise<void> {
  const planDesc = PLANS.find((p) => p.id === plan);
  if (!planDesc || planDesc.price === null) {
    throw new Error(`Plan "${plan}" requiert un contact commercial`);
  }
  const { error } = await supabase.functions.invoke('change-plan', {
    body: { appId: APP_ID, plan, newPriceAmount: planDesc.price },
  });
  if (error) throw new Error(error.message || 'Changement de plan échoué');
}

/**
 * Cancel the subscription at period end (user keeps access until paid
 * period expires). Implemented server-side via `cancel-subscription`.
 */
export async function cancelSubscription(): Promise<void> {
  const { error } = await supabase.functions.invoke('cancel-subscription', {
    body: { appId: APP_ID },
  });
  if (error) throw new Error(error.message || 'Annulation échouée');
}

/**
 * Format a XOF amount with thin-space thousands separator and a "FCFA"
 * suffix. Designed to match how the landing page renders prices.
 */
export function formatXof(amount: number): string {
  // Non-breaking thin space U+202F for FR readability.
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';
}
