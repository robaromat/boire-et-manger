import { Icon, type IconName } from '../../components/Icon';
import { usePhoto } from '../../photos/photos';
import { bottles, slotLabel, vintageLabel, windowLabel, windowState, wineName } from '../../cave/ops';
import type { Reason, Wine, WineColor } from '../../cave/types';
import { recipesEngine } from '../../sync/store';

// Petits morceaux communs aux écrans de la cave.

export const YEAR = () => new Date().getFullYear();

/** Bouteille dessinée, de la couleur du vin. */
export function BottleArt({ color }: { color: WineColor }) {
  return (
    <svg viewBox="0 0 34 54" width="34" height="54" aria-hidden="true">
      <path d="M14 2h6v10c0 2 6 4 6 11v27a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V23c0-7 6-9 6-11z" fill={`var(--w-${color})`} stroke="rgba(0,0,0,.18)" />
      <rect x="10" y="28" width="14" height="12" rx="1.5" fill="var(--label-bg)" opacity=".9" />
    </svg>
  );
}

export const Dot = ({ color, size }: { color: WineColor; size?: number }) => (
  <i class="wdot" style={`--wc:var(--w-${color})${size ? `;width:${size}px;height:${size}px` : ''}`} aria-hidden="true" />
);

/** Où sont les bouteilles : « Cave · B2, Armoire cuisine · 1 ». */
export const whereText = (w: Wine) =>
  w.stock
    .filter((s) => s.n)
    .map(slotLabel)
    .join(', ');

/** Vignette d'un vin dans une liste : la photo de l'étiquette (bordure + pastille de la couleur du vin),
 *  sinon la bouteille dessinée de sa couleur. */
export function WineArt({ w }: { w: Wine }) {
  const url = usePhoto(w.label, 'thumb');
  if (!url)
    return (
      <span class="bottle">
        <BottleArt color={w.color} />
      </span>
    );
  return (
    <span class="wphoto" style={`--wc:var(--w-${w.color})`}>
      <img src={url} alt="" loading="lazy" />
      <Dot color={w.color} />
    </span>
  );
}

/** Ligne de vin dans une liste. */
export function WineRow({ w, current, onOpen, sub }: { w: Wine; current?: boolean; onOpen: () => void; sub?: string }) {
  const y = YEAR();
  const st = windowState(w, y);
  const n = bottles(w);
  return (
    <button class="wrow" onClick={onOpen} aria-current={current ? 'true' : undefined}>
      <WineArt w={w} />
      <span class="t">
        <b>{wineName(w)}</b>
        <span class="meta">
          {vintageLabel(w)}
          {w.appellation ? ` · ${w.appellation}` : ''}
          {w.size ? ` · ${w.size}` : ''}
          {w.labels?.includes('biodynamie') ? ' · biodynamie' : w.labels?.includes('bio') ? ' · bio' : ''}
          {w.labels?.includes('sans-sulfites') ? ' · sans sulfites' : ''}
        </span>
        <span class="meta">{sub ?? (whereText(w) || 'plus en cave')}</span>
      </span>
      <span class="side">
        {n > 0 && <span class="n">×{n}</span>}
        <span class={`wtag ${st === 'late' ? 'late' : w.estimated.includes('window') ? 'est' : 'plain'}`}>{windowLabel(w, y)}</span>
      </span>
    </button>
  );
}

export const REASON_ICONS: Record<Reason, IconName> = {
  bue: 'glass',
  ailleurs: 'pin',
  exterieur: 'pin',
  offerte: 'gift',
  cuisine: 'book',
  defaut: 'alert',
  cassee: 'broken',
  disparue: 'help',
  vendue: 'swap',
};

/** Photo (étiquette, dégustation) ou pastille de la couleur du vin. */
export function Thumb({ photo, color }: { photo?: string; color: WineColor }) {
  const url = usePhoto(photo, 'thumb');
  return <span class="wthumb" style={`--wc:var(--w-${color})`}>{url ? <img src={url} alt="" loading="lazy" /> : <Icon name="glass" />}</span>;
}

/** Recettes du carnet, pour les accords et « avec quel plat ». */
export function recipeList(): { id: string; title: string; category: string }[] {
  return (recipesEngine.value?.data.value?.recipes ?? []).map((r) => ({ id: r.id, title: r.title, category: r.category }));
}
export const recipeTitle = (id: string) => recipesEngine.value?.data.value?.recipes.find((r) => r.id === id)?.title ?? null;
