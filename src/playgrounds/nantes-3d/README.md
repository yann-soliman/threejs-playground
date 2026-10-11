# Nantes 3D — V4A

Diorama interactif de **toute la commune de Nantes**, dans l’architecture existante
`mount(container): Cleanup`. Three.js, TypeScript strict, HTML/CSS natifs et fichiers
statiques ; aucun backend, clé ou appel géographique depuis le navigateur.
Lien : `#/playgrounds/nantes-3d`.

## Couverture et provenance

- Commune **Nantes, INSEE 44109**, et non Nantes Métropole. Emprise WGS84 :
  sud 47.180628, ouest −1.641774, nord 47.295839, est −1.478895.
- Contour communal obtenu le **11 octobre 2026** auprès de l’[API Découpage
  administratif](https://geo.api.gouv.fr/decoupage-administratif), endpoint
  [commune 44109, géométrie contour](https://geo.api.gouv.fr/communes/44109?format=geojson&geometry=contour).
  Le GeoJSON original est versionné dans `data/municipality.geojson` ; son code,
  sa validité topologique, sa superficie et son SHA-256 sont vérifiés. Les objets
  sont intersectés avec ce contour, y compris dans la Loire et l’Erdre. Le rectangle
  englobant ne sert qu’aux index et à la caméra. Le référentiel communal de cette
  réponse est utilisé tel quel ; aucune date d’édition du contour n’est inventée.
- Extrait régional [Geofabrik Pays de la Loire](https://download.geofabrik.de/europe/france/pays-de-la-loire.html),
  téléchargé le **11 octobre 2026**, état OSM **2026-10-08T20:21:06Z**, SHA-256
  `93884bcd2092431fce58a0fc824eaf8b3bc661a0df744b8feaf0b7d5b67e1814`.
  Le PBF brut de 356 Mio reste dans `work/` et n’est jamais versionné ni déployé.
- **79 939 empreintes**, 35 783 portions de rues/chemins, 3 948 surfaces,
  1 708 portions de murs/remparts et 17 182 arbres OSM. Aucun contour invalide
  signalé par l’extracteur. Une empreinte coupée en plusieurs polygones reçoit
  des suffixes ; ces compteurs décrivent les géométries produites, pas les adresses.
- **329 tuiles de 500 × 500 m**, trois fichiers par tuile. La superficie projetée
  est d’environ **65,6 km²** ; ce calcul graphique n’est pas une superficie cadastrale.
- Environ **69,6 Mo** de données déployées : 67,5 Mo de tuiles, 2,0 Mo de vue générale
  et le manifeste. Les tuiles ne sont pas toutes téléchargées au démarrage.

**© OpenStreetMap contributors** — [attribution](https://www.openstreetmap.org/copyright)
et [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), visibles dans la scène.
La limite administrative est une donnée publique de l’API Découpage administratif
([Licence ouverte](https://www.etalab.gouv.fr/licence-ouverte-open-licence/)).
Les identifiants et attributs OSM utiles sont conservés.

## Préparation et actualisation

Python 3.12+, libosmium via `osmium`, Shapely : dépendances **de préparation**, sans
ajout au navigateur. Les versions sont fixées dans `scripts/requirements.txt`.

```sh
python3 -m venv work/nantes-python
work/nantes-python/bin/pip install -r src/playgrounds/nantes-3d/scripts/requirements.txt

# Téléchargement explicite de l’extrait régional et du contour, puis préparation.
work/nantes-python/bin/python -B src/playgrounds/nantes-3d/scripts/prepare_city.py --download

# Régénération locale, à partir du même PBF et du contour versionné.
work/nantes-python/bin/python -B src/playgrounds/nantes-3d/scripts/prepare_city.py

# Autres chemins d’entrée/sortie ; aucun téléchargement implicite.
work/nantes-python/bin/python -B src/playgrounds/nantes-3d/scripts/prepare_city.py \
  --pbf work/v3/region.osm.pbf --boundary src/playgrounds/nantes-3d/data/municipality.geojson \
  --output work/nantes-verification

# Si les dépendances Python sont installées dans l’environnement courant :
npm run nantes:prepare
npm run nantes:test-data
```

Le traitement lit le PBF régional en flux, assemble les multipolygones avec
libosmium, évite les ways membres déjà représentés par une relation, répare les
polygones lorsque nécessaire et découpe lignes/surfaces/bâtiments au contour
communal avec Shapely. Les attributs estimés ne sont jamais écrits comme tags OSM.
La date du manifeste est celle de la réplication OSM : à source et versions
identiques, une régénération produit les mêmes octets, quel que soit le jour de
préparation. La date du téléchargement est consignée ci-dessus pour cette version.

Après actualisation : vérifier la commune, les compteurs, le SHA-256, les éventuelles
exclusions, la couverture et le rendu ; mettre à jour les dates/chiffres de cette
page. Versionner **tous** les fichiers utiles sous `public/nantes/` et le contour.
Retirer les fichiers de tuiles devenus obsolètes lors d’un changement de couverture.
Ne pas versionner le PBF, l’environnement Python, les caches ou les captures.
Un rafraîchissement demande plusieurs minutes et environ 1 Gio de mémoire ici.
Le téléchargement régional est explicite, sans retries ni requête Overpass massive ;
respecter les [conditions Geofabrik](https://download.geofabrik.de/).

L’ancienne extraction V1/V2 de 846 × 801 m reste comme fixture de régression dans
`data/city.json` / `data/osm-snapshot.json.gz`. `npm run nantes:prepare-legacy` la
régénère hors réseau. Ces fichiers ne sont plus importés par l’application et ne
font pas partie des assets de production.

## Format, projection et frontières

`public/nantes/manifest.json` décrit le contour, l’origine, les limites métriques,
la provenance, les compteurs et chaque tuile : coordonnées entières `x/z`, `bounds`,
`contentBounds`, URLs et octets par niveau. `tiles/<x>_<z>.<near|medium|far>.json`
contient les mêmes collections typées que la V2. Les URLs sont préfixées par
`import.meta.env.BASE_URL`, donc fonctionnent sous `/threejs-playground/nantes/`.
Vite copie les fichiers publics lors du build ; aucun fichier de `work/` n’est requis.

Tous les fichiers utilisent la **même projection équirectangulaire locale** en
mètres, origine WGS84 `[47.2156, -1.5524]`, rayon 6 371 008,8 m, X vers l’est et Z
vers le sud. Cette origine conserve les ancrages V2. La distorsion horizontale
reste inférieure à environ 0,2 % sur cette emprise ; ce modèle plat ne constitue
pas un relevé géodésique. Aucun recentrage indépendant des tuiles.

Un bâtiment complet appartient à la tuile contenant un point intérieur de son
empreinte : il n’est ni répliqué ni coupé aux frontières de la grille. Les
`contentBounds` comprennent son éventuel dépassement. Les surfaces et axes de rues
sont coupés aux limites de la grille, avec conservation des identifiants sources
et suffixes de fragments. Les intersections utilisent les mêmes lignes exactes,
avec arrondi au centimètre pour les assets. Les arbres ont un propriétaire unique.
La plateforme épouse le contour réel ; il n’existe pas de socle rectangulaire par tuile.

Le générateur `generate(data, boundary, output, meta)` accepte d’autres contours et
est testé avec une limite concave et un trou. Pour une autre commune, adapter le
code INSEE, la source régionale, l’origine commune et les contrôles de superficie de
la CLI, puis régénérer manifeste, vue générale et tuiles ensemble. Adapter aussi
les destinations et l’attribution ; ne jamais mélanger deux origines.

## Chargement et niveaux de détail

Au démarrage : manifeste et **vue générale agrégée** de 4 970 cellules urbaines,
avec rues majeures, parcs et eau. Aucune empreinte individuelle n’est téléchargée.
Ces volumes de présentation représentent la densité bâtie sur une grille de 100 m,
avec hauteur moyenne interprétée ; ce ne sont pas des bâtiments réels.

`tiles.ts` sélectionne les tuiles intersectant le frustum et proches de la cible,
avec priorité aux destinations. Limites : **16 actives sur ordinateur, 10 en portrait,
4 tuiles proches au maximum**, 3 requêtes simultanées et génération séquentielle.
Les requêtes obsolètes sont annulées ; les réponses tardives ne montent aucun objet.
La génération laisse une tâche navigateur entre les lots de 500 m. Une tuile dense
peut néanmoins bloquer brièvement le thread principal pendant son propre traitement.

- **Proche** : distance caméra/centre < 900 m ; empreintes, toits procéduraux,
  fenêtres/cadres, bandeaux, murs, troncs et feuillage détaillés.
- **Moyen** : < 2 400 m ; contours simplifiés à 35 cm, toits, pas de fenêtres ni
  bandeaux, un arbre sur trois et feuillage moins subdivisé.
- **Lointain** : contours simplifiés à 1,2 m, toits plats, axes majeurs et surfaces,
  pas d’arbres ni de murs. Au-dessus de 6 500 m, la vue générale agrégée suffit.
- Hystérésis de 15 % pour éviter les oscillations aux seuils. La destination peut
  demander le niveau proche avant l’arrivée. L’ancien niveau reste affiché jusqu’à
  disponibilité du nouveau, puis est retiré et détruit ; aucune superposition de
  deux niveaux détaillés. Pas de fondu géométrique : un changement demeure perceptible.

`overview.ts` utilise un petit masque de texture par case pour retirer localement
la vue générale lorsqu’une tuile la remplace, sans multiplier les draw calls.
Corps/toits/surfaces/rues/murs sont regroupés ; fenêtres et végétation instanciées.
Le cache est limité à **24 modèles** et **96 Mio de buffers sur ordinateur, 48 Mio
sur mobile portrait**. LRU pour les visites récentes ; retrait des anciennes
résolutions et des tuiles moins prioritaires si nécessaire. Une tuile trop lourde
laisse apparaître la représentation générale. Ces chiffres estiment les buffers,
sans mesurer exactement la mémoire du pilote, les matériaux ou les textures GPU.

## Navigation et présentation

OrbitControls, pan, zoom, clavier flèches/+/−/R/N, boussole cliquable et liens OSM
sont conservés. Le nord garde cible, distance et inclinaison. Transitions de
1,4 seconde, chemin angulaire court, annulables par geste ou nouvelle destination ;
immédiates avec `prefers-reduced-motion`. Le reset cadre la commune entière.

Les quatre monuments V2 conservent leurs coordonnées ; cinq cadrages supplémentaires :
Commerce, Parc des Chantiers, Butte Sainte-Anne, Grand-Blottereau et parc de l’Amande.
Commerce et les deux parcs sont ancrés dans les géométries OSM municipales
`relation/4764728`, `way/27532467`, `way/399064135`. Île/Chantenay sont des points
représentatifs de cadrage vérifiables par les liens OSM. Hauteur du repère et distance
restent des choix graphiques. Un seul repère HTML projeté, sans test d’occlusion.

Palette V2, soleil astronomique, lumière hémisphérique variable, toits et façades
variés, brouillard adapté à la distance et à l’heure. Hauteur OSM ou niveaux × 3,15 m ; sinon estimation déterministe,
avec interprétation spécifique des monuments. Les fenêtres et formes de toit
restent procédurales ; les couleurs/matériaux OSM sont utilisés lorsqu’ils existent.

Ombres locales sur une zone de 1 240 m, recentrée avec la navigation ; désactivées
au-delà de 2 400 m et quand le soleil est trop bas. Elles sont recalculées aux
changements utiles, sans couvrir la commune entière. Un ordonnanceur commun
regroupe les mises à jour ; les simples mises à jour du statut ne redessinent pas
la scène. Sans lecture, eau animée ni transition, le rendu revient au repos. Le diagnostic repliable affiche tuiles, requêtes,
LOD, appels de dessin, triangles et estimation des buffers via le renderer.
La cadence affichée est instantanée pendant une transition, pas un benchmark moyen.

À la fermeture : annulation fetch/timers/transitions, contrôles/écouteurs/observateur
retirés, modèles/cache/instances/matériaux/géométries/masque/ombres/contextes libérés.

## Date, soleil et nuit

Le panneau propose la date (2000–2099), un curseur de 00:00 à 23:59, **Maintenant**,
lecture/pause et trois vitesses : 1, 10 ou 60 minutes simulées par seconde réelle.
Au montage, la date et l’heure sont celles de l’instant courant à Nantes. Modifier
la date ou l’heure met la lecture en pause et actualise l’éclairage sans reconstruire
les bâtiments. Lever et coucher calculés sont affichés pour la date sélectionnée.

`time.ts` utilise `Intl.DateTimeFormat` et le fuseau **Europe/Paris**, indépendamment
du fuseau du navigateur. Les décalages sont déterminés pour la date choisie, pas
fixés à UTC+1. Au printemps, une heure inexistante est reportée à 03:00 ; en automne,
la première occurrence de l’heure répétée est sélectionnée. Le panneau l’indique.
La lecture avance des instants UTC : elle traverse naturellement les deux bascules.

`solar.ts` implémente les [équations NOAA](https://gml.noaa.gov/grad/solcalc/calcdetails.html)
(jour julien, longitude apparente, obliquité, déclinaison et équation du temps),
sans dépendance ajoutée. Position pour 47,2156° N / −1,5524° E : azimut mesuré depuis
le nord dans le sens horaire, hauteur géométrique ; conversion en **X est, Y haut,
Z sud**. Le lever/coucher utilise −0,833° (disque et réfraction standard), le crépuscule
civil −6°. Le relief et les conditions atmosphériques locales ne sont pas calculés.

`lighting.ts` fait varier soleil, ciel, brouillard, lumière hémisphérique et exposition
avec des transitions continues. Soleil chaud et ombres longues à faible hauteur,
lumière naturelle à midi, ambiance bleue la nuit avec éclairage ambiant de lisibilité.
Le soleil direct est nul sous l’horizon. Les ombres conservent une emprise locale
±620 m, tournée selon le soleil ; désactivées au-delà de 2 400 m ou sous 0,5° pour
limiter les artefacts rasants. En lecture, mise à jour au plus toutes les 500 ms,
si la direction a changé de plus de 0,5° ; un choix manuel, une nouvelle tuile ou
un recentrage utile force la mise à jour. Le soleil lui-même continue son trajet.

Les fenêtres du LOD proche réutilisent les instances V3. Un attribut de trois
flottants par fenêtre porte une teinte emissive déterministe : environ **21 %**
allumées, trois teintes chaudes, majorité sombre. L’uniforme de nuit module leur
émission au crépuscule sans modification des buffers ni PointLights. Les LOD
moyen/lointain restent sans fenêtres individuelles. Aucun bloom coûteux.

## Eau et ordonnanceur

`atmosphere.ts` fournit les uniformes communs et les matériaux de fenêtre et d’eau.
L’eau est un lot distinct des parcs/places, soit un appel de dessin supplémentaire
pour chaque modèle qui contient de l’eau. Deux ondulations sinusoïdales modulent
légèrement couleur et normale : reflets doux, **pas de déplacement vertical**,
pas de réflexion du reste de la scène. Coordonnées mondiales et horloge uniques
pour toutes les tuiles et LOD. Les nouveaux modèles rejoignent la phase courante ;
le shader reste combiné au masque de remplacement de la vue générale.

**Animer l’eau** permet de revenir à une scène immobile. Par défaut elle s’anime
aux cadrages situés à moins de 6 500 m de la cible ; la vue municipale éloignée reste
statique. Couleur plus claire le jour, reflet chaud près du coucher, eau sombre la nuit.

`animation.ts` centralise le seul rAF natif, les callbacks de CameraNavigator,
la progression du temps et l’horloge de l’eau. Cadences maximales : **24 images/s pour la caméra, 12 pour la lecture et 8 pour
l’eau seule**, avec un intervalle libre après chaque dessin et delta réel entre images ; les limites matérielles peuvent donner beaucoup moins.
Une frame très tardive allonge le prochain intervalle libre (jusqu’à 3 s) pour
laisser respirer les GPU lents ; cela peut rendre l’animation saccadée en rendu logiciel.
Les invalidations caméra/temps/tuiles sont regroupées dans cette même frame.
Un simple compteur de requêtes ne demande aucun dessin. Les métriques de rendu
ne sont actualisées que si le panneau de diagnostic est ouvert.

`visibilitychange` et IntersectionObserver arrêtent l’ordonnanceur lorsque l’onglet
est masqué ou le viewport hors écran. La lecture et les transitions sont interrompues ;
l’eau reprend à sa phase conservée, sans rattrapage du temps masqué. Avec
`prefers-reduced-motion`, eau figée, lecture désactivée et caméra immédiate ; les
changements manuels d’heure restent disponibles. La préférence est suivie à chaud.
À la fermeture : annulation du rAF, callbacks/timers/fetch, retrait de tous les
écouteurs/observateurs et destruction des matériaux d’eau, fenêtres et autres
ressources V3. Les 989 fichiers géographiques V3 sont inchangés.

## Validation V4A

Installation propre (`npm ci`), TypeScript, **67 tests Vitest**, **10 tests Python**
et build de production vérifiés. Cas ciblés : exemple solaire NREL SPA, horaires
saisonniers Nantes, points cardinaux, crépuscule, Paris et les deux changements
d’heure, partage caméra/ordonnanceur, arrêt/retard/réveil, fenêtre déterministe,
uniformes partagés, masque de vue générale et destruction des matériaux.
Les 989 assets V3 sont copiés à l’identique dans le build ; aucune donnée ajoutée.

Chromium headless avec GPU logiciel : ordinateur 1 440 × 1 100, mobile simulé
390 × 844 avec fuseau America/New_York et réduction des animations. Scènes de
7 h, 14 h, 22 h et minuit testées ; captures de midi et de nuit inspectées. Curseur,
lecture/pause, phases d’eau dans le shader WebGL, navigation pendant animation,
masquage, changements d’heure, fermeture pendant chargement et remontage passent.
Aucun asset manquant ni erreur applicative ou débordement horizontal observé.
Au plus un rAF applicatif en attente ; aucun après fermeture ou au repos sans eau/lecture.

Au château, la séquence logicielle d’eau mesurée a présenté des intervalles de
**3,3 à 3,9 s** entre les dessins : ce n’est pas un benchmark GPU physique et
l’animation reste très saccadée dans cet environnement. Le délai adaptatif rétablit
les interactions. Le module Nantes passe de 624,7 à environ **637,6 ko** minifiés
(de 161,2 à **165,6 ko gzip**), sans dépendance runtime supplémentaire.
L’avertissement Vite de plus de 500 ko reste présent ; le module est chargé à la demande.

Limites V4A : météo, relief et lune non pris en compte dans le calcul lumineux ;
ambiance et fenêtres interprétées ; fenêtres proches seulement ; ombres rasantes
coupées à 0,5° et actualisées par pas en lecture ; eau sans réflexion de scène ni
simulation hydrodynamique. Les cadres détaillés restent coûteux sur GPU logiciel.
Pas de mesures sur GPU physique, Safari ou téléphone réel.

## Validation V3 et limites géographiques

```sh
npm ci
npm run typecheck
npm test
npm run nantes:test-data
npm run build
npm run preview
```

La CI installe les dépendances Python et contrôle les assets avant déploiement.
Tests : tous les corps/toits municipaux finis, coordonnées communes, fichiers/tailles
et niveaux présents, identifiants uniques, frontières, couverture du contour,
traitement déterministe, priorités/frustum, annulations, réponses périmées,
remplacement de LOD, budget/cache/disposal, fermeture pendant chargement, caméra
municipale et régressions V2. La reproduction complète depuis le même PBF est
également comparée octet par octet aux fichiers versionnés.

Validation V3 du 11 octobre 2026 : installation propre, TypeScript et build réussis,
**46 tests Vitest et 10 tests Python** réussis ; les 989 assets sont présents sous
le préfixe GitHub Pages et identiques à la régénération. Le build conserve un
avertissement Vite pour le module Three.js/Nantes de plus de 500 ko, chargé à la demande.

Le build de production a été testé avec Chromium headless et **GPU logiciel** :
ordinateur 1 440 × 1 000, mobile simulé 390 × 844, réduction des animations.
Captures de la vue générale et du château inspectées ; cinq quartiers parcourus,
navigation rapide, interruption clavier, boussole, fermeture pendant chargement
et remontage vérifiés. Aucun appel géographique externe, asset Nantes manquant,
erreur JavaScript applicative ou débordement horizontal observé. Au repos,
aucun dessin WebGL continu ni rAF Nantes restant ; au plus une chaîne rAF en mouvement.

Mesures du dernier passage, incluant une attente de stabilité de 1,05 s et le rendu
logiciel, sans prétendre mesurer les performances d’un GPU physique :

| Mesure | Ordinateur | Mobile simulé |
| --- | ---: | ---: |
| Vue générale prête puis au repos | 3,21 s | 2,49 s |
| Sélection du château → repos | 15,95 s | 9,84 s |
| Sélection de Nantes Nord → repos | 13,77 s | 10,36 s |
| Plus longue tâche navigateur observée | 3,51 s | 2,48 s |
| Intervalle médian des rAF suivis, hors pauses > 1 s | 400 ms | 217 ms |
| Tuiles actives au château / à Nantes Nord | 7 / 16 | 4 / 10 |
| Buffers estimés au château / à Nantes Nord | 55,0 / 83,3 Mio | 46,7 / 35,7 Mio |

Aucune tuile détaillée téléchargée à la vue municipale initiale. Le diagnostic
au château indiquait 99 appels et 1,48 million de triangles sur ordinateur,
64 appels et 1,29 million sur mobile (ombres incluses dans ce dessin). Les mesures
varient selon le cadrage, le cache et les ombres ; l’estimation des buffers exclut
le pilote, les textures et les autres allocations. Les pauses restent importantes
sur ce GPU logiciel ; la génération synchrone des tuiles denses est une limite V3.


Limites : terrain plat ; relief, ponts, tunnels et niveaux superposés non reconstruits ;
hauteurs largement estimées ; monuments interprétés ; formes de toit approchées ;
jonctions de chaussées estimées ; limites de tuiles parfois perceptibles au changement
de LOD ; vue générale agrégée ; génération d’une tuile dense sur le thread principal.
Une erreur réseau conserve la vue générale et propose de recharger la page.
Les données publiques ne sont pas hashées par Vite : un rafraîchissement de page
peut être nécessaire après une nouvelle publication. Pas de mesures sur GPU physique,
Safari ni téléphone réel ; le Chromium logiciel ne représente pas ces performances.
