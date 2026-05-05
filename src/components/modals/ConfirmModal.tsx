import { Modal } from '../ui/Modal';
import { AlertTriangle } from 'lucide-react';

interface Props {
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  title,
  description,
  confirmLabel = 'Confirmer',
  danger,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
            Annuler
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={danger ? 'btn-danger text-sm px-3.5 py-1.5' : 'btn-primary text-sm px-3.5 py-1.5'}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {danger && (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-signal-red/10 border border-signal-red/30 text-signal-red">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">Cette action est irréversible.</span>
        </div>
      )}
    </Modal>
  );
}
