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

window.addEventListener('popstate', () => {
  if (ownBacks > 0) {
    ownBacks--;
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

export function Sheet({
  onClose,
  label,
  full,
  children,
}: {
  onClose: () => void;
  label: string;
  full?: boolean;
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
      <div class={`sheet${full ? ' full' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        {!full && <div class="grab" aria-hidden="true" />}
        {children}
      </div>
    </div>
  );
}
