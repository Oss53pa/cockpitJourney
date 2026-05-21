import { useApp } from '../../stores/appStore';
import { TaskFormModal } from './TaskFormModal';
import { ProjectFormModal } from './ProjectFormModal';
import { FolderFormModal } from './FolderFormModal';
import { GoalFormModal } from './GoalFormModal';
import { ConfirmModal } from './ConfirmModal';
import { SettingsModal } from './SettingsModal';
import { AutomationFormModal } from './AutomationFormModal';
import { BriefModal } from './BriefModal';
import { ShortcutsModal } from './ShortcutsModal';
import { InviteTeamModal } from './InviteTeamModal';
import { FormCreateModal } from './FormCreateModal';

export function ModalRoot() {
  const modal = useApp((s) => s.modal);
  const close = useApp((s) => s.closeModal);

  if (!modal) return null;
  switch (modal.kind) {
    case 'task-create':
      return <TaskFormModal mode="create" initial={modal.payload} onClose={close} />;
    case 'task-edit':
      return <TaskFormModal mode="edit" initial={modal.payload} onClose={close} />;
    case 'task-delete':
      return (
        <ConfirmModal
          title="Supprimer la tâche ?"
          description={modal.payload?.title}
          confirmLabel="Supprimer"
          danger
          onConfirm={modal.payload?.onConfirm}
          onClose={close}
        />
      );
    case 'project-create':
      return <ProjectFormModal onClose={close} />;
    case 'project-edit':
      return <ProjectFormModal initial={modal.payload} onClose={close} />;
    case 'folder-create':
      return <FolderFormModal onClose={close} />;
    case 'folder-edit':
      return <FolderFormModal initial={modal.payload} onClose={close} />;
    case 'project-delete':
      return (
        <ConfirmModal
          title="Supprimer le projet ?"
          description={modal.payload?.title}
          confirmLabel="Supprimer"
          danger
          onConfirm={modal.payload?.onConfirm}
          onClose={close}
        />
      );
    case 'goal-create':
      return <GoalFormModal onClose={close} />;
    case 'goal-edit':
      return <GoalFormModal initial={modal.payload} onClose={close} />;
    case 'automation-create':
      return <AutomationFormModal onClose={close} />;
    case 'automation-edit':
      return <AutomationFormModal initial={modal.payload} onClose={close} />;
    case 'settings':
      return <SettingsModal onClose={close} />;
    case 'invite-team':
      return <InviteTeamModal onClose={close} />;
    case 'proph3t-brief':
      return <BriefModal onClose={close} />;
    case 'shortcuts':
      return <ShortcutsModal onClose={close} />;
    case 'help':
      return <ShortcutsModal onClose={close} />;
    case 'form-create':
      return <FormCreateModal onClose={close} />;
    default:
      return null;
  }
}
