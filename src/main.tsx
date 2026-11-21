import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './app';
import { setupPwa } from './pwa';

setupPwa();

// Android : après le clavier ou un changement de taille, la page entière pouvait rester décalée vers le haut
// (barre d'onglets sous l'écran). La coque tient dans la fenêtre : on la recale en haut.
const recale = () => {
  if (document.querySelector('.shell') && (window.scrollY || document.documentElement.scrollTop)) window.scrollTo(0, 0);
};
window.addEventListener('resize', recale);
window.visualViewport?.addEventListener('resize', recale);
document.addEventListener('visibilitychange', recale);

const root = document.getElementById('app');
if (root) render(<App />, root);
