import { useEffect, useState } from 'preact/hooks';
import '../../styles/cave.css';
import { Icon } from '../../components/Icon';
import { sheetsSettled } from '../../components/Sheet';
import { Snack, showSnack } from '../../components/Snack';
import { savePhoto } from '../../photos/photos';
import { back, navigate } from '../../router';
import { addStock, addWine, addWish, emptyWineDraft, findSame, removeWish, slotLabel, updateWine, type WineDraft } from '../../cave/ops';
import type { CaveFile, Wish } from '../../cave/types';
import { caveEngine, mutateCave } from '../../sync/store';
import { AddSheet, type AddWineResult } from './AddSheet';
import { Home, view } from './Home';
import { ImportSheet } from './ImportSheet';
import { WinePage, type StartSheet } from './WinePage';
import { Reports } from './Reports';
import type { WineKind } from './WineEditor';

// Onglet Cave : l'accueil (4 vues) et la fiche ouverte (#/cave/w_…). Sur un écran large, les deux côte à côte.

type AddState = { prefill?: { draft: WineDraft; kind: WineKind }; wishId?: string };

export function Cave({ openId }: { openId?: string }) {
  const e = caveEngine.value;
  const data = e?.data.value ?? null;
  const [add, setAdd] = useState<AddState | null>(null);
  const [importing, setImporting] = useState(false);
  const [start, setStart] = useState<{ id: string; sheet: StartSheet } | null>(null);
  const reports = openId === 'rapports';
  const wine = openId && !reports ? data?.wines.find((w) => w.id === openId) : undefined;

  const open = (id: string) => navigate({ name: 'tab', tab: 'cave', sub: id }, { replace: !!openId });
  const close = () => back({ name: 'tab', tab: 'cave' });

  // « Dégusté ailleurs » ouvre la note sur la fiche une seule fois.
  useEffect(() => {
    if (start && openId !== start.id) setStart(null);
  }, [openId]);

  // Fiche supprimée (ou absente sur cet appareil) : retour à l'accueil.
  useEffect(() => {
    if (openId && !reports && data && !wine) navigate({ name: 'tab', tab: 'cave' }, { replace: true });
  }, [openId, !!data, !!wine]);

  const bought = (w: Wish) => {
    const known = w.wineId ? data?.wines.find((x) => x.id === w.wineId) : undefined;
    const draft: WineDraft = known
      ? { ...known }
      : { ...emptyWineDraft(), domaine: w.domaine, cuvee: w.cuvee, color: w.color ?? 'rouge', appellation: w.appellation };
    setAdd({ prefill: { draft, kind: 'cave' }, wishId: w.id });
  };

  const onSave = async (r: AddWineResult, wishId?: string) => {
    setAdd(null);
    let label: string | undefined;
    try {
      if (r.labelFile && r.kind !== 'envie') label = await savePhoto(r.labelFile);
    } catch {
      showSnack('Photo de l’étiquette illisible : le vin est enregistré sans elle.');
    }
    const draft = { ...r.draft, ...(label ? { label } : {}) };
    if (r.kind === 'envie') {
      mutateCave((d) => addWish(d, { domaine: draft.domaine, cuvee: draft.cuvee, color: draft.color, appellation: draft.appellation, why: r.why }));
      view.value = 'envies';
      showSnack('Ajouté à tes envies');
      return;
    }
    let id = '';
    mutateCave((d: CaveFile) => {
      const same = findSame(d, draft);
      let next = d;
      if (same) {
        id = same.id;
        if (r.kind === 'cave') {
          next = addStock(next, id, [r.slot]);
          // Nouvel achat : son prix et sa provenance remplacent les anciens.
          if (draft.price != null || draft.bought) next = updateWine(next, id, { price: draft.price ?? same.price, bought: draft.bought || same.bought });
        }
        if (label && !same.label) next = updateWine(next, id, { label });
      } else {
        const a = addWine(d, draft, r.kind === 'cave' ? [r.slot] : []);
        id = a.id;
        next = a.data;
      }
      return wishId ? removeWish(next, wishId) : next;
    });
    await sheetsSettled();
    if (r.kind === 'ailleurs') setStart({ id, sheet: { k: 'drank', reason: 'exterieur' } });
    open(id);
    if (r.kind === 'cave') showSnack(`${r.slot.n} bouteille${r.slot.n > 1 ? 's' : ''} rangée${r.slot.n > 1 ? 's' : ''} : ${slotLabel(r.slot)}`);
  };

  return (
    <div class="rec cave" data-open={wine || reports ? '' : undefined}>
      <Home data={data} openId={wine?.id} onOpen={open} onAdd={() => setAdd({})} onImport={() => setImporting(true)} onBought={bought} onReports={() => open('rapports')} />
      <div class="rec-page">
        {reports && data ? (
          <Reports data={data} onBack={close} />
        ) : wine ? (
          <WinePage key={wine.id} w={wine} onBack={close} start={start?.id === wine.id ? start.sheet : null} />
        ) : (
          <div class="rec-page-empty">
            <div>
              <Icon name="bottle" />
              <p>Choisis un vin à gauche.</p>
            </div>
          </div>
        )}
      </div>
      {add && data && <AddSheet data={data} prefill={add.prefill} onClose={() => setAdd(null)} onSave={(r) => void onSave(r, add.wishId)} />}
      {importing && <ImportSheet onClose={() => setImporting(false)} />}
      <Snack />
    </div>
  );
}
