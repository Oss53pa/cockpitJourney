import { Modal } from '../ui/Modal';

const groups = [
  {
    label: 'Navigation',
    items: [
      ['⌘ K', 'Ouvrir la palette de commandes'],
      ['⌘ ⇧ T', 'Capturer une tâche en langage naturel'],
      ['G puis T', "Aller à Aujourd'hui"],
      ['G puis P', 'Aller aux Projets'],
      ['G puis G', 'Aller aux Goals'],
      ['G puis D', 'Aller aux Dashboards'],
      ['G puis F', 'Mode Focus'],
    ],
  },
  {
    label: 'Tâche en focus',
    items: [
      ['Espace', 'Marquer comme terminée'],
      ['E', 'Modifier la tâche'],
      ['C', 'Ajouter un commentaire'],
      ['1-4', 'Définir la priorité'],
      ['Suppr', 'Supprimer (avec confirmation)'],
    ],
  },
  {
    label: 'Général',
    items: [
      ['?', 'Afficher les raccourcis'],
      ['Échap', 'Fermer modale / palette'],
    ],
  },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Raccourcis clavier"
      size="lg"
      footer={
        <button onClick={onClose} className="btn-primary text-sm px-3.5 py-1.5">
          Fermer
        </button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        {groups.map((g) => (
          <section key={g.label}>
            <h3 className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 mb-2">{g.label}</h3>
            <div className="space-y-1.5">
              {g.items.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-atlas-fg-2">{v}</span>
                  <span className="kbd">{k}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
