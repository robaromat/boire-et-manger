import { useEffect } from 'preact/hooks';
import '../styles/shell.css';
import { Icon, type IconName } from '../components/Icon';
import { Topbar } from '../components/Topbar';
import { TABS, TAB_LABELS, openTab, type TabId } from '../router';
import { hasPending, maybeOpenTuto, tutoSeen } from '../tuto/state';
import { TutoSheet } from '../tuto/TutoSheet';
import { Lists } from './Lists';
import { Recettes } from './recettes/Recettes';
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
        {tab === 'courses' ? <Lists /> : tab === 'recettes' ? <Recettes openId={sub} /> : <Soon tab={tab} />}
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

const SOON: Record<'cave' | 'souvenirs', { phase: number; text: string; items: string[] }> = {
  cave: {
    phase: 3,
    text: 'Ta cave et tes dégustations, pour remplacer CellarTracker et Vivino.',
    items: [
      '« À boire » classé par année',
      'Plan de la cave, lieu par lieu et clayette par clayette',
      'Ajout par photo de l’étiquette',
      'Import de ton export CellarTracker',
    ],
  },
  souvenirs: {
    phase: 4,
    text: 'Tes restaurants, bars et adresses gourmandes, sur une carte et dans un livre de photos.',
    items: ['Une fiche par lieu et un journal de visites', 'Adresses « à essayer »', 'Carte, liste et livre de photos'],
  },
};

function Soon({ tab }: { tab: 'cave' | 'souvenirs' }) {
  const s = SOON[tab];
  return (
    <div class="shop">
      <Topbar title={TAB_LABELS[tab]} />
      <div class="shop-main">
        <div class="soon">
          <span class="soon-icon">
            <Icon name={ICONS[tab]} />
          </span>
          <h2>Bientôt ici</h2>
          <p>{s.text}</p>
          <ul>
            {s.items.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p class="muted">Prévu en phase {s.phase} du plan.</p>
        </div>
      </div>
    </div>
  );
}
