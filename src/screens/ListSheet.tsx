import { useState } from 'preact/hooks';
import { Sheet } from '../components/Sheet';
import type { ShopList } from '../model/types';

/** Créer une liste (list absent) ou renommer / supprimer la liste ouverte ; avec ou sans rayons (demandé à la création). */
export function ListSheet(props: {
  list?: ShopList;
  onClose: () => void;
  onSubmit: (name: string, rayons: boolean) => void;
  onDelete?: () => void;
}) {
  const { list } = props;
  const [name, setName] = useState(list?.name ?? '');
  // À la création, rien n'est choisi d'avance : on demande.
  const [rayons, setRayons] = useState<boolean | null>(list ? list.rayons !== false : null);
  const [confirming, setConfirming] = useState(false);
  const ready = !!name.trim() && rayons != null;
  const changed = !list || name.trim() !== list.name || rayons !== (list.rayons !== false);
  const submit = (e: Event) => {
    e.preventDefault();
    if (ready && changed) props.onSubmit(name, rayons);
  };
  const n = list?.items.length ?? 0;

  return (
    <Sheet onClose={props.onClose} label={list ? `Liste ${list.name}` : 'Nouvelle liste'}>
      <h2>{list ? list.name : 'Nouvelle liste'}</h2>
      <form class="field" onSubmit={submit}>
        <label for="l-name">Nom du magasin</label>
        <input
          id="l-name"
          class="input"
          value={name}
          placeholder="ex. Leroy Merlin, Marché du samedi"
          autoFocus={!list}
          enterKeyHint="done"
          onInput={(e) => setName(e.currentTarget.value)}
        />
      </form>
      <div class="kind-opts" role="radiogroup" aria-label="Rangement des articles">
        <button type="button" role="radio" aria-checked={rayons === true} onClick={() => setRayons(true)}>
          <b>Avec rayons</b>
          <small>Courses alimentaires : les articles sont rangés par rayon (fruits et légumes, crèmerie…)</small>
        </button>
        <button type="button" role="radio" aria-checked={rayons === false} onClick={() => setRayons(false)}>
          <b>Liste simple</b>
          <small>Bricolage, matériel, pharmacie… : les articles restent dans l’ordre où tu les ajoutes</small>
        </button>
      </div>
      <button class="btn primary block" disabled={!ready || !changed} onClick={submit}>
        {list ? 'Enregistrer' : 'Créer la liste'}
      </button>
      {list && props.onDelete && !confirming && (
        <button class="btn danger block" onClick={() => setConfirming(true)}>
          Supprimer la liste
        </button>
      )}
      {list && props.onDelete && confirming && (
        <div class="confirm" role="alert">
          <p>
            Supprimer « {list.name} »{n > 0 ? ` et ses ${n} article${n > 1 ? 's' : ''}` : ''} ? L'historique des achats est
            conservé.
          </p>
          <div class="btnrow">
            <button class="btn danger" onClick={props.onDelete}>
              Supprimer
            </button>
            <button class="btn ghost" onClick={() => setConfirming(false)}>
              Garder
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
