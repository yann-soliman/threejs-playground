# Consignes pour les agents

## Architecture

- Vite, TypeScript strict, Three.js, HTML/CSS et npm. Aucun framework d’interface.
- `src/app/` : catalogue, accueil et routeur par fragment.
- `src/playgrounds/<id>/` : un dossier autonome par expérience.
- `src/shared/` : contrats et utilitaires réellement communs.
- `src/main.ts` : navigation et gestion du montage/nettoyage.

## Conventions

- Documenter et rédiger l’interface en français ; utiliser des noms techniques explicites.
- Préférer de petits modules et les API natives ; éviter les abstractions et dépendances inutiles.
- Respecter TypeScript strict, les imports de types et le style existant (deux espaces, guillemets simples, points-virgules).
- Garder une interface responsive, des liens natifs, des titres structurés et un focus clavier visible.

## Isolation des playgrounds

- Déclarer les métadonnées dans `src/app/catalog.ts` et charger chaque module par `import()` explicite.
- Ne jamais importer statiquement Three.js dans l’accueil, ni une expérience depuis une autre.
- Exporter `mount(container): Cleanup`, sans effet de bord au chargement du module.
- Monter uniquement dans le conteneur fourni. Garder les ressources spécifiques dans le dossier de l’expérience.
- Nettoyer WebGL, contrôles, animations, textures, événements, observateurs et requêtes à la fermeture.
- Vérifier qu’une navigation rapide ne monte pas une expérience après son abandon.

## Vérifications

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`npm run dev` lance le développement ; `npm run preview` sert le build ; `npm run test:watch` suit les tests. Ajouter des tests de comportement lorsque la logique le justifie. Ne pas versionner les sorties générées (`dist/`, `node_modules/`, couverture).

## Contraintes GitHub Pages

- Conserver `base: '/threejs-playground/'` dans Vite.
- Utiliser `#/playgrounds/<id>` pour les liens stables ; aucun serveur ne réécrit les routes.
- Respecter le préfixe pour les ressources publiques (`import.meta.env.BASE_URL`).
- PR vers `main` : installation, typage, tests et build uniquement.
- Push vers `main` : même validation, puis déploiement de `dist/` via les actions officielles Pages ; le job de déploiement dépend de la réussite des vérifications.
- Ne pas pousser, fusionner, taguer, créer une release ou publier sans autorisation explicite.
