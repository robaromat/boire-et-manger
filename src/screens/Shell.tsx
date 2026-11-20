import { useEffect } from 'preact/hooks';
import '../styles/shell.css';
import { Icon, type IconName } from '../components/Icon';
import { TABS, TAB_LABELS, openTab, type TabId } from '../router';
import { hasPending, maybeOpenTuto, tutoSeen } from '../tuto/state';
import { TutoSheet } from '../tuto/TutoSheet';
import { Lists } from './Lists';
import { Recettes } from './recettes/Recettes';
import { Cave } from './cave/Cave';
import { Souvenirs } from './souvenirs/Souvenirs';
import { applyUpdate, updateReady } from '../pwa';
import { sharedLink } from '../share';

// Coque de Boire & Manger : le carnet ouvert, et la barre des 4 onglets en bas.
// Chaque carnet a sa couleur d'accent (styles/shell.css, selon data-tab).

const ICONS: Record<TabId, IconName> = { courses: 'cart', recettes: 'book', cave: 'bottle', souvenirs: 'pin' };

export function Shell({ tab, sub }: { tab: TabId; sub?: string }) {
  // Pas de visite par-dessus une recette reçue par le menu Partager : elle attendra le prochain passage.
  useEffect(() => {
    if (!sharedLink.value) maybeOpenTuto(tab);
  }, [tab]);
  void tutoSeen.value; // redessine les pastilles « nouveau » après la visite

  return (
    <div class="shell" data-tab={tab}>
      <div class="shell-body">
        {tab === 'courses' ? <Lists /> : tab === 'recettes' ? <Recettes openId={sub} /> : tab === 'cave' ? <Cave openId={sub} /> : <Souvenirs openId={sub} />}
      </div>
      <nav class="tabbar" aria-label="Carnets">
        {TABS.map((t) => (
          <button key={t} aria-current={t === tab ? 'page' : undefined} onClick={() => openTab(t)}>
            <span class="tabbar-pill">
              <Icon name={ICONS[t]} />
            </span>
            {TAB_LABELS[t]}
            {hasPending(t) && t !== tab && <span class="tabbar-new" aria-label="Nouveautés à découvrir" />}
          </button>
        ))}
      </nav>
      <TutoSheet />
      {updateReady.value && (
        <div class="update" role="status">
          <span>Nouvelle version de l'app disponible.</span>
          <button class="btn small primary" onClick={applyUpdate}>
            <Icon name="refresh" />
            Mettre à jour
          </button>
        </div>
      )}
    </div>
  );
}
