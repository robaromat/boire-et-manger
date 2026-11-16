import { signal } from '@preact/signals';

// Navigation par #/… : GitHub Pages ne sait pas renvoyer /courses/reglages vers l'app, le hash si.
// Les Réglages ont leur propre adresse, donc le bouton Retour d'Android les ferme au lieu de quitter l'app.

export type Route = { name: 'lists' } | { name: 'settings' };

export function parseHash(hash: string): Route {
  const [a] = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (a === 'reglages') return { name: 'settings' };
  return { name: 'lists' };
}

export function hrefOf(r: Route): string {
  return r.name === 'settings' ? '#/reglages' : '#/';
}

export const route = signal<Route>(parseHash(location.hash));
let previousHref: string | null = null;
window.addEventListener('hashchange', (e) => {
  previousHref = hrefOf(parseHash(new URL(e.oldURL).hash));
  route.value = parseHash(location.hash);
});

export function navigate(r: Route, opts: { replace?: boolean } = {}): void {
  const h = hrefOf(r);
  if (opts.replace) {
    history.replaceState(null, '', h);
    route.value = parseHash(h);
  } else location.hash = h;
}

/** Revenir à `target` : recule dans l'historique si c'est l'écran précédent, sinon le remplace (pas de sortie de l'app). */
export function back(target: Route): void {
  if (previousHref === hrefOf(target)) history.back();
  else navigate(target, { replace: true });
}
