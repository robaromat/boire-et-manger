import { useState } from 'preact/hooks';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { showSnack } from '../../components/Snack';
import { applyCtImport, buildCtImport, type CtFileKind, type CtImport } from '../../cave/cellartracker';
import { decodeText } from '../../cave/csv';
import { caveEngine, mutateCave } from '../../sync/store';

// Import CellarTracker (maquette validée) : 1. exporter les CSV, 2. les choisir, 3. vérifier (chiffres, lieux à renommer),
// puis importer. Rien n'est écrit avant le bouton final. La valeur estimée de CellarTracker n'est pas reprise.

const KIND_LABELS: Record<CtFileKind, string> = {
  inventory: 'ta cave (bouteilles en stock)',
  consumed: 'les bouteilles sorties',
  notes: 'tes notes de dégustation',
  unknown: 'non reconnu, ignoré',
};

export function ImportSheet({ onClose }: { onClose: () => void }) {
  const [plan, setPlan] = useState<CtImport | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onFiles = async (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      const texts = await Promise.all(files.map(async (f) => ({ name: f.name, text: decodeText(new Uint8Array(await f.arrayBuffer())) })));
      const data = caveEngine.value?.data.value;
      if (!data) throw new Error('La cave n’est pas encore chargée.');
      const p = buildCtImport(texts, data);
      if (!p.wines.length) {
        setError(
          p.files.every((f) => f.kind === 'unknown')
            ? 'Ces fichiers ne ressemblent pas à des exports CellarTracker (colonnes iWine, Producer, Location…). Choisis les fichiers CSV exportés.'
            : 'Aucun vin trouvé dans ces fichiers.',
        );
        return;
      }
      setPlan(p);
      setNames(Object.fromEntries(p.locations.map((l) => [l.name, l.name || 'À ranger'])));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doImport = () => {
    if (!plan) return;
    mutateCave((d) => applyCtImport(d, plan, names));
    onClose();
    const s = plan.stats;
    showSnack(`${s.wines} vins importés · ${s.bottles} bouteilles · ${s.tastings} dégustations`);
  };

  if (!plan)
    return (
      <Sheet onClose={onClose} label="Importer de CellarTracker" full>
        <div class="sheet-head">
          <h2>Importer de CellarTracker</h2>
          <button class="btn ghost small" onClick={onClose}>
            Annuler
          </button>
        </div>
        {new Date().toISOString().slice(0, 10) <= '2026-12-14' && <p class="warnline">À faire avant le 14 décembre 2026, fin de ton abonnement.</p>}
        <div class="opts">
          <div class="opt static">
            <Icon name="upload" />
            <span>
              1. Sur cellartracker.com, exporte ta cave en CSV<small>Les bouteilles en stock (Inventory ou My Cellar), avec leur emplacement et leur prix d’achat</small>
            </span>
          </div>
          <div class="opt static">
            <Icon name="glass" />
            <span>
              2. Exporte aussi tes bouteilles bues et tes notes<small>Consumed (les sorties et leur raison) et Tasting Notes, en CSV aussi</small>
            </span>
          </div>
          <label class="opt">
            <Icon name="image" />
            <span>
              3. Choisir les fichiers<small>Un ou plusieurs CSV, depuis le téléphone ou Google Drive</small>
            </span>
            <input type="file" accept=".csv,.txt,text/csv,text/plain" multiple hidden onChange={(e) => void onFiles(e.currentTarget)} />
          </label>
        </div>
        {busy && (
          <div class="loading" role="status">
            <div class="spinner" aria-hidden="true" />
            <b>Lecture des fichiers…</b>
          </div>
        )}
        {error && (
          <div class="notice" role="alert">
            {error}
          </div>
        )}
        <p class="note">Rien n’est importé avant que tu aies vérifié l’écran suivant. La valeur estimée de CellarTracker n’est pas reprise.</p>
      </Sheet>
    );

  const s = plan.stats;
  return (
    <Sheet onClose={onClose} label="Vérifier l’import" full>
      <div class="sheet-head">
        <h2>Vérifier l’import</h2>
        <button class="btn ghost small" onClick={onClose}>
          Annuler
        </button>
      </div>
      <div class="stats">
        <div>
          <b>{s.wines}</b>
          <span>vins en cave</span>
        </div>
        <div>
          <b>{s.bottles}</b>
          <span>bouteilles en stock</span>
        </div>
        <div>
          <b>{s.tastings}</b>
          <span>dégustations</span>
        </div>
        <div>
          <b>{s.exits}</b>
          <span>autres sorties (offertes, bouchonnées…)</span>
        </div>
      </div>
      <section>
        <h3>Fichiers</h3>
        <ul class="filelist">
          {plan.files.map((f) => (
            <li key={f.name} class={f.kind === 'unknown' ? 'bad' : ''}>
              <b>{f.name}</b> · {f.rows} lignes · {KIND_LABELS[f.kind]}
            </li>
          ))}
        </ul>
        {!plan.files.some((f) => f.kind === 'inventory') && <p class="warnline">Pas de fichier de stock : aucune bouteille ne sera rangée en cave.</p>}
      </section>
      {plan.locations.length > 0 && (
        <section>
          <h3>Emplacements</h3>
          <p class="note" style="margin-bottom:8px">
            CellarTracker a « Location » et « Bin » : ils deviennent lieu et clayette. Renomme les lieux si besoin.
          </p>
          <div style="overflow-x:auto">
            <table class="maptbl">
              <thead>
                <tr>
                  <th>CellarTracker</th>
                  <th>Lieu</th>
                  <th>Clayettes</th>
                </tr>
              </thead>
              <tbody>
                {plan.locations.map((l) => (
                  <tr key={l.name}>
                    <td>{l.name || '(vide)'}</td>
                    <td>
                      <input
                        aria-label={`Lieu pour ${l.name || 'emplacement vide'}`}
                        value={names[l.name] ?? ''}
                        onInput={(e) => {
                          const v = e.currentTarget.value;
                          setNames((cur) => ({ ...cur, [l.name]: v }));
                        }}
                      />
                    </td>
                    <td>
                      {l.bins.length ? `${l.bins.length} (${l.bins.slice(0, 3).join(', ')}${l.bins.length > 3 ? '…' : ''})` : '—'} · {l.bottles} bout.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section>
        <h3>À savoir</h3>
        <div class="opts">
          {s.noWindow > 0 && (
            <div class="opt static small">
              {s.noWindow} vin{s.noWindow > 1 ? 's' : ''} sans fenêtre de dégustation
              <small>Sur chaque fiche, « Compléter avec ChatGPT » pourra en proposer une, marquée « estimation »</small>
            </div>
          )}
          {s.merged > 0 && (
            <div class="opt static small">
              {s.merged} vin{s.merged > 1 ? 's' : ''} déjà dans ta cave B&M
              <small>Fusionnés : le stock de CellarTracker remplace le leur (pas additionné deux fois), l’historique est complété</small>
            </div>
          )}
          {s.elsewhere > 0 && (
            <div class="opt static small">
              {s.elsewhere} vin{s.elsewhere > 1 ? 's' : ''} plus en stock
              <small>Bus, offerts ou dégustés ailleurs : ils vont dans « Dégustés » et l’historique</small>
            </div>
          )}
          <div class="opt static small">
            Raisons de sortie reprises
            <small>Drank → bue, Gave away → offerte, Spoiled → bouchonnée, Dropped → cassée, Missing → disparue, Used for cooking → cuisine…</small>
          </div>
          <div class="opt static small">
            Notes sur 100 converties en étoiles
            <small>95 et plus : 5 ★ · 90-94 : 4 ★ · 85-89 : 3 ★ · 80-84 : 2 ★ · la note d’origine est gardée</small>
          </div>
        </div>
      </section>
      <button class="btn primary block" onClick={doImport}>
        Importer {plan.wines.length} vin{plan.wines.length > 1 ? 's' : ''}
      </button>
    </Sheet>
  );
}
