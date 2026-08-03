// Node 26 defines an inert `localStorage` global (it needs --localstorage-file
// to do anything). Vitest's jsdom environment skips copying any jsdom window key
// that already exists as a Node global, so jsdom's real Storage never lands and
// `localStorage` reads back as undefined. sessionStorage is unaffected because
// Node does not define it.
//
// Supply a minimal in-memory Storage so persistence tests have something real to
// read and write. Only the method API is provided — not index/property access —
// which is all the app uses (`readView`/`writeView` in src/lib/activation.ts).
if (typeof window !== 'undefined' && window.sessionStorage && !window.localStorage) {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() { return store.size },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(String(k)) ?? null,
    setItem: (k: string, v: string) => { store.set(String(k), String(v)) },
    removeItem: (k: string) => { store.delete(String(k)) },
    clear: () => { store.clear() },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
}
