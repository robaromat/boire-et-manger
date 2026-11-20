import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { checkRecipe, type CheckResult, type CheckTopic } from '../../recipe/check';
import { RecipeError } from '../../recipe/read';
import { settings } from '../../settings/settings';

// « Challenger la recette » : ChatGPT relit la fiche et signale les quantités incohérentes, les cuissons déconnantes,
// les portions improbables. Rien n'est modifié : la feuille alerte, tu corriges si tu es d'accord.

const TOPICS: Record<CheckTopic, string> = {
  quantite: 'Quantité',
  cuisson: 'Cuisson',
  temps: 'Temps',
  portions: 'Portions',
  ingredient: 'Ingrédient',
  autre: 'À vérifier',
};

export function CheckSheet({ text, onClose, onEdit }: { text: string; onClose: () => void; onEdit?: () => void }) {
  const [res, setRes] = useState<CheckResult | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  const run = () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setRes(null);
    setError('');
    checkRecipe(settings.value.openaiKey, text, { signal: ctrl.signal })
      .then((r) => !ctrl.signal.aborted && setRes(r))
      .catch((e: unknown) => !ctrl.signal.aborted && setError(e instanceof RecipeError ? e.message : 'Vérification impossible : ' + String(e)));
  };
  useEffect(() => {
    run();
    return () => abort.current?.abort();
  }, []);

  const alerts = res?.alerts.filter((a) => a.level === 'alerte').length ?? 0;
  return (
    <Sheet onClose={onClose} label="Challenger la recette">
      <div class="sheet-head">
        <h2>Challenger la recette</h2>
        <button class="btn ghost small" onClick={onClose}>
          Fermer
        </button>
      </div>
      {!res && !error && (
        <div class="loading" role="status" style="padding:24px 0">
          <div class="spinner" aria-hidden="true" />
          <div>
            <b>ChatGPT relit la recette…</b>
            <p class="note">Quantités, cuissons, temps, portions. Environ 10 à 30 secondes.</p>
          </div>
        </div>
      )}
      {error && (
        <div class="notice" role="alert">
          {error}
          <button class="btn small" onClick={run}>
            Réessayer
          </button>
        </div>
      )}
      {res && (
        <>
          <div class={`check-verdict ${alerts ? 'bad' : res.alerts.length ? 'warn' : 'ok'}`} role="status">
            <Icon name={res.alerts.length ? 'alert' : 'check'} />
            <b>{res.verdict}</b>
          </div>
          {res.alerts.length > 0 ? (
            <div class="check-list">
              {res.alerts.map((a, k) => (
                <div key={k} class={`check-item ${a.level}`}>
                  <span class="check-k">
                    {a.level === 'alerte' ? 'Alerte' : 'Doute'} · {TOPICS[a.topic]}
                  </span>
                  <p>{a.problem}</p>
                  {a.suggestion && <p class="check-sugg">Plutôt : {a.suggestion}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p class="note">Rien d’anormal dans les quantités, les cuissons ni les temps.</p>
          )}
          <p class="note">ChatGPT peut se tromper : rien n’a été modifié dans la fiche.</p>
          {onEdit && res.alerts.length > 0 && (
            <button class="btn primary block" onClick={onEdit}>
              <Icon name="pen" />
              Corriger la fiche
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}
