import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from '../../components/Icon';
import { Sheet, sheetsSettled } from '../../components/Sheet';
import { showSnack } from '../../components/Snack';
import { savePhoto, usePhoto } from '../../photos/photos';
import { defaultListId, sendToCourses } from '../../recettes/actions';
import { asReadRecipe } from '../../recettes/fromRead';
import {
  addJournal, avgRating, deleteRecipe, lastMade, recipeAsText, removeJournal, scaledQty, stepParts, updateRecipe, type RecipeDraft,
} from '../../recettes/ops';
import { ingredientSeasons, recipeSeasons } from '../../recettes/season';
import { SEASONS, SEASON_LABELS, type JournalEntry, type Recipe, type Season } from '../../recettes/types';
import { formatQty } from '../../model/qty';
import { engine, mutateRecipes, recipesEngine } from '../../sync/store';
import { Review } from '../RecipeSheet';
import { Cover, SeasonChips, Stars, fmtNote, shortDate, todayIso } from './bits';
import { CookMode } from './CookMode';
import { Editor } from './Editor';

// Fiche d'une recette (maquette validée) : photo, saison, ajustements, portions, étapes, source, journal,
// et les trois actions Aux courses / Mode cuisine / Je l'ai fait.

type SheetKind =
  | { k: 'done'; afterCook?: boolean }
  | { k: 'adjust' }
  | { k: 'season' }
  | { k: 'more' }
  | { k: 'courses' }
  | { k: 'cook' }
  | { k: 'edit' }
  | { k: 'viewer'; photo: string }
  | null;

