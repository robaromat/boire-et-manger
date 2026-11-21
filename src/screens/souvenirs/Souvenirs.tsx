import { useEffect, useState } from 'preact/hooks';
import '../../styles/souvenirs.css';
import { Icon } from '../../components/Icon';
import { sheetsSettled } from '../../components/Sheet';
import { Snack } from '../../components/Snack';
import { back, navigate } from '../../router';
import { souvenirsEngine } from '../../sync/store';
import { AddPlace } from './AddPlace';
import { Home } from './Home';
import { PlacePage } from './PlacePage';
import { pendingSouvenir, type SouvenirDraft } from '../../souvenirs/pending';

// Onglet Souvenirs : l'accueil (carte, liste, livre) et la fiche ouverte (#/souvenirs/l_…). Sur grand écran, côte à côte.

export function Souvenirs({ openId }: { openId?: string }) {
  const e = souvenirsEngine.value;
  const data = e?.data.value ?? null;
  const [adding, setAdding] = useState<{ query?: string; draft?: SouvenirDraft } | null>(null);
  const place = openId ? data?.places.find((p) => p.id === openId) : undefined;

  const open = (id: string) => navigate({ name: 'tab', tab: 'souvenirs', sub: id }, { replace: !!openId });
  const close = () => back({ name: 'tab', tab: 'souvenirs' });

  // Souvenir proposé depuis Recettes ou la Cave : l'ajout s'ouvre dès que le carnet est chargé.
  const pending = pendingSouvenir.value;
  useEffect(() => {
    if (!pending || !data) return;
    pendingSouvenir.value = null;
    setAdding({ draft: pending });
  }, [pending, !!data]);

  // Lieu supprimé (ou absent sur cet appareil) : retour à l'accueil.
  useEffect(() => {
    if (openId && data && !place) navigate({ name: 'tab', tab: 'souvenirs' }, { replace: true });
  }, [openId, !!data, !!place]);

  return (
    <div class="rec souv" data-open={place ? '' : undefined}>
      <Home data={data} openId={place?.id} onOpen={open} onAdd={(query) => setAdding({ query })} />
      <div class="rec-page">
        {place ? (
          <PlacePage key={place.id} p={place} onBack={close} />
        ) : (
          <div class="rec-page-empty">
            <div>
              <Icon name="pin" />
              <p>Choisis un lieu à gauche.</p>
            </div>
          </div>
        )}
      </div>
      {adding && data && (
        <AddPlace
          data={data}
          initialQuery={adding.query}
          draft={adding.draft}
          onClose={() => setAdding(null)}
          onDone={(id) => {
            setAdding(null);
            void sheetsSettled().then(() => open(id));
          }}
        />
      )}
      <Snack />
    </div>
  );
}
