// Landing-page CMS reader.
//
// All marketing copy (hero, stats, features, pricing, testimonials, faq, cta)
// is stored in the shared Atlas Studio table `public.app_landing_content`,
// keyed by app_id + section. Marketing/admin teams update the rows from the
// Atlas Studio admin console; this hook fetches them at runtime and the
// LandingPage renders whatever is there.
//
// Hardcoded fallbacks live in the LandingPage itself so the page is always
// renderable, even if Supabase is unreachable or the CMS is empty.

import { useEffect, useState } from 'react';
import { supabase, SUPABASE_CONFIGURED } from './supabase';

export const APP_ID_FOR_CMS = 'cockpitjourney';

/* ───────────── Section types ───────────── */

export interface HeroContent {
  title?: string;
  subtitle?: string;
  badges?: string[];
  cta_primary?: { text: string; url: string };
  cta_secondary?: { text: string; url: string };
  trust_inline?: string[];
}

export interface StatItem {
  value: string;
  label: string;
  sub?: string;
}
export interface StatsContent {
  items?: StatItem[];
}

export interface FeatureItem {
  icon?: string;
  title: string;
  body: string;
}
export interface FeaturesContent {
  title?: string;
  subtitle?: string;
  items?: FeatureItem[];
}

export interface PricingPlan {
  name: string;
  price: number | null;
  currency?: string;
  period?: string;
  tagline?: string;
  features?: string[];
  cta_text?: string;
  cta_url?: string;
  is_popular?: boolean;
}
export interface PricingContent {
  title?: string;
  subtitle?: string;
  plans?: PricingPlan[];
}

export interface TestimonialItem {
  quote: string;
  name: string;
  role: string;
  initials: string;
  color: string;
}
export interface TestimonialsContent {
  title?: string;
  subtitle?: string;
  rating?: string;
  items?: TestimonialItem[];
}

export interface FaqItem {
  q: string;
  a: string;
}
export interface FaqContent {
  title?: string;
  subtitle?: string;
  items?: FaqItem[];
}

export interface TrustBadge {
  icon?: string;
  label: string;
}
export interface CtaContent {
  title?: string;
  subtitle?: string;
  cta_text?: string;
  cta_url?: string;
  trust_badges?: TrustBadge[];
}

export interface LandingContent {
  hero?: HeroContent;
  stats?: StatsContent;
  features?: FeaturesContent;
  pricing?: PricingContent;
  testimonials?: TestimonialsContent;
  faq?: FaqContent;
  cta?: CtaContent;
}

/* ───────────── Hook ───────────── */

interface Row {
  section: string;
  data: unknown;
}

/**
 * Fetches all active landing rows for the current app and shapes them
 * into a single { hero, stats, features, ... } object. Returns
 * `{ content, loading }` — components should read each section with
 * `??` fallbacks to hardcoded copy.
 *
 * One-shot query at mount; no realtime subscription. The landing is
 * reload-driven (visitors refresh to see updates).
 */
export function useLandingContent(appId: string = APP_ID_FOR_CMS) {
  const [content, setContent] = useState<LandingContent>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('app_landing_content')
          .select('section, data')
          .eq('app_id', appId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        if (cancelled) return;
        if (error) {
          console.warn('[landing] CMS read failed, using hardcoded fallbacks', error);
          setLoading(false);
          return;
        }
        const shaped: LandingContent = {};
        for (const row of (data ?? []) as Row[]) {
          const key = row.section as keyof LandingContent;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (shaped as any)[key] = row.data;
        }
        setContent(shaped);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appId]);

  return { content, loading };
}

/** Format a price using the currency hint from the CMS. */
export function formatPrice(price: number | null | undefined, currency?: string): string {
  if (price === null || price === undefined) return 'Sur mesure';
  if (price === 0) return 'Gratuit';
  if ((currency ?? '').toUpperCase() === 'FCFA' || currency === 'XOF') {
    return new Intl.NumberFormat('fr-FR').format(price) + ' FCFA';
  }
  if (currency === 'EUR') return price + '€';
  return price + ' ' + (currency ?? '');
}
