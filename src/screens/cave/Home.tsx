import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { Icon } from '../../components/Icon';
import { Sheet, sheetsSettled } from '../../components/Sheet';
import { showSnack } from '../../components/Snack';
import { Topbar } from '../../components/Topbar';
import {
  NO_FILTER, bottles, cellarPlan, drinkGroups, filterActive, filterChoices, inCellar, matchWine, onlyPlace, passFilter, removeWish, tastings, totalBottles, wineName, vintageLabel,
  type WineFilter,
} from '../../cave/ops';
import { COLORS, COLOR_LABELS, type CaveFile, type Wine, type Wish } from '../../cave/types';
import { caveEngine, mutateCave } from '../../sync/store';
import { Stars, shortDate } from '../recettes/bits';
import { BottleArt, Dot, Thumb, WineRow, YEAR, recipeTitle } from './bits';

// Accueil de la cave (maquette validée le 20/11/2026) : À boire (par défaut), Ma cave (plan ou liste), Dégustés, Envies.

export type CaveView = 'boire' | 'cave' | 'bus' | 'envies';
const VIEWS: [CaveView, string][] = [
  ['boire', 'À boire'],
  ['cave', 'Ma cave'],
  ['bus', 'Dégustés'],
  ['envies', 'Envies'],
];

// Gardés pendant la session : ouvrir une fiche puis revenir retrouve la même vue.
export const view = signal<CaveView>('boire');
const query = signal('');
const filter = signal<WineFilter>(NO_FILTER);
const caveMode = signal<'plan' | 'liste'>('plan');

/** Le bandeau d'import reste visible tant que rien n'a été importé de CellarTracker. */
const CT_DEADLINE = '2026-12-14';

