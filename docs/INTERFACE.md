# Interface

La variante A a été retenue : galerie claire, cartes compactes et typographie
sans-serif système. Chaque carte affiche le titre, le statut, une description
et l’action « Ouvrir la scène ». La carte entière est un lien natif.

La page Nantes présente le retour aux expériences, le titre, une maquette OSM
et des vues ciblées sur Bouffay et le château. Une barre discrète permet le zoom
et le reset ; l’attribution OSM reste visible. Rotation et déplacement sont
possibles à la souris, au tactile et via les commandes clavier documentées.
Sur mobile, la carte et la scène s’adaptent à la largeur disponible.
Le détail des sources et des estimations est repliable sous la scène.
L’aperçu d’accueil reste schématique.

Les variantes B/C, leur police et le dispositif temporaire de comparaison
ont été retirés. Aucun framework ni dépendance npm supplémentaire.
Le routeur par fragment, le préfixe `/threejs-playground/`, le chargement
dynamique et le nettoyage des ressources de chaque expérience sont conservés.

## Vérifications

Commandes de validation :

```sh
npm run typecheck
npm test
npm run build
```

L’accueil et Nantes ont été contrôlés avec Chromium sur ordinateur et mobile
simulé : navigation, lien direct, rechargement et absence de débordement.
La maquette Nantes a également été contrôlée dans le build de production :
vues ciblées, zoom/reset, rotation, déplacement souris/clavier, rechargement,
attribution, chemins statiques préfixés et nettoyage après navigation. Aucun
appel OSM au runtime ni erreur de page n’a été observé. Les limites de validation
restent les téléphones physiques, Safari et lecteur d’écran.

Le build peut signaler un chunk Three.js de plus de 500 Ko, chargé uniquement
à l’ouverture de Nantes. Le push sur `main` déclenche le workflow existant de
validation puis de publication GitHub Pages.
