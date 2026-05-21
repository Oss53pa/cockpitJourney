import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

/**
 * Public, unauthenticated intake form. Loads the form definition through the
 * `form-public` edge function (service-role, read-only) and submits answers
 * through `form-submit`, which creates a task for the form owner.
 *
 * Both edge functions must be deployed with `verify_jwt = false` so anonymous
 * visitors can reach them; the anon apikey is still sent as a header.
 */

type FieldType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'email'
  | 'phone'
  | 'url'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'file';

interface PublicField {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

interface PublicForm {
  id: string;
  name: string;
  description?: string;
  fields: PublicField[];
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export default function PublicFormPage() {
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<PublicForm | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'sent' | 'error'>('loading');
  const [values, setValues] = useState<Record<string, string | string[] | boolean>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!id || !SUPABASE_URL || !ANON_KEY) {
      setStatus('notfound');
      return;
    }
    fetch(`${SUPABASE_URL}/functions/v1/form-public?id=${encodeURIComponent(id)}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: PublicForm) => {
        setForm(data);
        setStatus('ready');
      })
      .catch(() => setStatus('notfound'));
  }, [id]);

  const setValue = (fieldId: string, v: string | string[] | boolean) =>
    setValues((s) => ({ ...s, [fieldId]: v }));

  const submit = async () => {
    if (!form || sending) return;
    // Required-field validation at the boundary.
    const missing = form.fields.find((f) => {
      if (!f.required) return false;
      const v = values[f.id];
      if (f.type === 'multiselect') return !Array.isArray(v) || v.length === 0;
      if (f.type === 'checkbox') return v !== true;
      return v === undefined || v === '';
    });
    if (missing) {
      setStatus('error');
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/form-submit`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY!,
          Authorization: `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ formId: form.id, values }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus('sent');
    } catch {
      setStatus('error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-atlas-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-soft-pop p-6">
        {status === 'loading' && <p className="text-sm text-atlas-fg-3 text-center py-8">Chargement…</p>}

        {status === 'notfound' && (
          <div className="text-center py-8">
            <h1 className="font-display text-xl font-medium text-atlas-fg-1">Formulaire indisponible</h1>
            <p className="text-sm text-atlas-fg-3 mt-2">Ce formulaire n'existe pas ou n'est plus actif.</p>
          </div>
        )}

        {status === 'sent' && (
          <div className="text-center py-8">
            <h1 className="font-display text-xl font-medium text-atlas-fg-1">Merci !</h1>
            <p className="text-sm text-atlas-fg-3 mt-2">Votre réponse a bien été envoyée.</p>
          </div>
        )}

        {(status === 'ready' || status === 'error') && form && (
          <>
            <h1 className="font-display text-xl font-medium text-atlas-fg-1">{form.name}</h1>
            {form.description && <p className="text-sm text-atlas-fg-3 mt-1">{form.description}</p>}
            {status === 'error' && (
              <p className="text-2xs text-signal-red mt-2">Vérifiez les champs requis, puis réessayez.</p>
            )}
            <div className="mt-5 space-y-4">
              {form.fields.map((f) => (
                <PublicFieldInput
                  key={f.id}
                  field={f}
                  value={values[f.id]}
                  onChange={(v) => setValue(f.id, v)}
                />
              ))}
              <button
                onClick={submit}
                disabled={sending}
                className="btn-primary w-full text-sm py-2.5 justify-center"
              >
                {sending ? 'Envoi…' : 'Envoyer'}
              </button>
              <p className="text-2xs text-atlas-fg-3 text-center">Propulsé par CockpitJourney</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PublicFieldInput({
  field,
  value,
  onChange,
}: {
  field: PublicField;
  value: string | string[] | boolean | undefined;
  onChange: (v: string | string[] | boolean) => void;
}) {
  const label = (
    <label className="block text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium mb-1">
      {field.label}
      {field.required && <span className="text-signal-red ml-0.5">*</span>}
    </label>
  );
  const inputCls =
    'w-full h-10 px-3 rounded-lg bg-black/[0.02] border border-atlas-line text-sm text-atlas-fg-1 outline-none focus:border-atlas-amber';

  switch (field.type) {
    case 'long_text':
      return (
        <div>
          {label}
          <textarea
            rows={3}
            placeholder={field.placeholder}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-black/[0.02] border border-atlas-line text-sm text-atlas-fg-1 outline-none focus:border-atlas-amber"
          />
        </div>
      );
    case 'select':
      return (
        <div>
          {label}
          <select
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className={inputCls}
          >
            <option value="">—</option>
            {(field.options || []).map((o, i) => (
              <option key={i} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      );
    case 'multiselect':
      return (
        <div>
          {label}
          <div className="space-y-1.5">
            {(field.options || []).map((o, i) => {
              const arr = Array.isArray(value) ? value : [];
              return (
                <label key={i} className="flex items-center gap-2 text-sm text-atlas-fg-2">
                  <input
                    type="checkbox"
                    className="accent-atlas-amber"
                    checked={arr.includes(o)}
                    onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))}
                  />
                  {o}
                </label>
              );
            })}
          </div>
        </div>
      );
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-sm text-atlas-fg-2">
          <input
            type="checkbox"
            className="accent-atlas-amber"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.label}
        </label>
      );
    case 'file':
      // File uploads need storage wiring; collect the file name as text for now.
      return (
        <div>
          {label}
          <input
            type="text"
            placeholder="Lien vers le fichier (Drive, Dropbox…)"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className={inputCls}
          />
        </div>
      );
    default:
      return (
        <div>
          {label}
          <input
            type={
              field.type === 'number'
                ? 'number'
                : field.type === 'email'
                  ? 'email'
                  : field.type === 'date'
                    ? 'date'
                    : field.type === 'url'
                      ? 'url'
                      : field.type === 'phone'
                        ? 'tel'
                        : 'text'
            }
            placeholder={field.placeholder}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className={inputCls}
          />
        </div>
      );
  }
}
