import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { FieldLabel, NativeSelect, TextInput } from '../ui/Field';
import { useApp } from '../../stores/appStore';

export function InviteTeamModal({ onClose }: { onClose: () => void }) {
  const pushToast = useApp((s) => s.pushToast);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');

  const submit = () => {
    if (!email.trim()) return;
    pushToast({ kind: 'success', title: 'Invitation envoyée', body: `${email} · rôle ${role}` });
    setEmail('');
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Inviter quelqu'un"
      description="Envoyez un lien magique par email · expire sous 7 jours"
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
            Fermer
          </button>
          <button disabled={!email.trim()} onClick={submit} className="btn-primary text-sm px-3.5 py-1.5">
            Envoyer l'invitation
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <FieldLabel>Email</FieldLabel>
          <TextInput
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom@entreprise.com"
          />
        </div>
        <div>
          <FieldLabel>Rôle</FieldLabel>
          <NativeSelect value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="owner">Propriétaire</option>
            <option value="editor">Éditeur</option>
            <option value="commenter">Commentateur</option>
            <option value="reader">Lecteur</option>
          </NativeSelect>
        </div>
      </div>
    </Modal>
  );
}
