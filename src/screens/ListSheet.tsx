import { useState } from 'preact/hooks';
import { Sheet } from '../components/Sheet';
import type { ShopList } from '../model/types';

/** Créer une liste (list absent) ou renommer / supprimer la liste ouverte. */
export function ListSheet(props: {
  list?: ShopList;
  onClose: () => void;
  onSubmit: (name: string) => void;
  onDelete?: () => void;
}) {
  const { list } = props;
  const [name, setName] = useState(list?.name ?? '');
  const [confirming, setConfirming] = useState(false);
  const submit = (e: Event) => {
    e.preventDefault();
    if (name.trim()) props.onSubmit(name);
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
      <button class="btn primary block" disabled={!name.trim()} onClick={submit}>
        {list ? 'Renommer' : 'Créer la liste'}
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
