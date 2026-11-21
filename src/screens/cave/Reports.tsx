import { signal } from '@preact/signals';
import { Icon } from '../../components/Icon';
import { bottles, inCellar } from '../../cave/ops';
import { byColor, exitsPerYear, top, windowBuckets, type Bar, type TopKey } from '../../cave/reports';
import { COLOR_LABELS, type CaveFile } from '../../cave/types';
import { YEAR } from './bits';

// Rapports de la cave : fenêtres de dégustation, couleurs, « ton top » (cépages, régions, appellations, pays, caves),
// bouteilles sorties par an. Barres en HTML : chaque valeur est écrite au bout de sa barre, et au survol.

const TOPS: [TopKey, string][] = [
  ['region', 'Régions'],
  ['appellation', 'Appellations'],
  ['grapes', 'Cépages'],
  ['country', 'Pays'],
  ['place', 'Caves'],
];
const topKey = signal<TopKey>('region');

function HBars({ bars, unit = 'bouteille', color }: { bars: Bar[]; unit?: string; color?: (b: Bar, i: number) => string }) {
  const max = Math.max(1, ...bars.map((b) => b.n));
  const plural = (n: number) => `${n} ${unit}${n > 1 ? 's' : ''}`;
  return (
    <div class="hbars" role="list">
      {bars.map((b, i) => (
        <div class="hbar" role="listitem" key={b.label} title={`${b.label} : ${plural(b.n)}`}>
          <span class="hbar-l">{b.label}</span>
          <span class="hbar-track">
            {b.n > 0 && <i style={`width:${(b.n / max) * 100}%;${color ? `--bc:${color(b, i)}` : ''}`} />}
            <b>{b.n}</b>
          </span>
        </div>
      ))}
    </div>
  );
}

function Years({ data }: { data: { year: number; drunk: number; other: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.drunk + d.other));
  const step = data.length > 12 ? 2 : 1;
  return (
    <>
      <div class="legend rep-legend">
        <span>
          <i class="sw" style="--bc:var(--accent)" />
          Bues
        </span>
        <span>
          <i class="sw" style="--bc:color-mix(in srgb, var(--accent) 35%, var(--card))" />
          Autres sorties (offertes, bouchonnées…)
        </span>
      </div>
      <div class="vbars" role="list">
        {data.map((d, k) => (
          <div class="vbar" role="listitem" key={d.year} title={`${d.year} : ${d.drunk} bue${d.drunk > 1 ? 's' : ''}, ${d.other} autre${d.other > 1 ? 's' : ''}`}>
            <span class="vbar-n">{d.drunk + d.other || ''}</span>
            <span class="vbar-col">
              {d.other > 0 && <i class="o" style={`height:${(d.other / max) * 100}%`} />}
              {d.drunk > 0 && <i style={`height:${(d.drunk / max) * 100}%`} />}
            </span>
            <span class="vbar-y">{k % step === 0 || k === data.length - 1 ? `’${String(d.year).slice(2)}` : ''}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function Reports({ data, onBack }: { data: CaveFile; onBack: () => void }) {
  const y = YEAR();
  const wines = inCellar(data);
  const total = wines.reduce((a, w) => a + bottles(w), 0);
  const years = exitsPerYear(data.wines, undefined, y);
  const drunk = years.reduce((a, d) => a + d.drunk, 0);
  return (
    <div class="rpage-scroll">
      <div class="fiche rep">
        <div class="rep-head">
          <button class="iconbtn" onClick={onBack} aria-label="Retour à la cave">
            <Icon name="back" />
          </button>
          <h1>Rapports</h1>
        </div>
        <div class="rep-tiles">
          <div>
            <b>{total}</b>
            <span>bouteilles</span>
          </div>
          <div>
            <b>{wines.length}</b>
            <span>vins</span>
          </div>
          <div>
            <b>{drunk}</b>
            <span>bues en tout</span>
          </div>
        </div>

        <section class="block">
          <h2>Fenêtres de dégustation</h2>
          <HBars bars={windowBuckets(wines, y)} color={(_, i) => (i === 0 ? 'var(--danger)' : i === 6 ? 'var(--line)' : 'var(--accent)')} />
          <p class="note">Selon l’année de fin de la fenêtre, comme « À boire ».</p>
        </section>

        <section class="block">
          <h2>Couleurs</h2>
          <HBars bars={byColor(wines).map((c) => ({ label: COLOR_LABELS[c.color], n: c.n, color: c.color }))} color={(b) => `var(--w-${(b as Bar & { color: string }).color})`} />
        </section>

        <section class="block">
          <h2>
            Ton top
            <select class="rep-select" aria-label="Classer par" value={topKey.value} onChange={(e) => (topKey.value = e.currentTarget.value as TopKey)}>
              {TOPS.map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </h2>
          <HBars bars={top(wines, topKey.value)} />
        </section>

        {years.length > 0 && (
          <section class="block">
            <h2>Bouteilles sorties par an</h2>
            <Years data={years} />
          </section>
        )}

        <section class="block">
          <h2>Évolution de la cave</h2>
          <p class="note">
            Le nombre de bouteilles au fil des années demande les dates d’achat, qui ne sont pas dans les exports importés. Avec l’export
            « Purchases » de CellarTracker, la courbe pourra être reconstruite.
          </p>
        </section>
      </div>
    </div>
  );
}
