// Date e piccoli helper condivisi (nessuna dipendenza dal DOM: testabili in Node)

export const pad = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };
export const today = () => iso(new Date());
export const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000);

/** Lunedì della settimana che contiene la data (chiave della settimana). */
export function weekKey(s = today()) {
  const d = parseIso(s);
  const dow = (d.getDay() + 6) % 7; // 0 = lunedì
  d.setDate(d.getDate() - dow);
  return iso(d);
}
export const weekDays = (wk) => Array.from({ length: 7 }, (_, i) => addDays(wk, i));
export const dayIndex = (s) => (parseIso(s).getDay() + 6) % 7; // 0 = lun ... 6 = dom
export const isWeekend = (s) => dayIndex(s) >= 5;

export const DAY_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
export const DAY_LONG = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
export const fmtDay = (s) => { const d = parseIso(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export function fmtWeek(wk) {
  const a = parseIso(wk), b = parseIso(addDays(wk, 6));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

export const norm = (s) => String(s || "").trim().toLowerCase();
export const uid = () => Math.random().toString(36).slice(2, 9);
export const slug = (s) => norm(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
