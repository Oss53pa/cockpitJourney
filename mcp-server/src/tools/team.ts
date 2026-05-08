/**
 * Team tools — list_members / invite_member.
 *
 * Backed by the universal Atlas Studio table `licence_seats` (one row
 * per seat per app per tenant). The PAT-derived JWT must have the
 * `admin` scope to invite — list_members is read-only and works for
 * any role.
 *
 * Invitations go through the existing `invite-user` Edge Function so we
 * reuse the email template + token flow shared across Atlas products.
 */
import type { ToolDefinition } from './common.js';
import { requireScope } from '../auth.js';

interface ListTeamMembersArgs {
  status?: 'active' | 'pending' | 'suspended';
}

interface InviteMemberArgs {
  email: string;
  full_name?: string;
  role?: 'editor' | 'viewer' | 'app_admin';
}

interface SeatRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  user_id: string | null;
  invitation_sent_at: string | null;
  invitation_accepted_at: string | null;
  last_login: string | null;
  login_count: number;
  created_at: string;
}

export const listTeamMembers: ToolDefinition<ListTeamMembersArgs> = {
  name: 'cj_list_team_members',
  description:
    "Liste les membres de l'équipe CockpitJourney (table partagée licence_seats). Renvoie email, nom complet, rôle (app_super_admin / app_admin / editor / viewer), statut, et stats de connexion.",
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'pending', 'suspended'],
        description: "Filtre par statut (défaut: tous)",
      },
    },
    additionalProperties: false,
  },
  async handler(args, session) {
    let q = session.client
      .from('licence_seats')
      .select(
        'id, email, full_name, role, status, user_id, invitation_sent_at, invitation_accepted_at, last_login, login_count, created_at'
      );
    if (args.status) q = q.eq('status', args.status);
    q = q.order('role', { ascending: true }).order('email', { ascending: true });

    const { data, error } = await q;
    if (error) throw new Error(`cj_list_team_members: ${error.message}`);

    const members = ((data ?? []) as SeatRow[]).map((s) => {
      const isPending = !s.invitation_accepted_at && s.status === 'active';
      return {
        ...s,
        display_status: s.status === 'suspended' ? 'suspended' : isPending ? 'pending' : 'active',
      };
    });

    return { count: members.length, members };
  },
};

export const inviteMember: ToolDefinition<InviteMemberArgs> = {
  name: 'cj_invite_member',
  description:
    "Invite un nouveau membre dans l'équipe CockpitJourney. Envoie l'e-mail d'invitation via la fonction partagée Atlas Studio. Le PAT doit avoir le scope 'admin'.",
  inputSchema: {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email', description: "E-mail de la personne à inviter" },
      full_name: { type: 'string', description: 'Nom complet (optionnel)' },
      role: {
        type: 'string',
        enum: ['editor', 'viewer', 'app_admin'],
        description: "Rôle (défaut editor). Inviter un app_super_admin n'est pas autorisé via l'API.",
      },
    },
    required: ['email'],
    additionalProperties: false,
  },
  async handler(args, session) {
    requireScope(session, 'admin');

    // Resolve tenant + licence from the user's seat (the JWT carries auth.uid()).
    const { data: mySeat, error: seatErr } = await session.client
      .from('licence_seats')
      .select('licence_id, tenant_id, role')
      .eq('user_id', session.userId)
      .eq('status', 'active')
      .maybeSingle();

    if (seatErr) throw new Error(`cj_invite_member (seat): ${seatErr.message}`);
    if (!mySeat) throw new Error("Vous n'avez pas de seat actif dans cette licence — impossible d'inviter.");

    // Get the access_token from the supabase client to forward auth.
    const { data: ses } = await session.client.auth.getSession();
    if (!ses.session) throw new Error('Session Supabase introuvable côté client MCP');

    const supabaseUrl = process.env.SUPABASE_URL ?? '';
    const supabaseAnon = process.env.SUPABASE_ANON_KEY ?? '';

    const res = await fetch(`${supabaseUrl}/functions/v1/invite-user`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ses.session.access_token}`,
        apikey: supabaseAnon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: args.email.trim().toLowerCase(),
        full_name: args.full_name ?? null,
        role: args.role ?? 'editor',
        licence_id: mySeat.licence_id,
        tenant_id: mySeat.tenant_id,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
    if (!res.ok || json.error) {
      throw new Error(`cj_invite_member: ${json.error ?? `HTTP ${res.status}`}`);
    }
    return { ok: true, invited: { email: args.email, role: args.role ?? 'editor' } };
  },
};
