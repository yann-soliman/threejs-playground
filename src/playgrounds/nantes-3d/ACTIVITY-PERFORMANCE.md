# Nantes 3D — validation et coût de l’activité V6

## Conditions de mesure

13 octobre 2026, comparaison avec V5C `de6a45c`, build de production,
Chromium headless, 1 440 × 1 100, DPR 1, GPU logiciel ANGLE/SwiftShader.
Le même navigateur et les mêmes cadrages Bouffay/Commerce sont utilisés à
14 h le 21 juin. Voitures arrêtées, lecture solaire arrêtée, eau animée dans
tous les cas de mesure pour conserver une cadence continue même sans agents.
Les contexts de navigateur sont neufs ; géométrie/tuiles stabilisées avant mesure.
Les options faible/normale et tram sont comparées successivement dans V6.

Le protocole suit V5C : événements `performance.now()`, `renderer.info`,
intervalles entre dessins réels et mémoire principale lorsqu’exposée.
Le script `scripts/benchmark_activity.py` conserve JSON/captures sous `work/`.
Il attend l’apparition progressive, observe huit dessins et calcule sept
intervalles. Les valeurs de référence V5C sont normalisées aux sept premiers
intervalles enregistrés. Un passage isolé par configuration : pas de moyenne
statistique ni de résultat garanti sur téléphone.

Un essai concurrent avec un ancien navigateur resté actif a été écarté.
Les chiffres ci-dessous proviennent du passage final avec un seul navigateur
actif. Des variations importantes restent possibles sur le GPU logiciel.
La soumission JavaScript du renderer n’est pas une durée GPU ; l’extension
WebGL de chronométrage GPU est indisponible. FPS approximatives = inverse de
l’intervalle médian ; ni budget mémoire CPU total ni VRAM réelle mesurés.

## Géométrie et mémoire

V6 conserve les lots géographiques V5C, le worker unique, les empreintes,
le relief, les LOD et les budgets de cache. Quand l’activité est désactivée,
les compteurs de la scène restent ceux de V5C. Aucun asset de mobilité n’est
chargé à la vue municipale, même avec le réglage initial faible/tram activé.
Les modèles sont créés à la première apparition, puis réutilisés. La désactivation
masque immédiatement les lots ; leur petite allocation bornée est conservée
jusqu’à la fermeture pour permettre une réactivation sans reconstruction.

Un lot instancié de passants, un de cyclistes, un de sections de tram et un
lot statique de rails : au plus quatre lots de dessin supplémentaires, sans
casting d’ombre. Les compteurs `renderer.info` du dernier dessin peuvent aussi
inclure les ombres lorsqu’elles sont recalculées ; ici, les cadres statiques
et l’heure fixe permettent la comparaison de dessins stabilisés.
Les buffers agents estimés comprennent attributs, indices, matrices et couleurs,
sans pilote GPU. Les chemins chargés sont bornés aux tuiles proches actives et
libérés à leur retrait. Les ressources globales de tram restent locales au
playground et sont libérées à sa fermeture.

Le module Nantes/Three passe de 708,33 à 729,93 ko minifiés,
185,89 à 193,17 ko gzip (+7,28 ko gzip). Le worker de géométrie reste identique
à V5C (207,81 ko). Le build conserve son avertissement de module > 500 ko.
Aucune nouvelle dépendance de production ni de modèle téléchargé.

## Comparaison V5C / V6

Intervalle médian entre images (plus bas est meilleur) et cadence dérivée :

| Scène et réglage | V5C sans activité | V6 | Cadence médiane dérivée V6 |
| --- | ---: | ---: | ---: |
| Bouffay — désactivée | 1.76 s | 2.13 s | 0.47 image/s |
| Bouffay — faible | 1.76 s | 2.27 s | 0.44 image/s |
| Bouffay — normale | 1.76 s | 2.39 s | 0.42 image/s |
| Bouffay — normale + tramways | 1.76 s | 2.32 s | 0.43 image/s |
| Commerce — désactivée | 3.02 s | 3.09 s | 0.32 image/s |
| Commerce — faible | 3.02 s | 3.06 s | 0.33 image/s |
| Commerce — normale | 3.02 s | 3.10 s | 0.32 image/s |
| Commerce — normale + tramways | 3.02 s | 3.11 s | 0.32 image/s |

Les différences entre passages sans activité (1,76 → 2,13 s à Bouffay,
3,02 → 3,09 s à Commerce) montrent la variabilité de cet environnement.
Aucun gain de FPS n’est revendiqué. Dans le même passage V6, la densité normale
avec tram ajoute environ 9 % à Bouffay et 1 % à Commerce par rapport au cas
sans activité. Le niveau faible reste la valeur initiale. Ces cadences restent
très lentes sur SwiftShader ; elles ne représentent pas un GPU physique.
Les dernières corrections concernent le sens cyclable prioritaire, la cadence
des rayons, l’absence d’apparition à moins de 8 m de la caméra piétonne et le
filtrage des arrêts explicitement tram : elles conservent les budgets et lots.

