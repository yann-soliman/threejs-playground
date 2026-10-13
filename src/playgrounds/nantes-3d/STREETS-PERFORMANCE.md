# Nantes 3D — rues et course V7

## Détails et provenance

Les empreintes, hauteurs OSM, socles IGN et fenêtres V5C sont conservés.
Deux façades extérieures longues au maximum reçoivent portes encadrées,
linteaux, appuis de fenêtres, volets sélectifs, quelques balcons à garde-corps
et cheminées. Les décorations des étages se limitent aux trois premières travées
et aux trois premiers étages ; aucune décoration individuelle au LOD lointain.
Le LOD moyen garde un simple panneau de façade. Les bâtiments industriels,
garages, ruines, édifices religieux et objets historiques identifiés sont exclus
pour éviter de leur attribuer un vocabulaire résidentiel/commercial arbitraire.
Les matériaux/couleurs renseignés dans OSM restent prioritaires ; le style,
les détails et leur disposition sont des estimations déterministes par identifiant.
Les toitures et façades de V3–V6 restent présentes.

Une vitrine avec cadre, panneau vierge et auvent peut être ajoutée aux types
compatibles. Une activité OSM est conservée avec son identifiant et ses tags dans
`businesses`, seulement si sa position est contenue dans l’empreinte. Cette
association ne prouve ni l’entrée ni l’orientation du commerce. En l’absence de
données, quelques immeubles reçoivent une vitrine générique, explicitement
procédurale. Aucun nom, adresse ou identité commerciale inventé n’est affiché.

Les bordures de trottoir comportent un dessus et une face verticale suivant
le terrain. Les indications `sidewalk`, `surface`, `lanes`, `oneway` conservées
dans le complément OSM guident les détails. Sans tag de trottoir, la bordure
reste une estimation graphique. Les axes ponctués sont réservés aux routes
compatibles ayant au moins deux voies renseignées et sans sens unique connu.
Leur phase mondiale ne redémarre pas à une limite de tuile. Les zébras utilisent
uniquement des nœuds de franchissement OSM, hors passages explicitement non
marqués ; largeur, orientation par la route proche et dessin restent estimés.
Ils ne représentent pas une réglementation ou un relevé précis de peinture.
Aucun emplacement de stationnement routier n’est inventé.

Bancs à lattes, poubelles, arceaux vélo, bornes, panneaux d’arrêts et lampadaires
sont des modèles partagés à l’échelle métrique. Les positions OSM sont filtrées
contre les empreintes, l’eau, les espaces interdits et les murs. Quelques lampes
et poteaux de tram sont ajoutés à des positions déterministes estimées, également
filtrées. Le script garde séparément `source: osm` et `source: estimated`.
Ces meubles sont décoratifs : ils ne constituent pas une nouvelle carte de
collisions détaillée du joueur ou une simulation d’accès réglementaire.

Les ampoules émettent un ton chaud selon l’uniforme nocturne du cycle astronomique.
Un halo transparent à décroissance radiale représente approximativement la lumière
sur le sol, avec un matériau transférable reconstruit avec les uniformes vivants.
Aucune PointLight, texture externe, passe d’ombre ou bloom supplémentaire.
Le halo n’est pas un calcul de lumière indirecte sur les façades.

Les arbres OSM gardent leurs positions ; troncs, proportions des houppiers et
palette foliaire varient de façon stable. Quelques buissons stylisés sont placés
sur une grille mondiale dans les espaces verts ouverts, à distance des routes,
hors eau/bâtiments, avec un plafond de 24 par tuile proche. Aucune espèce botanique
n’est revendiquée.

Le lit de voie, les deux rails et le fil de contact simplifié utilisent les
segments réels de tram V6. Les poteaux ajoutés sont des estimations visuelles ;
les marqueurs d’arrêts viennent d’OSM. Les ponts restent rendus par les rails V6,
pas par ce complément au sol. Pas de nouvelle ligne, modification des trajets,
quais inventés ou modèle d’ingénierie complet. Les véhicules V6 sont conservés.

## Préparation reproductible

Même PBF Geofabrik Pays de la Loire que V3–V6 : snapshot du 8 octobre 2026
à 20:21:06 UTC, SHA-256
`93884bcd2092431fce58a0fc824eaf8b3bc661a0df744b8feaf0b7d5b67e1814`.
Préparation du 13 octobre 2026, projection métrique et limite communale existantes.
Les nouveaux assets statiques ne remplacent aucun fichier de bâtiments,
relief ou mobilité. Attribution © OpenStreetMap contributors et ODbL conservées.

```sh
npm run nantes:prepare-streets -- --pbf work/v3/region.osm.pbf --prepared-at 2026-10-13
npm run nantes:test-data
```

Le script refuse un PBF différent du manifeste de ville, ne télécharge rien
implicitement et n’appelle pas Overpass. Pour changer de snapshot, préparer
la ville, le relief et la mobilité avec la procédure existante avant ce complément.
Les 329 tuiles et le manifeste représentent 7 124 942 octets de tuiles supplémentaires.
Téléchargement uniquement avec les tuiles proches, sous `BASE_URL`, puis génération
avec le worker V5C et ses ArrayBuffers transférables. Aucun téléchargement de
ce complément à la vue municipale initiale.

