/**
 * Boot snapshot cache — stale-while-revalidate hydration.
 *
 * On every successful `loadSnapshot()` we mirror the snapshot to
 * `localStorage` keyed by `auth_user_id`. On the NEXT boot, before
 * Supabase has even resolved auth, we read that mirror back and hydrate
 * the Zustand store optimistically. The user sees their cockpit in
 * ~0ms instead of ~500ms.
 *
 * Then Supabase finishes resolving in the background, a fresh
 * `loadSnapshot()` runs, and the store is overwritten with the
 * server-side truth. If the cache was stale (user mutated on another
 * device), the UI flickers briefly to the new state — acceptable.
 *
 * Invalidation rules:
 *   - Every successful boot rewrites the cache (latest known good).
 *   - Every state mutation re-writes the cache, debounced to 800 ms
 *     so we don't thrash localStorage during rapid edits.
 *   - Schema changes bump `SCHEMA_VERSION` → old caches are ignored.
 *   - Signing out leaves the cache in place (same user coming back gets
 *     an instant boot); explicit `wipeDatabase()` purges it.
 */

import { type Snapshot, normalizeProject, normalizeFolder, normalizeSection } from './repo';

// Bumped v2 → v3 (2026-05-20) — after the "mock data still showing"
// reports. Some users had pre-cleanup snapshots cached with demo
// personas (Pamela/Koffi/Aminata, Cosmos Group projects, fake KPIs).
// The schema didn't actually change, but the bump forces every device
// to drop its stale localStorage mirror and rehydrate fresh from
// Supabase — eliminating the "ghost demo data after deploy" trap.
const SCHEMA_VERSION = 'v3';
const SNAP_KEY_PREFIX = `cj-snap-${SCHEMA_VERSION}:`;
// Legacy prefixes that older clients wrote — purged opportunistically
// on every boot so they don't accumulate forever in users' localStorage.
const LEGACY_SNAP_PREFIXES = ['cj-snap-v1:', 'cj-snap-v2:'];
const SUPABASE_STORAGE_KEY = 'cj-supabase-auth';

// One-time-per-tab cleanup: drop every legacy-prefixed key as soon as
// this module is imported. Idempotent (the keys disappear after the
// first pass) and bounded (only runs once per page load, max O(n) on
// localStorage entry count). Side effect at module top-level — accept
// the no-side-effect lint exception for a focused, deterministic op.
if (typeof localStorage !== 'undefined') {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && LEGACY_SNAP_PREFIXES.some((p) => k.startsWith(p))) toRemove.push(k);
    }
    if (toRemove.length > 0) {
      toRemove.forEach((k) => localStorage.removeItem(k));
      console.info(`[snap-cache] purged ${toRemove.length} legacy snapshot key(s)`);
    }
  } catch {
    /* localStorage unavailable (private mode, quota etc.) — skip */
  }
}

// Hard upper bound on cache age. Beyond this, we ignore the mirror and
// force a fresh `loadSnapshot` against Supabase — protects against
// hydrating a months-old snapshot on a device that hasn't been opened
// in a long while (e.g. backup laptop, returning user after sabbatical).
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Settings keys to STRIP from the localStorage mirror.
//
// NOTE: `proph3t` (which carries the AI API key) used to be here. That was
// removed because it broke persistence UX without buying real security: the
// key is ALSO stored in the RLS-protected `cj_settings` row and is reachable
// from the in-memory store and the Supabase session token (itself in
// localStorage) — so an attacker with XSS already has it. Stripping it only
// made the key "disappear" on instant-boot until server revalidation, which
// users reported as the key not staying saved. Keeping it in the mirror lets
// it survive a reload immediately. Add a key here only if it must never touch
// localStorage AND is never needed before the first server load.
const SETTINGS_BLOCKLIST = new Set<string>();

export interface CachedSnapshot extends Snapshot {
  /** The profile id that was active when this snapshot was captured. */
  profileId: string;
  /** Wall-clock time the cache was written, for debugging / TTL caps. */
  cachedAt: string;
}

/* ───────────── Read / write ───────────── */

