import { useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { SyncBadge } from '../components/SyncBadge';
import { TABS, TAB_LABELS, back, lastTab, navigate } from '../router';
import { replayTuto, resetTuto } from '../tuto/state';
import { installPrompt, isStandalone } from '../pwa';
import { stepsOf } from '../tuto/tuto';
import { clearSettings, maskSecret, repoRef, settings, updateSettings } from '../settings/settings';
import { testConnection, serialize } from '../sync/github';
import { engine, mutate, resetLocal, startSync } from '../sync/store';
import { testOpenAIKey } from '../providers/openai';
import { RAYONS } from '../model/types';
import { moveRayon } from '../model/ops';
import { relativeTime } from '../lib/time';

type Msg = null | { ok: boolean; text: string };

function GitHubSection() {
  const s = settings.value;
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState('');
  const [owner, setOwner] = useState(s.owner);
  const [repo, setRepo] = useState(s.repo);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const e = engine.value;
  const last = e?.lastSyncAt.value;

  async function test() {
    setBusy(true);
    setMsg(null);
    const draft = { ...settings.value, owner: owner.trim(), repo: repo.trim(), ...(token.trim() ? { githubToken: token.trim() } : {}) };
    const t = await testConnection(repoRef(draft));
    setBusy(false);
    if (t.ok) {
      const changed = draft.githubToken !== s.githubToken || draft.owner !== s.owner || draft.repo !== s.repo;
      if (changed) {
        updateSettings({ githubToken: draft.githubToken, owner: draft.owner, repo: draft.repo });
        void startSync();
      }
      setEditing(false);
      setToken('');
      setMsg({ ok: true, text: `Connexion OK : ${t.lists} liste${t.lists > 1 ? 's' : ''}, ${t.items} article${t.items > 1 ? 's' : ''}.` });
    } else if (t.kind === 'no_file') setMsg({ ok: false, text: "Le dépôt est accessible mais n'a pas de courses.json." });
    else setMsg({ ok: false, text: t.message });
  }

  return (
    <section class="card">
      <h2>
        <Icon name="cloud" />
        Données
      </h2>
      <div class="kv">
        <span>Dépôt</span>
        <span class="mono">
          {s.owner}/{s.repo}
        </span>
        <span>Jeton</span>
        <span class="mono">{maskSecret(s.githubToken)}</span>
        <span>État</span>
        <span class="row-inline">
          <SyncBadge />
          {last && <span class="muted">dernière synchro {relativeTime(last)}</span>}
        </span>
      </div>
      {editing && (
        <>
          <div class="field">
            <label for="s-tok">Nouveau jeton GitHub</label>
            <input class="input mono" id="s-tok" type="password" autocomplete="off" spellcheck={false} placeholder="Laisser vide pour garder l'actuel" value={token} onInput={(ev) => setToken(ev.currentTarget.value)} />
          </div>
          <div class="fgrid2">
            <div class="field">
              <label for="s-own">Propriétaire</label>
              <input class="input" id="s-own" autocapitalize="off" value={owner} onInput={(ev) => setOwner(ev.currentTarget.value)} />
            </div>
            <div class="field">
              <label for="s-repo">Dépôt</label>
              <input class="input" id="s-repo" autocapitalize="off" value={repo} onInput={(ev) => setRepo(ev.currentTarget.value)} />
            </div>
          </div>
        </>
      )}
      {msg && <p class={`testres ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</p>}
      <div class="btnrow">
        <button class="btn" disabled={busy} onClick={test}>
          {busy ? 'Test…' : editing ? 'Tester et enregistrer' : 'Tester la connexion'}
        </button>
        {!editing && (
          <button class="btn ghost" onClick={() => setEditing(true)}>
            Changer de jeton
          </button>
        )}
      </div>
    </section>
  );
}

function OpenAISection() {
  const s = settings.value;
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function save() {
    const k = key.trim();
    if (!k) return setMsg({ ok: false, text: 'Colle d’abord ta clé OpenAI.' });
    setBusy(true);
    setMsg(null);
    const t = await testOpenAIKey(k);
    setBusy(false);
    if (t.ok) {
      updateSettings({ openaiKey: k });
      setKey('');
      setMsg({ ok: true, text: 'Clé vérifiée et enregistrée sur cet appareil.' });
    } else setMsg({ ok: false, text: t.message });
  }

  async function retest() {
    setBusy(true);
    const t = await testOpenAIKey(s.openaiKey);
    setBusy(false);
    setMsg(t.ok ? { ok: true, text: 'La clé fonctionne.' } : { ok: false, text: t.message });
  }

  return (
    <section class="card">
      <h2>
        <Icon name="camera" />
        Recettes en photo
      </h2>
      <p class="lead">
        La lecture des recettes passe par l'API OpenAI. La clé reste sur cet appareil et n'est envoyée qu'à OpenAI. Compte environ 1 centime par
        photo.
      </p>
      {s.openaiKey && (
        <div class="kv">
          <span>Clé</span>
          <span class="mono">{maskSecret(s.openaiKey)}</span>
        </div>
      )}
      <div class="field">
        <label for="s-oai">{s.openaiKey ? 'Remplacer la clé' : 'Clé OpenAI'}</label>
        <input class="input mono" id="s-oai" type="password" autocomplete="off" spellcheck={false} placeholder="sk-…" value={key} onInput={(ev) => setKey(ev.currentTarget.value)} />
        <span class="hint">À créer sur platform.openai.com → API keys. Mets une limite de dépense mensuelle sur ton compte.</span>
      </div>
      {msg && <p class={`testres ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</p>}
      <div class="btnrow">
        <button class="btn" disabled={busy || !key.trim()} onClick={save}>
          {busy ? 'Vérification…' : 'Vérifier et enregistrer'}
        </button>
        {s.openaiKey && !key.trim() && (
          <>
            <button class="btn ghost" disabled={busy} onClick={retest}>
              Tester
            </button>
            <button
              class="btn ghost"
              onClick={() => {
                updateSettings({ openaiKey: '' });
                setMsg({ ok: true, text: 'Clé retirée de cet appareil.' });
              }}
            >
              Retirer
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function RayonsSection() {
  const d = engine.value?.data.value;
  if (!d) return null;
  return (
    <section class="card">
      <h2>
        <Icon name="cart" />
        Ordre des rayons
      </h2>
      <p class="lead">Les listes s'affichent dans cet ordre, le même pour tous les magasins.</p>
      <ol class="ord">
        {d.rayonOrder.map((r, k) => (
          <li class="ord-row" style={`--rc: var(--r-${r})`} key={r}>
            <i aria-hidden="true" />
            <span>{RAYONS[r]}</span>
            <button class="iconbtn" aria-label={`Monter ${RAYONS[r]}`} disabled={k === 0} onClick={() => mutate((x) => moveRayon(x, k, -1))}>
              <Icon name="up" />
            </button>
            <button
              class="iconbtn"
              aria-label={`Descendre ${RAYONS[r]}`}
              disabled={k === d.rayonOrder.length - 1}
              onClick={() => mutate((x) => moveRayon(x, k, 1))}
            >
              <Icon name="down" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DeviceSection() {
  const [confirm, setConfirm] = useState(false);
  const e = engine.value;
  const d = e?.data.value;

  function exportJson() {
    if (!d) return;
    const blob = new Blob([serialize(d)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `courses-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function logout() {
    await resetLocal();
    clearSettings();
    location.hash = '#/';
  }

  return (
    <section class="card">
      <h2>
        <Icon name="download" />
        Sauvegarde et appareil
      </h2>
      <div class="btnrow">
        <button class="btn ghost" disabled={!d} onClick={exportJson}>
          Exporter les données (JSON)
        </button>
      </div>
      {!confirm ? (
        <div class="btnrow">
          <button class="btn danger" onClick={() => setConfirm(true)}>
            <Icon name="logout" />
            Déconnecter cet appareil
          </button>
        </div>
      ) : (
        <div class="notice" role="alert">
          <span>
            Le jeton, la clé OpenAI et la copie locale seront effacés de cet appareil. Les données restent sur GitHub.
            {e?.hasPendingChanges && <b> Des modifications n'ont pas encore été envoyées et seront perdues.</b>}
          </span>
          <div class="btnrow">
            <button class="btn danger" onClick={logout}>
              Déconnecter
            </button>
            <button class="btn ghost" onClick={() => setConfirm(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function AppSection() {
  return (
    <section class="card">
      <h2>
        <Icon name="download" />
        Application
      </h2>
      {isStandalone() ? (
        <p class="testres ok">Boire & Manger est installée sur cet appareil et fonctionne hors connexion.</p>
      ) : installPrompt.value ? (
        <div>
          <button
            class="btn primary"
            onClick={async () => {
              const p = installPrompt.value;
              if (!p) return;
              await p.prompt();
              await p.userChoice;
              installPrompt.value = null;
            }}
          >
            <Icon name="download" />
            Installer sur cet appareil
          </button>
        </div>
      ) : (
        <p class="lead">
          Pour l'avoir comme une app (icône « B&M », plein écran, hors connexion) : menu ⋮ de Chrome → « Installer l'application » ou
          « Ajouter à l'écran d'accueil ».
        </p>
      )}
      <p class="hint">Une fois installée, elle apparaît dans le menu Partager : partage-lui la page d'une recette depuis Chrome.</p>
    </section>
  );
}

function TutoSection() {
  const withSteps = TABS.filter((t) => stepsOf(t).length > 0);
  const [done, setDone] = useState(false);
  return (
    <section class="card">
      <h2>
        <Icon name="book" />
        Tuto
      </h2>
      <p class="lead">Chaque carnet a une courte visite, proposée la première fois que tu l'ouvres.</p>
      <div class="btnrow">
        {withSteps.map((t) => (
          <button
            key={t}
            class="btn"
            onClick={() => {
              navigate({ name: 'tab', tab: t }, { replace: true });
              replayTuto(t);
            }}
          >
            Revoir · {TAB_LABELS[t]}
          </button>
        ))}
        <button
          class="btn ghost"
          onClick={() => {
            resetTuto();
            setDone(true);
          }}
        >
          Tout reproposer
        </button>
      </div>
      {done && <p class="testres ok">Chaque visite se rouvrira à ton prochain passage dans le carnet.</p>}
      <p class="lead">
        Pour installer l’app chez quelqu’un d’autre, avec ses propres données :{' '}
        <a class="linkbtn" href="installer.html" target="_blank" rel="noopener">
          le guide d’installation
        </a>
        .
      </p>
    </section>
  );
}

export function SettingsScreen() {
  return (
    <div class="screen">
      <header class="topbar">
        <button class="iconbtn" aria-label="Retour" onClick={() => back({ name: 'tab', tab: lastTab.value })}>
          <Icon name="back" />
        </button>
        <h1 class="title">Réglages</h1>
        <span />
      </header>
      <div class="screen-body">
        <GitHubSection />
        <OpenAISection />
        <RayonsSection />
        <AppSection />
        <TutoSection />
        <DeviceSection />
        <p class="version">Boire & Manger v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}
