import { Icon } from '../components/Icon';
import { SyncBadge } from '../components/SyncBadge';
import { navigate } from '../router';
import { engine } from '../sync/store';

// Étape 2 : écran provisoire qui montre que les données arrivent bien de GitHub.
// Les onglets, rayons, panier et la saisie (maquette v1) arrivent à l'étape 3.
export function Lists() {
  const e = engine.value;
  const d = e?.data.value;
  const error = e?.error.value;

  return (
    <div class="screen">
      <header class="topbar">
        <div class="brand">
          Courses <SyncBadge />
        </div>
        <button class="iconbtn" aria-label="Réglages" onClick={() => navigate({ name: 'settings' })}>
          <Icon name="sliders" />
        </button>
      </header>
      <div class="screen-body">
        {!d && !error && <p class="muted center">Chargement des listes…</p>}
        {!d && error && (
          <div class="notice" role="alert">
            <span>{error}</span>
            <button class="btn small" onClick={() => navigate({ name: 'settings' })}>
              Ouvrir les réglages
            </button>
          </div>
        )}
        {d && (
          <>
            <ul class="lists-preview">
              {d.lists.map((l) => {
                const todo = l.items.filter((i) => !i.checked).length;
                return (
                  <li key={l.id}>
                    <span class="lname">{l.name}</span>
                    <span class="muted">
                      {todo} à prendre{l.items.length > todo ? ` · ${l.items.length - todo} dans le panier` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p class="muted center">Connexion OK. Les listes, rayons et le panier arrivent à la prochaine étape.</p>
          </>
        )}
      </div>
    </div>
  );
}