export function readSnapshotCache(authUserId: string): CachedSnapshot | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SNAP_KEY_PREFIX + authUserId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray(parsed.users) ||
      !Array.isArray(parsed.projects)
    ) {
      // Shape looks wrong (older schema, corrupted). Drop it.
      localStorage.removeItem(SNAP_KEY_PREFIX + authUserId);
      return null;
    }
    // TTL check — beyond CACHE_MAX_AGE_MS we drop the cache so we don't
    // hydrate something stale by months.
    if (typeof parsed.cachedAt === 'string') {
      const age = Date.now() - new Date(parsed.cachedAt).getTime();
      if (isFinite(age) && age > CACHE_MAX_AGE_MS) {
        console.info('[snap-cache] expired (age=' + Math.round(age / 86400000) + 'd), dropping');
        localStorage.removeItem(SNAP_KEY_PREFIX + authUserId);
        return null;
      }
    }
    // Apply the same normalizers we use on Supabase loads, so a cache
    // written by an older client (pre-membersIds backfill) doesn't crash
    // the UI on hydrate. This is the read-side belt to the write-side
    // braces in repo.normalize*.
    return {
      ...parsed,
      folders: Array.isArray(parsed.folders) ? parsed.folders.map(normalizeFolder) : [],
      projects: parsed.projects.map(normalizeProject),
      sections: Array.isArray(parsed.sections) ? parsed.sections.map(normalizeSection) : [],
    } as CachedSnapshot;
  } catch {
    return null;
  }
}

export function writeSnapshotCache(authUserId: string, snapshot: Snapshot, profileId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    // Strip secrets (proph3t.apiKey + anything else in SETTINGS_BLOCKLIST)
    // from the localStorage mirror. The server-side cj_settings row is the
    // source of truth — those values come back on the next `loadSnapshot`.
    const safeSettings: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(snapshot.settings ?? {})) {
      if (!SETTINGS_BLOCKLIST.has(k)) safeSettings[k] = v;
    }
    const payload: CachedSnapshot = {
      ...snapshot,
      settings: safeSettings,
      profileId,
      cachedAt: new Date().toISOString(),
    };
    localStorage.setItem(SNAP_KEY_PREFIX + authUserId, JSON.stringify(payload));
  } catch (err) {
    // QuotaExceededError is the realistic failure mode. Not fatal — the
    // app still works, we just don't get the instant-boot perk next time.
    console.warn('[snap-cache] write failed (probably quota)', err);
  }
}

export function clearSnapshotCache(authUserId?: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (authUserId) {
      localStorage.removeItem(SNAP_KEY_PREFIX + authUserId);
      return;
    }
    // Wipe ALL snapshot caches across users — used by full database wipe.
    // Use `localStorage.length` + `.key(i)` rather than `Object.keys()`
    // because the latter only enumerates own properties (works in real
    // browsers, but not in our jsdom fake-storage mock; this form is
    // portable across both).
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SNAP_KEY_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* localStorage unavailable — nothing to do */
  }
}

/* ───────────── Supabase session peek ───────────── */

/**
 * Synchronously read the Supabase session that supabase-js persisted to
 * localStorage on the last visit, WITHOUT awaiting `supabase.auth.getSession()`.
 *
 * Used to derive the `auth_user_id` we need to look up the snapshot cache,
 * before the async Supabase auth round-trip has resolved. Returns null if:
 *   - storage is unavailable
 *   - no session was persisted (logged-out user)
 *   - the persisted session is parse-broken
 *   - `expires_at` is in the past (token expired → don't trust it)
 *
 * NOTE: returning a value here does NOT prove the user is authorized; the
 * real auth handshake still runs in parallel and will reject if the
 * refresh-token is bad. We only use this as a hint to start hydrating
 * from the cache early.
 */
export function peekSupabaseSession(): {
  authUserId: string;
  email?: string;
  expiresAt: number;
} | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const userId = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
    const email = parsed?.user?.email ?? parsed?.currentSession?.user?.email;
    const expiresAt = parsed?.expires_at ?? parsed?.currentSession?.expires_at;
    if (typeof userId !== 'string' || !userId) return null;
    if (typeof expiresAt === 'number' && expiresAt * 1000 < Date.now()) {
      // Expired — let the normal flow handle the refresh.
      return null;
    }
    return {
      authUserId: userId,
      email: typeof email === 'string' ? email : undefined,
      expiresAt: typeof expiresAt === 'number' ? expiresAt : 0,
    };
  } catch {
    return null;
  }
}
