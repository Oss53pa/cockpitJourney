import { useState } from 'react';
import {
  ClipboardList,
  Plus,
  Sparkles,
  Copy,
  Eye,
  Edit3,
  Trash2,
  MoreHorizontal,
  ExternalLink,
  Send,
  FileText,
  AlignLeft,
  Hash as HashIcon,
  Mail,
  Phone,
  Link as LinkIcon,
  Calendar,
  ChevronDown,
  ListChecks,
  CheckSquare,
  Paperclip,
  QrCode,
  Power,
} from 'lucide-react';
import { useApp, type IntakeForm, type FormField, type FormFieldType } from '../../stores/appStore';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { Switch, FieldLabel, NativeSelect, TextInput, Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { cn, relativeTime } from '../../lib/utils';

const fieldTypes: { value: FormFieldType; label: string; icon: any }[] = [
  { value: 'short_text', label: 'Texte court', icon: FileText },
  { value: 'long_text', label: 'Texte long', icon: AlignLeft },
  { value: 'number', label: 'Nombre', icon: HashIcon },
  { value: 'email', label: 'E-mail', icon: Mail },
  { value: 'phone', label: 'Téléphone', icon: Phone },
  { value: 'url', label: 'URL', icon: LinkIcon },
  { value: 'date', label: 'Date', icon: Calendar },
  { value: 'select', label: 'Liste', icon: ChevronDown },
  { value: 'multiselect', label: 'Multi-choix', icon: ListChecks },
  { value: 'checkbox', label: 'Case à cocher', icon: CheckSquare },
  { value: 'file', label: 'Fichier', icon: Paperclip },
];

export function FormsView() {
  const forms = useApp((s) => s.forms);
  const openModal = useApp((s) => s.openModal);
  const toggleEnabled = useApp((s) => s.toggleFormEnabled);
  const deleteForm = useApp((s) => s.deleteForm);
  const simulate = useApp((s) => s.simulateFormSubmission);
  const pushToast = useApp((s) => s.pushToast);
  const [openBuilderFor, setOpenBuilderFor] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);

  const totalSubs = forms.reduce((s, f) => s + f.submissions, 0);

  return (
    <div className="px-8 py-7">
      <div className="flex items-end justify-between mb-7">
        <div>
          <div className="text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-medium mb-1">
            Forms d'intake
          </div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Formulaires publics</h1>
          <p className="text-sm text-atlas-fg-3 mt-1">
            {forms.length} formulaires · {totalSubs} soumissions totales · création automatique de tâches
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              pushToast({ kind: 'info', title: 'Modèles bientôt', body: '8 templates pré-configurés' })
            }
            className="btn-secondary text-sm px-3 py-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" /> Modèles
          </button>
          <button onClick={() => openModal('form-create')} className="btn-primary text-sm px-3 py-1.5">
            <Plus className="w-3.5 h-3.5" /> Nouveau form
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {forms.map((f) => (
          <FormCard
            key={f.id}
            form={f}
            onToggle={() => toggleEnabled(f.id)}
            onSimulate={() => simulate(f.id)}
            onDelete={() => {
              if (confirm(`Supprimer "${f.name}" ?`)) deleteForm(f.id);
            }}
            onEdit={() => setOpenBuilderFor(f.id)}
            onPreview={() => setPreviewFor(f.id)}
          />
        ))}
        {forms.length === 0 && (
          <div className="col-span-full panel p-10 text-center">
            <ClipboardList className="w-8 h-8 mx-auto text-atlas-fg-3 mb-2" />
            <h3 className="text-sm font-medium text-atlas-fg-1">Aucun formulaire</h3>
            <p className="text-2xs text-atlas-fg-3 mt-1 mb-4">
              Créez un formulaire d'intake pour collecter demandes externes.
            </p>
            <button
              onClick={() => openModal('form-create')}
              className="btn-primary text-sm px-3.5 py-1.5 inline-flex"
            >
              <Plus className="w-3.5 h-3.5" /> Nouveau form
            </button>
          </div>
        )}
      </div>

      {openBuilderFor && (
        <FormBuilderModal
          form={forms.find((f) => f.id === openBuilderFor)!}
          onClose={() => setOpenBuilderFor(null)}
        />
      )}
      {previewFor && (
        <FormPreviewModal
          form={forms.find((f) => f.id === previewFor)!}
          onClose={() => setPreviewFor(null)}
        />
      )}
    </div>
  );
}

