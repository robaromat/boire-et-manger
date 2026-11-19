import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import type { Entry } from '../model/lists';
import { formatQty } from '../model/qty';
import { RAYONS, type DataFile } from '../model/types';
import { imageToDataUrl } from '../recipe/image';
import { RecipeError, readRecipe, type Recipe } from '../recipe/read';
import { linesToEntries, reviewLines } from '../recipe/review';
import { navigate } from '../router';
import { settings } from '../settings/settings';

// Recette en photo : choisir l'image → lecture par ChatGPT → revue (portions, cases, liste de destination) → ajout.
// Un seul panneau pour tout le parcours (le bouton Retour le ferme à n'importe quelle étape).

type Phase =
  | { kind: 'pick'; error?: string }
  | { kind: 'loading'; preview: string }
  | { kind: 'review'; recipe: Recipe };

export function RecipeSheet(props: {
  data: DataFile;
  listId: string;
  onClose: () => void;
  onAdd: (destId: string, entries: Entry[], title: string) => void;
}) {
  const key = settings.value.openaiKey;
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPhase({ kind: 'loading', preview });
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const url = await imageToDataUrl(file);
      const recipe = await readRecipe(key, url, { signal: ctrl.signal });
      if (!ctrl.signal.aborted) setPhase({ kind: 'review', recipe });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setPhase({ kind: 'pick', error: e instanceof RecipeError ? e.message : 'Lecture impossible : ' + String(e) });
    } finally {
      URL.revokeObjectURL(preview);
    }
  };

  if (!key) {
    return (
      <Sheet onClose={props.onClose} label="Ajouter une recette">
        <h2>Ajouter une recette</h2>
        <p class="lead">
          La lecture des recettes passe par ChatGPT. Colle d'abord ta clé OpenAI dans les Réglages : elle reste sur ce
          téléphone.
        </p>
        <button
          class="btn primary block"
          onClick={() => {
            props.onClose();
            setTimeout(() => navigate({ name: 'settings' }), 50);
          }}
        >
          Ouvrir les réglages
        </button>
      </Sheet>
    );
  }

  if (phase.kind === 'loading') {
    return (
      <Sheet onClose={props.onClose} label="Lecture de la recette" full>
        <div class="loading" role="status">
          <img src={phase.preview} alt="Photo de la recette" />
          <div class="spinner" aria-hidden="true" />
          <div>
            <b>ChatGPT lit la recette…</b>
            <p class="note">Ingrédients, quantités, nombre de portions. Environ 10 à 30 secondes.</p>
          </div>
          <button
            class="btn ghost"
            onClick={() => {
              abort.current?.abort();
              setPhase({ kind: 'pick' });
            }}
          >
            Annuler
          </button>
        </div>
      </Sheet>
    );
  }

  if (phase.kind === 'review') {
    return (
      <Sheet onClose={props.onClose} label={`Recette : ${phase.recipe.title}`} full>
        <Review {...props} recipe={phase.recipe} />
      </Sheet>
    );
  }

  return (
    <Sheet onClose={props.onClose} label="Ajouter une recette">
      <h2>Ajouter une recette</h2>
      {phase.error && (
        <div class="notice" role="alert">
          {phase.error}
        </div>
      )}
      <div class="photo-opts">
        <label class="photo-opt">
          <Icon name="camera" />
          <span>
            Prendre une photo<small>Livre, fiche, écran de l'ordi</small>
          </span>
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.currentTarget)} />
        </label>
        <label class="photo-opt">
          <Icon name="image" />
          <span>
            Choisir dans la galerie<small>Capture d'écran d'un site ou d'Instagram</small>
          </span>
          <input type="file" accept="image/*" hidden onChange={(e) => void onFile(e.currentTarget)} />
        </label>
      </div>
      <p class="note">L'image est envoyée à OpenAI pour être lue, puis tu vérifies tout avant l'ajout. Environ 1 centime par recette.</p>
    </Sheet>
  );
}

function Review(props: {
  data: DataFile;
  listId: string;
  recipe: Recipe;
  onClose: () => void;
  onAdd: (destId: string, entries: Entry[], title: string) => void;
}) {
  const { data, recipe } = props;
  const [portions, setPortions] = useState(recipe.servings ?? 4);
  const [dest, setDest] = useState(props.listId);
  const lines = useMemo(() => reviewLines(data, dest, recipe, portions), [data, dest, recipe, portions]);
  // Basiques (« toujours à la maison ») décochés d'office.
  const [selected, setSelected] = useState<boolean[]>(() => reviewLines(data, props.listId, recipe, portions).map((l) => !l.staple));
  const count = selected.filter(Boolean).length;
  const destList = data.lists.find((l) => l.id === dest);

  return (
    <>
      <div class="sheet-head">
        <h2>{recipe.title}</h2>
        <button class="btn ghost small" onClick={props.onClose}>
          Annuler
        </button>
      </div>
      <div class="portions">
        <span>
          Portions
          {!recipe.servings && <small>Non indiqué sur la recette : quantités telles quelles</small>}
        </span>
        {recipe.servings ? (
          <div class="stepper">
            <button aria-label="Moins de portions" onClick={() => setPortions(Math.max(1, portions - 1))}>
              −
            </button>
            <span aria-live="polite">{portions}</span>
            <button aria-label="Plus de portions" onClick={() => setPortions(Math.min(30, portions + 1))}>
              +
            </button>
          </div>
        ) : (
          <span class="muted">—</span>
        )}
      </div>
      <div class="ings">
        {lines.map((l, k) => (
          <label key={k} class={`ing${selected[k] ? '' : ' off'}`}>
            <input
              type="checkbox"
              checked={selected[k]}
              onChange={(e) => {
                const next = [...selected];
                next[k] = e.currentTarget.checked;
                setSelected(next);
              }}
            />
            <span class="t">
              <b>{l.name}</b>
              <span class="meta">
                <span class="tag" style={`--rc:var(--r-${l.rayon})`}>
                  <i />
                  {RAYONS[l.rayon]}
                </span>
                {l.staple && <span class="staple">toujours à la maison</span>}
                {l.existing && selected[k] && (
                  <span class="merge">
                    déjà dans la liste : {formatQty(l.existing) || '×1'} → {formatQty(l.merged ?? [])}
                  </span>
                )}
              </span>
            </span>
            <span class="q">{formatQty(l.qty)}</span>
          </label>
        ))}
      </div>
      <div class="field">
        <label for="r-dest">Ajouter à la liste</label>
        <select id="r-dest" class="select" value={dest} onChange={(e) => setDest(e.currentTarget.value)}>
          {data.lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <button
        class="btn primary block"
        disabled={!count}
        onClick={() => props.onAdd(dest, linesToEntries(lines, selected), recipe.title)}
      >
        Ajouter {count} article{count > 1 ? 's' : ''} à {destList?.name ?? ''}
      </button>
    </>
  );
}
