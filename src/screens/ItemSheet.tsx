import { useState } from 'preact/hooks';
import { Sheet } from '../components/Sheet';
import { formatQty, parseQtyText } from '../model/qty';
import { findItem, historyEntry, type ItemEdit } from '../model/lists';
import { RAYONS, type DataFile, type RayonId } from '../model/types';

export type { ItemEdit };

/** Fiche d'un article : nom, quantité, rayon, « toujours à la maison », déplacer, supprimer. */
export function ItemSheet(props: {
  data: DataFile;
  itemId: string;
  onClose: () => void;
  onSave: (edit: ItemEdit) => void;
  onMove: (edit: ItemEdit, destId: string) => void;
  onDelete: () => void;
}) {
  const { data, itemId, onClose } = props;
  const found = findItem(data, itemId);
  const [name, setName] = useState(found?.item.name ?? '');
  const [qty, setQty] = useState(found ? formatQty(found.item.qty).replace(/^×/, '') : '');
  const [rayon, setRayon] = useState<RayonId>(found?.item.rayon ?? 'div');
  const [staple, setStaple] = useState(found ? (historyEntry(data, found.item.name)?.staple ?? false) : false);
  if (!found) return null;

  const others = data.lists.filter((l) => l.id !== found.list.id);
  const edit = (): ItemEdit => ({ name, qty: parseQtyText(qty), rayon, staple });

  return (
    <Sheet onClose={onClose} label={`Modifier ${found.item.name}`}>
      <div class="field">
        <label for="e-name">Article</label>
        <input id="e-name" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} />
      </div>
      <div class="field">
        <label for="e-qty">Quantité</label>
        <input
          id="e-qty"
          class="input"
          value={qty}
          placeholder="ex. 2, 500 g, 1 L, 3 gousses"
          onInput={(e) => setQty(e.currentTarget.value)}
        />
        <span class="hint">Facultatif. « + » pour cumuler deux quantités.</span>
      </div>
      <div>
        <h3>Rayon</h3>
        <div class="rchips">
          {data.rayonOrder.map((r) => (
            <button key={r} class="rchip" style={`--rc:var(--r-${r})`} aria-pressed={r === rayon} onClick={() => setRayon(r)}>
              <i />
              {RAYONS[r]}
            </button>
          ))}
        </div>
      </div>
      <label class="switch">
        <span>
          Toujours à la maison
          <small>Décoché d'office quand une recette le demande</small>
        </span>
        <input type="checkbox" checked={staple} onChange={(e) => setStaple(e.currentTarget.checked)} />
      </label>
      {others.length > 0 && (
        <div>
          <h3>Déplacer vers…</h3>
          <div class="btnrow">
            {others.map((o) => (
              <button key={o.id} class="btn" onClick={() => props.onMove(edit(), o.id)}>
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div class="btnrow">
        <button class="btn primary block" onClick={() => props.onSave(edit())}>
          Enregistrer
        </button>
        <button class="btn danger block" onClick={props.onDelete}>
          Supprimer l'article
        </button>
      </div>
    </Sheet>
  );
}
