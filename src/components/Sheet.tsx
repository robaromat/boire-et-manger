import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/**
 * Panneau qui monte du bas de l'écran. Le bouton Retour d'Android le ferme (au lieu de quitter l'app) :
 * chaque panneau ouvert empile une entrée d'historique, retirée à sa fermeture.
 * Plusieurs panneaux peuvent être ouverts en même temps (le tuto par-dessus une recette partagée, par exemple) :
 * Retour et Échap ne ferment que celui du dessus, et le « retour » qu'on déclenche nous-mêmes en fermant un panneau
 * ne doit pas fermer les autres.
 */
type Entry = { close: () => void; popped: boolean };
const stack: Entry[] = [];
let ownBacks = 0;

let settled: (() => void)[] = [];

window.addEventListener('popstate', () => {
  if (ownBacks > 0) {
    ownBacks--;
    if (!ownBacks) {
      settled.forEach((f) => f());
      settled = [];
    }
    return;
  }
  const top = stack[stack.length - 1];
  if (!top) return;
  top.popped = true;
  top.close();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') stack[stack.length - 1]?.close();
});

/**
 * Attend que les panneaux qu'on vient de fermer aient retiré leur entrée d'historique. À appeler avant de naviguer
 * juste après une fermeture : sinon le « retour » du panneau, qui arrive après, annulerait la navigation.
 */
export async function sheetsSettled(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0)); // laisse Preact démonter les panneaux
  if (!ownBacks) return;
  await new Promise<void>((resolve) => {
    settled.push(resolve);
    setTimeout(resolve, 500); // filet de sécurité
  });
}

export function Sheet({
  onClose,
  label,
  full,
  cls,
  children,
}: {
  onClose: () => void;
  label: string;
  full?: boolean;
  /** Classe en plus (ex. « cook » pour le mode cuisine). */
  cls?: string;
  children: ComponentChildren;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const entry: Entry = { close: () => closeRef.current(), popped: false };
    stack.push(entry);
    history.pushState({ sheet: true }, '');
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (!entry.popped) {
        ownBacks++;
        history.back();
      }
    };
  }, []);

  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`sheet${full ? ' full' : ''}${cls ? ` ${cls}` : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        {!full && <div class="grab" aria-hidden="true" />}
        {children}
      </div>
    </div>
  );
}
