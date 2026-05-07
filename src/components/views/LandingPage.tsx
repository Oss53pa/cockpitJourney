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
} from 'lucide-react';

const ATLAS_STUDIO_URL = 'https://atlas-studio.org';
const TRIAL_URL = 'https://atlas-studio.org/portal/apps?app=cockpitjourney';

interface FeatureCard {
  icon: typeof Sunrise;
  title: string;
  body: string;
}

const HERO_FEATURES: FeatureCard[] = [
  {
    icon: Sunrise,
    title: 'Daily Brief PROPH3T',
    body: 'Chaque matin à 7h, un brief généré par IA : top 3 priorités, risques, fenêtre de Deep Work, suggestions de réordonnancement.',
  },
  {
    icon: Workflow,
    title: 'Automations sans code',
    body: 'Quand un statut passe à "En revue" → notification WhatsApp. Échéance dépassée + Critique → escalade auto. 0 ligne de code.',
  },
  {
    icon: Target,
    title: 'Goals & OKRs',
    body: 'Cap stratégique aligné par niveau (workspace / équipe / personnel). Liez vos tâches aux goals, suivez le progress en temps réel.',
  },
];

const MODULES = [
  { icon: Sunrise, label: 'Aujourd’hui', sub: 'Daily Brief & focus' },
  { icon: Inbox, label: 'Boîte d’entrée', sub: 'Capture brute' },
  { icon: ListChecks, label: 'Projets Kanban', sub: 'Drag & drop dnd-kit' },
  { icon: Target, label: 'Goals & OKRs', sub: 'Cap stratégique' },
  { icon: LayoutDashboard, label: 'Dashboards', sub: 'Vue exécutive' },
  { icon: Timer, label: 'Mode Focus', sub: 'Pomodoro · Deep Work' },
  { icon: FileText, label: 'Rapports IA', sub: 'Hebdo · Mensuel · Trimestriel' },
  { icon: Mail, label: 'Forms d’intake', sub: 'Tickets entrants → tâches' },
  { icon: Workflow, label: 'Automations', sub: 'Triggers · Conditions · Actions' },
];

const PROPHET_CAPS = [
  'Parser une tâche en langage naturel ("appeler Koffi vendredi 15h, P1")',
  'Générer le Daily Brief avec priorités, risques et insights',
  'Reformuler une description (Impact / Dépendances / Critères de succès)',
  'Suggérer 5–7 tâches contributrices à un Goal',
  'Narration exécutive d’un rapport hebdomadaire (markdown)',
  'Détecter les patterns d’estimation et affiner avec ±15% de marge',
];

export function LandingPage() {
  return (
    <div className="min-h-screen w-full bg-atlas-cream text-atlas-fg-1 overflow-x-hidden">
      <Nav />
      <Hero />
      <ValueProps />
      <PropheticBlock />
      <Modules />
      <AtlasFamily />
      <CTA />
      <Footer />
    </div>
  );
}

/* ─────────────── Top nav ─────────────── */

