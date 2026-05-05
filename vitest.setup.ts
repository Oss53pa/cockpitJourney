// Vitest setup — polyfill IndexedDB (Dexie needs it) + in-memory localStorage
import 'fake-indexeddb/auto';

const memoryStore = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => memoryStore.get(k) ?? null,
  setItem: (k: string, v: string) => { memoryStore.set(k, String(v)); },
  removeItem: (k: string) => { memoryStore.delete(k); },
  clear: () => { memoryStore.clear(); },
  key: (i: number) => Array.from(memoryStore.keys())[i] ?? null,
  get length() { return memoryStore.size; },
};
Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage, configurable: true, writable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: fakeStorage, configurable: true, writable: true });
