import { Icon } from '../../components/Icon';
import { usePhoto, type PhotoSize } from '../../photos/photos';
import { avgRating, lastMade } from '../../recettes/ops';
import { recipeSeasons } from '../../recettes/season';
import { SEASON_LABELS, type Recipe, type Season } from '../../recettes/types';

// Petits morceaux communs aux écrans du carnet de recettes.

export const fmtNote = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

export function Stars({ n }: { n: number }) {
  const r = Math.round(n);
  return (
    <span class="stars" aria-label={`${fmtNote(n)} sur 5`}>
      {'★'.repeat(r)}
      <span class="off">{'★'.repeat(5 - r)}</span>
    </span>
  );
}

export function SeasonChips({ seasons }: { seasons: Season[] }) {
  if (!seasons.length || seasons.length === 4)
    return (
      <span class="season">
        <i class="all">Toute l’année</i>
      </span>
    );
  return (
    <span class="season">
      {seasons.map((s) => (
        <i key={s} style={`--sc:var(--s-${s})`}>
          {SEASON_LABELS[s]}
        </i>
      ))}
    </span>
  );
}

/** Photo du plat (ou de la source), ou un livre dessiné. */
export function Cover({ photo, size = 'thumb', alt = '' }: { photo?: string | null; size?: PhotoSize; alt?: string }) {
  const url = usePhoto(photo, size);
  return <div class="cover">{url ? <img src={url} alt={alt} loading="lazy" /> : <Icon name="book" />}</div>;
}

/** « 12 nov. 2026 » à partir de « 2026-11-12 ». */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Ligne de recette dans une liste, avec l'ingrédient trouvé par la recherche. */
export function RecipeRow({ r, hit, current, onOpen }: { r: Recipe; hit?: string; current?: boolean; onOpen: () => void }) {
  const avg = avgRating(r);
  const last = lastMade(r);
  return (
    <button class="rrow" onClick={onOpen} aria-current={current ? 'true' : undefined}>
      <Cover photo={r.cover} />
      <span class="t">
        <b>{r.title}</b>
        <span class="meta">
          {r.category}
          {hit && (
            <>
              {' · contient '}
              <mark>{hit}</mark>
            </>
          )}
        </span>
        <span>
          {r.journal.length ? (
            <>
              {avg != null && <Stars n={avg} />}{' '}
              <span class="meta">
                faite {r.journal.length}×{last ? ` · ${shortDate(last)}` : ''}
              </span>
            </>
          ) : (
            <span class="rtag todo">à tester</span>
          )}
        </span>
      </span>
    </button>
  );
}

export function RecipeCard({ r, onOpen }: { r: Recipe; onOpen: () => void }) {
  const avg = avgRating(r);
  return (
    <button class="rcard" onClick={onOpen}>
      <Cover photo={r.cover} />
      <b>{r.title}</b>
      <span class="meta">
        {r.category} · {avg != null ? <Stars n={avg} /> : r.journal.length ? `faite ${r.journal.length}×` : 'à tester'}
      </span>
    </button>
  );
}

export const seasonsOf = (r: Recipe) => recipeSeasons(r).seasons;