function Nav() {
  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-atlas-cream/80 border-b border-atlas-line">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-logo text-3xl text-atlas-fg-1 leading-none">
            Cockpit<span className="text-atlas-sage-deep">Journey</span>
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-6 text-sm font-light text-atlas-fg-2">
          <a href="#features" className="hover:text-atlas-fg-1 transition">
            Fonctionnalités
          </a>
          <a href="#prophet" className="hover:text-atlas-fg-1 transition">
            PROPH3T
          </a>
          <a href="#modules" className="hover:text-atlas-fg-1 transition">
            Modules
          </a>
          <a href="#atlas" className="hover:text-atlas-fg-1 transition">
            Atlas Studio
          </a>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="text-xs uppercase tracking-wider font-light text-atlas-fg-2 hover:text-atlas-fg-1 transition px-3 py-2"
          >
            Se connecter
          </Link>
          <a
            href={TRIAL_URL}
            className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-light text-white bg-atlas-sage-deep hover:bg-atlas-sage-deeper transition px-4 py-2 rounded-xl shadow-amber-deep"
          >
            Essai gratuit
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ─────────────── Hero ─────────────── */

function Hero() {
  return (
    <section className="relative pt-20 pb-24 sm:pt-28 sm:pb-32 px-6">
      <div className="absolute inset-0 bg-aurora opacity-60 pointer-events-none" aria-hidden="true" />
      <div className="relative max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-atlas-sage/10 border border-atlas-sage/20 mb-8">
          <Sparkles className="w-3.5 h-3.5 text-atlas-sage-deep" />
          <span className="text-2xs uppercase tracking-[0.2em] text-atlas-sage-deeper font-light">
            13e produit du catalogue Atlas Studio
          </span>
        </div>
        <h1 className="font-logo text-6xl sm:text-7xl md:text-8xl text-atlas-fg-1 leading-[1.05] mb-6">
          Pilotez votre <span className="text-atlas-sage-deep">journée</span>.
        </h1>
        <p className="max-w-2xl mx-auto text-lg sm:text-xl text-atlas-fg-2 leading-relaxed font-light mb-10">
          Le compagnon quotidien de gestion de tâches et de projets pour dirigeants — propulsé par{' '}
          <strong className="font-normal text-atlas-sage-deep">PROPH3T</strong>, l'IA d'Atlas Studio. Daily
          Brief intelligent, automations sans code, goals alignés.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={TRIAL_URL}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-atlas-sage-deep text-white font-light tracking-wider hover:bg-atlas-sage-deeper transition shadow-amber-deep text-sm"
          >
            Démarrer un essai gratuit · 14 jours
            <ArrowRight className="w-4 h-4" />
          </a>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-atlas-line bg-white hover:border-atlas-sage-deep/40 hover:bg-atlas-sage/5 transition text-sm font-light tracking-wider text-atlas-fg-1"
          >
            Voir une démo
          </Link>
        </div>
        <p className="mt-6 text-xs text-atlas-fg-3 font-light">
          Sans carte bancaire · Données isolées par utilisateur · IA gratuite incluse
        </p>

        {/* Visual proof — mockup placeholder */}
        <div className="mt-16 mx-auto max-w-4xl rounded-2xl shadow-soft-pop border border-atlas-line bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-atlas-line flex items-center gap-2 bg-atlas-panel-2">
            <span className="w-2.5 h-2.5 rounded-full bg-signal-red/40" />
            <span className="w-2.5 h-2.5 rounded-full bg-signal-yellow/40" />
            <span className="w-2.5 h-2.5 rounded-full bg-signal-green/40" />
            <span className="ml-3 text-2xs font-mono text-atlas-fg-3">cockpitjourney.app/dashboard</span>
          </div>
          <div className="aspect-[16/9] bg-gradient-to-br from-atlas-cream via-white to-atlas-sage/10 grid place-items-center text-atlas-fg-3 font-light text-sm tracking-wide">
            <div className="text-center">
              <LayoutDashboard className="w-12 h-12 mx-auto mb-3 text-atlas-sage-deep/40" />
              Aperçu du cockpit · Daily Brief, Kanban, Goals, Reports
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────── Value props (3 colonnes) ─────────────── */

function ValueProps() {
  return (
    <section id="features" className="py-20 sm:py-28 px-6 bg-white border-y border-atlas-line">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <span className="text-2xs uppercase tracking-[0.22em] text-atlas-sage-deep font-light">
            Pourquoi CockpitJourney
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl text-atlas-fg-1 font-light leading-tight max-w-2xl mx-auto">
            Conçu pour ceux qui décident, pas pour ceux qui exécutent.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {HERO_FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="p-6 rounded-2xl border border-atlas-line bg-atlas-panel-2 hover:border-atlas-sage-deep/30 hover:shadow-panel transition"
              >
                <div className="w-10 h-10 rounded-xl bg-atlas-sage/15 grid place-items-center mb-4">
                  <Icon className="w-5 h-5 text-atlas-sage-deep" />
                </div>
                <h3 className="text-lg font-light text-atlas-fg-1 mb-2">{f.title}</h3>
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
  return (
    <section
      id="prophet"
      className="py-20 sm:py-28 px-6 bg-gradient-to-br from-atlas-cream via-white to-atlas-sage/5"
    >
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
            {PROPHET_CAPS.map((cap, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-atlas-fg-2 font-light">
                <Sparkles className="w-3.5 h-3.5 text-atlas-sage-deep mt-1 shrink-0" />
                <span className="leading-relaxed">{cap}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-atlas-fg-3 font-light">
            Compatible Groq (gratuit) · OpenRouter · Ollama auto-hébergé
          </p>
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
              Bonjour Pamela. 4 priorités aujourd'hui.
            </h3>
            <div className="space-y-3">
              {[
                {
                  badge: 'P1',
                  text: 'Validation Daily Brief — design system tokens (Koffi)',
                  color: 'bg-signal-red/10 text-signal-red',
                },
                {
                  badge: 'P2',
                  text: 'CoDir Cosmos — point budget 2027',
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
  return (
    <section id="modules" className="py-20 sm:py-28 px-6 bg-white border-y border-atlas-line">
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
          {MODULES.map((m) => {
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

/* ─────────────── Atlas family ─────────────── */

function AtlasFamily() {
  return (
    <section id="atlas" className="py-20 sm:py-24 px-6 bg-atlas-cream">
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

function CTA() {
  return (
    <section className="py-20 sm:py-28 px-6 bg-gradient-to-br from-atlas-sage-deep via-atlas-sage-deeper to-atlas-fg-1 text-white">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="font-logo text-5xl sm:text-6xl mb-6 leading-tight">Prêt à piloter votre journée ?</h2>
        <p className="text-base sm:text-lg text-white/80 leading-relaxed font-light mb-10 max-w-xl mx-auto">
          14 jours d'essai gratuit. Aucune carte bancaire. PROPH3T inclus. Vos données restent isolées sur
          votre cockpit, partagées avec personne.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={TRIAL_URL}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white text-atlas-sage-deeper font-light tracking-wider hover:bg-atlas-cream transition text-sm"
          >
            Démarrer mon essai
            <ArrowRight className="w-4 h-4" />
          </a>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-white/20 hover:border-white/40 hover:bg-white/5 transition text-sm font-light tracking-wider text-white"
          >
            J'ai déjà un compte
          </Link>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-white/60 font-light">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            RLS Postgres par utilisateur
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5" />
            IA gratuite (Groq)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            13e produit Atlas Studio
          </span>
        </div>
      </div>
    </section>
  );
}

/* ─────────────── Footer ─────────────── */

function Footer() {
  return (
    <footer className="py-12 px-6 bg-atlas-panel-2 border-t border-atlas-line">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <div className="font-logo text-2xl text-atlas-fg-1 leading-none mb-2">
            Cockpit<span className="text-atlas-sage-deep">Journey</span>
          </div>
          <p className="text-2xs text-atlas-fg-3 font-light leading-relaxed">
            Pilotez votre journée. Suite cockpit pour dirigeants par Atlas Studio.
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
              <a href="#modules" className="hover:text-atlas-fg-1 transition">
                Modules
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
              <a href={`${ATLAS_STUDIO_URL}/portal/legal/cgu`} className="hover:text-atlas-fg-1 transition">
                CGU
              </a>
            </li>
            <li>
              <a
                href={`${ATLAS_STUDIO_URL}/portal/legal/privacy`}
                className="hover:text-atlas-fg-1 transition"
              >
                Confidentialité
              </a>
            </li>
            <li>
              <a
                href="https://github.com/Oss53pa/cockpitJourney"
                className="hover:text-atlas-fg-1 transition inline-flex items-center gap-1.5"
              >
                <Github className="w-3 h-3" />
                Code source
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-atlas-line flex flex-col sm:flex-row items-center justify-between gap-2 text-2xs text-atlas-fg-3 font-light">
        <div>© 2026 Atlas Studio · Pamela Atokouna · Tous droits réservés.</div>
        <div className="font-mono">v1.0 · 13e produit du catalogue</div>
      </div>
    </footer>
  );
}
