import { describe, it, expect, beforeEach } from 'vitest';
import {
  readSnapshotCache,
  writeSnapshotCache,
  clearSnapshotCache,
  peekSupabaseSession,
} from './snapshotCache';

const emptySnap = {
  users: [{ id: 'u1', name: 'X', initials: 'X', email: '', role: '', color: '#000' }],
  folders: [],
  projects: [
    {
      id: 'p1',
      name: 'P',
      slug: 'p',
      status: 'active' as const,
      color: '#000',
      icon: 'x',
      ownerId: 'u1',
      health: 'green' as const,
      progress: 0,
      taskCount: 0,
      membersIds: ['u1'],
    },
  ],
  sections: [],
  tasks: [],
  goals: [],
  comments: [],
  notifications: [],
  insights: [],
  automations: [],
  forms: [],
  reports: [],
  attachments: [],
  dependencies: [],
  activity: [],
  notes: [],
  subtasks: [],
  budgetLines: [],
  expenses: [],
  settings: {},
};

beforeEach(() => {
  localStorage.clear();
});

describe('writeSnapshotCache + readSnapshotCache', () => {
  it('round-trips a snapshot through localStorage', () => {
    writeSnapshotCache('user-abc', emptySnap, 'prof-1');
    const out = readSnapshotCache('user-abc');
    expect(out).not.toBeNull();
    expect(out!.profileId).toBe('prof-1');
    expect(out!.users).toHaveLength(1);
    expect(out!.projects).toHaveLength(1);
  });

  it('returns null when no cache exists', () => {
    expect(readSnapshotCache('nobody')).toBeNull();
  });

  it('returns null and drops the key when shape is invalid', () => {
    localStorage.setItem('cj-snap-v3:user-x', '{"garbage":"yes"}');
    expect(readSnapshotCache('user-x')).toBeNull();
    expect(localStorage.getItem('cj-snap-v3:user-x')).toBeNull();
  });

  it('returns null when JSON is malformed', () => {
    localStorage.setItem('cj-snap-v3:user-x', '{not json');
    expect(readSnapshotCache('user-x')).toBeNull();
  });

  it('keys snapshots per auth user (no cross-pollution)', () => {
    writeSnapshotCache('user-a', emptySnap, 'profile-a');
    writeSnapshotCache('user-b', { ...emptySnap, projects: [] }, 'profile-b');
    const a = readSnapshotCache('user-a');
    const b = readSnapshotCache('user-b');
    expect(a!.profileId).toBe('profile-a');
    expect(b!.profileId).toBe('profile-b');
    expect(a!.projects.length).toBe(1);
    expect(b!.projects.length).toBe(0);
  });

  it('strips proph3t.apiKey from settings before persisting (secret blocklist)', () => {
    const withSecret = {
      ...emptySnap,
      settings: {
        proph3t: { provider: 'groq', apiKey: 'gsk_supersecret123' },
        theme: 'light',
      },
    };
    writeSnapshotCache('user-x', withSecret, 'prof-x');
    const raw = localStorage.getItem('cj-snap-v3:user-x');
    expect(raw).not.toBeNull();
    expect(raw!).not.toContain('gsk_supersecret123');
    expect(raw!).not.toContain('proph3t');
    expect(raw!).toContain('theme');
  });

  it('expires snapshots older than 7 days (TTL)', () => {
    const stale = { ...emptySnap, cachedAt: '2020-01-01T00:00:00.000Z' };
    localStorage.setItem('cj-snap-v3:user-stale', JSON.stringify({ ...stale, profileId: 'p' }));
    expect(readSnapshotCache('user-stale')).toBeNull();
    // After read, the stale entry should be removed.
    expect(localStorage.getItem('cj-snap-v3:user-stale')).toBeNull();
  });

  it('returns fresh snapshots within the TTL window', () => {
    writeSnapshotCache('user-fresh', emptySnap, 'p');
    expect(readSnapshotCache('user-fresh')).not.toBeNull();
  });
});

describe('readSnapshotCache normalization', () => {
  it('normalizes a project that was written before membersIds backfill', () => {
    // Simulate a v2 cache where projects lack membersIds (write predates fix).
    const broken = {
      ...emptySnap,
      projects: [
        { id: 'p1', name: 'P', slug: 'p', status: 'active', color: '#000', icon: 'x', ownerId: 'u1' },
      ] as unknown as typeof emptySnap.projects,
      profileId: 'p1',
      cachedAt: new Date().toISOString(),
    };
    localStorage.setItem('cj-snap-v3:legacy-user', JSON.stringify(broken));
    const out = readSnapshotCache('legacy-user');
    expect(out).not.toBeNull();
    expect(out!.projects[0].membersIds).toEqual(['u1']);
    expect(out!.projects[0].health).toBe('green');
    expect(out!.projects[0].progress).toBe(0);
  });
});

describe('clearSnapshotCache', () => {
  it('clears a single user when authUserId provided', () => {
    writeSnapshotCache('user-a', emptySnap, 'pa');
    writeSnapshotCache('user-b', emptySnap, 'pb');
    clearSnapshotCache('user-a');
    expect(readSnapshotCache('user-a')).toBeNull();
    expect(readSnapshotCache('user-b')).not.toBeNull();
  });

  it('clears ALL snapshot caches when no arg passed', () => {
    writeSnapshotCache('user-a', emptySnap, 'pa');
    writeSnapshotCache('user-b', emptySnap, 'pb');
    localStorage.setItem('other-key', 'should-survive');
    clearSnapshotCache();
    expect(readSnapshotCache('user-a')).toBeNull();
    expect(readSnapshotCache('user-b')).toBeNull();
    expect(localStorage.getItem('other-key')).toBe('should-survive');
  });
});

describe('peekSupabaseSession', () => {
  it('returns null when no session is persisted', () => {
    expect(peekSupabaseSession()).toBeNull();
  });

  it('returns the user id and email for a valid session', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem(
      'cj-supabase-auth',
      JSON.stringify({
        user: { id: 'abc-123', email: 'test@example.com' },
        expires_at: future,
      })
    );
    const peek = peekSupabaseSession();
    expect(peek).not.toBeNull();
    expect(peek!.authUserId).toBe('abc-123');
    expect(peek!.email).toBe('test@example.com');
  });

  it('returns null when token has expired', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    localStorage.setItem(
      'cj-supabase-auth',
      JSON.stringify({
        user: { id: 'abc-123' },
        expires_at: past,
      })
    );
    expect(peekSupabaseSession()).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    localStorage.setItem('cj-supabase-auth', '{broken');
    expect(peekSupabaseSession()).toBeNull();
  });

  it('returns null when user.id is missing', () => {
    localStorage.setItem(
      'cj-supabase-auth',
      JSON.stringify({ expires_at: Math.floor(Date.now() / 1000) + 3600 })
    );
    expect(peekSupabaseSession()).toBeNull();
  });
});
