import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from '../../components/Icon';
import { Sheet, sheetsSettled } from '../../components/Sheet';
import { showSnack } from '../../components/Snack';
import { savePhoto, usePhoto } from '../../photos/photos';
import { RecipeError } from '../../recipe/read';
import { navigate } from '../../router';
import { settings } from '../../settings/settings';
import { draftFromLabel, readLabel } from '../../cave/label';
import { wineAdvice } from '../../cave/advice';
import {
  addWish, avgRating, bottles, deleteWine, placeOptions, shelfOptions, removeExit, setStock, slotLabel, takeBottle, todayIso, updateExit, updateWine,
  vintageLabel, windowState, wineName, type WineDraft,
} from '../../cave/ops';
import { COLOR_LABELS, REASON_LABELS, WINE_LABEL_NAMES, isTasting, type Exit, type Reason, type Slot, type Wine } from '../../cave/types';
import { caveEngine, mutateCave } from '../../sync/store';
import { Cover, Stars, fmtNote, shortDate } from '../recettes/bits';
import { Viewer } from '../recettes/Page';
import { Dot, REASON_ICONS, YEAR, recipeList, recipeTitle, whereText } from './bits';
import { WineEditor } from './WineEditor';

// Fiche d'un vin (maquette validée) : étiquette, stock et « Sortir », fenêtre de dégustation, emplacements, le vin,
// accords, historique (dégustations et autres sorties).

export type StartSheet = { k: 'drank'; reason: Reason } | null;

type SheetKind =
  | { k: 'exit' }
  | { k: 'drank'; exitId?: string; reason: Reason }
  | { k: 'detail'; exitId: string; reason: Reason }
  | { k: 'stock' }
  | { k: 'window' }
  | { k: 'more' }
  | { k: 'edit' }
  | { k: 'viewer'; photo: string }
  | null;

/** Raisons proposées par « Sortir » : [raison, libellé, aide]. */
const EXIT_CHOICES: [Reason, string, string][] = [
  ['bue', 'Bue à la maison', 'Tu notes la dégustation juste après'],
  ['ailleurs', 'Apportée et bue ailleurs', 'Chez des amis, au restaurant, à une dégustation'],
  ['offerte', 'Offerte', 'Tu peux dire à qui'],
  ['cuisine', 'Pour la cuisine', 'Liée à une recette du carnet'],
  ['defaut', 'Bouchonnée ou abîmée', 'Bouchon, oxydation… rapportée ou non'],
  ['cassee', 'Cassée', ''],
  ['disparue', 'Disparue, sans doute bue', 'Pour remettre le stock juste'],
  ['vendue', 'Vendue ou échangée', ''],
];

const baseExit = (reason: Reason): Omit<Exit, 'id'> => ({ date: todayIso(), reason, rating: null, comment: '', dish: '', where: '', detail: '', auteur: 'Robin' });

