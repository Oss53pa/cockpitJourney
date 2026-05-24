/**
 * Thin HTTP wrapper for the central Proph3t edge functions.
 * Handles auth, timeout, JSON, and Proph3tError normalisation.
 *
 * Vendored from oss53pa/atlas-studio-website · proph3t-client/src/http.ts
 * (relative import extensions stripped for Vite/TS bundler resolution).
 */

import { Proph3tError } from './types';
import type { Proph3tClientOptions } from './types';

export interface HttpContext {
  baseUrl: string;
  apiKey: string;
  userToken?: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}

export function makeHttpContext(opts: Proph3tClientOptions): HttpContext {
  if (!opts.supabaseUrl) throw new Error('Proph3tClient: supabaseUrl is required');
  if (!opts.apiKey) throw new Error('Proph3tClient: apiKey is required');
  if (!opts.product) throw new Error('Proph3tClient: product (app_id) is required');
  return {
    baseUrl: opts.supabaseUrl.replace(/\/+$/, ''),
    apiKey: opts.apiKey,
    userToken: opts.userToken,
    fetchImpl: opts.fetchImpl ?? fetch,
    timeoutMs: opts.timeoutMs ?? 15000,
  };
}

export async function postEdge<T>(ctx: HttpContext, functionName: string, body: unknown): Promise<T> {
  const url = `${ctx.baseUrl}/functions/v1/${functionName}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ctx.timeoutMs);
  try {
    const resp = await ctx.fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.userToken ?? ctx.apiKey}`,
        apikey: ctx.apiKey,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await resp.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!resp.ok) {
      const msg =
        parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : `HTTP ${resp.status}`;
      throw new Proph3tError(msg, resp.status, functionName, parsed);
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof Proph3tError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new Proph3tError(`Timeout after ${ctx.timeoutMs}ms`, 408, functionName);
    }
    throw new Proph3tError((err as Error).message, 0, functionName);
  } finally {
    clearTimeout(t);
  }
}

export async function getRest<T>(ctx: HttpContext, path: string): Promise<T> {
  const url = `${ctx.baseUrl}/rest/v1/${path.replace(/^\/+/, '')}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ctx.timeoutMs);
  try {
    const resp = await ctx.fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${ctx.userToken ?? ctx.apiKey}`,
        apikey: ctx.apiKey,
        Accept: 'application/json',
      },
      signal: ctrl.signal,
    });
    const text = await resp.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!resp.ok) {
      throw new Proph3tError(`REST ${resp.status} on ${path}`, resp.status, path, parsed);
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof Proph3tError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new Proph3tError(`Timeout after ${ctx.timeoutMs}ms`, 408, path);
    }
    throw new Proph3tError((err as Error).message, 0, path);
  } finally {
    clearTimeout(t);
  }
}
