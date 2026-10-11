# threejs-playground

Une collection légère d’expériences 3D interactives et indépendantes, réalisée avec **Vite, TypeScript et Three.js**, sans framework d’interface.

L’interface utilise un thème clair et un accueil minimal : titre, cartes des expériences et lien GitHub.

La présentation retenue est une galerie de cartes compactes, avec une scène
large pour chaque expérience. Voir [les choix d’interface](docs/INTERFACE.md).

Site cible : https://yann-soliman.github.io/threejs-playground/

## Installation

Prérequis : Node.js **22.12 ou supérieur** et npm. La CI utilise Node.js 24.

```sh
git clone https://github.com/yann-soliman/threejs-playground.git
cd threejs-playground
npm ci
```

## Développement

```sh
npm run dev          # Serveur de développement
npm run typecheck    # Vérification TypeScript stricte
npm test             # Tests automatisés
npm run test:watch   # Tests en continu
npm run build        # Vérification des types et build dans dist/
npm run preview      # Prévisualisation du dernier build
```

Vite affiche l’adresse locale, avec le préfixe `/threejs-playground/`.

## Architecture

```text
src/
  app/                    # Catalogue, accueil et routage
  playgrounds/
    nantes-3d/index.ts     # Module Nantes chargé à la demande
  shared/playground.ts    # Contrat de montage et de nettoyage
  main.ts                 # Navigation et cycle de vie
  style.css               # Présentation commune et responsive
tests/                    # Tests du routage et du catalogue
.github/workflows/        # Vérification et déploiement Pages
```

L’accueil n’importe ni Three.js ni les expériences directement. Le catalogue contient uniquement les métadonnées et des fonctions `import()` : Vite produit des fichiers JavaScript séparés, chargés lors de l’ouverture d’un playground.

**Nantes 3D** propose une première maquette du centre historique : Bouffay,
le Château des ducs de Bretagne et les alentours de la cathédrale, avec 1 293
empreintes de bâtiments OpenStreetMap. Les fenêtres, toits, routes, arbres et
ombres composent un diorama navigable. Les données sont statiques ; aucune
requête OSM n’est faite depuis le navigateur. Voir [les données, leur préparation,
les estimations et les limites](src/playgrounds/nantes-3d/README.md).
Le rendu fonctionne à la demande, sans boucle d’animation permanente. Un message
est affiché si WebGL 2 est indisponible.

## Ajouter un playground

1. Créer `src/playgrounds/<identifiant>/index.ts`, avec un identifiant stable en minuscules et tirets.
2. Exporter `mount(container: HTMLElement): Cleanup`. Monter le contenu uniquement dans ce conteneur et retourner une fonction de nettoyage.
3. Ajouter une entrée dans `src/app/catalog.ts` : `id`, `title`, `description`, `status` et `load: () => import('../playgrounds/<identifiant>')`.
4. Conserver les composants, styles spécifiques et ressources de l’expérience dans son dossier. Ne pas importer un autre playground. Mutualiser uniquement les utilitaires réellement partagés dans `src/shared/`.
5. Libérer les géométries, matériaux, textures, contrôles, renderer, observateurs et écouteurs ; annuler les animations et requêtes éventuelles en quittant l’expérience.
6. Exécuter `npm run typecheck`, `npm test` et `npm run build`.

Le catalogue alimente automatiquement les cartes. Les représentations graphiques des cartes sont actuellement communes ; adapter `src/app/home.ts` si une nouvelle expérience nécessite un visuel différent.

## URLs et GitHub Pages

Nantes est accessible directement à :

https://yann-soliman.github.io/threejs-playground/#/playgrounds/nantes-3d

Le routage utilise le fragment `#` : le serveur reçoit toujours `/threejs-playground/`. Les liens directs, le rechargement et l’historique du navigateur fonctionnent sans réécriture serveur ni fichier `404.html`. Une route inconnue affiche un message dans l’application.

Le `base` Vite est fixé à `/threejs-playground/`. Utiliser des imports pour les ressources ou `import.meta.env.BASE_URL` pour les fichiers publics ; éviter les chemins absolus à la racine du domaine.

## Déploiement

Dans **Settings → Pages → Build and deployment**, choisir **GitHub Actions** comme source. Vérifier que les Actions sont autorisées et que l’environnement `github-pages` permet les déploiements depuis `main`.

Le workflow `.github/workflows/pages.yml` :

- Sur les pull requests vers `main` : exécute `npm ci`, le typage, les tests et le build, sans déployer.
- Sur les pushes vers `main` : exécute les mêmes vérifications, prépare Pages et téléverse `dist/` avec les actions officielles `actions/configure-pages` et `actions/upload-pages-artifact`.
- Après réussite du premier job : publie avec `actions/deploy-pages`, dans un job distinct disposant uniquement des permissions nécessaires.

Le fichier `package-lock.json` est versionné pour les installations reproductibles. `dist/` et `node_modules/` restent ignorés. Aucun secret de déploiement personnel n’est nécessaire : GitHub utilise son jeton et OIDC.

L’activation du workflow sur GitHub nécessite l’envoi des changements. Cette initialisation ne pousse ni ne publie le dépôt.