export function WinePage({ w, onBack, start }: { w: Wine; onBack: () => void; start?: StartSheet }) {
  const [sheet, setSheet] = useState<SheetKind>(start ?? null);
  const close = () => setSheet(null);
  const y = YEAR();
  const n = bottles(w);
  const avg = avgRating(w);
  const st = windowState(w, y);
  const label = usePhoto(w.label, 'full');
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    const before = caveEngine.value?.data.value;
    close();
    await sheetsSettled();
    onBack();
    mutateCave((d) => deleteWine(d, w.id));
    if (before) showSnack(`« ${wineName(w)} » supprimé`, () => mutateCave(() => before));
  };

  const enrich = async () => {
    close();
    const key = settings.value.openaiKey;
    if (!key) return showSnack('Colle d’abord ta clé OpenAI dans les Réglages.');
    setBusy(true);
    showSnack('ChatGPT complète la fiche…');
    try {
      const recipes = recipeList();
      const desc = [w.domaine, w.cuvee, w.appellation, w.region, w.vintage ?? 'non millésimé', COLOR_LABELS[w.color]].filter(Boolean).join(', ');
      const r = await readLabel(key, { text: desc }, recipes);
      const d = draftFromLabel(r, recipes, w);
      mutateCave((cur) =>
        updateWine(cur, w.id, {
          region: d.region,
          country: d.country,
          appellation: d.appellation,
          grapes: d.grapes,
          style: d.style,
          from: d.from,
          to: d.to,
          pairings: d.pairings,
          pairRecipes: d.pairRecipes,
          labels: d.labels,
          estimated: d.estimated,
        }),
      );
      showSnack('Fiche complétée : les estimations sont à vérifier.');
    } catch (e) {
      showSnack(e instanceof RecipeError ? e.message : 'ChatGPT n’a pas pu compléter la fiche.');
    } finally {
      setBusy(false);
    }
  };

  const lo = Math.min(w.from ?? y, y) - 3;
  const hi = Math.max(w.to ?? y, y) + 3;
  const pct = (v: number) => ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * 100;
  const ticks = [0, 1, 2, 3, 4].map((k) => Math.round(lo + ((hi - lo) * k) / 4));

  return (
    <>
      <div class="rpage-scroll">
        <div class="wtop" style={`--wc:var(--w-${w.color})`}>
          {label ? (
            <button class="wtop-photo" onClick={() => setSheet({ k: 'viewer', photo: w.label! })} aria-label="Agrandir la photo de l’étiquette">
              <img src={label} alt="Étiquette" />
            </button>
          ) : (
            <div class="wlabel" aria-hidden="true">
              <small>{w.appellation}</small>
              <b>{w.domaine || w.appellation}</b>
              <i>{vintageLabel(w)}</i>
            </div>
          )}
          <button class="fbtn back" onClick={onBack} aria-label="Retour à la cave">
            <Icon name="back" />
          </button>
          <button class="fbtn more" onClick={() => setSheet({ k: 'more' })} aria-label="Plus d’actions">
            <Icon name="more" />
          </button>
        </div>
        <div class="fiche">
          <h1>
            {wineName(w)} {vintageLabel(w)}
          </h1>
          <div class="chipsline">
            <span class="rtag plain">
              <Dot color={w.color} size={10} />
              {COLOR_LABELS[w.color]}
            </span>
            {w.appellation && <span class="rtag plain">{w.appellation}</span>}
            {w.region && <span class="rtag plain">{w.region}</span>}
            {w.size && <span class="rtag plain">{w.size}</span>}
            {(w.labels ?? []).map((l) => (
              <span key={l} class="rtag wlab">
                {WINE_LABEL_NAMES[l]}
              </span>
            ))}
            {avg != null && (
              <span class="statline">
                <Stars n={avg} />
                {fmtNote(avg)}
              </span>
            )}
          </div>
          <div class="stock">
            <span class="big">{n}</span>
            <span class="t">
              <b>
                bouteille{n > 1 ? 's' : ''} en cave
              </b>
              <div class="meta">{whereText(w) || 'plus aucune'}</div>
            </span>
            {n > 0 ? (
              <button class="btn primary" onClick={() => setSheet({ k: 'exit' })}>
                <Icon name="glass" />
                Sortir
              </button>
            ) : (
              <button class="btn" onClick={() => setSheet({ k: 'stock' })}>
                <Icon name="plus" />
                Ranger
              </button>
            )}
          </div>

          <section class="block">
            <h2>
              Fenêtre de dégustation {w.estimated.includes('window') && <span class="wtag est">estimation ChatGPT</span>}
            </h2>
            {st === 'unknown' ? (
              <p class="note">Pas de fenêtre. Saisis-la, ou « ⋯ » puis « Compléter avec ChatGPT ».</p>
            ) : (
              <>
                <p class="note">
                  {st === 'late' ? (
                    <span class="warnline">Fenêtre passée depuis {w.to} : à boire vite.</span>
                  ) : st === 'young' ? (
                    `Pas encore prêt : à attendre jusqu’en ${w.from}.`
                  ) : w.to ? (
                    `À boire jusqu’en ${w.to}.`
                  ) : (
                    'À boire.'
                  )}
                </p>
                <div class="win" role="img" aria-label={`De ${w.from ?? '?'} à ${w.to ?? '?'}`}>
                  <div class="track" />
                  <div class={`band${w.estimated.includes('window') ? ' est' : ''}`} style={`left:${pct(w.from ?? lo)}%;width:${pct(w.to ?? hi) - pct(w.from ?? lo)}%`} />
                  <div class="now" style={`left:${pct(y)}%`} data-y={y} />
                  <div class="ticks">
                    {ticks.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                </div>
              </>
            )}
            <button class="btn ghost small" style="margin-top:8px" onClick={() => setSheet({ k: 'window' })}>
              Modifier la fenêtre
            </button>
          </section>

          <section class="block">
            <h2>Emplacement</h2>
            {w.stock.length ? (
              <div class="locs">
                {w.stock.map((s) => (
                  <div class="loc" key={`${s.place}|${s.shelf}`}>
                    <Icon name="pin" />
                    <b>{slotLabel(s)}</b>
                    <span class="n">×{s.n}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p class="note">Plus de bouteille en cave.</p>
            )}
            <button class="btn ghost small" style="margin-top:8px" onClick={() => setSheet({ k: 'stock' })}>
              Déplacer ou ajouter des bouteilles
            </button>
          </section>

          {(w.grapes || w.style || w.price != null || w.bought || w.country || w.notes) && (
            <section class="block">
              <h2>Le vin</h2>
              <div class="kv">
                {w.grapes && (
                  <>
                    <span>Cépages</span>
                    <span>
                      {w.grapes} {w.estimated.includes('grapes') && <span class="wtag est">estimation</span>}
                    </span>
                  </>
                )}
                {w.style && (
                  <>
                    <span>Style</span>
                    <span>
                      {w.style} {w.estimated.includes('style') && <span class="wtag est">estimation</span>}
                    </span>
                  </>
                )}
                {w.country && (
                  <>
                    <span>Pays</span>
                    <span>{w.country}</span>
                  </>
                )}
                {(w.price != null || w.bought) && (
                  <>
                    <span>Achat</span>
                    <span>{[w.price != null ? `${w.price.toLocaleString('fr-FR')} € la bouteille` : '', w.bought].filter(Boolean).join(' · ')}</span>
                  </>
                )}
                {w.notes && (
                  <>
                    <span>Notes</span>
                    <span style="white-space:pre-line">{w.notes}</span>
                  </>
                )}
              </div>
            </section>
          )}

          <ServiceBlock w={w} />

          {(w.pairRecipes.length > 0 || w.pairings.length > 0) && (
            <section class="block">
              <h2>Avec quoi le boire</h2>
              <div class="pairs">
                {w.pairRecipes.map((id) => {
                  const t = recipeTitle(id);
                  return (
                    t && (
                      <button key={id} class="pair" onClick={() => navigate({ name: 'tab', tab: 'recettes', sub: id })}>
                        <Icon name="book" />
                        {t}
                      </button>
                    )
                  );
                })}
                {w.pairings.map((p) => (
                  <span key={p} class="pair gen">
                    {p}
                  </span>
                ))}
              </div>
              <p class="note" style="margin-top:8px">
                {w.pairRecipes.length > 0 ? 'En terracotta : des recettes de ton carnet. ' : ''}
                {w.estimated.includes('pairings') ? 'Accords proposés par ChatGPT, à titre d’idée.' : ''}
              </p>
            </section>
          )}

          <section class="block">
            <h2>
              Historique{' '}
              <span class="meta" style="font-family:var(--f-ui)">
                {w.history.filter((x) => isTasting(x.reason)).length ? `bu ${w.history.filter((x) => isTasting(x.reason)).length} fois` : ''}
              </span>
            </h2>
            <div class="journal">
              {w.history.length ? (
                w.history.map((x) => (
                  <HistoryEntry
                    key={x.id}
                    w={w}
                    x={x}
                    onEdit={() => setSheet(isTasting(x.reason) ? { k: 'drank', exitId: x.id, reason: x.reason } : { k: 'detail', exitId: x.id, reason: x.reason })}
                    onPhoto={(p) => setSheet({ k: 'viewer', photo: p })}
                  />
                ))
              ) : (
                <p class="note">Aucune bouteille sortie. « Sortir » baisse le stock et te demande pourquoi : bue, offerte, bouchonnée…</p>
              )}
            </div>
          </section>
          {busy && <p class="note center">ChatGPT complète la fiche…</p>}
        </div>
      </div>

      {sheet?.k === 'exit' && <ExitSheet w={w} onClose={close} onNext={setSheet} />}
      {sheet?.k === 'drank' && <DrankSheet w={w} exitId={sheet.exitId} reason={sheet.reason} onClose={close} />}
      {sheet?.k === 'detail' && <DetailSheet w={w} exitId={sheet.exitId} reason={sheet.reason} onClose={close} />}
      {sheet?.k === 'stock' && <StockSheet w={w} onClose={close} />}
      {sheet?.k === 'window' && <WindowSheet w={w} onClose={close} />}
      {sheet?.k === 'viewer' && <Viewer photo={sheet.photo} onClose={close} />}
      {sheet?.k === 'edit' && caveEngine.value?.data.value && (
        <WineEditor
          data={caveEngine.value.data.value}
          initial={w}
          mode="edit"
          onClose={close}
          onSave={({ draft }) => {
            mutateCave((d) => updateWine(d, w.id, draft as Partial<WineDraft>));
            close();
            showSnack('Fiche modifiée');
          }}
        />
      )}
      {sheet?.k === 'more' && (
        <Sheet onClose={close} label="Plus d’actions">
          <div class="opts">
            <button class="opt" onClick={() => setSheet({ k: 'edit' })}>
              <Icon name="pen" />
              <span>
                Modifier la fiche<small>Domaine, millésime, fenêtre, cépages, prix…</small>
              </span>
            </button>
            {settings.value.openaiKey && (
              <button class="opt" onClick={() => void enrich()}>
                <Icon name="sparkle" />
                <span>
                  Compléter avec ChatGPT<small>Remplit ce qui manque (fenêtre, cépages, accords), marqué « estimation »</small>
                </span>
              </button>
            )}
            <label class="opt">
              <Icon name="camera" />
              <span>
                {w.label ? 'Changer la photo de l’étiquette' : 'Ajouter une photo de l’étiquette'}
                <small>Elle remplace l’étiquette dessinée</small>
              </span>
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const file = e.currentTarget.files?.[0];
                  close();
                  if (!file) return;
                  try {
                    const id = await savePhoto(file);
                    mutateCave((d) => updateWine(d, w.id, { label: id }));
                  } catch {
                    showSnack('Photo illisible : réessaie avec une autre.');
                  }
                }}
              />
            </label>
            <button
              class="opt"
              onClick={() => {
                mutateCave((d) => addWish(d, { domaine: w.domaine, cuvee: w.cuvee, color: w.color, appellation: w.appellation, why: 'Pour en racheter', wineId: w.id }));
                close();
                showSnack('Ajouté à tes envies');
              }}
            >
              <Icon name="heart" />
              <span>
                Mettre dans les envies<small>Pour en racheter</small>
              </span>
            </button>
            <button class="opt danger" onClick={() => void remove()}>
              <Icon name="trash" />
              <span>
                Supprimer le vin<small>Avec Annuler pendant quelques secondes</small>
              </span>
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function HistoryEntry({ w, x, onEdit, onPhoto }: { w: Wine; x: Exit; onEdit: () => void; onPhoto: (p: string) => void }) {
  const remove = () => {
    const before = caveEngine.value?.data.value;
    // Sortie faite dans l'app : la bouteille retourne à sa place. Ligne importée de CellarTracker : simple suppression.
    const restock = !!x.from && !x.ctId && x.reason !== 'exterieur';
    mutateCave((d) => removeExit(d, w.id, x.id, restock));
    if (before) showSnack(restock ? `Sortie annulée : bouteille remise ${slotLabel(x.from!)}` : 'Ligne supprimée', () => mutateCave(() => before));
  };
  const recipe = x.recipe ? recipeTitle(x.recipe) : null;
  if (!isTasting(x.reason))
    return (
      <div class="xentry">
        <button class="xmain" onClick={onEdit}>
          <Icon name={REASON_ICONS[x.reason]} />
          <span>
            <b>{REASON_LABELS[x.reason]}</b> · {shortDate(x.date)}
            {x.detail ? ` · ${x.detail}` : ''}
            {recipe ? ` · pour ${recipe}` : ''}
            {x.comment ? ` · ${x.comment}` : ''}
          </span>
        </button>
        <button class="iconbtn" aria-label={`Supprimer la ligne du ${shortDate(x.date)}`} onClick={remove}>
          <Icon name="trash" />
        </button>
      </div>
    );
  return (
    <div class="jentry">
      {x.photo ? (
        <button onClick={() => onPhoto(x.photo!)} aria-label="Agrandir la photo">
          <Cover photo={x.photo} />
        </button>
      ) : (
        <span class="wsw" style={`--wc:var(--w-${w.color})`} />
      )}
      <button class="xmain" onClick={onEdit}>
        <span class="meta">
          {shortDate(x.date)}
          {x.reason !== 'bue' ? ` · ${x.where || REASON_LABELS[x.reason].toLowerCase()}` : ''}
        </span>{' '}
        {x.rating != null ? <Stars n={x.rating} /> : <span class="meta">· sans note</span>}
        {x.comment && <p>{x.comment}</p>}
        {(recipe || x.dish) && <span class="meta">avec {recipe ?? x.dish}</span>}
      </button>
      <button class="iconbtn" aria-label={`Supprimer la dégustation du ${shortDate(x.date)}`} onClick={remove}>
        <Icon name="trash" />
      </button>
    </div>
  );
}

function ExitSheet({ w, onClose, onNext }: { w: Wine; onClose: () => void; onNext: (s: SheetKind) => void }) {
  const spots = w.stock.filter((s) => s.n > 0);
  const [sp, setSp] = useState(0);
  const take = (reason: Reason) => {
    const s = spots[sp] ?? spots[0];
    if (!s) return onClose();
    let exitId = '';
    mutateCave((d) => {
      const r = takeBottle(d, w.id, { ...baseExit(reason), from: { place: s.place, shelf: s.shelf } });
      exitId = r.exitId;
      return r.data;
    });
    const left = bottles(w) - 1;
    showSnack(`${REASON_LABELS[reason]} (${slotLabel(s)}) : il en reste ${left}`, () => {
      mutateCave((d) => removeExit(d, w.id, exitId, true));
      onNext(null);
    });
    if (reason === 'bue' || reason === 'ailleurs') onNext({ k: 'drank', exitId, reason });
    else if (reason === 'offerte' || reason === 'cuisine' || reason === 'defaut') onNext({ k: 'detail', exitId, reason });
    else onClose();
  };
  return (
    <Sheet onClose={onClose} label="Sortir une bouteille">
      <div class="sheet-head">
        <h2>Sortir une bouteille</h2>
        <button class="btn ghost small" onClick={onClose}>
          Annuler
        </button>
      </div>
      <p class="note" style="margin-top:-6px">
        {wineName(w)} {vintageLabel(w)} · il en reste {bottles(w)}
      </p>
      {spots.length > 1 && (
        <div class="field">
          <label>D’où sort-elle</label>
          <div class="choice" role="group" aria-label="Emplacement">
            {spots.map((s, k) => (
              <button key={k} aria-pressed={sp === k} onClick={() => setSp(k)}>
                {slotLabel(s)} ({s.n})
              </button>
            ))}
          </div>
        </div>
      )}
      <div class="field">
        <label>Pourquoi</label>
        <div class="opts tight">
          {EXIT_CHOICES.map(([r, l, h]) => (
            <button key={r} class="opt" onClick={() => take(r)}>
              <Icon name={REASON_ICONS[r]} />
              <span>
                {l}
                {h && <small>{h}</small>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/** Choix d'une recette du carnet : celles de l'accord d'abord, puis la saisie libre avec suggestions. */
function DishField({ w, recipe, dish, onChange, label }: { w: Wine; recipe?: string; dish: string; onChange: (recipe: string | undefined, dish: string) => void; label: string }) {
  const recipes = useMemo(recipeList, []);
  const chips = w.pairRecipes.filter((id) => recipes.some((r) => r.id === id));
  const shown = recipe ? (recipes.find((r) => r.id === recipe)?.title ?? dish) : dish;
  return (
    <div class="field">
      <label for="b-dish">{label}</label>
      {chips.length > 0 && (
        <div class="choice">
          {chips.map((id) => (
            <button key={id} aria-pressed={recipe === id} onClick={() => (recipe === id ? onChange(undefined, '') : onChange(id, ''))}>
              <Icon name="book" />
              {recipes.find((r) => r.id === id)!.title}
            </button>
          ))}
        </div>
      )}
      <input
        id="b-dish"
        class="input"
        list="b-recipes"
        value={shown}
        placeholder="Plat ou recette du carnet (ex. côte de bœuf)"
        onInput={(e) => {
          const v = e.currentTarget.value;
          const r = recipes.find((x) => x.title.toLowerCase() === v.trim().toLowerCase());
          onChange(r?.id, r ? '' : v);
        }}
      />
      <datalist id="b-recipes">
        {recipes.map((r) => (
          <option key={r.id} value={r.title} />
        ))}
      </datalist>
    </div>
  );
}

function DrankSheet({ w, exitId, reason, onClose }: { w: Wine; exitId?: string; reason: Reason; onClose: () => void }) {
  const x = exitId ? w.history.find((e) => e.id === exitId) : undefined;
  const editing = !!x && (x.rating != null || !!x.comment || !!x.dish || !!x.recipe || !!x.photo);
  const [date, setDate] = useState(x?.date ?? todayIso());
  const [rating, setRating] = useState<number | null>(x?.rating ?? null);
  const [comment, setComment] = useState(x?.comment ?? '');
  const [dish, setDish] = useState({ recipe: x?.recipe, dish: x?.dish ?? '' });
  const [where, setWhere] = useState(x?.where ?? '');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const url = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  const outside = reason !== 'bue';

  const save = async () => {
    setBusy(true);
    try {
      const pid = photo ? await savePhoto(photo) : undefined;
      const patch: Partial<Exit> = {
        date: date || todayIso(),
        rating,
        comment: comment.trim(),
        recipe: dish.recipe,
        dish: dish.dish.trim(),
        where: outside ? where.trim() : '',
        ...(pid ? { photo: pid } : {}),
      };
      mutateCave((d) => (exitId ? updateExit(d, w.id, exitId, patch) : takeBottle(d, w.id, { ...baseExit(reason), ...patch }).data));
      onClose();
      showSnack(editing ? 'Dégustation modifiée' : 'Ajouté à tes dégustations');
    } catch {
      setBusy(false);
      showSnack('Photo illisible : réessaie avec une autre.');
    }
  };

  return (
    <Sheet onClose={onClose} label="Je l’ai bu">
      <div class="sheet-head">
        <h2>{reason === 'exterieur' ? 'Dégusté ailleurs' : 'Je l’ai bu'}</h2>
        <button class="btn ghost small" onClick={onClose}>
          {exitId && !editing ? 'Plus tard' : 'Annuler'}
        </button>
      </div>
      <p class="note" style="margin-top:-6px">
        {wineName(w)} {vintageLabel(w)}
      </p>
      <div class="field">
        <label for="b-date">Quand</label>
        <input id="b-date" class="input" type="date" value={date} max={todayIso()} onInput={(e) => setDate(e.currentTarget.value)} />
      </div>
      <div class="field">
        <label>Ta note</label>
        <div class="rate" role="group" aria-label="Note sur 5">
          {[1, 2, 3, 4, 5].map((k) => (
            <button key={k} class={rating != null && k <= rating ? 'on' : ''} aria-label={`${k} sur 5`} aria-pressed={rating === k} onClick={() => setRating(rating === k ? null : k)}>
              ★
            </button>
          ))}
        </div>
      </div>
      <div class="field">
        <label for="b-com">Commentaire</label>
        <textarea id="b-com" class="ftext" placeholder="Arômes, ouverture, ce que tu en as pensé…" value={comment} onInput={(e) => setComment(e.currentTarget.value)} />
      </div>
      <DishField w={w} recipe={dish.recipe} dish={dish.dish} label="Avec quel plat" onChange={(recipe, d) => setDish({ recipe, dish: d })} />
      {outside && (
        <div class="field">
          <label for="b-ou">Où</label>
          <input id="b-ou" class="input" placeholder="Restaurant, chez des amis, dégustation…" value={where} onInput={(e) => setWhere(e.currentTarget.value)} />
        </div>
      )}
      {url ? (
        <div class="photo-prev">
          <img src={url} alt="Photo de la dégustation" />
          <button class="btn ghost small" onClick={() => setPhoto(null)}>
            Retirer
          </button>
        </div>
      ) : (
        <label class="photo-add">
          <Icon name="camera" />
          {x?.photo ? 'Changer la photo' : 'Ajouter une photo'}
          <input type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.currentTarget.files?.[0] ?? null)} />
        </label>
      )}
      <button class="btn primary block" disabled={busy} onClick={() => void save()}>
        Enregistrer la dégustation
      </button>
    </Sheet>
  );
}

const DEFECTS = ['bouchonnée', 'oxydée', 'trop vieille', 'autre défaut'];

/** Précision facultative pour une sortie sans dégustation (offerte, cuisine, défaut). */
function DetailSheet({ w, exitId, reason, onClose }: { w: Wine; exitId: string; reason: Reason; onClose: () => void }) {
  const x = w.history.find((e) => e.id === exitId);
  const parts = (x?.detail ?? '').split(', ').filter(Boolean);
  const [date, setDate] = useState(x?.date ?? todayIso());
  const [who, setWho] = useState(reason === 'offerte' ? (x?.detail ?? '') : '');
  const [dish, setDish] = useState({ recipe: x?.recipe, dish: x?.dish ?? '' });
  const [defect, setDefect] = useState(parts.find((p) => DEFECTS.includes(p)) ?? 'bouchonnée');
  const [returned, setReturned] = useState(parts.includes('rapportée au caviste'));
  const [comment, setComment] = useState(x?.comment ?? '');
  const title = { offerte: 'Offerte', cuisine: 'Pour la cuisine', defaut: 'Bouchonnée ou abîmée' }[reason as 'offerte'] ?? REASON_LABELS[reason];

  const save = () => {
    const patch: Partial<Exit> = { date: date || todayIso(), comment: comment.trim() };
    if (reason === 'offerte') patch.detail = who.trim();
    else if (reason === 'cuisine') Object.assign(patch, { recipe: dish.recipe, dish: dish.dish.trim(), detail: '' });
    else if (reason === 'defaut') patch.detail = [defect, returned ? 'rapportée au caviste' : ''].filter(Boolean).join(', ');
    mutateCave((d) => updateExit(d, w.id, exitId, patch));
    onClose();
    showSnack('Historique du vin mis à jour');
  };

  return (
    <Sheet onClose={onClose} label={title}>
      <div class="sheet-head">
        <h2>{title}</h2>
        <button class="btn ghost small" onClick={onClose}>
          Passer
        </button>
      </div>
      <p class="note" style="margin-top:-6px">
        {wineName(w)} {vintageLabel(w)} · facultatif
      </p>
      <div class="field">
        <label for="x-date">Quand</label>
        <input id="x-date" class="input" type="date" value={date} max={todayIso()} onInput={(e) => setDate(e.currentTarget.value)} />
      </div>
      {reason === 'offerte' && (
        <div class="field">
          <label for="x-who">À qui, pour quelle occasion</label>
          <input id="x-who" class="input" placeholder="ex. à Paul, pour son anniversaire" value={who} onInput={(e) => setWho(e.currentTarget.value)} />
        </div>
      )}
      {reason === 'cuisine' && <DishField w={w} recipe={dish.recipe} dish={dish.dish} label="Pour quelle recette" onChange={(recipe, d) => setDish({ recipe, dish: d })} />}
      {reason === 'defaut' && (
        <>
          <div class="field">
            <label>Le problème</label>
            <div class="choice" role="group" aria-label="Le problème">
              {DEFECTS.map((t) => (
                <button key={t} aria-pressed={defect === t} onClick={() => setDefect(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <label class="checkline">
            <input type="checkbox" checked={returned} onChange={(e) => setReturned(e.currentTarget.checked)} />
            Rapportée au caviste ou remplacée
          </label>
        </>
      )}
      <div class="field">
        <label for="x-com">Commentaire</label>
        <input id="x-com" class="input" placeholder={reason === 'defaut' ? 'ex. 2e bouteille du carton touchée' : ''} value={comment} onInput={(e) => setComment(e.currentTarget.value)} />
      </div>
      <button class="btn primary block" onClick={save}>
        Enregistrer
      </button>
    </Sheet>
  );
}

function StockSheet({ w, onClose }: { w: Wine; onClose: () => void }) {
  const data = caveEngine.value?.data.value;
  const places = useMemo(() => (data ? placeOptions(data) : []), [data]);
  const [rows, setRows] = useState<Slot[]>(() => (w.stock.length ? w.stock.map((s) => ({ ...s })) : [{ place: places[0] ?? 'En attente', shelf: '', n: 1 }]));
  const setRow = (k: number, patch: Partial<Slot>) => setRows((cur) => cur.map((r, j) => (j === k ? { ...r, ...patch } : r)));
  const total = rows.reduce((a, r) => a + r.n, 0);
  return (
    <Sheet onClose={onClose} label="Emplacements">
      <div class="sheet-head">
        <h2>Emplacements</h2>
        <button class="btn ghost small" onClick={onClose}>
          Annuler
        </button>
      </div>
      <p class="note" style="margin-top:-6px">
        Change la cave, la clayette ou le nombre de bouteilles. Pour une bouteille bue, préfère « Sortir » : elle ira dans l’historique.
      </p>
      <div class="slots">
        {rows.map((r, k) => (
          <div class="slotrow" key={k}>
            <select class="input" aria-label={`Cave ${k + 1}`} value={r.place} onChange={(e) => setRow(k, { place: e.currentTarget.value, shelf: '' })}>
              {(data ? placeOptions(data, r.place) : [r.place]).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select class="input" aria-label={`Clayette ${k + 1}`} value={r.shelf} onChange={(e) => setRow(k, { shelf: e.currentTarget.value })}>
              {(data ? shelfOptions(data, r.place, r.shelf) : [r.shelf]).map((x) => (
                <option key={x} value={x}>
                  {x || 'Aucune'}
                </option>
              ))}
            </select>
            <span class="stepper">
              <button aria-label={`Une bouteille de moins, emplacement ${k + 1}`} onClick={() => setRow(k, { n: Math.max(0, r.n - 1) })}>
                −
              </button>
              <b>{r.n}</b>
              <button aria-label={`Une bouteille de plus, emplacement ${k + 1}`} onClick={() => setRow(k, { n: r.n + 1 })}>
                +
              </button>
            </span>
          </div>
        ))}
      </div>
      <button class="btn ghost small" style="justify-self:start" onClick={() => setRows([...rows, { place: rows[rows.length - 1]?.place ?? places[0] ?? 'En attente', shelf: '', n: 1 }])}>
        <Icon name="plus" />
        Autre emplacement
      </button>
      <button
        class="btn primary block"
        onClick={() => {
          mutateCave((d) => setStock(d, w.id, rows.filter((r) => r.place.trim() && r.n > 0)));
          onClose();
          showSnack(`${total} bouteille${total > 1 ? 's' : ''} en cave`);
        }}
      >
        Enregistrer ({total} bouteille{total > 1 ? 's' : ''})
      </button>
    </Sheet>
  );
}

function WindowSheet({ w, onClose }: { w: Wine; onClose: () => void }) {
  const [from, setFrom] = useState(w.from ? String(w.from) : '');
  const [to, setTo] = useState(w.to ? String(w.to) : '');
  const yr = (s: string) => {
    const n = parseInt(s, 10);
    return n > 1800 && n < 2200 ? n : null;
  };
  return (
    <Sheet onClose={onClose} label="Fenêtre de dégustation">
      <h2>Fenêtre de dégustation</h2>
      <p class="note" style="margin-top:-6px">
        Les années où ce vin est bon à boire. « À boire » classe la cave par année de fin.
      </p>
      <div class="fgrid2">
        <div class="field">
          <label for="w-from">À boire dès</label>
          <input id="w-from" class="input" inputMode="numeric" value={from} placeholder="année" onInput={(e) => setFrom(e.currentTarget.value)} />
        </div>
        <div class="field">
          <label for="w-to">Jusqu’à</label>
          <input id="w-to" class="input" inputMode="numeric" value={to} placeholder="année" onInput={(e) => setTo(e.currentTarget.value)} />
        </div>
      </div>
      <button
        class="btn primary block"
        onClick={() => {
          let a = yr(from);
          let b = yr(to);
          if (a && b && a > b) [a, b] = [b, a];
          mutateCave((d) => updateWine(d, w.id, { from: a, to: b, estimated: w.estimated.filter((e) => e !== 'window') }));
          onClose();
        }}
      >
        Enregistrer
      </button>
    </Sheet>
  );
}

const DECANT = { oui: 'Oui', non: 'Non', facultatif: 'Facultatif' } as const;

/** « Donne-moi des infos » : carafe, température, verre, où en est le vin ; demandé à ChatGPT et gardé dans la fiche. */
function ServiceBlock({ w }: { w: Wine }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = settings.value.openaiKey;
  const s = w.service;
  if (!s && !key) return null;
  const ask = async () => {
    setBusy(true);
    setError('');
    try {
      const service = await wineAdvice(key, w);
      mutateCave((d) => updateWine(d, w.id, { service }));
    } catch (e) {
      setError(e instanceof RecipeError ? e.message : 'ChatGPT n’a pas pu répondre.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section class="block">
      <h2>
        Service {s && <span class="wtag est">estimation ChatGPT</span>}
      </h2>
      {s ? (
        <>
          <div class="kv">
            <span>Carafe</span>
            <span>
              <b>{DECANT[s.decant]}</b>
              {s.decantDetail ? ` · ${s.decantDetail}` : ''}
            </span>
            <span>Température</span>
            <span>
              <b>{s.temperature}</b>
              {s.temperatureTip ? ` · ${s.temperatureTip}` : ''}
            </span>
            {s.glass && (
              <>
                <span>Verre</span>
                <span>{s.glass}</span>
              </>
            )}
            {s.timing && (
              <>
                <span>Aujourd’hui</span>
                <span>{s.timing}</span>
              </>
            )}
          </div>
          {s.about && (
            <p class="note" style="margin-top:10px;font-size:14px;color:var(--ink)">
              {s.about}
            </p>
          )}
          {s.tips.length > 0 && (
            <ul class="svc-tips">
              {s.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          {key && (
            <button class="btn ghost small" style="margin-top:8px" disabled={busy} onClick={() => void ask()}>
              <Icon name="sparkle" />
              {busy ? 'ChatGPT réfléchit…' : 'Redemander'}
            </button>
          )}
        </>
      ) : (
        <>
          <p class="note">Faut-il le carafer, à quelle température le servir, dans quel verre, où il en est aujourd’hui.</p>
          <button class="btn primary" style="margin-top:8px" disabled={busy} onClick={() => void ask()}>
            <Icon name="sparkle" />
            {busy ? 'ChatGPT réfléchit…' : 'Donne-moi des infos'}
          </button>
        </>
      )}
      {error && (
        <p class="note" role="alert" style="color:var(--danger);margin-top:6px">
          {error}
        </p>
      )}
    </section>
  );
}
