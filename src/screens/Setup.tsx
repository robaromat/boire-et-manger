import { useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { repoRef, settings, updateSettings } from '../settings/settings';
import { testConnection, writeDataFile } from '../sync/github';
import { startSync } from '../sync/store';
import { emptyDataFile } from '../model/validate';

type Result = null | { kind: 'error'; message: string } | { kind: 'no_file' };

/** Premier lancement sur un appareil : sans jeton, l'app ne montre que cet écran. */
export function Setup() {
  const s = settings.value;
  const [token, setToken] = useState(s.githubToken);
  const [owner, setOwner] = useState(s.owner);
  const [repo, setRepo] = useState(s.repo);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  const draft = () => ({ githubToken: token.trim(), owner: owner.trim(), repo: repo.trim() });

  async function connect(e: Event) {
    e.preventDefault();
    if (!token.trim()) return setResult({ kind: 'error', message: 'Colle d’abord ton jeton GitHub.' });
    setBusy(true);
    setResult(null);
    const d = draft();
    const t = await testConnection(repoRef({ ...settings.value, ...d }));
    setBusy(false);
    if (t.ok) {
      updateSettings(d);
      void startSync();
    } else if (t.kind === 'no_file') setResult({ kind: 'no_file' });
    else setResult({ kind: 'error', message: 'message' in t ? t.message : 'Connexion impossible.' });
  }

  async function createFile() {
    setBusy(true);
    const d = draft();
    try {
      await writeDataFile(repoRef({ ...settings.value, ...d }), emptyDataFile(), null, 'Crée courses.json');
      updateSettings(d);
      void startSync();
    } catch (err) {
      setResult({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="setup">
      <div class="setup-in">
        <h1 class="wordmark">Boire & Manger</h1>
        <p class="intro">Tes courses, tes recettes, ta cave et tes souvenirs de table, synchronisés entre ton téléphone et ton ordinateur.</p>
        <form class="card" onSubmit={connect}>
          <h2>
            <Icon name="key" />
            Connexion à tes données
          </h2>
          <p class="lead">Une seule fois par appareil. Le jeton reste sur cet appareil et n'est envoyé qu'à GitHub.</p>
          <div class="field">
            <label for="u-tok">Jeton GitHub</label>
            <input class="input mono" id="u-tok" type="password" autocomplete="off" spellcheck={false} placeholder="github_pat_…" value={token} onInput={(e) => setToken(e.currentTarget.value)} />
          </div>
          <div class="fgrid2">
            <div class="field">
              <label for="u-own">Propriétaire</label>
              <input class="input" id="u-own" autocapitalize="off" value={owner} onInput={(e) => setOwner(e.currentTarget.value)} />
            </div>
            <div class="field">
              <label for="u-repo">Dépôt</label>
              <input class="input" id="u-repo" autocapitalize="off" value={repo} onInput={(e) => setRepo(e.currentTarget.value)} />
            </div>
          </div>
          {result?.kind === 'error' && <p class="testres err" role="alert">{result.message}</p>}
          {result?.kind === 'no_file' && (
            <div class="notice" role="alert">
              <span>
                Le dépôt <b>{owner}/{repo}</b> est accessible, mais il n'a pas encore de fichier <span class="mono">courses.json</span>.
              </span>
              <button type="button" class="btn small primary" disabled={busy} onClick={createFile}>
                Créer le fichier
              </button>
            </div>
          )}
          <button class="btn primary block" type="submit" disabled={busy}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <ol class="steps">
          <li>Sur github.com : Settings → Developer settings → Fine-grained tokens → Generate new token.</li>
          <li>
            Accès au seul dépôt <b>{repo || 'boire-et-manger-data'}</b>, permission <b>Contents : Read and write</b>, avec une date d'expiration.
          </li>
          <li>Colle le jeton ci-dessus. Il reste stocké sur cet appareil uniquement.</li>
        </ol>
        <p class="version">v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}
