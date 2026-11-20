import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { parseTags, qtyFromEditor, qtyToEditor, stepsFromEditor, stepsToEditor, type RecipeDraft } from '../../recettes/ops';
import { computeSeasons } from '../../recettes/season';
import { CATEGORIES, SEASONS, SEASON_LABELS, type Category, type Season } from '../../recettes/types';

// Fiche à vérifier (après lecture d'une photo ou d'un lien), à remplir (saisie à la main) ou à modifier.
// Dans les étapes, « [Ingrédient] » remplace la quantité de cet ingrédient : elle suivra le nombre de portions.

export interface EditorResult {
  draft: RecipeDraft;
  alsoCourses: boolean;
  coverFile: File | null;
}

export function Editor(props: {
  initial: RecipeDraft;
  mode: 'read' | 'manual' | 'edit';
  /** « sur marmiton.org », « sur ta photo » */
  readFrom?: string;
  onClose: () => void;
  onSave: (r: EditorResult) => void;
}) {
  const i = props.initial;
  const [title, setTitle] = useState(i.title);
  const [category, setCategory] = useState<Category | null>(props.mode === 'manual' && !i.title ? null : i.category);
  const [servings, setServings] = useState(i.servings ? String(i.servings) : '');
  const [ings, setIngs] = useState(() =>
    i.ingredients.length ? i.ingredients.map((x) => ({ name: x.name, qty: qtyToEditor(x.qty) })) : [{ name: '', qty: '' }, { name: '', qty: '' }],
  );
  const [steps, setSteps] = useState(() => stepsToEditor(i));
  const [tags, setTags] = useState(i.tags.join(', '));
  const [seasons, setSeasons] = useState<Season[] | null>(i.seasons);
  const [alsoCourses, setAlsoCourses] = useState(false);
  const [cover, setCover] = useState<File | null>(null);
  const coverUrl = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover]);
  useEffect(() => () => void (coverUrl && URL.revokeObjectURL(coverUrl)), [coverUrl]);

  const ingredients = ings.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), qty: qtyFromEditor(x.qty) }));
  const auto = computeSeasons(ingredients);
  const shown = seasons ?? auto.seasons;

  const toggleSeason = (s: Season) => {
    const cur = seasons ?? auto.seasons;
    setSeasons(cur.includes(s) ? cur.filter((x) => x !== s) : SEASONS.filter((x) => x === s || cur.includes(x)));
  };

  const setIng = (k: number, patch: Partial<{ name: string; qty: string }>) => setIngs((cur) => cur.map((x, j) => (j === k ? { ...x, ...patch } : x)));

  const save = () => {
    if (!title.trim() || !category) return;
    const n = parseInt(servings, 10);
    props.onSave({
      draft: {
        ...i,
        title: title.trim(),
        category,
        servings: n > 0 ? Math.min(n, 99) : null,
        ingredients,
        steps: stepsFromEditor(steps, ingredients),
        tags: parseTags(tags),
        seasons,
      },
      alsoCourses,
      coverFile: cover,
    });
  };

  const heading = props.mode === 'edit' ? 'Modifier la recette' : props.mode === 'manual' ? 'Nouvelle recette' : 'Vérifier la recette';

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
          Lue {props.readFrom ?? ''}. Corrige ce qui doit l’être.
        </p>
      )}
      <div class="field">
        <label for="e-title">Titre</label>
        <input id="e-title" class="input" value={title} placeholder="ex. Gratin de courge" onInput={(e) => setTitle(e.currentTarget.value)} />
      </div>
      <div class="field">
        <label>Catégorie</label>
        <div class="choice" role="group" aria-label="Catégorie">
          {CATEGORIES.map((c) => (
            <button key={c} aria-pressed={c === category} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div class="field">
        <label>
          Saison
          {seasons
            ? ' (choisie à la main)'
            : auto.from.length
              ? ` (calculée d’après : ${auto.from.map((x) => x.toLowerCase()).join(', ')})`
              : ' (aucun fruit ou légume de saison : toute l’année)'}
        </label>
        <div class="choice seasons" role="group" aria-label="Saison">
          {SEASONS.map((s) => (
            <button key={s} style={`--sc:var(--s-${s})`} aria-pressed={shown.includes(s)} onClick={() => toggleSeason(s)}>
              {SEASON_LABELS[s]}
            </button>
          ))}
          {seasons && (
            <button class="linkbtn" style="border:0;background:none" onClick={() => setSeasons(null)}>
              Revenir au calcul
            </button>
          )}
        </div>
      </div>
      <div class="field">
        <label for="e-serv">Portions</label>
        <input id="e-serv" class="input" style="width:120px" inputMode="numeric" value={servings} placeholder="ex. 4" onInput={(e) => setServings(e.currentTarget.value)} />
      </div>
      <div class="field">
        <label>Ingrédients</label>
        <div class="ingedit">
          {ings.map((x, k) => (
            <div class="ingrow" key={k}>
              <input aria-label={`Ingrédient ${k + 1}`} value={x.name} placeholder="Ingrédient" onInput={(e) => setIng(k, { name: e.currentTarget.value })} />
              <input aria-label={`Quantité ${k + 1}`} value={x.qty} placeholder="Quantité" onInput={(e) => setIng(k, { qty: e.currentTarget.value })} />
              <button class="iconbtn" aria-label={`Retirer l'ingrédient ${k + 1}`} onClick={() => setIngs((cur) => cur.filter((_, j) => j !== k))}>
                <Icon name="close" />
              </button>
            </div>
          ))}
          <button class="btn ghost small" style="justify-self:start" onClick={() => setIngs((cur) => [...cur, { name: '', qty: '' }])}>
            <Icon name="plus" />
            Ingrédient
          </button>
        </div>
        <p class="note">Quantité : « 400 g », « 2 », « 1 c. à s. », ou vide.</p>
      </div>
      <div class="field">
        <label for="e-steps">Étapes</label>
        <textarea id="e-steps" class="ftext" style="min-height:150px" value={steps} placeholder="Une étape par ligne" onInput={(e) => setSteps(e.currentTarget.value)} />
        <p class="note">Une étape par ligne. « [Nom de l’ingrédient] » affiche sa quantité, qui suit le nombre de portions.</p>
      </div>
      <div class="field">
        <label for="e-tags">Tags</label>
        <input id="e-tags" class="input" value={tags} placeholder="végé, rapide…" onInput={(e) => setTags(e.currentTarget.value)} />
      </div>
      {props.mode !== 'edit' && (
        <div class="field">
          <label>Photo du plat (facultatif)</label>
          {coverUrl ? (
            <div class="photo-prev">
              <img src={coverUrl} alt="Photo du plat" />
              <button class="btn ghost small" onClick={() => setCover(null)}>
                Retirer
              </button>
            </div>
          ) : (
            <label class="photo-add">
              <Icon name="camera" />
              Ajouter une photo du plat
              <input type="file" accept="image/*" hidden onChange={(e) => setCover(e.currentTarget.files?.[0] ?? null)} />
            </label>
          )}
        </div>
      )}
      {props.mode === 'read' && <p class="note">La {props.readFrom?.startsWith('sur ta') ? 'photo' : 'page'} d’origine est gardée avec la recette.</p>}
      {props.mode !== 'edit' && (
        <label class="checkline">
          <input type="checkbox" checked={alsoCourses} onChange={(e) => setAlsoCourses(e.currentTarget.checked)} />
          Ajouter aussi les ingrédients aux courses
        </label>
      )}
      <button class="btn primary block" disabled={!title.trim() || !category} onClick={save}>
        {props.mode === 'edit' ? 'Enregistrer' : 'Enregistrer dans le carnet'}
      </button>
      {!category && title.trim() && <p class="note center">Choisis une catégorie pour enregistrer.</p>}
    </Sheet>
  );
}
