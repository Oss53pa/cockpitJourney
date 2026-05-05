// Vitest setup — in-memory localStorage / sessionStorage for jsdom.
// (No IndexedDB polyfill needed: persistence is now Supabase-cloud, and unit
//  tests should mock supabase.from() rather than rely on a local DB.)

const memoryStore = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => memoryStore.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memoryStore.set(k, String(v));
  },
  removeItem: (k: string) => {
    memoryStore.delete(k);
  },
  clear: () => {
    memoryStore.clear();
  },
  key: (i: number) => Array.from(memoryStore.keys())[i] ?? null,
  get length() {
    return memoryStore.size;
  },
};
Object.defineProperty(globalThis, 'localStorage', {
  value: fakeStorage,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'sessionStorage', {
  value: fakeStorage,
  configurable: true,
  writable: true,
});
