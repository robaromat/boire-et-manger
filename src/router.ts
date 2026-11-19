import { signal } from '@preact/signals';
import { recordUse, startTab } from './lib/lastUse';

// Navigation par #/… : GitHub Pages ne sait pas renvoyer /boire-et-manger/reglages vers l'app, le hash si.
// Changer d'onglet remplace l'adresse (le bouton Retour d'Android ne remonte pas les onglets un par un) ;
// les Réglages s'empilent, donc Retour les ferme au lieu de quitter l'app.

export const TABS = ['courses', 'recettes', 'cave', 'souvenirs'] as const;
export type TabId = (typeof TABS)[number];
export const TAB_LABELS: Record<TabId, string> = { courses: 'Courses', recettes: 'Recettes', cave: 'Cave', souvenirs: 'Souvenirs' };

export type Route = { name: 'tab'; tab: TabId } | { name: 'settings' };

export function parseHash(hash: string): Route {
  const [a] = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (a === 'reglages') return { name: 'settings' };
  if ((TABS as readonly string[]).includes(a ?? '')) return { name: 'tab', tab: a as TabId };
  return { name: 'tab', tab: 'courses' };
}

export function hrefOf(r: Route): string {
  if (r.name === 'settings') return '#/reglages';
  return r.tab === 'courses' ? '#/' : `#/${r.tab}`;
}

// À l'ouverture sans adresse précise : dernier onglet s'il a servi il y a moins de 24 h, sinon Courses.
function initialRoute(): Route {
  const bare = location.hash.replace(/^#\/?/, '') === '';
  if (!bare) return parseHash(location.hash);
  const r: Route = { name: 'tab', tab: startTab() };
  if (r.tab !== 'courses') history.replaceState(history.state, '', hrefOf(r));
  return r;
}

export const route = signal<Route>(initialRoute());
let previousHref: string | null = null;
window.addEventListener('hashchange', (e) => {
  previousHref = hrefOf(parseHash(new URL(e.oldURL).hash));
  route.value = parseHash(location.hash);
});

/** Onglet courant, ou celui sous les Réglages. */
export const lastTab = signal<TabId>(route.value.name === 'tab' ? route.value.tab : 'courses');
route.subscribe((r) => {
  if (r.name !== 'tab') return;
  lastTab.value = r.tab;
  recordUse(r.tab);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') recordUse(lastTab.value);
});

export function navigate(r: Route, opts: { replace?: boolean } = {}): void {
  const h = hrefOf(r);
  if (opts.replace) {
    history.replaceState(history.state, '', h);
    route.value = parseHash(h);
  } else location.hash = h;
}

export const openTab = (tab: TabId) => navigate({ name: 'tab', tab }, { replace: true });

/** Revenir à `target` : recule dans l'historique si c'est l'écran précédent, sinon le remplace (pas de sortie de l'app). */
export function back(target: Route): void {
  if (previousHref === hrefOf(target)) history.back();
  else navigate(target, { replace: true });
}
