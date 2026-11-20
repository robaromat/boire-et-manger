# Boire & Manger — plan

App web perso (PWA) qui réunit quatre carnets : **Courses · Recettes · Cave · Souvenirs**.
Nom court sous l'icône : **B&M**. Suite de l'app « Courses » (étapes 1 à 3 en ligne depuis le 16/11/2026).
Décisions issues du grill du 18-19/11/2026.

## Principes communs

- Une seule app, 4 onglets en bas. Réglages et état de la synchro en haut à droite.
- À l'ouverture : dernier onglet utilisé s'il date de moins de 24 h, sinon Courses (dernière liste ouverte).
- Données dans un dépôt GitHub privé, **un fichier par carnet** (`courses.json`, `recettes.json`, `cave.json`,
  `souvenirs.json`), même moteur de synchro hors ligne que Courses et Culture.
- **Photos dans le dépôt privé** (`photos/`), réduites sur le téléphone (~250 Ko + vignette ~30 Ko),
  vignettes gardées en cache pour le hors ligne.
- Robin seul en v1 ; chaque entrée de journal porte un champ `auteur` pour ouvrir à une 2e personne plus tard.
- Lecture d'images et de pages par l'API OpenAI (clé sur le téléphone seulement) ; pages web lues via le relais
  r.jina.ai, comme dans Culture.
- Style « carnet de marché » (crème, mode sombre auto, grosse typo) ; couleur d'accent par carnet :
  Courses vert, Recettes terracotta, Cave bordeaux, Souvenirs bleu ardoise.
- Mini-tuto par onglet au premier passage, façon Labs Jarvis (titre, 2-3 phrases, mini-illustration inventée),
  rejouable depuis les Réglages ; une étape redevient « nouvelle » quand une nouveauté la concerne.
- Recherche et filtres par onglet. Fold déplié / ordinateur : liste et fiche côte à côte.

## Phases

Chaque carnet est utilisable dès sa livraison. Une maquette cliquable est validée avant le développement de
chaque carnet.

### Phase 0 — Passage à Boire & Manger ✅ (19/11/2026)
- ✅ Maquette de la coque validée le 19/11/2026 (https://claude.ai/artifact/Ji5NLeyeSvYSXSKyNRRqEQ).
- Renommer les dépôts : `courses` → `boire-et-manger`, `courses-data` → `boire-et-manger-data`
  (le jeton fine-grained de Robin suit le renommage). Nouvelle adresse
  robaromat.github.io/boire-et-manger/ ; l'ancienne adresse /courses/ redirige.
- `data.json` → `courses.json` (migration automatique, rien à ressaisir).
- Un moteur de synchro par fichier (chaque carnet aura le sien). Le magasin de photos (envoi, cache, vignettes)
  arrive avec le premier carnet qui en a besoin (phase 2).
- Coque : barre d'onglets, règle des 24 h, Réglages communs, moteur du tuto.
- Manifeste « Boire & Manger » / « B&M », icônes.

### Phase 1 — Courses v1.0 ✅ (20/11/2026)
- Bouton 📷 Recette (code de l'étape 4 déjà écrit : photo ou lien → revue → ajout), case
  « Garder dans le carnet de recettes » branchée en phase 2.
- PWA hors ligne (service worker, installation), finitions, essais sur le Fold.

### Phase 2 — Recettes ✅ (20/11/2026, v1.1.0)
- ✅ Maquette validée le 20/11/2026 (https://claude.ai/artifact/5GaMF9Sk4sng37CnwTC1s7).
- Livré : carnet `recettes.json` (synchro et fusion propres), magasin de photos `photos/` (grande + vignette, file
  d'envoi hors ligne), accueil (de saison / pas faites depuis longtemps / à tester, recherche par ingrédient, filtres,
  tri), fiche, ajout photo / lien / Partager / à la main, mode cuisine, journal, « Aux courses » avec « pour : … » et
  retrait d'une recette depuis la liste, case « Garder dans le carnet » dans Courses, tuto Recettes, Fold côte à côte.
- Reste : export PDF (le partage texte est fait). Un lien partagé vers l'app ouvre désormais Recettes (plus Courses).
- 7 catégories (Apéro, Entrée, Plat, Dessert, Boisson, Bases & sauces, Petit-déj & goûter) + tags libres.
- Ajout : photo / galerie, lien (fiche recette schema.org, sinon ChatGPT, sinon texte collé), menu Partager d'Android.
- Photo source + photo du plat. Saison calculée depuis les ingrédients (calendrier FR), modifiable ;
  « De saison en ce moment ».
- Journal « Je l'ai fait » (date, note /5, commentaire, photo) + « Mes ajustements » ; tris meilleures /
  pas faite depuis longtemps / jamais testée.
- Mode cuisine (écran allumé, ingrédients cochables, étapes, portions recalculées), sans minuteur.
- « Ajouter aux courses » : écran de revue, articles marqués « pour : … », retrait d'une recette de la liste.
- Export d'une recette en texte / PDF via Partager.

### Phase 3 — Cave
- Fiche par vin (domaine, cuvée, millésime) : stock, lieu + clayette, prix d'achat, fenêtre de dégustation,
  journal « Je l'ai bu » (date, note, commentaire, plat / recette, photo). Ouvrir une bouteille = stock −1 + entrée.
- Ajout par photo d'étiquette ; fiche enrichie par ChatGPT (région, cépages, style, fenêtre estimée, accords
  vers tes recettes), marquée « estimation ».
- Vues : **À boire** (par défaut, groupée par année de fin de fenêtre), Ma cave (+ plan visuel des clayettes),
  Dégustés, Envies. Aucune valeur de cave affichée.
- Import CellarTracker (stock, bouteilles bues, notes) avec écran de revue.
  ⚠ Robin exporte ses données CellarTracker **avant le 14/12/2026** (fin de l'abonnement).

### Phase 4 — Souvenirs
- Fiche par lieu (resto, bar, cave, boulangerie…) + journal de visites (date, photos, note, commentaire,
  avec qui, vins bus liés à la Cave). « À essayer » façon Mapstr.
- Lieux via OpenStreetMap : autour de moi, recherche par nom, GPS des photos, point posé à la main ;
  lien « Ouvrir dans Google Maps ».
- Vues : Carte, Liste, Livre (book chronologique de photos).

### Plus tard (hors v1)
Planning des repas, recherche globale, minuteurs, deuxième utilisateur, import Mapstr.