export function Home(props: {
  data: CaveFile | null;
  openId?: string;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onImport: () => void;
  onBought: (w: Wish) => void;
}) {
  const { data, openId, onOpen } = props;
  const e = caveEngine.value;
  const q = query.value.trim();
  const [filterOpen, setFilterOpen] = useState(false);
  const [shelf, setShelf] = useState<{ place: string; shelf: string; wines: Wine[] } | null>(null);
  const row = (w: Wine, sub?: string) => <WineRow key={w.id} w={w} sub={sub} current={w.id === openId} onOpen={() => onOpen(w.id)} />;
  const y = YEAR();

  let body;
  if (!data) {
    body = e?.error.value ? (
      <div class="empty" role="alert">
        <b>Impossible de charger la cave</b>
        {e.error.value}
      </div>
    ) : (
      <p class="empty">Chargement de la cave…</p>
    );
  } else {
    const f = filter.value;
    const list = inCellar(data).filter((w) => matchWine(w, q) && passFilter(w, f));
    const imported = data.wines.some((w) => w.ctId);
    const banner = !imported && (
      <button class="banner" onClick={props.onImport}>
        <b>
          <Icon name="upload" />
          Importer depuis CellarTracker
        </b>
        <span class="note">
          {new Date().toISOString().slice(0, 10) <= CT_DEADLINE
            ? 'Ton abonnement se termine le 14 décembre : exporte tes données avant. Tu vérifies tout avant l’import.'
            : 'Tes exports CSV de CellarTracker : stock, bouteilles bues et notes. Tu vérifies tout avant l’import.'}
        </span>
      </button>
    );
    const empty = !data.wines.length && (
      <div class="empty">
        <b>Ta cave est vide</b>
        Photographie l’étiquette d’une bouteille, ou importe ta cave CellarTracker.
        <div class="btnrow" style="justify-content:center;margin-top:14px">
          <button class="btn primary" onClick={props.onAdd}>
            <Icon name="camera" />
            Premier vin
          </button>
          <button class="btn ghost" onClick={props.onImport}>
            <Icon name="upload" />
            CellarTracker
          </button>
        </div>
      </div>
    );

    if (view.value === 'boire') {
      const g = drinkGroups(list, y);
      const n = (ws: Wine[]) => ws.reduce((a, w) => a + bottles(w), 0);
      const plural = (k: number) => `${k} bouteille${k > 1 ? 's' : ''}`;
      body = empty || (
        <>
          <p class="summary">
            <span>
              <b>{totalBottles(data)}</b> bouteilles
            </span>
            <span>
              <b>{inCellar(data).length}</b> vins
            </span>
            <span>classés par fin de fenêtre</span>
          </p>
          {g.ready.map((grp) => (
            <div key={grp.year}>
              <div class={`sec-h${grp.late ? ' late' : ''}`}>
                <h2>{grp.late ? 'Fenêtre dépassée' : grp.year === y ? `À boire en ${y}` : `À boire avant fin ${grp.year}`}</h2>
                <span>{plural(n(grp.wines))}</span>
              </div>
              {grp.wines.map((w) => row(w))}
            </div>
          ))}
          {g.young.length > 0 && (
            <>
              <div class="sec-h">
                <h2>Pas encore prêts</h2>
                <span>{plural(n(g.young))}</span>
              </div>
              {g.young.map((w) => row(w))}
            </>
          )}
          {g.unknown.length > 0 && (
            <>
              <div class="sec-h">
                <h2>Sans fenêtre de dégustation</h2>
                <span>{plural(n(g.unknown))}</span>
              </div>
              {g.unknown.map((w) => row(w))}
              <p class="hint">Sur la fiche, « ⋯ » puis « Compléter avec ChatGPT » propose une fenêtre.</p>
            </>
          )}
          {!list.length && <p class="hint" style="padding-top:16px">{q ? 'Aucun vin ne correspond.' : 'Aucune bouteille en cave.'}</p>}
          {list.some((w) => w.estimated.includes('window')) && (
            <p class="hint" style="padding-top:14px">
              Pointillés : fenêtre estimée par ChatGPT, à corriger quand tu sais mieux.
            </p>
          )}
        </>
      );
    } else if (view.value === 'cave') {
      const plan = cellarPlan(onlyPlace(list, f.place));
      body = (
        <>
          {banner}
          {empty || (
            <>
              <div class="sec-h">
                <h2>{totalBottles(data)} bouteilles</h2>
                <span>
                  {inCellar(data).length} vins · {cellarPlan(inCellar(data)).length} lieu{cellarPlan(inCellar(data)).length > 1 ? 'x' : ''}
                </span>
              </div>
              <div class="toggle" role="group" aria-label="Affichage">
                <button aria-pressed={caveMode.value === 'plan'} onClick={() => (caveMode.value = 'plan')}>
                  Plan
                </button>
                <button aria-pressed={caveMode.value === 'liste'} onClick={() => (caveMode.value = 'liste')}>
                  Liste
                </button>
              </div>
              {caveMode.value === 'plan' ? (
                <>
                  <div class="legend">
                    {COLORS.map((c) => (
                      <span key={c}>
                        <Dot color={c} />
                        {COLOR_LABELS[c]}
                      </span>
                    ))}
                  </div>
                  {plan.map((p) => (
                    <div class="place" key={p.place}>
                      <h3>
                        {p.place} <span>{p.n} bouteille{p.n > 1 ? 's' : ''}</span>
                      </h3>
                      {p.shelves.map((s) => (
                        <button
                          key={s.shelf}
                          class="shelf"
                          onClick={() => setShelf({ place: p.place, shelf: s.shelf, wines: s.items.map((x) => x.wine) })}
                          aria-label={`${p.place}, ${s.shelf ? `clayette ${s.shelf}` : 'sans clayette'} : ${s.n} bouteilles`}
                        >
                          <span class="lbl">{s.shelf || '—'}</span>
                          <span class="bots">
                            {s.items.flatMap(({ wine, n }) =>
                              Array.from({ length: Math.min(n, 48) }, (_, k) => <i key={`${wine.id}${k}`} style={`--wc:var(--w-${wine.color})`} />),
                            )}
                          </span>
                          <span class="c">{s.n}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                  {!plan.length && <p class="hint" style="padding-top:16px">Aucun vin ne correspond.</p>}
                  <p class="hint" style="padding-top:12px">
                    Le plan se dessine d’après les lieux et clayettes que tu saisis : rien à configurer.
                  </p>
                </>
              ) : (
                COLORS.filter((c) => list.some((w) => w.color === c)).map((c) => {
                  const ws = list.filter((w) => w.color === c).sort((a, b) => (a.region || 'zz').localeCompare(b.region || 'zz', 'fr') || wineName(a).localeCompare(wineName(b), 'fr'));
                  return (
                    <div key={c}>
                      <div class="sec-h">
                        <h2>{COLOR_LABELS[c]}</h2>
                        <span>{ws.reduce((a, w) => a + bottles(w), 0)}</span>
                      </div>
                      {ws.map((w) => row(w))}
                    </div>
                  );
                })
              )}
              {imported && (
                <p class="hint" style="padding-top:16px">
                  <button class="linkbtn" onClick={props.onImport}>
                    Réimporter un export CellarTracker
                  </button>
                </p>
              )}
            </>
          )}
        </>
      );
    } else if (view.value === 'bus') {
      const all = tastings(data).filter((x) => matchWine(x.wine, q) && passFilter(x.wine, f, f.place ? (x.exit.from ?? null) : undefined));
      body = (
        <>
          <div class="sec-h">
            <h2>Dégustés</h2>
            <span>
              {all.length} note{all.length > 1 ? 's' : ''}
            </span>
          </div>
          {all.map(({ wine, exit }) => (
            <button key={exit.id} class="tast" onClick={() => onOpen(wine.id)} aria-current={wine.id === openId ? 'true' : undefined}>
              <Thumb photo={exit.photo ?? wine.label} color={wine.color} />
              <span>
                <b>
                  {wineName(wine)} {vintageLabel(wine)}
                </b>
                <br />
                <span class="meta">{shortDate(exit.date)}</span> {exit.rating != null && <Stars n={exit.rating} />}
                {exit.comment && <p>{exit.comment}</p>}
                <span class="pl">
                  <span class="wtag plain">{exit.reason === 'bue' ? 'De ta cave' : exit.where || 'Ailleurs'}</span>
                  {(exit.recipe || exit.dish) && <span>avec {(exit.recipe && recipeTitle(exit.recipe)) || exit.dish}</span>}
                </span>
              </span>
            </button>
          ))}
          {!all.length && <p class="hint" style="padding-top:8px">{q ? 'Aucune dégustation ne correspond.' : 'Pas encore de dégustation notée.'}</p>}
          <p class="hint" style="padding-top:12px">
            « + Vin » puis « Dégusté ailleurs » pour noter une bouteille bue au restaurant ou chez des amis, sans la mettre en cave.
          </p>
        </>
      );
    } else {
      const ws = data.wishes.filter((w) => matchWine({ ...w, region: '', grapes: '', vintage: null }, q));
      body = (
        <>
          <div class="sec-h">
            <h2>Envies</h2>
            <span>
              {ws.length} vin{ws.length > 1 ? 's' : ''} à acheter
            </span>
          </div>
          {ws.map((w) => (
            <div class="wrow" key={w.id}>
              <span class="bottle">
                <BottleArt color={w.color ?? 'rouge'} />
              </span>
              <span class="t">
                <b>{wineName(w)}</b>
                {w.appellation && <span class="meta">{w.appellation}</span>}
                {w.why && <span class="meta">{w.why}</span>}
              </span>
              <span class="side" style="grid-auto-flow:column;align-items:center">
                <button class="btn small" onClick={() => props.onBought(w)}>
                  Acheté
                </button>
                <button
                  class="iconbtn"
                  aria-label={`Retirer ${wineName(w)} des envies`}
                  onClick={() => {
                    const before = data;
                    mutateCave((d) => removeWish(d, w.id));
                    showSnack('Retiré des envies', () => mutateCave(() => before));
                  }}
                >
                  <Icon name="trash" />
                </button>
              </span>
            </div>
          ))}
          {!ws.length && <p class="hint" style="padding-top:8px">{q ? 'Aucune envie ne correspond.' : 'Pas d’envie pour l’instant.'}</p>}
          <p class="hint" style="padding-top:12px">
            « Acheté » range le vin dans la cave : tu choisis la quantité, le lieu et la clayette. « + Vin » puis « Une envie » pour en ajouter.
          </p>
        </>
      );
    }
  }

  return (
    <div class="rec-home">
      <Topbar title="Cave" engine={e} photos />
      <div class="rec-scroll">
        <div class="seg" role="group" aria-label="Vue">
          {VIEWS.map(([k, n]) => (
            <button key={k} aria-pressed={view.value === k} onClick={() => (view.value = k)}>
              {n}
            </button>
          ))}
        </div>
        <div class="searchrow">
          <label class="search">
            <Icon name="search" />
            <input
              type="search"
              value={query.value}
              placeholder="Domaine, appellation, cépage…"
              aria-label="Chercher un vin"
              enterKeyHint="search"
              onInput={(ev) => (query.value = ev.currentTarget.value)}
            />
            {query.value && (
              <button class="iconbtn" aria-label="Effacer la recherche" onClick={() => (query.value = '')}>
                <Icon name="close" />
              </button>
            )}
          </label>
          <button class="filterbtn" aria-label={filterActive(filter.value) ? 'Filtres (actifs)' : 'Filtres'} onClick={() => setFilterOpen(true)}>
            <Icon name="filter" />
            {filterActive(filter.value) && <span class="dot" />}
          </button>
        </div>
        {filterActive(filter.value) && <ActiveFilters />}
        {body}
      </div>
      {data && (
        <button class="fab" onClick={props.onAdd}>
          <Icon name="plus" />
          Vin
        </button>
      )}
      {filterOpen && data && <FilterSheet data={data} onClose={() => setFilterOpen(false)} />}
      {shelf && (
        <Sheet onClose={() => setShelf(null)} label={`${shelf.place} · ${shelf.shelf}`}>
          <h2>
            {shelf.shelf ? `${shelf.place} · ${shelf.shelf}` : shelf.place}
          </h2>
          <div style="margin:0 -18px">
            {shelf.wines.map((w) => (
              <WineRow
                key={w.id}
                w={w}
                onOpen={() => {
                  setShelf(null);
                  void sheetsSettled().then(() => onOpen(w.id));
                }}
              />
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** Les filtres en cours, sous la recherche : un appui retire le filtre. */
function ActiveFilters() {
  const f = filter.value;
  const chips: [string, Partial<WineFilter>][] = [];
  if (f.color) chips.push([COLOR_LABELS[f.color], { color: null }]);
  if (f.place) chips.push([f.place, { place: '' }]);
  if (f.region) chips.push([f.region, { region: '' }]);
  if (f.appellation) chips.push([f.appellation, { appellation: '' }]);
  return (
    <div class="pills" role="group" aria-label="Filtres actifs">
      {chips.map(([label, reset]) => (
        <button key={label} class="pill-b fchip" aria-label={`Retirer le filtre ${label}`} onClick={() => (filter.value = { ...filter.value, ...reset })}>
          {label}
          <Icon name="close" />
        </button>
      ))}
      {chips.length > 1 && (
        <button class="pill-b" onClick={() => (filter.value = NO_FILTER)}>
          Tout effacer
        </button>
      )}
    </div>
  );
}

function FilterSheet({ data, onClose }: { data: CaveFile; onClose: () => void }) {
  const f = filter.value;
  const set = (patch: Partial<WineFilter>) => (filter.value = { ...filter.value, ...patch });
  // Les choix tiennent compte des autres filtres : une région ne propose que ses appellations.
  const base = view.value === 'bus' ? data.wines : inCellar(data);
  const pool = (except: keyof WineFilter) => base.filter((w) => passFilter(w, { ...f, place: '', [except]: except === 'color' ? null : '' }));
  const regions = filterChoices(pool('region')).regions;
  const apps = filterChoices(pool('appellation')).appellations;
  const places = filterChoices(inCellar(data).filter((w) => passFilter(w, { ...f, place: '' }))).places;
  const n = inCellar(data).filter((w) => passFilter(w, f)).reduce((a, w) => a + bottles(w), 0);
  return (
    <Sheet onClose={onClose} label="Filtres">
      <div class="sheet-head">
        <h2>Filtres</h2>
        <button class="btn ghost small" onClick={() => (filter.value = NO_FILTER)} disabled={!filterActive(f)}>
          Tout effacer
        </button>
      </div>
      <div class="field">
        <label>Couleur</label>
        <div class="choice" role="group" aria-label="Couleur">
          {COLORS.map((c) => (
            <button key={c} aria-pressed={f.color === c} onClick={() => set({ color: f.color === c ? null : c })}>
              <Dot color={c} size={10} />
              {COLOR_LABELS[c]}
            </button>
          ))}
        </div>
      </div>
      {places.length > 0 && (
        <div class="field">
          <label>Cave</label>
          <div class="choice" role="group" aria-label="Cave">
            {places.map(([p, k]) => (
              <button key={p} aria-pressed={f.place.toLowerCase() === p.toLowerCase()} onClick={() => set({ place: f.place.toLowerCase() === p.toLowerCase() ? '' : p })}>
                {p} <span class="meta">{k}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div class="fgrid2">
        <div class="field">
          <label for="f-reg">Région</label>
          <select id="f-reg" class="input" value={f.region} onChange={(e) => set({ region: e.currentTarget.value })}>
            <option value="">Toutes</option>
            {regions.map(([r, k]) => (
              <option key={r} value={r}>
                {r} ({k})
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="f-app">Appellation</label>
          <select id="f-app" class="input" value={f.appellation} onChange={(e) => set({ appellation: e.currentTarget.value })}>
            <option value="">Toutes</option>
            {apps.map(([a, k]) => (
              <option key={a} value={a}>
                {a} ({k})
              </option>
            ))}
          </select>
        </div>
      </div>
      <button class="btn primary block" onClick={onClose}>
        {view.value === 'bus' ? 'Voir les dégustations' : `Voir ${n} bouteille${n > 1 ? 's' : ''}`}
      </button>
    </Sheet>
  );
}
