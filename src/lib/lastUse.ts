// Dernier onglet utilisé et heure, pour la règle d'ouverture : moins de 24 h → on y revient, sinon Courses.

export type LastUse = { tab: string; at: number };
const KEY = 'bm.lastUse.v1';
const DAY = 24 * 3600 * 1000;
const TAB_IDS = ['courses', 'recettes', 'cave', 'souvenirs'] as const;
type Tab = (typeof TAB_IDS)[number];

export function chooseStartTab(last: LastUse | null, now: number): Tab {
  if (!last || now - last.at >= DAY || now < last.at) return 'courses';
  return (TAB_IDS as readonly string[]).includes(last.tab) ? (last.tab as Tab) : 'courses';
}

function read(): LastUse | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LastUse) : null;
  } catch {
    return null;
  }
}

export const startTab = (now = Date.now()) => chooseStartTab(read(), now);

export function recordUse(tab: string, now = Date.now()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ tab, at: now }));
  } catch {
    /* stockage indisponible : on ouvrira sur Courses */
  }
}
