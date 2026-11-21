import { signal } from '@preact/signals';
import { Icon } from '../../components/Icon';
import { bottles, inCellar } from '../../cave/ops';
import { byColor, exitsPerYear, stockPerYear, top, windowBuckets, type Bar, type StockYear, type TopKey } from '../../cave/reports';
import { COLOR_LABELS, type CaveFile } from '../../cave/types';
import { YEAR } from './bits';

// Rapports de la cave : fenêtres de dégustation, couleurs, « ton top » (cépages, régions, appellations, pays, caves),
// bouteilles sorties par an, évolution de la cave (stock en fin d'année, entrées et sorties). Barres en HTML : chaque valeur est écrite au bout de sa barre, et au survol.

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

const bt = (n: number) => `${n} bouteille${n > 1 ? 's' : ''}`;

function Evolution({ data, year }: { data: StockYear[]; year: number }) {
  const max = Math.max(1, ...data.map((d) => d.end));
  const step = data.length > 12 ? 2 : 1;
  const peak = data.reduce((a, d) => (d.end > a.end ? d : a), data[0]!);
  return (
    <>
      <p class="note rep-lead">
        En cave à la fin de chaque année{data.length > 1 ? ` ; au plus haut : ${bt(peak.end)} fin ${peak.year}` : ''}.
      </p>
      <div class="vbars" role="list">
        {data.map((d, k) => (
          <div
            class="vbar"
            role="listitem"
            key={d.year}
            title={`${d.year === year ? 'Aujourd’hui' : `Fin ${d.year}`} : ${bt(d.end)} (+${d.added} entrée${d.added > 1 ? 's' : ''}, −${d.removed} sortie${d.removed > 1 ? 's' : ''})`}
          >
            <span class="vbar-n">{d.end || ''}</span>
            <span class="vbar-col">{d.end > 0 && <i style={`height:${(d.end / max) * 100}%`} />}</span>
            <span class="vbar-y">{k % step === 0 || k === data.length - 1 ? `’${String(d.year).slice(2)}` : ''}</span>
          </div>
        ))}
      </div>
      <table class="rep-table">
        <thead>
          <tr>
            <th scope="col">Année</th>
            <th scope="col">Entrées</th>
            <th scope="col">Sorties</th>
            <th scope="col">En cave</th>
          </tr>
        </thead>
        <tbody>
          {[...data].reverse().map((d) => (
            <tr key={d.year}>
              <th scope="row">{d.year}</th>
              <td class={d.added ? 'plus' : ''}>{d.added ? `+${d.added}` : '·'}</td>
              <td class={d.removed ? 'minus' : ''}>{d.removed ? `−${d.removed}` : '·'}</td>
              <td>{d.end}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="note">
        Entrées : achats et cadeaux reçus. Sorties : bues, offertes, bouchonnées… Le stock est recalculé à rebours depuis aujourd’hui : si des achats
        anciens manquent, seules les années d’avant sont faussées.
      </p>
    </>
  );
}

export function Reports({ data, onBack }: { data: CaveFile; onBack: () => void }) {
  const y = YEAR();
  const wines = inCellar(data);
  const total = wines.reduce((a, w) => a + bottles(w), 0);
  const years = exitsPerYear(data.wines, undefined, y);
  const drunk = years.reduce((a, d) => a + d.drunk, 0);
  const evolution = stockPerYear(data.wines, y);
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
          {evolution.length > 0 ? (
            <Evolution data={evolution} year={y} />
          ) : (
            <p class="note">
              Le nombre de bouteilles au fil des années demande les dates d’entrée en cave. Elles sont notées à chaque bouteille ajoutée ; pour le passé,
              importe l’export « Purchases » de CellarTracker.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
