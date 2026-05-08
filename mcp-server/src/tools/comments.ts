/**
 * Communication tools — add_comment / add_note.
 *
 * Comments are short threaded posts on a task (with optional @mentions).
 * Notes are longer markdown-rich content attached to a task (think
 * "meeting notes" or "decision log"). Both go into their own table.
 */
import type { ToolDefinition } from './common.js';
import { requireScope } from '../auth.js';

interface AddCommentArgs {
  task_id: string;
  text: string;
  mentions?: string[];
}

interface AddNoteArgs {
  task_id: string;
  content: string;
}

export const addComment: ToolDefinition<AddCommentArgs> = {
  name: 'cj_add_comment',
  description:
    "Ajoute un commentaire sur une tâche. Mentions optionnelles : liste d'emails ou d'IDs utilisateur — déclenche les notifications dans CockpitJourney.",
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'ID de la tâche cible' },
      text: { type: 'string', minLength: 1, description: 'Contenu du commentaire (texte simple)' },
      mentions: {
        type: 'array',
        items: { type: 'string' },
        description: "@mentions par email ou user_id (déclenche notifications)",
      },
    },
    required: ['task_id', 'text'],
    additionalProperties: false,
  },
  async handler(args, session) {
    requireScope(session, 'write', 'admin');

    const userPrefix = session.userId.slice(0, 8);
    const id = `${userPrefix}_c_${cryptoRandomSuffix()}`;
    const now = new Date().toISOString();

    const data = {
      id,
      task_id: args.task_id,
      author_id: session.userId,
      author_email: session.email,
      text: args.text,
      mentions: args.mentions ?? [],
      created_at: now,
      updated_at: now,
      created_via: 'mcp',
    };

    const { error } = await session.client.from('cj_comments').insert({
      id,
      task_id: args.task_id,
      author_id: session.userId,
      data,
      auth_user_id: session.userId,
    });
    if (error) throw new Error(`cj_add_comment: ${error.message}`);
    return { ok: true, comment: data };
  },
};

export const addNote: ToolDefinition<AddNoteArgs> = {
  name: 'cj_add_note',
  description:
    "Ajoute une note libre (markdown) à une tâche. Différent d'un commentaire : la note est un contenu structuré (notes de réunion, décisions, références), affiché dans le panneau latéral de la tâche.",
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'ID de la tâche cible' },
      content: {
        type: 'string',
        minLength: 1,
        description: 'Contenu markdown de la note',
      },
    },
    required: ['task_id', 'content'],
    additionalProperties: false,
  },
  async handler(args, session) {
    requireScope(session, 'write', 'admin');

    const now = new Date().toISOString();
    // Notes table doesn't have an `id` column in its index list — only
    // task_id + data. The id lives inside `data`.
    const userPrefix = session.userId.slice(0, 8);
    const noteId = `${userPrefix}_n_${cryptoRandomSuffix()}`;

    const data = {
      id: noteId,
      task_id: args.task_id,
      content: args.content,
      author_id: session.userId,
      author_email: session.email,
      created_at: now,
      updated_at: now,
      created_via: 'mcp',
    };

    const { error } = await session.client.from('cj_notes').insert({
      task_id: args.task_id,
      data,
      auth_user_id: session.userId,
    });
    if (error) throw new Error(`cj_add_note: ${error.message}`);
    return { ok: true, note: data };
  },
};

function cryptoRandomSuffix(): string {
  return Math.random().toString(36).slice(2, 11);
}
