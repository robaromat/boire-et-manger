import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { Topbar } from '../../components/Topbar';
import { allTags, avgRating, lastMade, matchRecipe, notMadeSince } from '../../recettes/ops';
import { MONTHS, currentSeason } from '../../recettes/season';
import { CATEGORIES, type Recipe, type RecipesFile } from '../../recettes/types';
import { recipesEngine } from '../../sync/store';
import { RecipeCard, RecipeRow, seasonsOf } from './bits';

// Accueil du carnet : recherche (titre, tags, ingrédients), filtres, catégories, et trois rubriques sans recherche :
// de saison, pas faites depuis longtemps, à tester.

interface Filters {
  minNote: number;
  tag: string | null;
  todo: boolean;
  old: boolean;
}
const NO_FILTERS: Filters = { minNote: 0, tag: null, todo: false, old: false };

// Gardés en mémoire pendant la session (ouvrir une fiche puis revenir ne perd pas la recherche).
const query = signal('');
const cat = signal<string>('saison');
const filters = signal<Filters>(NO_FILTERS);
const sort = signal<'recent' | 'note' | 'old' | 'az'>('recent');

const active = (f: Filters) => !!(f.minNote || f.tag || f.todo || f.old);

function pass(r: Recipe, f: Filters): boolean {
  if (f.minNote && (avgRating(r) ?? 0) < f.minNote) return false;
  if (f.tag && !r.tags.includes(f.tag)) return false;
  if (f.todo && r.journal.length) return false;
  if (f.old && !notMadeSince(r, 6)) return false;
  return true;
}

