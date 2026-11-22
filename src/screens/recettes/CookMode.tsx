import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { formatQty } from '../../model/qty';
import { scaledQty, stepParts } from '../../recettes/ops';
import type { Recipe } from '../../recettes/types';

// Mode cuisine : écran sombre, gros texte, qui reste allumé (Wake Lock). Ingrédients à cocher, étapes à toucher,
// quantités recalculées jusque dans le texte. En sortant, « Je l'ai fait ? ».

type Lock = { release: () => Promise<void> };

function useWakeLock(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let lock: Lock | null = null;
    let alive = true;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Lock & { addEventListener: (e: string, f: () => void) => void }> } };
    const take = async () => {
      if (!nav.wakeLock || document.visibilityState !== 'visible') return;
      try {
        const l = await nav.wakeLock.request('screen');
        if (!alive) return void l.release();
        lock = l;
        setOn(true);
        l.addEventListener('release', () => alive && setOn(false));
      } catch {
        setOn(false);
      }
    };
    // Le verrou saute quand on quitte l'app : on le reprend au retour.
    const onVis = () => document.visibilityState === 'visible' && void take();
    void take();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, []);
  return on;
}

export function CookMode({ r, portions: initial, onQuit, onClose }: { r: Recipe; portions: number; onQuit: () => void; onClose: () => void }) {
  const awake = useWakeLock();
  const [tab, setTab] = useState<'ings' | 'steps'>(r.ingredients.length ? 'ings' : 'steps');
  const [portions, setPortions] = useState(initial);
  const [got, setGot] = useState<Set<number>>(new Set());
  const [cur, setCur] = useState(0);
  const n = r.steps.length;

  const toggle = (k: number) => {
    const next = new Set(got);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setGot(next);
  };

  return (
    <Sheet onClose={onClose} label="Mode cuisine" full cls="cook">
      <div class="cook-top">
        <div>
          <b>{r.title}</b>
          <div class={`awake${awake ? '' : ' off'}`}>{awake ? 'L’écran reste allumé' : 'Écran : mise en veille normale'}</div>
        </div>
        <button class="btn ghost small" onClick={onQuit}>
          Quitter
        </button>
      </div>
      <div class="cook-body">
        <div class="cook-seg" role="group" aria-label="Vue">
          <button aria-pressed={tab === 'ings'} onClick={() => setTab('ings')}>
            Ingrédients
          </button>
          <button aria-pressed={tab === 'steps'} onClick={() => setTab('steps')} disabled={!n}>
            Étapes {n ? `${Math.min(cur + 1, n)}/${n}` : ''}
          </button>
        </div>
        {r.adjustments.trim() && (
          <div class="cook-adj">
            <small>Mes ajustements</small>
            {r.adjustments}
          </div>
        )}
        {tab === 'ings' ? (
          <>
            {r.servings && (
              <div class="cook-portions">
                <span>Portions</span>
                <span class="stepper">
                  <button aria-label="Moins de portions" onClick={() => setPortions(Math.max(1, portions - 1))}>
                    −
                  </button>
                  <b aria-live="polite">{portions}</b>
                  <button aria-label="Plus de portions" onClick={() => setPortions(Math.min(60, portions + 1))}>
                    +
                  </button>
                </span>
              </div>
            )}
            <div>
              {/* Comme aux courses : un ingrédient coché descend en bas de la liste (dans l'ordre de la recette). */}
              {r.ingredients
                .map((i, k) => [i, k] as const)
                .sort((a, b) => Number(got.has(a[1])) - Number(got.has(b[1])) || a[1] - b[1])
                .map(([i, k]) => (
                  <button key={k} class={`cook-ing${got.has(k) ? ' on' : ''}`} aria-pressed={got.has(k)} onClick={() => toggle(k)}>
                    <span class="box">{got.has(k) && <Icon name="check" />}</span>
                    <span>{i.name}</span>
                    <span class="q">{formatQty(scaledQty(r, i, portions))}</span>
                  </button>
                ))}
            </div>
          </>
        ) : (
          r.steps.map((s, k) => (
            <button key={k} class={`cook-step${k === cur ? ' cur' : k < cur ? ' done' : ''}`} onClick={() => setCur(k)} aria-current={k === cur ? 'step' : undefined}>
              <small>Étape {k + 1}</small>
              <span>{stepParts(r, s, portions).map((p, j) => (typeof p === 'string' ? p : <b key={j}>{p.qty}</b>))}</span>
            </button>
          ))
        )}
      </div>
      <div class="cook-foot">
        {tab === 'ings' ? (
          n ? (
            <button class="btn primary" onClick={() => setTab('steps')}>
              C’est prêt, aux étapes
            </button>
          ) : (
            <button class="btn primary" onClick={onQuit}>
              Terminé
            </button>
          )
        ) : (
          <>
            <button class="btn ghost" disabled={cur === 0} onClick={() => setCur(Math.max(0, cur - 1))}>
              Précédente
            </button>
            {cur < n - 1 ? (
              <button class="btn primary" onClick={() => setCur(cur + 1)}>
                Étape suivante
              </button>
            ) : (
              <button class="btn primary" onClick={onQuit}>
                Terminé
              </button>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
