import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import type { Entry } from '../model/lists';
import { formatQty } from '../model/qty';
import { RAYONS, type DataFile } from '../model/types';
import { imageToDataUrl } from '../recipe/image';
import { LinkError, fetchRecipeText, normalizeUrl } from '../recipe/link';
import { RecipeError, readRecipe, type Recipe } from '../recipe/read';
import { linesToEntries, reviewLines } from '../recipe/review';
import { navigate } from '../router';
import { settings } from '../settings/settings';

// Recette en photo ou par lien : choisir l'image (ou coller l'adresse) → lecture par ChatGPT → revue (portions, cases, liste de destination) → ajout.
// Un seul panneau pour tout le parcours (le bouton Retour le ferme à n'importe quelle étape).

/** D'où vient la recette lue : gardé pour la ranger dans le carnet si on coche « Garder dans le carnet ». */
export type ReadSource = { kind: 'photo'; file: File } | { kind: 'link'; url: string; host: string };

/** Recette à garder dans le carnet en même temps que l'ajout aux courses. */
export interface KeepRequest {
  recipe: Recipe;
  source: ReadSource;
}

type Phase =
  | { kind: 'pick'; error?: string }
  | { kind: 'loading'; preview: string | null; what: string }
  | { kind: 'review'; recipe: Recipe; source: ReadSource };

export function RecipeSheet(props: {
  data: DataFile;
  listId: string;
  /** Lien reçu par le menu Partager d'une autre app : la lecture démarre tout de suite. */
  initialLink?: string;
  onClose: () => void;
  onAdd: (destId: string, entries: Entry[], title: string, keep: KeepRequest | null) => void;
}) {
  const key = settings.value.openaiKey;
  const [keep, setKeep] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const [link, setLink] = useState(props.initialLink ?? '');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (props.initialLink && key) void onLink(props.initialLink);
    return () => abort.current?.abort();
  }, []);

  const fail = (e: unknown) =>
    setPhase({
      kind: 'pick',
      error: e instanceof RecipeError || e instanceof LinkError ? e.message : 'Lecture impossible : ' + String(e),
    });

  const onLink = async (raw: string) => {
    const url = normalizeUrl(raw);
    if (!url) return setPhase({ kind: 'pick', error: 'Colle l’adresse complète de la page (elle commence par https://).' });
    const host = new URL(url).hostname.replace(/^www\./, '');
    setPhase({ kind: 'loading', preview: null, what: host });
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const page = await fetchRecipeText(url);
      if (ctrl.signal.aborted) return;
      const recipe = await readRecipe(key, { text: page.text }, { signal: ctrl.signal });
      if (!ctrl.signal.aborted) setPhase({ kind: 'review', recipe, source: { kind: 'link', url, host } });
    } catch (e) {
      if (!ctrl.signal.aborted) fail(e);
    }
  };

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPhase({ kind: 'loading', preview, what: 'photo' });
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const url = await imageToDataUrl(file);
      const recipe = await readRecipe(key, url, { signal: ctrl.signal });
      if (!ctrl.signal.aborted) setPhase({ kind: 'review', recipe, source: { kind: 'photo', file } });
    } catch (e) {
      if (!ctrl.signal.aborted) fail(e);
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
          {phase.preview ? <img src={phase.preview} alt="Photo de la recette" /> : <p class="note">{phase.what}</p>}
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
    const { recipe, source } = phase;
    return (
      <Sheet onClose={props.onClose} label={`Recette : ${recipe.title}`} full>
        <Review
          {...props}
          recipe={recipe}
          onAdd={(dest, entries, title) => props.onAdd(dest, entries, title, keep ? { recipe, source } : null)}
          extra={
            <label class="switch">
              <span>
                Garder dans le carnet de recettes
                <small>Avec ses étapes et la {source.kind === 'photo' ? 'photo' : 'page'} d’origine, à retrouver dans Recettes</small>
              </span>
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.currentTarget.checked)} />
            </label>
          }
        />
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
      <form
        class="field"
        onSubmit={(e) => {
          e.preventDefault();
          void onLink(link);
        }}
      >
        <label for="r-link">Ou coller le lien d'une recette</label>
        <div class="addform">
          <input
            id="r-link"
            type="url"
            inputMode="url"
            enterKeyHint="go"
            placeholder="https://www.marmiton.org/…"
            value={link}
            onInput={(e) => setLink(e.currentTarget.value)}
          />
          <button type="submit" aria-label="Lire la recette" disabled={!link.trim()}>
            <Icon name="check" />
          </button>
        </div>
      </form>
      <p class="note">
        La photo ou la page est envoyée à OpenAI pour être lue (une page passe d'abord par le relais r.jina.ai), puis tu vérifies
        tout avant l'ajout. Environ 1 centime par recette. Instagram et TikTok : fais plutôt une capture d'écran.
      </p>
    </Sheet>
  );
}

/** Écran de revue avant l'ajout aux courses (aussi utilisé depuis une fiche du carnet). */
export function Review(props: {
  data: DataFile;
  listId: string;
  recipe: Recipe;
  onClose: () => void;
  onAdd: (destId: string, entries: Entry[], title: string) => void;
  heading?: string;
  extra?: ComponentChildren;
  /** Nombre de portions de départ (celui choisi sur la fiche). */
  portions?: number;
}) {
  const { data, recipe } = props;
  const [portions, setPortions] = useState(props.portions ?? recipe.servings ?? 4);
  const [dest, setDest] = useState(props.listId);
  const lines = useMemo(() => reviewLines(data, dest, recipe, portions), [data, dest, recipe, portions]);
  // Basiques (« toujours à la maison ») décochés d'office.
  const [selected, setSelected] = useState<boolean[]>(() => reviewLines(data, props.listId, recipe, portions).map((l) => !l.staple));
  const count = selected.filter(Boolean).length;
  const destList = data.lists.find((l) => l.id === dest);

  return (
    <>
      <div class="sheet-head">
        <h2>{props.heading ?? recipe.title}</h2>
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
      {props.extra}
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
