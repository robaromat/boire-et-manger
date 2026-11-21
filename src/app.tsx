import { useEffect } from 'preact/hooks';
import './styles/ui.css';
import { route } from './router';
import { isConfigured } from './settings/settings';
import { engine, installSyncTriggers, startSync } from './sync/store';
import { Setup } from './screens/Setup';
import { SettingsScreen } from './screens/Settings';
import { Shell } from './screens/Shell';
import { installPhotoTriggers } from './photos/photos';

export function App() {
  const configured = isConfigured.value;

  useEffect(() => {
    installSyncTriggers();
    if (configured && !engine.value) void startSync();
    if (configured) installPhotoTriggers();
  }, [configured]);

  // Sans réglages, le site public ne montre que l'écran de connexion.
  if (!configured) return <div class="app"><Setup /></div>;

  const r = route.value;
  return <div class={r.name === 'settings' ? 'app' : 'app app-shell'}>{r.name === 'settings' ? <SettingsScreen /> : <Shell tab={r.tab} sub={r.sub} />}</div>;
}
