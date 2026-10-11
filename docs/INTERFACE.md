# Interface

La variante A a été retenue : galerie claire, cartes compactes et typographie
sans-serif système. Chaque carte affiche le titre, le statut, une description
et l’action « Ouvrir la scène ». La carte entière est un lien natif.

La page Nantes présente le retour aux expériences, le titre, le statut,
la mention de scène d’attente et une scène large. Sur mobile, la carte et la
scène s’adaptent à la largeur disponible. Le focus clavier reste visible.

Nantes reste un placeholder « En préparation » : grille et repère circulaire,
avec rotation et zoom via les contrôles existants. Les données OpenStreetMap
restent à venir. L’aperçu d’accueil est schématique.

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
Les limites actuelles restent la manipulation 3D sans commandes clavier et
l’absence de tests sur téléphone physique, Safari et lecteur d’écran.

Le build peut signaler un chunk Three.js de plus de 500 Ko, chargé uniquement
à l’ouverture de Nantes. Le push sur `main` déclenche le workflow existant de
validation puis de publication GitHub Pages.
