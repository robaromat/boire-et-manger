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

// Onglet Souvenirs : l'accueil (carte, liste, livre) et la fiche ouverte (#/souvenirs/l_…). Sur grand écran, côte à côte.

export function Souvenirs({ openId }: { openId?: string }) {
  const e = souvenirsEngine.value;
  const data = e?.data.value ?? null;
  const [adding, setAdding] = useState(false);
  const place = openId ? data?.places.find((p) => p.id === openId) : undefined;

  const open = (id: string) => navigate({ name: 'tab', tab: 'souvenirs', sub: id }, { replace: !!openId });
  const close = () => back({ name: 'tab', tab: 'souvenirs' });

  // Lieu supprimé (ou absent sur cet appareil) : retour à l'accueil.
  useEffect(() => {
    if (openId && data && !place) navigate({ name: 'tab', tab: 'souvenirs' }, { replace: true });
  }, [openId, !!data, !!place]);

  return (
    <div class="rec souv" data-open={place ? '' : undefined}>
      <Home data={data} openId={place?.id} onOpen={open} onAdd={() => setAdding(true)} />
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
          onClose={() => setAdding(false)}
          onDone={(id) => {
            setAdding(false);
            void sheetsSettled().then(() => open(id));
          }}
        />
      )}
      <Snack />
    </div>
  );
}
