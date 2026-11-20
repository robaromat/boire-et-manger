import { signal } from '@preact/signals';

// Menu Partager d'Android → Boire & Manger (app installée) : le manifeste déclare une « share_target » qui ouvre
// l'app avec ?url=…&text=… ; on y prend le lien d'une recette à lire.

function read(): string | null {
  const p = new URLSearchParams(location.search);
  const v = [p.get('url'), p.get('text'), p.get('title')].find((x) => x && /https?:\/\//.test(x));
  return v ?? null;
}

export const sharedLink = signal<string | null>(read());

/** Le lien a été pris en charge : on le retire de l'adresse (un rechargement ne le relira pas). */
export function consumeSharedLink(): void {
  sharedLink.value = null;
  if (location.search) history.replaceState(history.state, '', location.pathname + location.hash);
}
