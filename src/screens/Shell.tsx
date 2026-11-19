import { useEffect } from 'preact/hooks';
import '../styles/shell.css';
import { Icon, type IconName } from '../components/Icon';
import { Topbar } from '../components/Topbar';
import { TABS, TAB_LABELS, openTab, type TabId } from '../router';
import { hasPending, maybeOpenTuto, tutoSeen } from '../tuto/state';
import { TutoSheet } from '../tuto/TutoSheet';
import { Lists } from './Lists';

// Coque de Boire & Manger : le carnet ouvert, et la barre des 4 onglets en bas.
// Chaque carnet a sa couleur d'accent (styles/shell.css, selon data-tab).

const ICONS: Record<TabId, IconName> = { courses: 'cart', recettes: 'book', cave: 'bottle', souvenirs: 'pin' };

export function Shell({ tab }: { tab: TabId }) {
  useEffect(() => maybeOpenTuto(tab), [tab]);
  void tutoSeen.value; // redessine les pastilles « nouveau » après la visite

  return (
    <div class="shell" data-tab={tab}>
      <div class="shell-body">{tab === 'courses' ? <Lists /> : <Soon tab={tab} />}</div>
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
    </div>
  );
}

const SOON: Record<Exclude<TabId, 'courses'>, { phase: number; text: string; items: string[] }> = {
  recettes: {
    phase: 2,
    text: 'Ton carnet de recettes, rangé par catégorie et cherchable par ingrédient et par saison.',
    items: [
      'Ajout par photo, capture d’écran, lien ou menu Partager',
      'Saison calculée à partir des ingrédients',
      'Journal « Je l’ai fait » avec note et commentaires',
      'Mode cuisine et envoi des ingrédients vers les Courses',
    ],
  },
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

function Soon({ tab }: { tab: Exclude<TabId, 'courses'> }) {
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