function sorted(list: Recipe[], how: typeof sort.value): Recipe[] {
  const out = [...list];
  if (how === 'note') out.sort((a, b) => (avgRating(b) ?? -1) - (avgRating(a) ?? -1));
  else if (how === 'old') out.sort((a, b) => (lastMade(a) ?? '9999').localeCompare(lastMade(b) ?? '9999'));
  else if (how === 'az') out.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  else out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

export function Home({ data, openId, onOpen, onAdd }: { data: RecipesFile | null; openId?: string; onOpen: (id: string) => void; onAdd: () => void }) {
  const [filterOpen, setFilterOpen] = useState(false);
  const e = recipesEngine.value;
  const q = query.value.trim();
  const f = filters.value;
  const season = currentSeason();
  const month = MONTHS[new Date().getMonth()];

  const row = (r: Recipe, hit?: string) => <RecipeRow key={r.id} r={r} hit={hit} current={r.id === openId} onOpen={() => onOpen(r.id)} />;

  let body;
  if (!data) {
    body = e?.error.value ? (
      <div class="empty" role="alert">
        <b>Impossible de charger le carnet</b>
        {e.error.value}
      </div>
    ) : (
      <p class="empty">Chargement du carnet…</p>
    );
  } else if (!data.recipes.length) {
    body = (
      <div class="empty">
        <b>Ton carnet est vide</b>
        Ajoute une recette en photo, par lien, ou à la main.
        <div>
          <button class="btn primary" onClick={onAdd}>
            <Icon name="plus" />
            Première recette
          </button>
        </div>
      </div>
    );
  } else {
    const list = data.recipes.filter((r) => pass(r, f));
    if (q) {
      const res = list.map((r) => [r, matchRecipe(r, q)] as const).filter(([, m]) => m.ok);
      body = (
        <>
          <div class="sec-h">
            <h2>« {q} »</h2>
            <span>
              {res.length} recette{res.length > 1 ? 's' : ''}
            </span>
          </div>
          {res.length ? res.map(([r, m]) => row(r, m.ing)) : <p class="hint">Rien dans ton carnet. Essaie un autre ingrédient.</p>}
        </>
      );
    } else if (cat.value === 'saison' && !active(f)) {
      const sea = list.filter((r) => seasonsOf(r).includes(season));
      const old = list
        .filter((r) => notMadeSince(r, 6))
        .sort((a, b) => (lastMade(a) ?? '').localeCompare(lastMade(b) ?? ''))
        .slice(0, 5);
      const todo = sorted(
        list.filter((r) => !r.journal.length),
        'recent',
      );
      body = (
        <>
          <div class="sec-h">
            <h2>De saison en {month}</h2>
            <span>
              {sea.length} recette{sea.length > 1 ? 's' : ''}
            </span>
          </div>
          {sea.length ? (
            <div class="hscroll">
              {sea.map((r) => (
                <RecipeCard key={r.id} r={r} onOpen={() => onOpen(r.id)} />
              ))}
            </div>
          ) : (
            <p class="hint">Aucune recette de saison pour l’instant : la saison se calcule d’après les fruits et légumes.</p>
          )}
          {old.length > 0 && (
            <>
              <div class="sec-h">
                <h2>Pas faites depuis longtemps</h2>
              </div>
              {old.map((r) => row(r))}
            </>
          )}
          {todo.length > 0 && (
            <>
              <div class="sec-h">
                <h2>À tester</h2>
                <span>{todo.length}</span>
              </div>
              {todo.map((r) => row(r))}
            </>
          )}
          {!old.length && !todo.length && (
            <>
              <div class="sec-h">
                <h2>Tout le carnet</h2>
                <span>{list.length}</span>
              </div>
              {sorted(list, 'recent').map((r) => row(r))}
            </>
          )}
        </>
      );
    } else {
      let shown = list;
      if (cat.value === 'saison') shown = shown.filter((r) => seasonsOf(r).includes(season));
      else if (cat.value !== 'tout') shown = shown.filter((r) => r.category === cat.value);
      const title = cat.value === 'tout' ? 'Tout le carnet' : cat.value === 'saison' ? 'De saison' : cat.value;
      body = (
        <>
          <div class="sec-h">
            <h2>
              {title} <span>{shown.length}</span>
            </h2>
            <select aria-label="Trier" value={sort.value} onChange={(ev) => (sort.value = ev.currentTarget.value as typeof sort.value)}>
              <option value="recent">Récentes</option>
              <option value="note">Mieux notées</option>
              <option value="old">Pas faites depuis longtemps</option>
              <option value="az">A → Z</option>
            </select>
          </div>
          {shown.length ? sorted(shown, sort.value).map((r) => row(r)) : <p class="hint">Aucune recette ici pour l’instant.</p>}
        </>
      );
    }
  }

  const pills: [string, string][] = [['saison', 'De saison'], ['tout', 'Tout'], ...CATEGORIES.map((c) => [c, c] as [string, string])];

  return (
    <div class="rec-home">
      <Topbar title="Recettes" engine={e} photos />
      <div class="rec-scroll">
        <div class="searchrow">
          <label class="search">
            <Icon name="search" />
            <input
              type="search"
              value={query.value}
              placeholder="Recette ou ingrédient (ex. poireau)"
              aria-label="Chercher une recette ou un ingrédient"
              enterKeyHint="search"
              onInput={(ev) => (query.value = ev.currentTarget.value)}
            />
            {query.value && (
              <button class="iconbtn" aria-label="Effacer la recherche" onClick={() => (query.value = '')}>
                <Icon name="close" />
              </button>
            )}
          </label>
          <button class="filterbtn" aria-label={active(f) ? 'Filtres (actifs)' : 'Filtres'} onClick={() => setFilterOpen(true)}>
            <Icon name="filter" />
            {active(f) && <span class="dot" />}
          </button>
        </div>
        {!q && data && data.recipes.length > 0 && (
          <div class="pills" role="group" aria-label="Catégories">
            {pills.map(([k, n]) => (
              <button key={k} class="pill-b" aria-pressed={cat.value === k} onClick={() => (cat.value = k)}>
                {n}
              </button>
            ))}
          </div>
        )}
        {body}
      </div>
      {data && (
        <button class="fab" onClick={onAdd}>
          <Icon name="plus" />
          Recette
        </button>
      )}
      {filterOpen && data && <FilterSheet tags={allTags(data)} onClose={() => setFilterOpen(false)} />}
    </div>
  );
}

function FilterSheet({ tags, onClose }: { tags: string[]; onClose: () => void }) {
  const f = filters.value;
  const set = (patch: Partial<Filters>) => (filters.value = { ...filters.value, ...patch });
  return (
    <Sheet onClose={onClose} label="Filtres">
      <div class="sheet-head">
        <h2>Filtres</h2>
        <button class="btn ghost small" onClick={() => (filters.value = NO_FILTERS)} disabled={!active(f)}>
          Tout effacer
        </button>
      </div>
      <div>
        <h3>Note</h3>
        <div class="choice">
          {(
            [
              [0, 'Toutes'],
              [4, '★★★★ et plus'],
              [5, '★★★★★'],
            ] as const
          ).map(([n, l]) => (
            <button key={n} aria-pressed={f.minNote === n} onClick={() => set({ minNote: n })}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {tags.length > 0 && (
        <div>
          <h3>Tags</h3>
          <div class="choice">
            {tags.map((t) => (
              <button key={t} aria-pressed={f.tag === t} onClick={() => set({ tag: f.tag === t ? null : t })}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <h3>Journal</h3>
        <div class="choice">
          <button aria-pressed={f.todo} onClick={() => set({ todo: !f.todo, old: false })}>
            Jamais testées
          </button>
          <button aria-pressed={f.old} onClick={() => set({ old: !f.old, todo: false })}>
            Pas faites depuis 6 mois
          </button>
        </div>
      </div>
      <button class="btn primary block" onClick={onClose}>
        Voir les recettes
      </button>
    </Sheet>
  );
}