Après exclusions : 7 647 franchissements, 3 222 bancs, 2 171 poubelles,
3 151 parkings vélo, 682 bornes, 666 arrêts de bus, 111 marqueurs de tram,
4 962 lampes (2 974 positions OSM et 1 988 estimations), 1 164 poteaux de tram estimés.
Ce sont des objets de données, pas des effectifs affichés simultanément ni une
preuve d’exhaustivité ; le runtime peut encore refuser une position incompatible.

## Course et sécurité

ZQSD / WASD : **1,8 m/s**. Maintenir **Maj gauche ou droite : 6,5 m/s** ;
relâcher revient progressivement à la marche. Les deux Maj peuvent être maintenues
ensemble. Sur tactile, maintenir **Courir** avec une flèche. Transition exponentielle
de constante 150 ms, intégrée analytiquement, sans accélérer les diagonales.
Aucun tremblement/FOV animé, y compris avec la réduction des animations.

Un dessin simule au maximum **250 ms**, même si plusieurs commandes se sont
accumulées pendant un gel. Le temps excédentaire est ignoré : sur un appareil
très lent, le déplacement est donc volontairement ralenti. Les contrôles
restent actifs avec `prefers-reduced-motion`. Pas de saut après une longue pause.
Les pas horizontaux restent limités à 12 cm et vérifient empreintes, murs,
eau, accès, dénivelé et couverture du disque par les tuiles prêtes. La course
ne franchit pas une frontière non chargée ; la dernière position valide est
conservée. L’anticipation du chargeur passe de 180 à 240 m, avec six tuiles proches
au maximum et les budgets 96/48 Mio existants.

## Budget et cycle de vie

Les détails utilisent au maximum six lots instanciés par tuile avant subdivision
spatiale (volumes, plans, poteaux, ampoules, buissons, halos), et un lot fusionné
pour bordures/marquages/voies. Les ornements n’ont pas d’ombres individuelles.
Les grandes séries suivent le découpage géographique V5C ; pas de reconstruction
statique par image ni de boucle d’animation supplémentaire. Une grille CPU de
32 m évite les recherches contre toutes les empreintes pour chaque détail.
Les buffers participent au budget réel du cache de tuiles et sont libérés avec
les instances, matériaux et shaders au démontage/remplacement.

Les petites géométries de box/cylindre partagées augmentent le détail sans appel
par objet. Le chargement reste progressif et limité au LOD proche pour le mobilier.
Les façades restent stylisées ; certaines portes ou balcons peuvent ne pas
correspondre à la vraie entrée, et les contacts architecturaux complexes ne sont
pas reproduits exactement. Des chevauchements locaux restent possibles ; les
objets mobiliers ne sont pas des obstacles physiques supplémentaires.

## Vérification et mesures