| Scène/réglage V6 | Passants / vélos / trams visibles | Appels totaux | Triangles | Buffers agents estimés | Médiane CPU de mise à jour |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bouffay désactivée | 0 / 0 / 0 | 152 | 831,265 | 0.000 Mio | aucune |
| Bouffay faible | 30 / 8 / 0 | 154 | 843,267 | 0.086 Mio | 0.40 ms |
| Bouffay normale | 99 / 25 / 0 | 154 | 870,005 | 0.086 Mio | 0.70 ms |
| Bouffay normale + tram | 100 / 25 / 4 | 156 | 876,432 | 0.297 Mio | 0.60 ms |
| Commerce désactivée | 0 / 0 / 0 | 363 | 1,208,487 | 0.333 Mio | aucune |
| Commerce faible | 30 / 8 / 0 | 365 | 1,220,489 | 0.333 Mio | 0.20 ms |
| Commerce normale | 100 / 25 / 0 | 365 | 1,247,462 | 0.333 Mio | 0.50 ms |
| Commerce normale + tram | 100 / 24 / 4 | 367 | 1,253,563 | 0.333 Mio | 0.70 ms |

Sans activité, les compteurs V5C et V6 sont exactement 152 appels / 831 265
triangles à Bouffay et 363 / 1 208 487 à Commerce dans ces cadrages stabilisés.
Avec tous les agents, les triangles augmentent d’environ 5,4 % et 3,7 %.
Chaque catégorie mobile ajoute un lot ; les rails en ajoutent un.
Les durées GPU séparées par catégorie sont indisponibles. Les nouvelles mesures
CPU concernent la mise à jour totale ; les pics de sélection observés vont jusqu’à
13,8 ms. Aucun squelette, collision globale de foule ou géométrie statique
reconstruite à chaque image.

Les buffers de cache géographique restent 59,4 Mio à Bouffay et 75,1 Mio à
Commerce dans toutes les configurations. Les buffers agents ajoutent environ
0,09 Mio pour personnes/vélos et 0,30–0,34 Mio avec tram/rails. Ils sont libérés à
la fermeture. Le tas JavaScript principal mesuré à Bouffay va de 103,3 à 110,1 Mio
au fil de ce passage V6 ; cette mesure inclut parsing/caches/GC et exclut le worker.
La mesure de tas comparable V5C dans ce protocole est indisponible.

## Contrôles réalisés

Installation propre, typage strict, build de production, **119 tests Vitest** et
**25 tests Python** réussis. Les tests nouveaux couvrent restrictions par mode,
polylignes/curves/orientation, phases et articulation, sens cyclable, budgets,
relief, duplication aux frontières, requêtes périmées, arrêt au quai/extrémité,
rails soutenus, directions OSM et cleanup. Les 308 assets de mobilité ont été
reproduits octet par octet depuis le même PBF et la même date de préparation.
Tous les fichiers statiques ont été comparés à leur copie dans `dist/`.

Navigateur Chromium réel automatisé : Commerce, île de Nantes, Chantenay et
Bouffay ; jour et nuit ; vue aérienne et mode piéton ; écran 1 440 × 1 100 et
mobile simulé 390 × 844 avec/sans réduction des animations. Les effectifs restent
bornés à 100/25/4 sur ordinateur et 40/10/2 sur mobile. Avec animations réduites,
les trois catégories et leurs lots sont absents. Inspection devant soi et
mini-carte restent utilisables ; aucun débordement horizontal observé.

Mouvement visible vérifié par **images rendues**, pas uniquement un timer :
6 563 pixels changés dans la scène de rue entre deux captures avec eau,
voitures et lecture solaire arrêtées ; passant et cycliste identifiables dans
les captures inspectées. En tram seul à Commerce, positions et images évoluent
(144 pixels changés entre deux captures aériennes). Captures jour/nuit, rue et
mobile réellement inspectées. Ces contrôles ne couvrent pas visuellement chaque
tuile ni chaque paire de trajectoires.

Coexistence eau, voitures, agents et lecture solaire : une seule chaîne rAF.
Après fermeture de chaque contexte : aucun canvas, worker ou callback Nantes
restant, API de profil supprimée. Aucun pageerror, erreur de shader ou asset
HTTP manquant dans ces parcours. Les tests unitaires vérifient aussi la libération
des géométries/matériaux des agents et le rejet des données périmées.

## Limites

Pas de GPU physique, Safari ou téléphone réel testés. Les cadences logicielles
restent lentes et ne permettent pas d’affirmer une fluidité sur matériel réel.
Les chemins sont conservateurs et peuvent manquer là où OSM ne représente pas
les accès ; les décalages de bord de rue sont estimés. Les règles conditionnelles,
priorités aux carrefours, obstacles non cartographiés et foule dense ne sont
pas simulés ; chevauchements ponctuels possibles. Le mouvement est plafonné à
250 ms par dessin sur GPU lent pour éviter les grands sauts.

Les tronçons de tram non connectés et embranchements restent des extrémités,
sans choix de branche inventé. Les rames s’y arrêtent ; aucun service continu ni
horaire réel. Arrêts associés par proximité, tabliers ferroviaires estimés,
modèles de véhicule interprétés ; pas de dynamique physique des articulations.
Les rails et véhicules disparaissent lorsque leur terrain n’est pas disponible.

Contrôle complémentaire du dernier build : contact au sol inspecté en vue de rue,
population à 01:00 vérifiée à 12 passants / 2 cyclistes / 0 tramway dans le cadrage,
et fermeture pendant le chargement de Doulon réussie (aucun canvas, worker,
callback ou API de profil restant).
