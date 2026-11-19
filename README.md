# Boire & Manger

Application web personnelle (« B&M » sur l'écran d'accueil) qui réunit quatre carnets : **Courses** (une liste par magasin, rangée par rayon), **Recettes**, **Cave** et **Souvenirs** de table. Installable sur le téléphone (PWA), synchronisée entre appareils. Plan détaillé : [PLAN-boire-et-manger.md](PLAN-boire-et-manger.md). Suite de l'app « Courses ».

**En ligne :** https://robaromat.github.io/boire-et-manger/ (l'ancienne adresse /courses/ y redirige)

## Principe

- Site statique (Vite + TypeScript + Preact) publié sur GitHub Pages à chaque push sur `main`.
- Les données vivent dans un **dépôt privé séparé** (`boire-et-manger-data`, un fichier par carnet : `courses.json` pour l'instant), lu et écrit via l'API GitHub. Même moteur de synchro que l'app Culture.
- Classement par rayon **local** : historique (rayons appris) puis dictionnaire d'aliments. Aucun appel réseau.
- Lecture des recettes en photo par l'**API OpenAI**, appelée directement depuis le téléphone.
- **Aucun secret dans ce dépôt.** Le jeton GitHub et la clé OpenAI sont saisis dans l'écran Réglages et restent dans le stockage local de chaque appareil.

## Structure

```
.github/workflows/deploy.yml   tests + déploiement GitHub Pages
maquettes/                     prototype cliquable validé (données d'exemple)
public/                        icônes, manifeste
src/
  model/       types de data.json, dictionnaire des rayons, opérations sur les listes, quantités
  styles/      palette « carnet de marché » (thème clair/sombre automatique)
  screens/     écrans (listes, fiche article, réglages, connexion)
  sync/        API GitHub, fusion des conflits, cache IndexedDB, file hors ligne (à venir, repris de Culture)
  recipe/      lecture de recette via OpenAI (à venir)
```

## Développement

```bash
npm install
npm run dev       # http://localhost:5173/boire-et-manger/
npm test          # tests unitaires (vitest)
npm run build     # vérification des types + build dans dist/
```

## Avancement

1. ✅ Projet initialisé, déploiement automatique, dépôt de données créé
2. ✅ Réglages + stockage GitHub + cache local (moteur repris de Culture)
3. ✅ Listes, rayons, panier, saisie rapide, historique et habituels
4. Recette en photo (OpenAI) et écran de revue
5. PWA hors connexion
6. Finitions et tests sur téléphone
