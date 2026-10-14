# Nantes 3D — validation et performances V8

## Protocole de comparaison

Référence : V7 complète, commit `0093f31`, mesurée avant toute modification V8.
Même Chromium système, WebGL 2 en rendu **logiciel**, même machine de travail,
même viewport 1440 × 1100, build de production Vite sous
`/threejs-playground/`. Les exécutions sont séquentielles, sans préparation de
PBF ni suite de tests concurrente. Aucun test de performance sur GPU physique.

Le script `scripts/benchmark_landmarks.py` déplace la caméra via la carte aux
mêmes coordonnées métriques : château (184, −33), cathédrale (165, −309), Tour LU
(468,04, 15,88), grue (−1310, 1168) et Bouffay en marche (−63, 91).
Il emploie la même distance aérienne de 550 m et la même orientation initiale.
Le cadrage ne dépend pas des noms de POI ajoutés en V8. Les LOD chargés sont les
mêmes avant et après. Cache HTTP désactivé, journée du 21 juin à 14 h à Nantes,
voitures/passants/cyclistes/trams désactivés. L'eau anime la mesure des images ;
Bouffay ajoute la touche W. Trois images de chauffe puis cinq images mesurées
produisent quatre intervalles par scénario. Cette série courte est indicative,
pas une estimation statistique de FPS ni une promesse de fluidité sur appareil.

