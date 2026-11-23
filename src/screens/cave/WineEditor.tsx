import { useMemo, useState } from 'preact/hooks';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { knownWines, placeOptions, shelfOptions, type WineDraft } from '../../cave/ops';
import { COLORS, COLOR_LABELS, WINE_LABELS, WINE_LABEL_NAMES, type CaveFile, type Estimable, type WineColor, type WineLabel } from '../../cave/types';
import { Dot, recipeList } from './bits';

// Fiche à vérifier (après lecture d'une étiquette), à remplir (saisie à la main) ou à modifier.
// Ce que ChatGPT a déduit est regroupé dans un cadre pointillé « Estimations » ; un champ corrigé perd la mention.

export type WineKind = 'cave' | 'ailleurs' | 'envie';

export interface WineEditorResult {
  draft: WineDraft;
  kind: WineKind;
  slot: { place: string; shelf: string; n: number };
  why: string;
}

const num = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const yearOf = (s: string) => {
  const n = parseInt(s, 10);
  return n > 1800 && n < 2200 ? n : null;
};

export function WineEditor(props: {
  data: CaveFile;
  initial: WineDraft;
  mode: 'read' | 'manual' | 'edit';
  kind?: WineKind;
  why?: string;
  title?: string;
  /** Saisie à la main : un vin déjà eu, choisi dans les suggestions, remplit la fiche. */
  onPickKnown?: (draft: WineDraft) => void;
  /** Saisie à la main : ChatGPT remplit la fiche d'après le nom tapé. */
  onLookup?: (q: string) => void;
  onClose: () => void;
  onSave: (r: WineEditorResult) => void;
}) {
  const i = props.initial;
  const places = useMemo(() => placeOptions(props.data), [props.data]);
  const recipes = useMemo(recipeList, []);
  const [f, setF] = useState({
    domaine: i.domaine,
    cuvee: i.cuvee,
    vintage: i.vintage ? String(i.vintage) : '',
    appellation: i.appellation,
    region: i.region,
    country: i.country,
    size: i.size,
    grapes: i.grapes,
    style: i.style,
    from: i.from ? String(i.from) : '',
    to: i.to ? String(i.to) : '',
    pairings: i.pairings.join(', '),
    price: i.price != null ? String(i.price).replace('.', ',') : '',
    bought: i.bought,
    notes: i.notes,
    why: props.why ?? '',
    place: places[0] ?? 'En attente',
    shelf: '',
    recipeInput: '',
  });
  const [color, setColor] = useState<WineColor | null>(props.mode === 'manual' && !i.domaine ? null : i.color);
  const [pairRecipes, setPairRecipes] = useState(i.pairRecipes);
  const [labels, setLabels] = useState<WineLabel[]>(i.labels ?? []);
  const [kind, setKind] = useState<WineKind>(props.kind ?? 'cave');
  const [qty, setQty] = useState(1);
  const set = (k: keyof typeof f) => (e: { currentTarget: { value: string } }) => {
    const v = e.currentTarget.value;
    setF((cur) => ({ ...cur, [k]: v }));
  };
  const shelves = useMemo(() => shelfOptions(props.data, f.place), [props.data, f.place]);
  const isNew = props.mode !== 'edit';
  const estimated = new Set(i.estimated);
  const est = (k: Estimable) => estimated.has(k) && <span class="wtag est">estimation</span>;

  const addRecipe = (title: string) => {
    const r = recipes.find((x) => x.title.toLowerCase() === title.trim().toLowerCase());
    if (r && !pairRecipes.includes(r.id)) setPairRecipes([...pairRecipes, r.id]);
    setF((cur) => ({ ...cur, recipeInput: r ? '' : title }));
  };

  const save = () => {
    if (!color || !(f.domaine.trim() || f.appellation.trim())) return;
    let from = yearOf(f.from);
    let to = yearOf(f.to);
    if (from && to && from > to) [from, to] = [to, from];
    const pairings = f.pairings
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const draft: WineDraft = {
      ...i,
      domaine: f.domaine.trim(),
      cuvee: f.cuvee.trim(),
      vintage: yearOf(f.vintage),
      color,
      appellation: f.appellation.trim(),
      region: f.region.trim(),
      country: f.country.trim(),
      size: f.size.trim(),
      grapes: f.grapes.trim(),
      style: f.style.trim(),
      from,
      to,
      pairings,
      pairRecipes,
      price: num(f.price),
      bought: f.bought.trim(),
      notes: f.notes.trim(),
      labels,
    };
    // Un champ corrigé à la main n'est plus une estimation.
    const changed: Record<Estimable, boolean> = {
      window: from !== i.from || to !== i.to,
      grapes: draft.grapes !== i.grapes,
      style: draft.style !== i.style,
      region: draft.region !== i.region,
      pairings: pairings.join('|') !== i.pairings.join('|') || pairRecipes.join('|') !== i.pairRecipes.join('|'),
      labels: [...labels].sort().join('|') !== [...(i.labels ?? [])].sort().join('|'),
    };
    draft.estimated = i.estimated.filter((k) => !changed[k]);
    props.onSave({ draft, kind, slot: { place: f.place.trim() || 'En attente', shelf: f.shelf.trim(), n: qty }, why: f.why.trim() });
  };

  const heading = props.title ?? (props.mode === 'edit' ? 'Modifier le vin' : props.mode === 'read' ? 'Vérifier le vin' : 'Nouveau vin');
  const estFields = (
    <>
      <div class="field">
        <label for="v-cep">Cépages {est('grapes')}</label>
        <input id="v-cep" class="input" value={f.grapes} placeholder="ex. Syrah, grenache" onInput={set('grapes')} />
      </div>
      <div class="field">
        <label for="v-style">Style {est('style')}</label>
        <input id="v-style" class="input" value={f.style} placeholder="ex. Fruit rouge, frais, tanins souples" onInput={set('style')} />
      </div>
      <div class="fgrid2">
        <div class="field">
          <label for="v-f1">À boire dès {est('window')}</label>
          <input id="v-f1" class="input" inputMode="numeric" value={f.from} placeholder="année" onInput={set('from')} />
        </div>
        <div class="field">
          <label for="v-f2">Jusqu’à</label>
          <input id="v-f2" class="input" inputMode="numeric" value={f.to} placeholder="année" onInput={set('to')} />
        </div>
      </div>
      <div class="field">
        <label for="v-acc">Accords {est('pairings')}</label>
        {pairRecipes.length > 0 && (
          <div class="pairs">
            {pairRecipes.map((id) => (
              <button key={id} class="pair" onClick={() => setPairRecipes(pairRecipes.filter((x) => x !== id))} aria-label={`Retirer l’accord ${recipes.find((r) => r.id === id)?.title ?? ''}`}>
                <Icon name="book" />
                {recipes.find((r) => r.id === id)?.title ?? 'Recette supprimée'}
                <Icon name="close" />
              </button>
            ))}
          </div>
        )}
        {recipes.length > 0 && (
          <input
            class="input"
            list="v-recipes"
            aria-label="Ajouter une recette du carnet"
            placeholder="Ajouter une recette du carnet"
            value={f.recipeInput}
            onInput={(e) => {
              const v = e.currentTarget.value;
              if (recipes.some((r) => r.title.toLowerCase() === v.trim().toLowerCase())) addRecipe(v);
              else setF((cur) => ({ ...cur, recipeInput: v }));
            }}
          />
        )}
        <datalist id="v-recipes">
          {recipes.map((r) => (
            <option key={r.id} value={r.title} />
          ))}
        </datalist>
        <input id="v-acc" class="input" value={f.pairings} placeholder="Autres plats, séparés par des virgules" onInput={set('pairings')} />
      </div>
    </>
  );

  return (
    <Sheet onClose={props.onClose} label={heading} full>
      <div class="sheet-head">
        <h2>{heading}</h2>
        <button class="btn ghost small" onClick={props.onClose}>
          Annuler
        </button>
      </div>
      {props.mode === 'read' && (
        <p class="note" style="margin-top:-6px">
          Lu sur ta photo. Corrige ce qui doit l’être.
        </p>
      )}
      <div class="field">
        <label for="v-dom">Domaine ou château</label>
        <input id="v-dom" class="input" value={f.domaine} placeholder="ex. Domaine Lapierre" autoComplete="off" onInput={set('domaine')} />
        {(props.onPickKnown || props.onLookup) && f.domaine !== i.domaine && f.domaine.trim().length >= 2 && (
          <div class="known" role="list" aria-label="Vins correspondants">
            {props.onPickKnown &&
              knownWines(props.data, f.domaine).map(({ draft, vintages }) => (
                <button key={`${draft.domaine}|${draft.cuvee}`} class="known-row" role="listitem" onClick={() => props.onPickKnown!(draft)}>
                  <Dot color={draft.color} />
                  <span class="t">
                    <b>{[draft.domaine, draft.cuvee].filter(Boolean).join(' · ')}</b>
                    <span class="meta">
                      {[draft.appellation, vintages.length ? `déjà eu : ${vintages.slice(0, 4).join(', ')}${vintages.length > 4 ? '…' : ''}` : ''].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              ))}
            {props.onLookup && (
              <button class="known-row ai" role="listitem" onClick={() => props.onLookup!(f.domaine.trim())}>
                <Icon name="sparkle" />
                <span class="t">
                  <b>Chercher « {f.domaine.trim()} » avec ChatGPT</b>
                  <span class="meta">Remplit appellation, région, couleur, cépages, accords</span>
                </span>
              </button>
            )}
          </div>
        )}
      </div>
      <div class="fgrid2">
        <div class="field">
          <label for="v-cuv">Cuvée</label>
          <input id="v-cuv" class="input" value={f.cuvee} onInput={set('cuvee')} />
        </div>
        <div class="field">
          <label for="v-mil">Millésime</label>
          <input id="v-mil" class="input" inputMode="numeric" value={f.vintage} placeholder="vide = non millésimé" onInput={set('vintage')} />
        </div>
      </div>
      <div class="field">
        <label>Couleur</label>
        <div class="choice" role="group" aria-label="Couleur">
          {COLORS.map((c) => (
            <button key={c} aria-pressed={color === c} onClick={() => setColor(c)}>
              <Dot color={c} size={10} />
              {COLOR_LABELS[c]}
            </button>
          ))}
        </div>
      </div>
      <div class="fgrid2">
        <div class="field">
          <label for="v-app">Appellation</label>
          <input id="v-app" class="input" value={f.appellation} onInput={set('appellation')} />
        </div>
        <div class="field">
          <label for="v-reg">Région {est('region')}</label>
          <input id="v-reg" class="input" value={f.region} onInput={set('region')} />
        </div>
      </div>
      <div class="fgrid2">
        <div class="field">
          <label for="v-pays">Pays</label>
          <input id="v-pays" class="input" value={f.country} onInput={set('country')} />
        </div>
        <div class="field">
          <label for="v-size">Format</label>
          <input id="v-size" class="input" list="v-sizes" value={f.size} placeholder="75 cl" onInput={set('size')} />
          <datalist id="v-sizes">
            <option value="Demi-bouteille" />
            <option value="Magnum" />
            <option value="Jéroboam" />
          </datalist>
        </div>
      </div>
      <div class="field">
        <label>Classification {est('labels')}</label>
        <div class="choice" role="group" aria-label="Classification">
          {WINE_LABELS.map((l) => (
            <button key={l} aria-pressed={labels.includes(l)} onClick={() => setLabels(labels.includes(l) ? labels.filter((x) => x !== l) : [...labels, l])}>
              {labels.includes(l) && <Icon name="check" />}
              {WINE_LABEL_NAMES[l]}
            </button>
          ))}
        </div>
      </div>
      {i.estimated.length > 0 ? (
        <div class="estbox">
          <div class="h">
            <span>Estimations ChatGPT</span>
            <span class="wtag est">à vérifier</span>
          </div>
          {estFields}
        </div>
      ) : (
        estFields
      )}

      {isNew && (
        <div class="field">
          <label>Ce vin est…</label>
          <div class="choice" role="group" aria-label="Ce vin est">
            {(
              [
                ['cave', 'En cave'],
                ['ailleurs', 'Dégusté ailleurs'],
                ['envie', 'Une envie'],
              ] as const
            ).map(([k, n]) => (
              <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
      {isNew && kind === 'cave' && (
        <>
          <div class="field">
            <label>Bouteilles</label>
            <span class="stepper">
              <button aria-label="Une de moins" onClick={() => setQty(Math.max(1, qty - 1))}>
                −
              </button>
              <b aria-live="polite">{qty}</b>
              <button aria-label="Une de plus" onClick={() => setQty(Math.min(240, qty + 1))}>
                +
              </button>
            </span>
          </div>
          <div class="fgrid2">
            <div class="field">
              <label for="v-lieu">Cave</label>
              <select id="v-lieu" class="input" value={f.place} onChange={(e) => {
                const v = e.currentTarget.value;
                setF((cur) => ({ ...cur, place: v, shelf: '' }));
              }}>
                {places.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div class="field">
              <label for="v-clay">Clayette</label>
              <select id="v-clay" class="input" value={f.shelf} onChange={set('shelf')}>
                {shelves.map((x) => (
                  <option key={x} value={x}>
                    {x || 'Aucune'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}
      {(!isNew || kind === 'cave') && (
        <div class="fgrid2">
          <div class="field">
            <label for="v-prix">Prix d’achat (bouteille)</label>
            <input id="v-prix" class="input" inputMode="decimal" placeholder="€" value={f.price} onInput={set('price')} />
          </div>
          <div class="field">
            <label for="v-chez">Acheté chez, quand</label>
            <input id="v-chez" class="input" placeholder="Caviste, domaine…" value={f.bought} onInput={set('bought')} />
          </div>
        </div>
      )}
      {isNew && kind === 'envie' && (
        <div class="field">
          <label for="v-why">Pourquoi</label>
          <input id="v-why" class="input" placeholder="Goûté chez…, conseil du caviste…" value={f.why} onInput={set('why')} />
        </div>
      )}
      {!isNew && (
        <div class="field">
          <label for="v-notes">Notes</label>
          <textarea id="v-notes" class="ftext" value={f.notes} onInput={set('notes')} />
        </div>
      )}
      <button class="btn primary block" disabled={!color || !(f.domaine.trim() || f.appellation.trim())} onClick={save}>
        {!isNew ? 'Enregistrer' : kind === 'cave' ? `Ranger ${qty} bouteille${qty > 1 ? 's' : ''}` : kind === 'envie' ? 'Ajouter aux envies' : 'Continuer : noter la dégustation'}
      </button>
      {!color && <p class="note center">Choisis une couleur pour enregistrer.</p>}
    </Sheet>
  );
}
