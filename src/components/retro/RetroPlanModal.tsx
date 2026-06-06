import { Modal } from '../ui/Modal';
import { useApp } from '../../stores/appStore';
import { RetroPlanPanel } from './RetroPlanPanel';

/** Rétroplanning d'un projet, présenté en modale (ModalKind 'retroplan'). */
export function RetroPlanModal({
  payload,
  onClose,
}: {
  payload: { projectId: string };
  onClose: () => void;
}) {
  const project = useApp((s) => s.projects.find((p) => p.id === payload?.projectId));
  const updateProject = useApp((s) => s.updateProject);

  if (!project) return null;

  return (
    <Modal open onClose={onClose} title="Rétroplanning" description={project.name} size="lg">
      {/* RetroPlanPanel applique son propre padding px-6 py-5 — on neutralise
          celui du Modal via une marge négative pour rester homogène. */}
      <div className="-mx-6 -my-5">
        <RetroPlanPanel
          plan={project.retroplan}
          defaultTarget={project.endDate}
          onChange={(plan) => updateProject(project.id, { retroplan: plan })}
        />
      </div>
    </Modal>
  );
}
