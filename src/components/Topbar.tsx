import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';
import { SyncBadge } from './SyncBadge';
import { navigate } from '../router';
import type { SyncView } from '../sync/engine';

/** En-tête d'un carnet : titre (avec la couleur du carnet), état de la synchro, Réglages. */
export function Topbar({ title, engine, photos, children }: { title: string; engine?: SyncView | null; photos?: boolean; children?: ComponentChildren }) {
  return (
    <header class="topbar">
      <h1 class="tab-title">{title}</h1>
      <div class="topbar-end">
        {children}
        <SyncBadge engine={engine} photos={photos} />
        <button class="iconbtn" aria-label="Réglages" onClick={() => navigate({ name: 'settings' })}>
          <Icon name="sliders" />
        </button>
      </div>
    </header>
  );
}
