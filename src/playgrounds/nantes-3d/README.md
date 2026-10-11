# Nantes 3D — V3

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

Palette V2, soleil, lumière hémisphérique, toits et façades variés, brouillard adapté
à la distance. Hauteur OSM ou niveaux × 3,15 m ; sinon estimation déterministe,
avec interprétation spécifique des monuments. Les fenêtres et formes de toit
restent procédurales ; les couleurs/matériaux OSM sont utilisés lorsqu’ils existent.

Ombres locales sur une zone de 1 240 m, recentrée avec la navigation ; désactivées
au-delà de 2 400 m. Elles sont recalculées aux changements utiles, sans couvrir
la commune entière. Rendu à la demande, une seule chaîne rAF pendant une transition,
aucune boucle permanente au repos. Les arrivées de géométrie sont regroupées
sur 32 ms ; les simples mises à jour du statut ne redessinent pas la scène. Le diagnostic repliable affiche tuiles, requêtes,
LOD, appels de dessin, triangles et estimation des buffers via le renderer.
La cadence affichée est instantanée pendant une transition, pas un benchmark moyen.

À la fermeture : annulation fetch/timers/transitions, contrôles/écouteurs/observateur
retirés, modèles/cache/instances/matériaux/géométries/masque/ombres/contextes libérés.

## Validation et limites

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
