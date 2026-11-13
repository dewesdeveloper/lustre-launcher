const { rolldown } = require('rolldown');
const fs = require('fs');
const path = require('path');

const stub = `
// --- заглушка localStorage для Node ---
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};
`;

(async () => {
  const bundle = await rolldown({
    input: path.join(__dirname, 'cache-race-test.ts'),
    platform: 'node',
  });
  const out = path.join(__dirname, 'cache-race-test.bundle.mjs');
  await bundle.write({ file: out, format: 'esm', banner: stub });
  await bundle.close();
  console.log('собрано:', out, fs.statSync(out).size, 'байт');
})();