Protocole `scripts/benchmark_streets.py` : build de production, Chromium,
1 440 × 1 100, DPR 1, même date du 21 juin à 14 h puis 1 h, quatre POI dans
le même ordre. V6 de référence : commit `29e3b8b`. Captures aériennes/piétonnes
jour/nuit, puis activité normale, tram et eau actifs pour cinq dessins pendant
la marche. Les sorties restent dans `work/v7`, ignoré par Git.

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4175
python3 src/playgrounds/nantes-3d/scripts/benchmark_streets.py --label mesure
```

La mesure de préparation `geometry` est une durée aller-retour worker incluant
les échanges et attentes ; elle n’est pas le temps CPU. Les buffers sont une
estimation du cache, pas la VRAM ; la mémoire JS principale exclut le worker.
Les compteurs Three peuvent inclure les passes d’ombre lorsqu’elles sont invalidées.
Les vues initiales sont identiques, mais la marche V7 ignore davantage de temps
sur GPU lent : les images parcourues ne représentent pas des positions finales
strictement identiques. Un passage par version, sans moyenne statistique.

### Résultats mesurés — GPU logiciel uniquement

Chromium utilise **ANGLE/Vulkan SwiftShader**, pas un GPU matériel. La référence
V6 et V7 utilisent un contexte neuf et le même cache HTTP normal ; le cache
applicatif des tuiles reste actif. Le protocole reprend les scènes/profilage V5C,
mais n’est pas une répétition identique de son ancien passage avec cache HTTP
explicitement désactivé. Ces chiffres ne prouvent pas une fluidité sur GPU réel.

| Quartier | Intervalle médian de marche V6 → V7 | Appels au départ piéton V6 → V7 | Triangles au départ V6 → V7 |
| --- | ---: | ---: | ---: |
| Bouffay | 2.559 → 2.951 s | 150 → 193 | 748,109 → 951,229 |
| Commerce | 2.699 → 2.968 s | 228 → 289 | 925,870 → 1,198,070 |
| Chantenay | 1.798 → 1.938 s | 117 → 161 | 546,536 → 724,544 |
| Île de Nantes | 0.684 → 0.622 s | 38 → 55 | 346,760 → 376,204 |

L’activité normale, les tramways et l’eau sont actifs pendant les intervalles.
Les compteurs de géométrie proviennent du départ, avant cette animation : ils
ne décrivent pas exactement la dernière image du déplacement. Le surcoût
mesuré est d’environ +15 % à Bouffay, +10 % à Commerce, +8 % à Chantenay ; le
court passage de l’île baisse de 9 %, sans preuve d’un gain général. Les résultats
restent très lents sur ce GPU logiciel. Le changement de plafond de simulation
modifie la distance réellement parcourue sous cette cadence ; pas de comparaison
FPS à position finale identique, ni d’affirmation d’amélioration de fluidité.

| Quartier | Chargement du quartier V6 → V7 | Préparation aller-retour cumulée V6 → V7 | Buffers cache piéton V6 → V7 | Mémoire JS principale V6 → V7 |
| --- | ---: | ---: | ---: | ---: |
| Bouffay | 17.90 → 19.93 s | 5.10 → 6.58 s | 59.4 → 65.9 Mio | 105.1 → 111.8 Mio |
| Commerce | 53.17 → 64.65 s | 15.53 → 14.70 s | 96.0 → 94.8 Mio | 146.8 → 154.1 Mio |
| Chantenay | 33.59 → 42.91 s | 9.70 → 13.65 s | 87.3 → 92.5 Mio | 162.3 → 154.5 Mio |
| Île de Nantes | 24.94 → 32.41 s | 4.87 → 9.68 s | 90.4 → 89.7 Mio | 150.2 → 143.3 Mio |

Vue générale prête : **1.51 → 1.71 s**. Les chargements incluent
les attentes du protocole et le pilote logiciel ; aucun nouveau fichier de rue
n’est demandé à ce stade initial. CPU worker V7 cumulé sur les passages :
Bouffay 2132 ms, Commerce 1483 ms, Chantenay 1736 ms, Île de Nantes 1262 ms.

La référence V6 n’a pas conservé ce compteur CPU dans ce nouveau script : seule
la durée aller-retour est comparable ici. Les budgets de cache 96/48 Mio restent
inchangés ; évictions et ordre de chargement influencent le contenu conservé.
La mémoire JS est une lecture ponctuelle dépendant du GC, excluant worker et
pilote. Durée GPU et VRAM effectives non mesurées. Le module Nantes passe de
729,93 à 740,48 ko minifiés (193,17 → 197,28 ko gzip), le worker de 207,81 à
217,84 ko. L’avertissement Vite existant > 500 ko demeure.

Les mesures ci-dessus précèdent trois petites corrections finales : sens gauche/
droite des trottoirs, pied de bordure à 8 cm et exclusion conservatrice des
marquages sur les niveaux/ponts non pris en charge. Elles ont été validées par
les tests, le build et le contrôle final en navigateur ; le passage chronométré
complet n’a pas été répété après ces corrections locales.

### Contrôles réellement effectués

`npm ci`, `npm run typecheck`, `npm test` (**130 tests, 12 fichiers**),
`npm run nantes:test-data` (**27 tests Python**) et `npm run build` réussis.
Les tests ajoutés couvrent déterminisme, LOD, validité des matrices/géométries,
exclusions géographiques, côtés de trottoirs, phase entre tuiles, transfert worker,
uniformes nocturnes, ressources, vitesse/transitions/diagonales, gels, parois
minces, eau et données non chargées. Les suites V5C/V6 et navigation restent actives.
Les 330 assets de rue sont reproduits octet par octet depuis le même PBF ; les
1 958 JSON publics sont présents et identiques dans `dist/nantes`.

32 captures comparatives V6/V7 : Bouffay, Commerce, Chantenay et île de Nantes,
aérien/piéton, jour/nuit, inspectées réellement. Portes, volets, appuis et balcons
visibles à Bouffay ; bordures et traversées à Chantenay ; mobilier et végétation
sur l’île. La conservation des volumes industriels volontairement sobres n’est
pas une perte de détail. Les captures ont permis de corriger l’emplacement des
portes sur les faces visibles et de relever les houppiers trop bas.
Aucun trou ou objet majeur flottant constaté dans ces cadrages ; pas de contrôle
exhaustif des 329 tuiles. Les erreurs de groupes vides au LOD lointain ont été
corrigées ; le passage V7 final complet n’a ni erreur applicative/shader ni asset
HTTP manquant. La référence V6 a uniquement signalé le favicon absent du serveur
local, exclu explicitement du script corrigé.

Des contrôles supplémentaires en production locale vérifient un lampadaire OSM
près de Commerce (`node/11167515393`) et son halo nocturne, une vitrine/auvent
du bâtiment `way/41898497` (activités OSM associées, panneau sans identité),
les deux Maj maintenues/relâchées ensemble,
la carte et l’inspection, la coexistence eau/voitures/activité/soleil, puis fermeture
pendant chargement. Mobile simulé 390 × 844, tactile et animations réduites :
commande Courir, navigation et mise en page sans débordement. Après fermeture :
zéro canvas, worker et callback rAF Nantes, API de profil supprimée.
Pas de validation sur Safari, téléphone réel ni GPU matériel.
