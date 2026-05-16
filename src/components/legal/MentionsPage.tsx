import { LegalLayout, LegalH2, LegalP, LegalTODO } from './LegalLayout';

export function MentionsPage() {
  return (
    <LegalLayout title="Mentions légales" lastUpdated="2026-05-15">
      <LegalH2>Éditeur</LegalH2>
      <LegalTODO>
        À COMPLÉTER avec les informations légales exactes de la société éditrice. Une fois ces informations
        remplies, supprimer ce bloc jaune et le remplacer par le texte définitif.
        <br />
        <br />
        Modèle :
        <br />
        <strong>Dénomination sociale</strong> : Atlas Studio SARL (ou SAS / SA selon votre statut)
        <br />
        <strong>Forme juridique</strong> : (SARL, SAS, etc.)
        <br />
        <strong>Capital social</strong> : (montant en FCFA ou €)
        <br />
        <strong>Siège social</strong> : (adresse complète)
        <br />
        <strong>RCCM</strong> : (numéro Registre du Commerce et du Crédit Mobilier — OHADA) ou SIRET / SIREN
        si France
        <br />
        <strong>Identifiant fiscal</strong> : (numéro contribuable CI ou N° TVA intracom EU)
        <br />
        <strong>Représentant légal</strong> : Pamela Atokouna, Présidente
        <br />
        <strong>E-mail</strong> : <a href="mailto:bonjour@atlas-studio.org">bonjour@atlas-studio.org</a>
      </LegalTODO>

      <LegalH2>Directeur de la publication</LegalH2>
      <LegalP>Pamela Atokouna</LegalP>

      <LegalH2>Hébergeur</LegalH2>
      <LegalP>
        <strong>Vercel Inc.</strong> — 340 S Lemon Ave #4133, Walnut, CA 91789, USA
        <br />
        Site :{' '}
        <a href="https://vercel.com" className="text-atlas-sage-deep underline">
          vercel.com
        </a>
      </LegalP>
      <LegalP>
        <strong>Supabase Inc.</strong> (base de données + authentification) — 970 Toa Payoh North #07-04,
        Singapour
        <br />
        Site :{' '}
        <a href="https://supabase.com" className="text-atlas-sage-deep underline">
          supabase.com
        </a>
        <br />
        Région d'hébergement des données : Francfort, Allemagne (<code>eu-central-1</code>)
      </LegalP>

      <LegalH2>Propriété intellectuelle</LegalH2>
      <LegalP>
        L'ensemble du site (textes, graphismes, logos, icônes, sons, logiciels) est la propriété exclusive
        d'Atlas Studio et de ses concédants. Toute reproduction, représentation, modification, publication,
        adaptation totale ou partielle des éléments du site, quel que soit le moyen ou le procédé utilisé, est
        interdite sans autorisation écrite préalable.
      </LegalP>
      <LegalP>
        <strong>CockpitJourney</strong>, <strong>PROPH3T</strong> et <strong>Atlas Studio</strong> sont des
        marques d'Atlas Studio.
      </LegalP>

      <LegalH2>Crédits</LegalH2>
      <LegalP>
        Design et développement par l'équipe Atlas Studio. Iconographie sous licence ouverte :{' '}
        <a href="https://lucide.dev" className="text-atlas-sage-deep underline">
          Lucide
        </a>
        . Typographie : Inter (Rasmus Andersson, OFL) et Grand Hotel (Brian J. Bonislawsky, OFL).
      </LegalP>

      <LegalH2>Contact</LegalH2>
      <LegalP>
        Pour toute question juridique :{' '}
        <a href="mailto:legal@atlas-studio.org" className="text-atlas-sage-deep underline">
          legal@atlas-studio.org
        </a>
        <br />
        Pour la protection des données :{' '}
        <a href="mailto:privacy@atlas-studio.org" className="text-atlas-sage-deep underline">
          privacy@atlas-studio.org
        </a>
        <br />
        Pour le support :{' '}
        <a href="mailto:bonjour@atlas-studio.org" className="text-atlas-sage-deep underline">
          bonjour@atlas-studio.org
        </a>
      </LegalP>
    </LegalLayout>
  );
}
