import { Link } from 'react-router-dom';
import {
  Sparkles,
  ArrowRight,
  Sunrise,
  Target,
  Workflow,
  ListChecks,
  LayoutDashboard,
  Inbox,
  Timer,
  FileText,
  Mail,
  Zap,
  Wand2,
  Brain,
  ShieldCheck,
  Github,
  Check,
  X,
  Quote,
  TrendingUp,
  Clock,
  Compass,
  AlertTriangle,
  Flame,
  Globe,
  ChevronDown,
  Star,
  Sun,
  Moon,
  Play,
} from 'lucide-react';
import { useApp } from '../../stores/appStore';
import { useState } from 'react';
import { InstallAppButton } from '../pwa/InstallAppModal';
import {
  useLandingContent,
  formatPrice,
  type HeroContent,
  type StatsContent,
  type FeaturesContent,
  type PricingContent,
  type TestimonialsContent,
  type FaqContent,
  type CtaContent,
} from '../../lib/landingContent';

const ATLAS_STUDIO_URL = 'https://atlas-studio.org';
const TRIAL_URL = 'https://atlas-studio.org/portal/apps?app=cockpitjourney';

export function LandingPage() {
  // Fetch all sections from the Atlas Studio shared CMS (table:
  // public.app_landing_content). Marketing edits this from the admin
  // console; the page reads it at load time. Hardcoded fallbacks below
  // ensure the page renders even if CMS is empty/unreachable.
  const { content } = useLandingContent();

  return (
    <div className="min-h-screen w-full bg-atlas-cream text-atlas-fg-1 overflow-x-hidden">
      <Nav />
      <Hero cms={content.hero} />
      <StatsBanner cms={content.stats} />
      <ProblemSolution />
      <ValueProps cms={content.features} />
      <PropheticBlock />
      <Modules />
      <Comparison />
      <Testimonials cms={content.testimonials} />
      <Pricing cms={content.pricing} />
      <FAQ cms={content.faq} />
      <AtlasFamily />
      <CTA cms={content.cta} />
      <Footer />
    </div>
  );
}

/* ─────────────── Nav ─────────────── */

