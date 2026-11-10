// Utilità comuni ai test. ROOT = cartella dell'app; TMP = file generati (versioni vecchie, bundle).
export const ROOT = new URL("../", import.meta.url);
export const TMP = new URL("./.tmp/", import.meta.url);
export const app = (p, q = "") => import(new URL(p, ROOT).href + q);
export const old = (ver, p) => import(new URL(`old-${ver}/${p}`, TMP).href);
let fails = 0;
export const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) { fails++; process.exitCode = 1; } };
export const done = (name) => console.log(fails ? `${name}: ${fails} falliti` : `${name}: ok`);
export const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
