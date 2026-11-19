import { Icon } from './Icon';
import { SyncBadge } from './SyncBadge';
import { navigate } from '../router';

/** En-tête d'un carnet : titre (avec la couleur du carnet), état de la synchro, Réglages. */
export function Topbar({ title }: { title: string }) {
  return (
    <header class="topbar">
      <h1 class="tab-title">{title}</h1>
      <div class="topbar-end">
        <SyncBadge />
        <button class="iconbtn" aria-label="Réglages" onClick={() => navigate({ name: 'settings' })}>
          <Icon name="sliders" />
        </button>
      </div>
    </header>
  );
}