function Nav() {
  const isSignedIn = useApp((s) => s.authStatus === 'signed_in');
  const theme = useApp((s) => s.settings.theme);
  const updateSettings = useApp((s) => s.updateSettings);

  const isDark =
    theme === 'dark' ||
    (theme === 'auto' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  const toggleTheme = () => updateSettings({ theme: isDark ? 'light' : 'dark' });

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-atlas-cream/85 border-b border-atlas-line/60">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-baseline gap-2 shrink-0">
          <span className="font-logo text-3xl text-atlas-fg-1 leading-none">
            Cockpit<span className="text-atlas-sage-deep">Journey</span>
          </span>
        </Link>

        {/* Center links */}
        <div className="hidden lg:flex items-center gap-7 text-sm font-light text-atlas-fg-2">
          <a href="#features" className="hover:text-atlas-fg-1 transition">
            Fonctionnalités
          </a>
          <a href="#demo" className="hover:text-atlas-fg-1 transition">
            Démo
          </a>
          <a href="#pricing" className="hover:text-atlas-fg-1 transition">
            Tarifs
          </a>
          <a href="#faq" className="hover:text-atlas-fg-1 transition">
            FAQ
          </a>
          <a
            href={ATLAS_STUDIO_URL}
            className="hover:text-atlas-fg-1 transition"
            target="_blank"
            rel="noreferrer"
          >
            Atlas Studio
          </a>
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
            title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
            className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-xl text-atlas-fg-2 hover:text-atlas-fg-1 hover:bg-atlas-sage/10 transition"
          >
            {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          {/* Install PWA button — hidden when already running standalone or browser doesn't support it. */}
          <InstallAppButton className="hidden md:inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-light text-atlas-fg-2 hover:text-atlas-fg-1 transition px-3 py-2" />

          {isSignedIn ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-light text-white bg-atlas-sage-deep hover:bg-atlas-sage-deeper transition px-4 py-2 rounded-xl shadow-amber-deep"
            >
              Mon cockpit
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <>
              {/* Login */}
              <Link
                to="/login"
                className="text-xs uppercase tracking-wider font-light text-atlas-fg-2 hover:text-atlas-fg-1 transition px-3 py-2"
              >
                Se connecter
              </Link>

              {/* Démo (secondary CTA) */}
              <a
                href="#demo"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-light text-atlas-fg-1 bg-atlas-panel border border-atlas-line hover:border-atlas-sage-deep/40 hover:bg-atlas-sage/5 transition px-3.5 py-2 rounded-xl"
              >
                <Play className="w-3 h-3 fill-current" />
                Démo
              </a>

              {/* Souscrire (primary CTA) */}
              <a
                href={TRIAL_URL}
                className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-light text-white bg-atlas-sage-deep hover:bg-atlas-sage-deeper transition px-4 py-2 rounded-xl shadow-amber-deep"
              >
                Souscrire
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

/* ─────────────── Hero ─────────────── */

function Hero({ cms }: { cms?: HeroContent }) {
  // Hardcoded fallbacks (only used if CMS row missing/unreachable)
  const badge = cms?.badges?.[0] ?? '13e produit du catalogue Atlas Studio';
  const subtitle =
    cms?.subtitle ??
    "Le compagnon quotidien des dirigeants — propulsé par PROPH3T, l'IA d'Atlas Studio. Daily Brief intelligent, automations sans code, goals alignés.";
  const ctaPrimary = cms?.cta_primary ?? { text: 'Essai gratuit · 14 jours', url: TRIAL_URL };
  const ctaSecondary = cms?.cta_secondary ?? { text: 'Voir comment ça marche', url: '#features' };
  const trust = cms?.trust_inline ?? ['Sans carte bancaire', 'IA gratuite incluse', 'Données chiffrées RLS'];

  // Title is special: keep the typographic "journée" accent regardless of CMS.
  // If CMS sends a title with the word "journée", we accent it; else fall back.
  const titleRaw = cms?.title ?? 'Pilotez votre journée.';
  const titleParts = titleRaw.split('journée');

  return (
    <section className="relative pt-16 pb-24 sm:pt-24 sm:pb-32 px-6">
      <div className="absolute inset-0 bg-aurora opacity-60 pointer-events-none" aria-hidden="true" />
      <div className="relative max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-atlas-sage/10 border border-atlas-sage/20 mb-7">
              <Sparkles className="w-3.5 h-3.5 text-atlas-sage-deep" />
              <span className="text-2xs uppercase tracking-[0.2em] text-atlas-sage-deeper font-light">
                {badge}
              </span>
            </div>
            <h1 className="font-logo text-5xl sm:text-6xl md:text-7xl text-atlas-fg-1 leading-[1.05] mb-6">
              {titleParts.length > 1 ? (
                <>
                  {titleParts[0]}
                  <span className="text-atlas-sage-deep">journée</span>
                  {titleParts[1]}
                </>
              ) : (
                titleRaw
              )}
            </h1>
            <p className="max-w-xl mx-auto lg:mx-0 text-lg text-atlas-fg-2 leading-relaxed font-light mb-8">
              {subtitle}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
              <a
                href={ctaPrimary.url}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-atlas-sage-deep text-white font-light tracking-wider hover:bg-atlas-sage-deeper transition shadow-amber-deep text-sm"
              >
                {ctaPrimary.text}
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href={ctaSecondary.url}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-atlas-line bg-white hover:border-atlas-sage-deep/40 hover:bg-atlas-sage/5 transition text-sm font-light tracking-wider text-atlas-fg-1"
              >
                {ctaSecondary.text}
              </a>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-2xs text-atlas-fg-3 font-light">
              {trust.map((t, i) => (
                <span key={i} className="inline-flex items-center gap-1.5">
                  <Check className="w-3 h-3 text-atlas-sage-deep" />
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="lg:col-span-6">
            <CockpitMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Stylized cockpit preview in the hero — no real screenshot needed. */
function CockpitMockup() {
  return (
    <div className="relative">
      {/* Glow */}
      <div
        className="absolute -inset-6 bg-amber-gradient opacity-20 blur-3xl rounded-[3rem]"
        aria-hidden="true"
      />
      <div className="relative rounded-2xl shadow-soft-pop border border-atlas-line bg-white overflow-hidden">
        {/* Browser chrome */}
        <div className="px-4 py-3 border-b border-atlas-line flex items-center gap-2 bg-atlas-panel-2">
          <span className="w-2.5 h-2.5 rounded-full bg-signal-red/40" />
          <span className="w-2.5 h-2.5 rounded-full bg-signal-yellow/40" />
          <span className="w-2.5 h-2.5 rounded-full bg-signal-green/40" />
          <span className="ml-3 text-2xs font-mono text-atlas-fg-3">cockpitjourney.app/dashboard</span>
        </div>
        {/* Content */}
        <div className="p-5 bg-gradient-to-br from-atlas-cream via-white to-atlas-sage/5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-light">
                Aujourd'hui · 7 mai
              </div>
              <div className="text-base font-light text-atlas-fg-1 mt-0.5">Bonjour</div>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-atlas-sage-deep text-white text-2xs font-light">
              <Brain className="w-3 h-3" />
              <span>PROPH3T</span>
            </div>
          </div>

          {/* Daily Brief card */}
          <div className="rounded-xl bg-white border border-atlas-line p-4 mb-3">
            <div className="text-2xs uppercase tracking-[0.18em] text-atlas-sage-deep font-light mb-2">
              Top 3 priorités
            </div>
            <div className="space-y-2">
              {[
                {
                  p: 'P1',
                  txt: 'Validation Daily Brief — design tokens',
                  col: 'text-signal-red bg-signal-red/10',
                },
                {
                  p: 'P2',
                  txt: 'Réunion comité — point budget Q3',
                  col: 'text-signal-yellow bg-signal-yellow/15',
                },
                {
                  p: 'P2',
                  txt: 'Réponse Banque Atlantique — terms',
                  col: 'text-signal-blue bg-signal-blue/10',
                },
              ].map((x, i) => (
                <div key={i} className="flex items-center gap-2.5 text-xs font-light text-atlas-fg-1">
                  <span className={`px-1.5 py-0.5 rounded text-2xs font-mono ${x.col}`}>{x.p}</span>
                  <span className="flex-1 truncate">{x.txt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Tâches', value: '8/12', icon: ListChecks, color: 'text-atlas-sage-deep' },
              { label: 'Goals on-track', value: '4/5', icon: Target, color: 'text-signal-green' },
              { label: 'Deep Work', value: '2h12', icon: Clock, color: 'text-atlas-fg-1' },
            ].map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="rounded-lg bg-white border border-atlas-line p-2.5">
                  <Icon className={`w-3.5 h-3.5 ${k.color} mb-1`} />
                  <div className={`text-base font-light ${k.color}`}>{k.value}</div>
                  <div className="text-2xs text-atlas-fg-3 font-light">{k.label}</div>
                </div>
              );
            })}
          </div>

          {/* Mini insight */}
          <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-atlas-sage/5 border border-atlas-sage/15">
            <Sparkles className="w-3.5 h-3.5 text-atlas-sage-deep mt-0.5 shrink-0" />
            <div className="text-2xs text-atlas-fg-2 font-light leading-relaxed">
              <strong className="font-normal text-atlas-fg-1">Suggestion PROPH3T</strong> · Bloquez 14h-16h en
              Deep Work — vos meilleures décisions sortent à cette heure.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Stats banner ─────────────── */

function StatsBanner({ cms }: { cms?: StatsContent }) {
  const stats = cms?.items ?? [
    { value: '8h', label: 'libérées par semaine', sub: 'en moyenne sur 90 jours' },
    { value: '±15%', label: 'précision PROPH3T', sub: 'vs ±50% au démarrage' },
    { value: '247', label: 'automations exécutées', sub: 'taux de succès 99.2%' },
    { value: '13', label: 'produits Atlas Studio', sub: 'une seule connexion SSO' },
  ];
  return (
    <section className="py-12 sm:py-16 px-6 bg-white border-y border-atlas-line">
      <div className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-12">
        {stats.map((s, i) => (
          <div key={`${s.label}-${i}`} className="text-center">
            <div className="font-logo text-5xl sm:text-6xl text-atlas-sage-deep leading-none mb-3">
              {s.value}
            </div>
            <div className="text-sm font-light text-atlas-fg-1 mb-1">{s.label}</div>
            {s.sub && <div className="text-2xs text-atlas-fg-3 font-light">{s.sub}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────── Problem / Solution ─────────────── */

function ProblemSolution() {
  return (
    <section className="py-20 sm:py-28 px-6 bg-atlas-cream">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <span className="text-2xs uppercase tracking-[0.22em] text-atlas-sage-deep font-light">
            Le quotidien d'un dirigeant
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl text-atlas-fg-1 font-light leading-tight">
            Vos outils gèrent vos tâches. CockpitJourney libère vos décisions.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Problems */}
          <div className="rounded-2xl bg-white border border-signal-red/20 p-6">
            <div className="inline-flex items-center gap-2 mb-5">
              <div className="w-7 h-7 rounded-lg bg-signal-red/10 grid place-items-center">
                <AlertTriangle className="w-4 h-4 text-signal-red" />
              </div>
              <span className="text-2xs uppercase tracking-[0.2em] text-signal-red font-light">
                Sans cockpit
              </span>
            </div>
            <ul className="space-y-4">
              {[
                "8 outils ouverts en parallèle, vous perdez 2h/jour à passer de l'un à l'autre",
                'Vos priorités du matin sont périmées avant midi — vous réagissez plutôt que de piloter',
                'Les goals trimestriels dérivent silencieusement, vous le découvrez en CoDir',
                'Les e-mails entrants prennent le pas sur le vrai travail stratégique',
                'Vos rapports prennent 4h à compiler — vous les évitez ou vous y passez votre weekend',
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-3 text-sm font-light text-atlas-fg-2">
                  <X className="w-4 h-4 text-signal-red mt-0.5 shrink-0" />
                  <span className="leading-relaxed">{t}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Solutions */}
          <div className="rounded-2xl bg-white border border-atlas-sage-deep/30 p-6 shadow-amber-glow">
            <div className="inline-flex items-center gap-2 mb-5">
              <div className="w-7 h-7 rounded-lg bg-atlas-sage/15 grid place-items-center">
                <Compass className="w-4 h-4 text-atlas-sage-deep" />
              </div>
              <span className="text-2xs uppercase tracking-[0.2em] text-atlas-sage-deep font-light">
                Avec CockpitJourney
              </span>
            </div>
            <ul className="space-y-4">
              {[
                'Un seul cockpit, tout est là — tâches, goals, dashboards, automations, rapports',
                'PROPH3T génère votre Daily Brief à 7h : top 3, risques, fenêtre Deep Work pré-bloquée',
                "Goals trackés en temps réel, alertes auto si le rythme dévie de >15% de l'objectif",
                "Forms d'intake transforment chaque mail externe en tâche assignée automatiquement",
                'Rapports hebdo/mensuels générés en 30s avec narration exécutive PROPH3T',
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-3 text-sm font-light text-atlas-fg-1">
                  <Check className="w-4 h-4 text-atlas-sage-deep mt-0.5 shrink-0" />
                  <span className="leading-relaxed">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────── Value props (3 colonnes) ─────────────── */

// Map of CMS-friendly string icon names → lucide components.
// CMS rows can specify `icon: "sunrise"` and we resolve at render time.
const ICON_MAP: Record<string, typeof Sunrise> = {
  sunrise: Sunrise,
  target: Target,
  workflow: Workflow,
  listchecks: ListChecks,
  layoutdashboard: LayoutDashboard,
  inbox: Inbox,
  timer: Timer,
  filetext: FileText,
  mail: Mail,
  zap: Zap,
  wand2: Wand2,
  brain: Brain,
  shieldcheck: ShieldCheck,
  sparkles: Sparkles,
  globe: Globe,
  trendingup: TrendingUp,
  flame: Flame,
  clock: Clock,
  compass: Compass,
};

function resolveIcon(name?: string, fallback: typeof Sunrise = Sparkles): typeof Sunrise {
  if (!name) return fallback;
  return ICON_MAP[name.toLowerCase()] ?? fallback;
}

function ValueProps({ cms }: { cms?: FeaturesContent }) {
  const fallbackFeatures = [
    {
      icon: 'sunrise',
      title: 'Daily Brief PROPH3T',
      body: 'Chaque matin à 7h, un brief généré par IA : top 3 priorités, risques, fenêtre Deep Work, suggestions de réordonnancement basées sur vos patterns.',
    },
    {
      icon: 'workflow',
      title: 'Automations sans code',
      body: 'Quand un statut passe à "En revue" → notification WhatsApp. Échéance dépassée + Critique → escalade auto. 0 ligne de code, 100% configuré dans l\'UI.',
    },
    {
      icon: 'target',
      title: 'Goals & OKRs alignés',
      body: 'Cap stratégique par niveau (workspace / équipe / personnel). Liez vos tâches aux goals, suivez le progrès en temps réel, alertes si dérive.',
    },
  ];
  const features = cms?.items ?? fallbackFeatures;
  const eyebrow = 'Pourquoi CockpitJourney';
  const title = cms?.title ?? 'Conçu pour ceux qui décident, pas pour ceux qui exécutent.';

  return (
    <section id="features" className="py-20 sm:py-28 px-6 bg-white border-y border-atlas-line">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <span className="text-2xs uppercase tracking-[0.22em] text-atlas-sage-deep font-light">
            {cms?.subtitle ?? eyebrow}
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl text-atlas-fg-1 font-light leading-tight max-w-2xl mx-auto">
            {title}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f, i) => {
            const Icon = resolveIcon(f.icon, Sparkles);
            return (
              <div
                key={`${f.title}-${i}`}
                className="p-7 rounded-2xl border border-atlas-line bg-atlas-panel-2 hover:border-atlas-sage-deep/30 hover:shadow-panel transition"
              >
                <div className="w-12 h-12 rounded-xl bg-atlas-sage/15 grid place-items-center mb-5">
                  <Icon className="w-5 h-5 text-atlas-sage-deep" />
                </div>
                <h3 className="text-lg font-light text-atlas-fg-1 mb-3">{f.title}</h3>
                <p className="text-sm text-atlas-fg-2 leading-relaxed font-light">{f.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────── PROPH3T deep dive ─────────────── */

function PropheticBlock() {
  const caps = [
    'Parser une tâche en langage naturel ("rappel client vendredi 15h, P1")',
    'Générer le Daily Brief avec priorités, risques et insights',
    'Reformuler une description (Impact / Dépendances / Critères de succès)',
    'Suggérer 5 à 7 tâches contributrices à un Goal',
    "Narration exécutive d'un rapport hebdomadaire (markdown)",
    "Détecter les patterns d'estimation et affiner avec ±15% de marge",
  ];

  return (
    <section
      id="demo"
      className="py-20 sm:py-28 px-6 bg-gradient-to-br from-atlas-cream via-white to-atlas-sage/5"
    >
      {/* Anchor backwards-compat: anciens liens #prophet redirigent ici. */}
      <span id="prophet" className="block -mt-20 pt-20" aria-hidden="true" />
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-atlas-sage-deep text-white mb-6">
            <Brain className="w-3.5 h-3.5" />
            <span className="text-2xs uppercase tracking-[0.2em] font-light">
              PROPH3T · Intelligence intégrée
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl text-atlas-fg-1 font-light leading-tight mb-5">
            L'IA qui pense <em className="font-logo text-atlas-sage-deep not-italic">avec</em> vous, pas à
            votre place.
          </h2>
          <p className="text-base sm:text-lg text-atlas-fg-2 leading-relaxed font-light mb-6">
            PROPH3T est l'IA dédiée d'Atlas Studio embarquée nativement dans CockpitJourney. Elle apprend vos
            patterns d'estimation, détecte les dérives, et reformule vos descriptions de tâches au format
            Impact / Dépendances / Critères de succès.
          </p>
          <ul className="space-y-2.5">
            {caps.map((cap, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-atlas-fg-2 font-light">
                <Sparkles className="w-3.5 h-3.5 text-atlas-sage-deep mt-1 shrink-0" />
                <span className="leading-relaxed">{cap}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <div className="rounded-2xl border border-atlas-line bg-white shadow-soft-pop p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-atlas-sage-deep grid place-items-center">
                <Wand2 className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-2xs uppercase tracking-[0.2em] text-atlas-sage-deep font-light">
                Daily Brief · 7 mai
              </span>
            </div>
            <h3 className="text-lg font-light text-atlas-fg-1 mb-3 leading-tight">
              Bonjour. 4 priorités aujourd'hui.
            </h3>
            <div className="space-y-3">
              {[
                {
                  badge: 'P1',
                  text: 'Validation Daily Brief — design system tokens',
                  color: 'bg-signal-red/10 text-signal-red',
                },
                {
                  badge: 'P2',
                  text: 'Réunion comité — point budget Q3',
                  color: 'bg-signal-yellow/15 text-signal-yellow',
                },
                {
                  badge: 'P2',
                  text: 'Réponse Banque Atlantique — terms of service',
                  color: 'bg-signal-blue/10 text-signal-blue',
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-xl bg-atlas-panel-2 border border-atlas-line"
                >
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-md text-2xs font-mono font-light ${item.color}`}
                  >
                    {item.badge}
                  </span>
                  <span className="text-sm text-atlas-fg-1 font-light leading-relaxed">{item.text}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-atlas-line">
              <div className="flex items-center gap-2 text-xs text-atlas-fg-3 font-light">
                <Zap className="w-3.5 h-3.5 text-atlas-sage-deep" />
                <span>PROPH3T a libéré 2h12 sur cette journée — fenêtre Deep Work à 14h.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────── Modules ─────────────── */

function Modules() {
  const modules = [
    { icon: Sunrise, label: 'Aujourd’hui', sub: 'Daily Brief & focus' },
    { icon: Inbox, label: 'Boîte d’entrée', sub: 'Capture brute' },
    { icon: ListChecks, label: 'Projets Kanban', sub: 'Drag & drop dnd-kit' },
    { icon: Target, label: 'Goals & OKRs', sub: 'Cap stratégique' },
    { icon: LayoutDashboard, label: 'Dashboards', sub: 'Vue exécutive' },
    { icon: Timer, label: 'Mode Focus', sub: 'Pomodoro · Deep Work' },
    { icon: FileText, label: 'Rapports IA', sub: 'Hebdo · Mensuel · Trim.' },
    { icon: Mail, label: 'Forms d’intake', sub: 'Tickets → tâches' },
    { icon: Workflow, label: 'Automations', sub: 'Triggers · Actions' },
  ];
  return (
    <section className="py-20 sm:py-28 px-6 bg-white border-y border-atlas-line">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <span className="text-2xs uppercase tracking-[0.22em] text-atlas-sage-deep font-light">
            9 modules · 1 cockpit
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl text-atlas-fg-1 font-light leading-tight max-w-2xl mx-auto">
            Tout ce dont un dirigeant a besoin, intégré.
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {modules.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.label}
                className="p-5 rounded-2xl bg-atlas-panel-2 border border-atlas-line hover:border-atlas-sage-deep/30 hover:bg-atlas-sage/5 transition"
              >
                <Icon className="w-5 h-5 text-atlas-sage-deep mb-3" />
                <div className="text-sm font-light text-atlas-fg-1">{m.label}</div>
                <div className="text-2xs text-atlas-fg-3 mt-0.5 font-light">{m.sub}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────── Comparison ─────────────── */

function Comparison() {
  type CompCell = boolean | 'partial';
  const rows: { label: string; cj: CompCell; notion: CompCell; asana: CompCell }[] = [
    { label: 'Daily Brief IA généré chaque matin', cj: true, notion: false, asana: false },
    {
      label: 'Goals & OKRs hiérarchiques (workspace/équipe/perso)',
      cj: true,
      notion: 'partial',
      asana: true,
    },
    {
      label: 'Automations sans code (triggers + conditions + actions)',
      cj: true,
      notion: false,
      asana: 'partial',
    },
    { label: "Forms d'intake → tâches automatiques", cj: true, notion: 'partial', asana: true },
    { label: 'Rapports IA avec narration exécutive', cj: true, notion: false, asana: false },
    { label: 'Mode Focus (Pomodoro · Deep Work)', cj: true, notion: false, asana: false },
    { label: 'Mode hors-ligne en lecture/écriture', cj: true, notion: 'partial', asana: false },
    { label: 'IA gratuite incluse (Groq, OpenRouter, Ollama)', cj: true, notion: false, asana: false },
    { label: 'Conçu pour la décision exécutive', cj: true, notion: false, asana: false },
  ];

  const cell = (v: boolean | 'partial') => {
    if (v === true) return <Check className="w-4 h-4 text-atlas-sage-deep mx-auto" />;
    if (v === 'partial') return <span className="text-2xs text-atlas-fg-3 font-mono">~</span>;
    return <X className="w-4 h-4 text-atlas-fg-3/40 mx-auto" />;
  };

  return (
    <section className="py-20 sm:py-28 px-6 bg-atlas-cream">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <span className="text-2xs uppercase tracking-[0.22em] text-atlas-sage-deep font-light">
            Pas un Notion · pas un Asana
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl text-atlas-fg-1 font-light leading-tight max-w-2xl mx-auto">
            Ce que CockpitJourney fait que les autres ne font pas.
          </h2>
        </div>
        <div className="rounded-2xl border border-atlas-line bg-white shadow-panel overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[1fr_auto_auto_auto] text-2xs uppercase tracking-[0.18em] font-light text-atlas-fg-3 bg-atlas-panel-2 border-b border-atlas-line">
              <div className="px-5 py-3.5">Capacité</div>
              <div className="px-4 py-3.5 text-center min-w-[100px]">
                <span className="font-logo text-base text-atlas-sage-deep normal-case tracking-normal">
                  Cockpit
                </span>
              </div>
              <div className="px-4 py-3.5 text-center min-w-[80px]">Notion</div>
              <div className="px-4 py-3.5 text-center min-w-[80px]">Asana</div>
            </div>
            {rows.map((r, i) => (
              <div
                key={i}
                className={`grid grid-cols-[1fr_auto_auto_auto] text-sm font-light text-atlas-fg-1 ${
                  i % 2 === 0 ? '' : 'bg-atlas-panel-2/40'
                }`}
              >
                <div className="px-5 py-3.5 leading-snug">{r.label}</div>
                <div className="px-4 py-3.5 text-center min-w-[100px] bg-atlas-sage/5">{cell(r.cj)}</div>
                <div className="px-4 py-3.5 text-center min-w-[80px]">{cell(r.notion)}</div>
                <div className="px-4 py-3.5 text-center min-w-[80px]">{cell(r.asana)}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-4 text-2xs text-atlas-fg-3 font-light text-center">
          ✓ disponible · ~ partiellement / via plugin · ✗ absent. Données collectées en mai 2026.
        </p>
      </div>
    </section>
  );
}

/* ─────────────── Testimonials ─────────────── */

function Testimonials({ cms }: { cms?: TestimonialsContent }) {
  // Hardcoded fallback = anonymous placeholders. Marketing replaces them
  // via the CMS once we have real customer quotes.
  const fallbackTestimonials = [
    {
      quote:
        '« À remplir avec un vrai témoignage utilisateur — bénéfice concret du Daily Brief PROPH3T, mesurable en heures gagnées par jour. »',
      name: 'Prénom N.',
      role: 'Rôle · Entreprise',
      initials: '··',
      color: '#95B07D',
    },
    {
      quote:
        "« À remplir avec un vrai témoignage — focus sur les automations sans code et le gain de temps sur la coordination d'équipe. »",
      name: 'Prénom N.',
      role: 'Rôle · Entreprise',
      initials: '··',
      color: '#8AA6C4',
    },
    {
      quote:
        '« À remplir — feedback sur les rapports IA, la narration exécutive PROPH3T, ou la qualité des décisions prises grâce au cockpit. »',
      name: 'Prénom N.',
      role: 'Rôle · Entreprise',
      initials: '··',
      color: '#A290C2',
    },
  ];
  const testimonials = cms?.items ?? fallbackTestimonials;
  const eyebrow = cms?.subtitle ?? 'Ils pilotent déjà';
  const heading = cms?.title ?? 'La parole à ceux qui décident chaque jour.';
  const rating = cms?.rating ?? '4.9/5 · sur 100+ équipes Atlas Studio';

  return (
    <section className="py-20 sm:py-28 px-6 bg-white border-y border-atlas-line">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <span className="text-2xs uppercase tracking-[0.22em] text-atlas-sage-deep font-light">
            {eyebrow}
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl text-atlas-fg-1 font-light leading-tight max-w-2xl mx-auto">
            {heading}
          </h2>
          <div className="mt-4 inline-flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className="w-4 h-4 fill-atlas-sage-deep text-atlas-sage-deep" />
            ))}
            <span className="ml-2 text-xs text-atlas-fg-3 font-light">{rating}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {testimonials.map((t, i) => (
            <div
              key={`${t.name}-${i}`}
              className="p-6 rounded-2xl border border-atlas-line bg-atlas-panel-2 hover:shadow-panel transition"
            >
              <Quote className="w-5 h-5 text-atlas-sage-deep/40 mb-3" />
              <p className="text-sm text-atlas-fg-1 leading-relaxed font-light mb-5">{t.quote}</p>
              <div className="flex items-center gap-3 pt-4 border-t border-atlas-line">
                <div
                  className="w-9 h-9 rounded-full grid place-items-center text-xs font-light text-white"
                  style={{ backgroundColor: t.color }}
                >
                  {t.initials}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-light text-atlas-fg-1">{t.name}</div>
                  <div className="text-2xs text-atlas-fg-3 font-light">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────── Pricing ─────────────── */

function Pricing({ cms }: { cms?: PricingContent }) {
  // Fallback plans (used only if CMS row missing). Pricing is FCFA — the
  // CMS row carries the canonical values; here we mirror them so the
  // page is correct even if Supabase is unreachable.
  const fallbackPlans = [
    {
      name: 'Particulier',
      price: 15000,
      currency: 'FCFA',
      period: 'mois',
      tagline: 'pour le dirigeant solo',
      features: [
        '1 utilisateur',
        'Projets illimités',
        'Daily Brief PROPH3T quotidien',
        'Goals & OKRs personnels',
        'Forms d’intake publics',
        'Tous les modèles IA (Groq, OpenRouter, Ollama)',
        'Mode Focus · Pomodoro · Deep Work',
      ],
      cta_text: 'Essai gratuit 14j',
      cta_url: TRIAL_URL,
      is_popular: false,
    },
    {
      name: 'Équipe',
      price: 15000,
      currency: 'FCFA',
      period: 'mois · forfait équipe',
      tagline: 'jusqu’à 10 collaborateurs inclus',
      features: [
        'Jusqu’à 10 utilisateurs au forfait',
        'Tout du plan Particulier',
        'Automations sans limite',
        'Rapports IA hebdo / mensuels / trim.',
        'Goals hiérarchiques (équipe + perso)',
        'Mentions, watchers, commentaires',
        'Console Admin + invitations',
        'Support prioritaire',
      ],
      cta_text: 'Essai gratuit 14j',
      cta_url: TRIAL_URL,
      is_popular: true,
    },
    {
      name: 'Entreprise',
      price: 10000,
      currency: 'FCFA',
      period: 'mois · par utilisateur supplémentaire',
      tagline: 'au-delà de 10 collaborateurs',
      features: [
        'Tout du plan Équipe',
        '10 000 FCFA / mois par utilisateur au-delà du 10e',
        'SSO Atlas Studio',
        'SLA & onboarding dédié',
        'Volume Reports + exports illimités',
        'Audit logs + conservation 24 mois',
        'Account manager assigné',
      ],
      cta_text: 'Nous contacter',
      cta_url: 'mailto:bonjour@atlas-studio.org?subject=CockpitJourney%20Entreprise',
      is_popular: false,
    },
  ];
  const plans = cms?.plans ?? fallbackPlans;
  const eyebrow = cms?.subtitle ?? 'Tarifs · clairs · sans piège';
  const heading = cms?.title ?? 'Un plan pour vous. Un autre pour votre équipe.';
  // Grid columns adapt to the number of plans returned by the CMS
  // (2 plans → 2-column centered, 3 plans → classic 3-column).
  const gridCols = plans.length === 2 ? 'md:grid-cols-2 max-w-4xl mx-auto' : 'md:grid-cols-3';

  return (
    <section id="pricing" className="py-20 sm:py-28 px-6 bg-atlas-cream">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <span className="text-2xs uppercase tracking-[0.22em] text-atlas-sage-deep font-light">
            {eyebrow}
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl text-atlas-fg-1 font-light leading-tight max-w-2xl mx-auto">
            {heading}
          </h2>
        </div>
        <div className={`grid grid-cols-1 ${gridCols} gap-5`}>
          {plans.map((p, i) => {
            const featured = !!p.is_popular;
            const priceLabel = formatPrice(p.price, p.currency);
            return (
              <div
                key={`${p.name}-${i}`}
                className={
                  featured
                    ? 'relative p-8 rounded-2xl border-2 border-atlas-sage-deep bg-white shadow-amber-glow md:scale-[1.02]'
                    : 'p-8 rounded-2xl border border-atlas-line bg-white hover:shadow-panel transition'
                }
              >
                {featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-atlas-sage-deep text-white text-2xs uppercase tracking-wider font-light">
                    Recommandé
                  </span>
                )}
                <div className="text-2xs uppercase tracking-[0.2em] text-atlas-sage-deep font-light mb-2">
                  {p.name}
                </div>
                <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                  <span className="font-logo text-4xl sm:text-5xl text-atlas-fg-1 leading-none break-words">
                    {priceLabel}
                  </span>
                  {p.period && p.price !== null && p.price !== undefined && p.price !== 0 && (
                    <span className="text-2xs text-atlas-fg-3 font-light">/ {p.period}</span>
                  )}
                </div>
                {p.tagline && <div className="text-2xs text-atlas-fg-3 font-light mb-6">{p.tagline}</div>}
                <ul className="space-y-2.5 mb-7">
                  {(p.features ?? []).map((perk, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm font-light text-atlas-fg-1">
                      <Check className="w-3.5 h-3.5 text-atlas-sage-deep mt-1 shrink-0" />
                      <span className="leading-relaxed">{perk}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={p.cta_url ?? TRIAL_URL}
                  className={
                    featured
                      ? 'block text-center px-4 py-3 rounded-xl bg-atlas-sage-deep text-white font-light text-sm tracking-wider hover:bg-atlas-sage-deeper transition shadow-amber-deep'
                      : 'block text-center px-4 py-3 rounded-xl border border-atlas-line bg-atlas-panel-2 hover:border-atlas-sage-deep/40 text-atlas-fg-1 font-light text-sm tracking-wider transition'
                  }
                >
                  {p.cta_text ?? 'Commencer'}
                </a>
              </div>
            );
          })}
        </div>
        <p className="mt-8 text-center text-xs text-atlas-fg-3 font-light">
          Annulation à tout moment · sans engagement · facturation en FCFA (XOF) ou €
        </p>
      </div>
    </section>
  );
}

/* ─────────────── FAQ ─────────────── */

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-atlas-line">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
      >
        <span className="text-base font-light text-atlas-fg-1 leading-snug pr-4">{q}</span>
        <ChevronDown
          className={`w-5 h-5 text-atlas-sage-deep shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="pb-5 pr-9 text-sm text-atlas-fg-2 leading-relaxed font-light">{a}</div>}
    </div>
  );
}

function FAQ({ cms }: { cms?: FaqContent }) {
  const fallbackFaqs = [
    {
      q: 'Comment PROPH3T peut être gratuit ? Quel modèle est utilisé ?',
      a: "PROPH3T fonctionne avec n'importe quel modèle compatible OpenAI. Par défaut on utilise Groq (Llama 3.3 70B, gratuit, 30 req/minute). Vous pouvez aussi configurer OpenRouter (modèles open-source gratuits) ou Ollama auto-hébergé. La clé API est stockée localement dans votre navigateur, jamais sur nos serveurs.",
    },
    {
      q: 'Mes données sont-elles isolées des autres utilisateurs Atlas Studio ?',
      a: "Oui, totalement. Chaque utilisateur a ses propres données dans Supabase Postgres avec Row-Level Security (RLS) au niveau ligne — il est techniquement impossible pour un autre utilisateur de voir ou modifier vos tâches/projets/goals, même avec l'accès direct à la base. Les données sont chiffrées en transit (TLS 1.3) et au repos.",
    },
    {
      q: 'Puis-je migrer depuis Notion / Asana / Linear ?',
      a: "Oui. CockpitJourney peut importer un export CSV de tâches depuis n'importe quel outil. PROPH3T se charge de classer automatiquement par priorité, projet et estimation. Pour les imports en masse (>1000 tâches), nous avons une procédure dédiée — contactez-nous.",
    },
    {
      q: "Que se passe-t-il si je n'ai pas internet ?",
      a: 'Le cockpit fonctionne en mode dégradé hors-ligne : vous voyez vos données mises en cache et pouvez créer/modifier des tâches localement. Tout se synchronise automatiquement quand la connexion revient. Le mode offline est conçu pour les voyages, les zones de mauvaise réception, et les blackouts.',
    },
    {
      q: 'Est-ce que ça marche pour une équipe ou seulement pour un dirigeant ?',
      a: 'Les deux. Le plan Solo est conçu pour le pilotage individuel (CEO, fondateur, freelance). Le plan Pro déverrouille la collaboration : assignations multi-utilisateurs, watchers, commentaires, mentions, automations qui notifient les bonnes personnes. La hiérarchie de Goals (workspace / équipe / personnel) reflète exactement la structure organisationnelle.',
    },
    {
      q: 'Pourquoi 13e produit Atlas Studio ?',
      a: "Atlas Studio édite une suite cockpit pour dirigeants : comptabilité OHADA (CockpitFnA), signature électronique, CRM, analyse bancaire (AtlasBanx), et 9 autres produits métiers. CockpitJourney est le 13e — celui qui orchestre votre journée de pilotage au-dessus des outils métier. Une seule connexion SSO pour tout l'écosystème.",
    },
  ];
  const faqs = cms?.items ?? fallbackFaqs;
  const eyebrow = cms?.subtitle ?? 'Questions fréquentes';
  const heading = cms?.title ?? "Tout ce que vous voulez savoir avant l'essai.";

  return (
    <section id="faq" className="py-20 sm:py-28 px-6 bg-white border-y border-atlas-line">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <span className="text-2xs uppercase tracking-[0.22em] text-atlas-sage-deep font-light">
            {eyebrow}
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl text-atlas-fg-1 font-light leading-tight">{heading}</h2>
        </div>
        <div className="border-t border-atlas-line">
          {faqs.map((f, i) => (
            <FAQItem key={i} q={f.q} a={f.a} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────── Atlas family ─────────────── */

function AtlasFamily() {
  return (
    <section className="py-20 sm:py-24 px-6 bg-atlas-cream">
      <div className="max-w-4xl mx-auto text-center">
        <span className="text-2xs uppercase tracking-[0.22em] text-atlas-sage-deep font-light">
          La famille Atlas Studio
        </span>
        <h2 className="mt-3 text-2xl sm:text-3xl text-atlas-fg-1 font-light leading-tight mb-4">
          Une suite cockpit conçue pour la décision.
        </h2>
        <p className="text-sm sm:text-base text-atlas-fg-2 leading-relaxed font-light max-w-2xl mx-auto mb-8">
          CockpitJourney est le 13e produit du catalogue Atlas Studio. Une seule connexion vous ouvre l'accès
          à tous les produits — comptabilité OHADA, signature électronique, CRM, analyse bancaire, et plus
          encore.
        </p>
        <a
          href={ATLAS_STUDIO_URL}
          className="inline-flex items-center gap-2 text-sm uppercase tracking-wider font-light text-atlas-sage-deep hover:text-atlas-sage-deeper transition"
        >
          Découvrir le catalogue Atlas Studio
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    </section>
  );
}

/* ─────────────── CTA final ─────────────── */

function CTA({ cms }: { cms?: CtaContent }) {
  const heading = cms?.title ?? 'Prêt à piloter votre journée ?';
  const subtitle =
    cms?.subtitle ??
    "14 jours d'essai gratuit. Aucune carte bancaire. PROPH3T inclus. Vos données restent isolées sur votre cockpit, partagées avec personne.";
  const ctaText = cms?.cta_text ?? 'Démarrer mon essai';
  const ctaUrl = cms?.cta_url ?? TRIAL_URL;
  const fallbackBadges = [
    { icon: 'shieldcheck', label: 'RLS Postgres par utilisateur' },
    { icon: 'globe', label: 'Conforme OHADA · RGPD' },
    { icon: 'brain', label: 'IA gratuite (Groq)' },
    { icon: 'trendingup', label: '13e produit Atlas Studio' },
    { icon: 'flame', label: 'Hébergé en EU (Supabase eu-west-1)' },
  ];
  const badges = cms?.trust_badges ?? fallbackBadges;

  return (
    <section className="py-20 sm:py-28 px-6 bg-gradient-to-br from-atlas-sage-deep via-atlas-sage-deeper to-atlas-fg-1 text-white">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="font-logo text-5xl sm:text-6xl mb-6 leading-tight">{heading}</h2>
        <p className="text-base sm:text-lg text-white/80 leading-relaxed font-light mb-10 max-w-xl mx-auto">
          {subtitle}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={ctaUrl}
            className="inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-white text-atlas-sage-deeper font-light tracking-wider hover:bg-atlas-cream transition text-sm shadow-2xl"
          >
            {ctaText}
            <ArrowRight className="w-4 h-4" />
          </a>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-7 py-4 rounded-xl border border-white/20 hover:border-white/40 hover:bg-white/5 transition text-sm font-light tracking-wider text-white"
          >
            J'ai déjà un compte
          </Link>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-white/60 font-light">
          {badges.map((b, i) => {
            const Icon = resolveIcon(b.icon, ShieldCheck);
            return (
              <span key={`${b.label}-${i}`} className="inline-flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                {b.label}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────── Footer ─────────────── */

function Footer() {
  return (
    <footer className="py-14 px-6 bg-atlas-panel-2 border-t border-atlas-line">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <div className="font-logo text-3xl text-atlas-fg-1 leading-none mb-3">
            Cockpit<span className="text-atlas-sage-deep">Journey</span>
          </div>
          <p className="text-sm text-atlas-fg-2 font-light leading-relaxed max-w-sm">
            Pilotez votre journée. Suite cockpit pour dirigeants, propulsée par l'IA PROPH3T d'Atlas Studio.
          </p>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-light mb-3">Produit</div>
          <ul className="space-y-2 text-sm font-light text-atlas-fg-2">
            <li>
              <a href="#features" className="hover:text-atlas-fg-1 transition">
                Fonctionnalités
              </a>
            </li>
            <li>
              <a href="#prophet" className="hover:text-atlas-fg-1 transition">
                PROPH3T
              </a>
            </li>
            <li>
              <a href="#pricing" className="hover:text-atlas-fg-1 transition">
                Tarifs
              </a>
            </li>
            <li>
              <a href="#faq" className="hover:text-atlas-fg-1 transition">
                FAQ
              </a>
            </li>
            <li>
              <Link to="/login" className="hover:text-atlas-fg-1 transition">
                Se connecter
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-light mb-3">
            Atlas Studio
          </div>
          <ul className="space-y-2 text-sm font-light text-atlas-fg-2">
            <li>
              <a
                href={ATLAS_STUDIO_URL}
                className="hover:text-atlas-fg-1 transition inline-flex items-center gap-1.5"
              >
                Catalogue produits
                <ArrowRight className="w-3 h-3" />
              </a>
            </li>
            <li>
              <a href="/legal/cgu" className="hover:text-atlas-fg-1 transition">
                CGU
              </a>
            </li>
            <li>
              <a href="/legal/confidentialite" className="hover:text-atlas-fg-1 transition">
                Confidentialité
              </a>
            </li>
            <li>
              <a href="/legal/cookies" className="hover:text-atlas-fg-1 transition">
                Cookies
              </a>
            </li>
            <li>
              <a href="/legal/mentions" className="hover:text-atlas-fg-1 transition">
                Mentions légales
              </a>
            </li>
            <li>
              <a
                href="https://github.com/Oss53pa/cockpitJourney"
                className="hover:text-atlas-fg-1 transition inline-flex items-center gap-1.5"
              >
                <Github className="w-3 h-3" />
                GitHub
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-12 pt-6 border-t border-atlas-line flex flex-col sm:flex-row items-center justify-between gap-3 text-2xs text-atlas-fg-3 font-light">
        <div>© {new Date().getFullYear()} Atlas Studio · Tous droits réservés.</div>
        <div className="flex items-center gap-4">
          <span className="font-mono">v1.0</span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-atlas-sage-deep" />
            Hébergé en EU
          </span>
        </div>
      </div>
    </footer>
  );
}