Les appels/triangles sont ceux du dernier dessin chargé, incluant ses ombres,
avant la mesure animée. Le délai de quartier inclut navigation, interaction de
carte et attentes fixes ; il n'est pas uniquement un temps de téléchargement.
Le temps worker additionne les événements de préparation géométrique du scénario.
Les buffers sont l'estimation des ressources de tuiles V5C, pas toute la mémoire GPU.
Le heap JS est celui de la page, pas le heap des workers ; il dépend du GC.

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4175
python3 src/playgrounds/nantes-3d/scripts/benchmark_landmarks.py --label mesure
```

Playwright et Chromium sont nécessaires uniquement à ce script facultatif,
aucune dépendance de l'application. Les résultats JSON et captures restent dans
`work/v8/<label>/`, ignoré par Git. Les références et générateurs sont décrits dans
[LANDMARKS.md](./LANDMARKS.md).

## Résultats du 14 octobre 2026

Toutes les valeurs sont **V7 → V8**, sur le build final validé.

| Scénario | Appels | Triangles | Intervalle médian logiciel, ms | Worker cumulé, ms | Délai quartier, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Château | 392 → 411 | 1,401,280 → 1,427,373 | 2611 → 2740 | 1304 → 1386 | 17587 → 15824 |
| Cathédrale | 410 → 421 | 1,425,895 → 1,445,530 | 2667 → 2704 | 782 → 581 | 16481 → 16433 |
| Tour LU | 302 → 317 | 1,159,863 → 1,191,131 | 2000 → 2269 | 366 → 385 | 14649 → 14927 |
| Grue Titan | 223 → 228 | 856,248 → 858,481 | 1307 → 1209 | 1046 → 974 | 11173 → 11247 |
| Bouffay · marche | 255 → 259 | 1,128,519 → 1,133,498 | 2411 → 2657 | 704 → 733 | 15903 → 17931 |

| Scénario | Buffers tuiles, Mo | Heap page, Mo | Géométries chargées |
| --- | ---: | ---: | ---: |
| Château | 58.36 → 58.32 | 108.03 → 107.56 | 295 → 307 |
| Cathédrale | 79.98 → 79.94 | 134.17 → 134.39 | 418 → 430 |
| Tour LU | 76.06 → 76.15 | 145.19 → 146.00 | 410 → 422 |
| Grue Titan | 91.76 → 91.87 | 162.89 → 163.33 | 530 → 545 |
| Bouffay · marche | 91.86 → 91.73 | 188.97 → 173.88 | 511 → 523 |

La vue initiale devient utilisable en 1.46 → 1.49 s
selon le critère du script (bouton piéton activé).
Les appels augmentent de 1,6 à 5 %, les triangles de 0,3 à 2,7 %.
La variation des buffers reste inférieure à 0,2 Mo par scénario.
Les intervalles logiciels varient de **-7.5 à +13.5 %** ; le worker de
**-25.7 à +6.3 %**. L'augmentation maximale du temps d'image concerne la Tour LU.
Ces variations observées sont conservées dans le rapport. Leur ampleur ne peut
pas être attribuée précisément au rendu des monuments avec quatre intervalles
sur cette machine logicielle ; une comparaison répétée sur GPU physique reste
nécessaire. Aucune affirmation de 30/60 FPS ou d'absence de régression réelle.

Le coût est borné par les volumes fusionnés, l'instancing, les trois LOD et le
culling existant. Les compléments publics totalisent **4822 octets**, l'empreinte
OSM de grue **625 octets**. Pas de photo, modèle glTF, texture externe, nouvelle
lumière ni post-traitement. Le worker et le scheduler V5C restent uniques.

## Vérifications automatisées

* `npm ci --offline` avec cache npm local : installation propre réussie.
* `npm run typecheck` : réussi.
* `npm test` : **141 tests, 13 fichiers**, réussis ; onze tests V8 sur les vraies
  tuiles et leurs variantes LOD, géométrie finie, implantation stable, suppression
  du rendu ordinaire, proxies de sélection, terrain, obstacles, transfert et
  destruction idempotente.
* `npm run nantes:test-data` : **31 tests Python**, réussis ; quatre tests V8 de
  provenance, géométries OSM, découpe LU sans doublon, entrées et reproduction.
* `nantes:prepare-landmarks` exécuté sur le PBF source : 15 objets retrouvés ;
  sorties vérifiées et assets issus de cette préparation. Comparaison octet
  par octet du complément LU et de la grue reproduits, puis test du writer pour
  les trois assets, incluant les accès du passage.
* `npm run build` : réussi, base Pages conservée. L'avertissement Vite du chunk
  Nantes supérieur à 500 ko demeure ; Three.js reste chargé uniquement avec
  l'expérience, sans nouvelle bibliothèque.

## Contrôles de navigateur

Contrôles effectués sur le preview du build de production, avec Chromium :

* Les cinq monuments : vues aériennes, cadrage Observer, distance moyenne et
  approche piétonne ; captures réellement examinées. Les points d'observation
  ont été déplacés lorsqu'un arbre, le pont de la Rotonde ou un bâtiment voisin
  masquait la façade. Les vues finales ont permis de corriger les pignons
  procéduraux orientés vers l'intérieur et le massif central de la cathédrale.
* Cycle nocturne : scènes et fenêtres vérifiées ; pas d'éclairage architectural
  spécifique ni de lumière ajoutée. Le contrôle de coexistence active eau,
  soleil en lecture, voitures, passants/cyclistes et trams, puis vérifie la nuit.
* Mobile émulé 390 × 844, tactile et animations réduites : cathédrale, Tour LU,
  Passage, liens des fiches et bouton Observer ; absence de débordement horizontal,
  mode piéton et bouton Courir. Les contrôles d'activité désactivés par la
  préférence d'animations réduites sont respectés.
* Nettoyage au changement de route et pendant un chargement : aucun canvas,
  worker ni rAF Nantes restant ; maximum d'un rAF suivi pendant la coexistence.
* Aucun message d'erreur JavaScript/WebGL ni échec HTTP d'asset dans les séries
  terminées. Les URLs locales utilisent réellement le préfixe Pages.

Limites : navigateur et mobile émulés, pas de téléphone ni GPU physique testé.
Les proxies de sélection et les obstacles restent approximatifs ; ils ne sont
pas des maillages de physique. Les fenêtres et sculptures sont stylisées.
Le Passage n'a aucun intérieur reconstruit. Les images de référence ne sont pas
versionnées. Les captures de travail restent dans `work/`, pas dans le site.