function FormCard({
  form,
  onToggle,
  onSimulate,
  onDelete,
  onEdit,
  onPreview,
}: {
  form: IntakeForm;
  onToggle: () => void;
  onSimulate: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onPreview: () => void;
}) {
  const project = useApp((s) => s.projects.find((p) => p.id === form.projectId));
  const pushToast = useApp((s) => s.pushToast);
  const copyUrl = () => {
    navigator.clipboard?.writeText(form.publicUrl).catch(() => {});
    pushToast({ kind: 'success', title: 'URL publique copiée' });
  };

  return (
    <article
      className={cn('panel p-5 transition-colors', form.enabled ? 'hover:border-atlas-line-2' : 'opacity-80')}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center',
            form.enabled
              ? 'bg-atlas-amber/15 text-atlas-amber-deep border border-atlas-amber/30'
              : 'bg-black/[0.04] text-atlas-fg-3 border border-atlas-line'
          )}
        >
          <ClipboardList className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-medium text-atlas-fg-1 truncate">{form.name}</h3>
            {form.enabled ? (
              <span className="chip bg-signal-green/15 text-signal-green border border-signal-green/25">
                ● Actif
              </span>
            ) : (
              <span className="chip bg-black/[0.04] text-atlas-fg-3 border border-atlas-line">○ Inactif</span>
            )}
          </div>
          {form.description && <p className="text-xs text-atlas-fg-3 mt-1">{form.description}</p>}
          <div className="mt-3 flex items-center gap-3 text-2xs text-atlas-fg-3">
            <span>
              <strong className="text-atlas-fg-1">{form.submissions}</strong> soumissions
            </span>
            <span>·</span>
            <span>
              <strong className="text-atlas-fg-1">{form.fields.length}</strong> champs
            </span>
            <span>·</span>
            <span>Créé {relativeTime(form.createdAt)}</span>
          </div>
          {project && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-2xs text-atlas-fg-3">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: project.color }} />
              Crée des tâches dans <strong className="text-atlas-fg-2">{project.name}</strong>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch checked={form.enabled} onChange={onToggle} />
          <Menu
            trigger={
              <button className="btn-ghost !p-2">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            }
          >
            {(close) => (
              <>
                <MenuLabel>Form</MenuLabel>
                <MenuItem
                  icon={Edit3}
                  onClick={() => {
                    close();
                    onEdit();
                  }}
                >
                  Modifier les champs
                </MenuItem>
                <MenuItem
                  icon={Eye}
                  onClick={() => {
                    close();
                    onPreview();
                  }}
                >
                  Prévisualiser
                </MenuItem>
                <MenuItem
                  icon={Copy}
                  onClick={() => {
                    close();
                    copyUrl();
                  }}
                >
                  Copier URL publique
                </MenuItem>
                <MenuItem
                  icon={Send}
                  onClick={() => {
                    close();
                    onSimulate();
                  }}
                >
                  Simuler une soumission
                </MenuItem>
                <MenuItem
                  icon={Power}
                  onClick={() => {
                    close();
                    onToggle();
                  }}
                >
                  {form.enabled ? 'Désactiver' : 'Activer'}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  danger
                  icon={Trash2}
                  onClick={() => {
                    close();
                    onDelete();
                  }}
                >
                  Supprimer
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>

      <div className="mt-4 surface px-3 py-2.5 flex items-center gap-3">
        <LinkIcon className="w-3.5 h-3.5 text-atlas-fg-3 shrink-0" />
        <span className="font-mono text-2xs text-atlas-fg-2 flex-1 truncate">{form.publicUrl}</span>
        <button
          onClick={copyUrl}
          className="btn-ghost !p-1.5 text-atlas-fg-3 hover:text-atlas-fg-1"
          title="Copier"
        >
          <Copy className="w-3 h-3" />
        </button>
        <button
          onClick={() => pushToast({ kind: 'info', title: 'QR code généré', body: '512×512 PNG' })}
          className="btn-ghost !p-1.5 text-atlas-fg-3 hover:text-atlas-fg-1"
          title="QR code"
        >
          <QrCode className="w-3 h-3" />
        </button>
        <a
          href={form.publicUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost !p-1.5 text-atlas-fg-3 hover:text-atlas-fg-1"
          title="Ouvrir"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {form.fields.slice(0, 6).map((f) => {
          const ft = fieldTypes.find((x) => x.value === f.type);
          const Icon = ft?.icon || FileText;
          return (
            <span key={f.id} className="chip bg-black/[0.04] text-atlas-fg-2 border border-atlas-line">
              <Icon className="w-3 h-3" /> {f.label}
              {f.required && <span className="text-signal-red ml-0.5">*</span>}
            </span>
          );
        })}
        {form.fields.length > 6 && (
          <span className="text-2xs text-atlas-fg-3">+{form.fields.length - 6}</span>
        )}
      </div>
    </article>
  );
}

/* ───────────────────────── Form Builder Modal ───────────────────────── */
function FormBuilderModal({ form, onClose }: { form: IntakeForm; onClose: () => void }) {
  const updateForm = useApp((s) => s.updateForm);
  const addField = useApp((s) => s.addFormField);
  const updateField = useApp((s) => s.updateFormField);
  const removeField = useApp((s) => s.removeFormField);
  const projects = useApp((s) => s.projects);
  const pushToast = useApp((s) => s.pushToast);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Constructeur : ${form.name}`}
      description="Drag & drop · 11 types de champs · validation conditionnelle"
      size="xl"
      footer={
        <button
          onClick={() => {
            onClose();
            pushToast({ kind: 'success', title: 'Form enregistré' });
          }}
          className="btn-primary text-sm px-3.5 py-1.5"
        >
          Terminé
        </button>
      }
    >
      <div className="grid grid-cols-3 gap-5">
        {/* Settings */}
        <div className="col-span-1 space-y-4">
          <div>
            <FieldLabel>Nom du form</FieldLabel>
            <TextInput value={form.name} onChange={(e) => updateForm(form.id, { name: e.target.value })} />
          </div>
          <div>
            <FieldLabel>Description</FieldLabel>
            <Textarea
              rows={2}
              value={form.description || ''}
              onChange={(e) => updateForm(form.id, { description: e.target.value })}
            />
          </div>
          <div>
            <FieldLabel>Projet cible</FieldLabel>
            <NativeSelect
              value={form.projectId}
              onChange={(e) => updateForm(form.id, { projectId: e.target.value })}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="surface p-3">
            <FieldLabel>Ajouter un champ</FieldLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {fieldTypes.map((ft) => {
                const Icon = ft.icon;
                return (
                  <button
                    key={ft.value}
                    onClick={() =>
                      addField(form.id, {
                        type: ft.value,
                        label: ft.label,
                        required: false,
                        options:
                          ft.value === 'select' || ft.value === 'multiselect'
                            ? ['Option 1', 'Option 2']
                            : undefined,
                      })
                    }
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-atlas-line hover:border-atlas-amber/40 text-2xs text-atlas-fg-2"
                  >
                    <Icon className="w-3 h-3 text-atlas-amber-deep" />
                    {ft.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Field list */}
        <div className="col-span-2 space-y-2 max-h-[60vh] overflow-y-auto pr-2">
          <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium px-1">
            Champs ({form.fields.length})
          </div>
          {form.fields.map((f, i) => (
            <FieldEditor
              key={f.id}
              field={f}
              index={i}
              onChange={(patch) => updateField(form.id, f.id, patch)}
              onRemove={() => removeField(form.id, f.id)}
            />
          ))}
          {form.fields.length === 0 && (
            <div className="text-center text-2xs text-atlas-fg-3 italic py-8">
              Aucun champ — ajoutez-en depuis la palette à gauche.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function FieldEditor({
  field,
  index,
  onChange,
  onRemove,
}: {
  field: FormField;
  index: number;
  onChange: (patch: Partial<FormField>) => void;
  onRemove: () => void;
}) {
  const ft = fieldTypes.find((x) => x.value === field.type)!;
  const Icon = ft.icon;
  return (
    <div className="rounded-xl bg-white border border-atlas-line p-3 space-y-2 hover:border-atlas-line-2 transition-colors">
      <div className="flex items-center gap-2">
        <span className="font-mono text-2xs text-atlas-fg-3 w-6 text-right">
          {String(index + 1).padStart(2, '0')}
        </span>
        <Icon className="w-3.5 h-3.5 text-atlas-amber-deep" />
        <input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="flex-1 text-sm font-medium text-atlas-fg-1 bg-transparent outline-none border-b border-transparent focus:border-atlas-amber"
        />
        <label className="inline-flex items-center gap-1.5 text-2xs text-atlas-fg-3">
          <input
            type="checkbox"
            checked={!!field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="accent-atlas-amber"
          />
          requis
        </label>
        <button onClick={onRemove} className="btn-ghost !p-1.5 text-atlas-fg-3 hover:text-signal-red">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {(field.type === 'short_text' ||
        field.type === 'long_text' ||
        field.type === 'email' ||
        field.type === 'phone' ||
        field.type === 'url' ||
        field.type === 'number') && (
        <input
          value={field.placeholder || ''}
          onChange={(e) => onChange({ placeholder: e.target.value })}
          placeholder="Placeholder…"
          className="w-full h-8 px-3 rounded-md bg-black/[0.02] border border-atlas-line text-2xs text-atlas-fg-2 outline-none focus:border-atlas-amber"
        />
      )}
      {(field.type === 'select' || field.type === 'multiselect') && (
        <input
          value={(field.options || []).join(', ')}
          onChange={(e) =>
            onChange({
              options: e.target.value
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean),
            })
          }
          placeholder="Option 1, Option 2, Option 3…"
          className="w-full h-8 px-3 rounded-md bg-black/[0.02] border border-atlas-line text-2xs text-atlas-fg-2 outline-none focus:border-atlas-amber"
        />
      )}
    </div>
  );
}

/* ───────────────────────── Form Preview Modal ───────────────────────── */
function FormPreviewModal({ form, onClose }: { form: IntakeForm; onClose: () => void }) {
  const simulate = useApp((s) => s.simulateFormSubmission);
  return (
    <Modal
      open
      onClose={onClose}
      title="Aperçu public"
      description="Ce que verront vos visiteurs externes"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
            Fermer
          </button>
          <button
            onClick={() => {
              simulate(form.id);
              onClose();
            }}
            className="btn-primary text-sm px-3.5 py-1.5"
          >
            <Send className="w-3.5 h-3.5" /> Tester l'envoi
          </button>
        </>
      }
    >
      <div className="bg-atlas-black -m-6 p-8 rounded-b-2xl">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-soft-pop p-6">
          <h2 className="font-display text-xl font-medium text-atlas-fg-1">{form.name}</h2>
          {form.description && <p className="text-sm text-atlas-fg-3 mt-1">{form.description}</p>}
          <div className="mt-5 space-y-4">
            {form.fields.map((f) => (
              <PreviewField key={f.id} field={f} />
            ))}
            <button className="btn-primary w-full text-sm py-2.5">Envoyer</button>
            <div className="text-2xs text-atlas-fg-3 text-center">
              Captcha · Anti-spam · Privacy by design
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function PreviewField({ field }: { field: FormField }) {
  const label = (
    <FieldLabel>
      {field.label}
      {field.required && <span className="text-signal-red ml-0.5">*</span>}
    </FieldLabel>
  );
  switch (field.type) {
    case 'short_text':
    case 'email':
    case 'phone':
    case 'url':
      return (
        <div>
          {label}
          <TextInput placeholder={field.placeholder} />
        </div>
      );
    case 'number':
      return (
        <div>
          {label}
          <TextInput type="number" placeholder={field.placeholder} />
        </div>
      );
    case 'long_text':
      return (
        <div>
          {label}
          <Textarea rows={3} placeholder={field.placeholder} />
        </div>
      );
    case 'date':
      return (
        <div>
          {label}
          <TextInput type="date" />
        </div>
      );
    case 'select':
      return (
        <div>
          {label}
          <NativeSelect>
            {(field.options || []).map((o, i) => (
              <option key={i} value={o}>
                {o}
              </option>
            ))}
          </NativeSelect>
        </div>
      );
    case 'multiselect':
      return (
        <div>
          {label}
          <div className="space-y-1.5">
            {(field.options || []).map((o, i) => (
              <label key={i} className="flex items-center gap-2 text-sm text-atlas-fg-2">
                <input type="checkbox" className="accent-atlas-amber" /> {o}
              </label>
            ))}
          </div>
        </div>
      );
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-sm text-atlas-fg-2">
          <input type="checkbox" className="accent-atlas-amber" /> {field.label}
        </label>
      );
    case 'file':
      return (
        <div>
          {label}
          <div className="border-2 border-dashed border-atlas-line rounded-lg p-4 text-center text-2xs text-atlas-fg-3">
            <Paperclip className="w-4 h-4 mx-auto mb-1" />
            Cliquez ou glissez un fichier
          </div>
        </div>
      );
  }
}
