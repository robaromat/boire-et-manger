import './app.css';

// Étape 1 du plan : une page en ligne, sans données. Les écrans validés en maquette arrivent aux étapes suivantes.
export function App() {
  return (
    <main class="welcome">
      <div class="welcome-in">
        <h1 class="wordmark">Courses</h1>
        <p class="intro">
          Tes listes de courses par magasin, rangées par rayon, avec la lecture des recettes en photo.
        </p>
        <p class="status">
          <span class="dot" aria-hidden="true" />
          En construction · l'app arrive bientôt ici
        </p>
        <p class="version">v{__APP_VERSION__}</p>
      </div>
    </main>
  );
}
