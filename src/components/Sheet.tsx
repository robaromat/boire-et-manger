import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/**
 * Panneau qui monte du bas de l'écran. Le bouton Retour d'Android le ferme (au lieu de quitter l'app) :
 * on empile une entrée d'historique à l'ouverture et on la retire à la fermeture.
 */
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
    let poppedByBack = false;
    history.pushState({ sheet: true }, '');
    const onPop = () => {
      poppedByBack = true;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      if (!poppedByBack && (history.state as { sheet?: boolean } | null)?.sheet) history.back();
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