export function Page({ r, onBack, startCourses }: { r: Recipe; onBack: () => void; startCourses?: boolean }) {
  const [portions, setPortions] = useState(r.servings ?? 4);
  // Recette tout juste enregistrée avec « Ajouter aussi aux courses » : la revue s'ouvre d'office.
  const [sheet, setSheet] = useState<SheetKind>(startCourses ? { k: 'courses' } : null);
  useEffect(() => setPortions(r.servings ?? 4), [r.id, r.servings]);

  const avg = avgRating(r);
  const last = lastMade(r);
  const season = recipeSeasons(r);
  const close = () => setSheet(null);
  const step = (n: number) => setPortions(Math.max(1, Math.min(60, portions + n)));

  const remove = async () => {
    const before = recipesEngine.value?.data.value;
    close();
    await sheetsSettled();
    onBack();
    mutateRecipes((d) => deleteRecipe(d, r.id));
    if (before) showSnack(`« ${r.title} » supprimée`, () => mutateRecipes(() => before));
  };

  const share = async () => {
    close();
    const text = recipeAsText(r, portions);
    try {
      if (navigator.share) await navigator.share({ title: r.title, text });
      else {
        await navigator.clipboard.writeText(text);
        showSnack('Recette copiée : colle-la dans un message.');
      }
    } catch {
      /* partage annulé */
    }
  };

  return (
    <>
      <div class="rpage-scroll">
        <div class="fiche-top">
          <button class="cover-btn" style="display:block;width:100%" onClick={() => r.cover && setSheet({ k: 'viewer', photo: r.cover })} aria-label={r.cover ? 'Agrandir la photo du plat' : undefined} disabled={!r.cover}>
            <Cover photo={r.cover} size="full" alt={r.title} />
          </button>
          <button class="fbtn back" onClick={onBack} aria-label="Retour aux recettes">
            <Icon name="back" />
          </button>
          <button class="fbtn more" onClick={() => setSheet({ k: 'more' })} aria-label="Plus d’actions">
            <Icon name="more" />
          </button>
        </div>
        <div class="fiche">
          <h1>{r.title}</h1>
          <div class="chipsline">
            <span class="rtag plain">{r.category}</span>
            <SeasonChips seasons={season.seasons} />
            {r.tags.map((t) => (
              <span key={t} class="rtag">
                {t}
              </span>
            ))}
          </div>
          <div class="statline">
            {r.journal.length ? (
              <>
                {avg != null && <Stars n={avg} />}
                <span>
                  {avg != null ? `${fmtNote(avg)} · ` : ''}faite {r.journal.length}×{last ? ` · dernière le ${shortDate(last)}` : ''}
                </span>
              </>
            ) : (
              <span class="rtag todo">jamais testée</span>
            )}
          </div>
          <div class="ractions">
            <button class="act primary" onClick={() => setSheet({ k: 'courses' })}>
              <Icon name="cart" />
              Aux courses
            </button>
            <button class="act" onClick={() => setSheet({ k: 'cook' })}>
              <Icon name="flame" />
              Mode cuisine
            </button>
            <button class="act" onClick={() => setSheet({ k: 'done' })}>
              <Icon name="check" />
              Je l’ai fait
            </button>
          </div>
          <button class="adjust" onClick={() => setSheet({ k: 'adjust' })}>
            <small>
              <span>Mes ajustements</span>
              <Icon name="pen" />
            </small>
            <p>{r.adjustments.trim() ? r.adjustments : <span class="meta">Ce que tu changes à chaque fois : touche pour l’écrire.</span>}</p>
          </button>

          <section class="block">
            <h2>
              Ingrédients
              {r.servings ? (
                <span class="inl-portions">
                  <span class="meta">pour</span>
                  <span class="stepper">
                    <button onClick={() => step(-1)} aria-label="Moins de portions">
                      −
                    </button>
                    <b aria-live="polite">{portions}</b>
                    <button onClick={() => step(1)} aria-label="Plus de portions">
                      +
                    </button>
                  </span>
                </span>
              ) : (
                <span class="meta" style="font-family:var(--f-ui)">
                  portions non indiquées
                </span>
              )}
            </h2>
            {r.ingredients.length ? (
              <ul class="ringr">
                {r.ingredients.map((i, k) => {
                  const s = ingredientSeasons(i.name);
                  return (
                    <li key={k}>
                      <span>
                        {i.name}
                        {s && <span class="sea" style={`--sc:var(--s-${s[0]})`} title={`De saison : ${s.map((x) => SEASON_LABELS[x]).join(', ')}`} />}
                      </span>
                      <span class="q">{formatQty(scaledQty(r, i, portions))}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p class="note">Pas d’ingrédients. « ⋯ » puis « Modifier » pour en ajouter.</p>
            )}
            <p class="note" style="margin-top:8px">
              {season.manual
                ? 'Saison choisie à la main. '
                : season.from.length
                  ? `Saison calculée d’après : ${season.from.map((x) => x.toLowerCase()).join(', ')}. `
                  : 'Aucun légume ou fruit de saison : « toute l’année ». '}
              <button class="linkbtn" onClick={() => setSheet({ k: 'season' })}>
                Modifier
              </button>
            </p>
          </section>

          {r.steps.length > 0 && (
            <section class="block">
              <h2>Étapes</h2>
              <ol class="rsteps">
                {r.steps.map((s, k) => (
                  <li key={k}>
                    <span>
                      {stepParts(r, s, portions).map((p, j) => (typeof p === 'string' ? p : <b key={j}>{p.qty}</b>))}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section class="block">
            <h2>Source</h2>
            <Source r={r} onPhoto={(p) => setSheet({ k: 'viewer', photo: p })} />
          </section>

          <section class="block">
            <h2>
              Journal{' '}
              <span class="meta" style="font-family:var(--f-ui)">
                {r.journal.length ? `${r.journal.length} fois` : ''}
              </span>
            </h2>
            <div class="journal">
              {r.journal.length ? (
                r.journal.map((j) => <JEntry key={j.id} r={r} j={j} onPhoto={(p) => setSheet({ k: 'viewer', photo: p })} />)
              ) : (
                <p class="note">Pas encore cuisinée. « Je l’ai fait » ajoutera la première entrée.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      {sheet?.k === 'more' && (
        <Sheet onClose={close} label="Plus d’actions">
          <div class="opts">
            <button class="opt" onClick={() => setSheet({ k: 'edit' })}>
              <Icon name="pen" />
              <span>
                Modifier la recette<small>Titre, catégorie, saison, ingrédients, étapes, tags</small>
              </span>
            </button>
            <button class="opt" onClick={() => void share()}>
              <Icon name="share" />
              <span>
                Partager<small>En texte, par message ou e-mail</small>
              </span>
            </button>
            <button class="opt danger" onClick={() => void remove()}>
              <Icon name="trash" />
              <span>
                Supprimer la recette<small>Avec Annuler pendant quelques secondes</small>
              </span>
            </button>
          </div>
        </Sheet>
      )}
      {sheet?.k === 'edit' && (
        <Editor
          initial={r}
          mode="edit"
          onClose={close}
          onSave={({ draft }) => {
            mutateRecipes((d) => updateRecipe(d, r.id, draft as Partial<RecipeDraft>));
            close();
            showSnack('Recette modifiée');
          }}
        />
      )}
      {sheet?.k === 'adjust' && <AdjustSheet r={r} onClose={close} />}
      {sheet?.k === 'season' && <SeasonSheet r={r} onClose={close} />}
      {sheet?.k === 'done' && <DoneSheet r={r} afterCook={sheet.afterCook} onClose={close} />}
      {sheet?.k === 'courses' && <CoursesSheet r={r} portions={portions} onClose={close} />}
      {sheet?.k === 'cook' && <CookMode r={r} portions={portions} onQuit={() => setSheet({ k: 'done', afterCook: true })} onClose={close} />}
      {sheet?.k === 'viewer' && <Viewer photo={sheet.photo} onClose={close} />}
    </>
  );
}

function Source({ r, onPhoto }: { r: Recipe; onPhoto: (p: string) => void }) {
  const s = r.source;
  if (s.kind === 'link' && s.url)
    return (
      <a class="source" href={s.url} target="_blank" rel="noopener noreferrer">
        <span class="srcicon">
          <Icon name="link" />
        </span>
        <span>
          <b style="display:block">{s.label ?? new URL(s.url).hostname}</b>
          <span class="meta">Ouvrir la page d’origine</span>
        </span>
      </a>
    );
  if (s.photo)
    return (
      <button class="source" onClick={() => onPhoto(s.photo!)}>
        <Cover photo={s.photo} />
        <span>
          <b style="display:block">{s.label ?? 'Photo d’origine'}</b>
          <span class="meta">Photo d’origine : toucher pour l’agrandir</span>
        </span>
      </button>
    );
  return (
    <div class="source">
      <span class="srcicon">
        <Icon name="pen" />
      </span>
      <span>
        <b style="display:block">{s.label ?? 'Recette perso'}</b>
        <span class="meta">Saisie à la main</span>
      </span>
    </div>
  );
}

function JEntry({ r, j, onPhoto }: { r: Recipe; j: JournalEntry; onPhoto: (p: string) => void }) {
  const remove = () => {
    const before = recipesEngine.value?.data.value;
    mutateRecipes((d) => removeJournal(d, r.id, j.id));
    if (before) showSnack('Entrée du journal supprimée', () => mutateRecipes(() => before));
  };
  return (
    <div class="jentry">
      {j.photo ? (
        <button onClick={() => onPhoto(j.photo!)} aria-label="Agrandir la photo">
          <Cover photo={j.photo} />
        </button>
      ) : (
        <span />
      )}
      <div>
        <span class="meta">{shortDate(j.date)}</span> {j.rating != null && <Stars n={j.rating} />}
        {j.comment && <p>{j.comment}</p>}
      </div>
      <button class="iconbtn" aria-label={`Supprimer l’entrée du ${shortDate(j.date)}`} onClick={remove}>
        <Icon name="trash" />
      </button>
    </div>
  );
}

function AdjustSheet({ r, onClose }: { r: Recipe; onClose: () => void }) {
  const [text, setText] = useState(r.adjustments);
  return (
    <Sheet onClose={onClose} label="Mes ajustements">
      <h2>Mes ajustements</h2>
      <p class="note" style="margin-top:-6px">
        Ce que tu changes à chaque fois. Ça s’affiche en haut de la fiche et dans le mode cuisine.
      </p>
      <textarea class="ftext" style="min-height:120px" aria-label="Mes ajustements" value={text} onInput={(e) => setText(e.currentTarget.value)} autoFocus />
      <button
        class="btn primary block"
        onClick={() => {
          mutateRecipes((d) => updateRecipe(d, r.id, { adjustments: text.trim() }));
          onClose();
        }}
      >
        Enregistrer
      </button>
    </Sheet>
  );
}

function SeasonSheet({ r, onClose }: { r: Recipe; onClose: () => void }) {
  const info = recipeSeasons(r);
  const [s, setS] = useState<Season[]>(info.seasons);
  const toggle = (x: Season) => setS(s.includes(x) ? s.filter((y) => y !== x) : SEASONS.filter((y) => y === x || s.includes(y)));
  return (
    <Sheet onClose={onClose} label="Saison">
      <h2>Saison</h2>
      <p class="note" style="margin-top:-6px">
        Calculée à partir des fruits et légumes de la recette. Ton choix remplace le calcul. Rien de coché : toute l’année.
      </p>
      <div class="choice seasons">
        {SEASONS.map((x) => (
          <button key={x} style={`--sc:var(--s-${x})`} aria-pressed={s.includes(x)} onClick={() => toggle(x)}>
            {SEASON_LABELS[x]}
          </button>
        ))}
      </div>
      <div class="btnrow">
        <button
          class="btn ghost"
          disabled={!info.manual}
          onClick={() => {
            mutateRecipes((d) => updateRecipe(d, r.id, { seasons: null }));
            onClose();
          }}
        >
          Revenir au calcul
        </button>
        <button
          class="btn primary"
          style="flex:1"
          onClick={() => {
            mutateRecipes((d) => updateRecipe(d, r.id, { seasons: s }));
            onClose();
          }}
        >
          Enregistrer
        </button>
      </div>
    </Sheet>
  );
}

function DoneSheet({ r, afterCook, onClose }: { r: Recipe; afterCook?: boolean; onClose: () => void }) {
  const [date, setDate] = useState(todayIso());
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [asCover, setAsCover] = useState(true);
  const [busy, setBusy] = useState(false);
  const url = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const save = async () => {
    setBusy(true);
    try {
      const pid = photo ? await savePhoto(photo) : undefined;
      mutateRecipes((d) => {
        const next = addJournal(d, r.id, { date: date || todayIso(), rating, comment: comment.trim(), photo: pid, auteur: 'Robin' });
        return pid && asCover ? updateRecipe(next, r.id, { cover: pid }) : next;
      });
      onClose();
      showSnack('Ajouté au journal');
    } catch {
      setBusy(false);
      showSnack('Photo illisible : réessaie avec une autre.');
    }
  };

  return (
    <Sheet onClose={onClose} label="Je l’ai fait">
      <div class="sheet-head">
        <h2>Je l’ai fait</h2>
        <button class="btn ghost small" onClick={onClose}>
          {afterCook ? 'Pas maintenant' : 'Annuler'}
        </button>
      </div>
      <p class="note" style="margin-top:-6px">
        {r.title}
        {afterCook ? ' · tu sors du mode cuisine' : ''}
      </p>
      <div class="field">
        <label for="d-date">Quand</label>
        <input id="d-date" class="input" type="date" value={date} max={todayIso()} onInput={(e) => setDate(e.currentTarget.value)} />
      </div>
      <div class="field">
        <label>Ta note</label>
        <div class="rate" role="group" aria-label="Note sur 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} class={rating != null && n <= rating ? 'on' : ''} aria-label={`${n} sur 5`} aria-pressed={rating === n} onClick={() => setRating(rating === n ? null : n)}>
              ★
            </button>
          ))}
        </div>
      </div>
      <div class="field">
        <label for="d-com">Commentaire</label>
        <textarea id="d-com" class="ftext" placeholder="Ce qui a marché, ce que tu changerais…" value={comment} onInput={(e) => setComment(e.currentTarget.value)} />
      </div>
      {url ? (
        <div class="photo-prev">
          <img src={url} alt="Photo du plat" />
          <div style="display:grid;gap:8px">
            <label class="checkline">
              <input type="checkbox" checked={asCover} onChange={(e) => setAsCover(e.currentTarget.checked)} />
              Utiliser comme couverture
            </label>
            <button class="btn ghost small" style="justify-self:start" onClick={() => setPhoto(null)}>
              Retirer
            </button>
          </div>
        </div>
      ) : (
        <label class="photo-add">
          <Icon name="camera" />
          Ajouter une photo du plat
          <input type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.currentTarget.files?.[0] ?? null)} />
        </label>
      )}
      <button class="btn primary block" disabled={busy} onClick={() => void save()}>
        Enregistrer dans le journal
      </button>
    </Sheet>
  );
}

function CoursesSheet({ r, portions, onClose }: { r: Recipe; portions: number; onClose: () => void }) {
  const data = engine.value?.data.value;
  const listId = defaultListId();
  const read = useMemo(() => asReadRecipe(r), [r]);
  if (!data || !listId)
    return (
      <Sheet onClose={onClose} label="Aux courses">
        <h2>Aux courses</h2>
        <p class="lead">Crée d’abord une liste dans l’onglet Courses (une par magasin).</p>
        <button class="btn primary block" onClick={onClose}>
          OK
        </button>
      </Sheet>
    );
  return (
    <Sheet onClose={onClose} label={`Aux courses : ${r.title}`} full>
      <Review
        data={data}
        listId={listId}
        recipe={read}
        portions={portions}
        heading="Aux courses"
        onClose={onClose}
        onAdd={(dest, entries) => {
          sendToCourses(dest, entries, r.title, r.id);
          onClose();
        }}
      />
    </Sheet>
  );
}

export function Viewer({ photo, onClose }: { photo: string; onClose: () => void }) {
  const url = usePhoto(photo, 'full');
  return (
    <Sheet onClose={onClose} label="Photo" full cls="viewer">
      {url ? <img src={url} alt="" /> : <div class="spinner" aria-label="Chargement" />}
      <button class="fbtn" onClick={onClose} aria-label="Fermer">
        <Icon name="close" />
      </button>
    </Sheet>
  );
}
