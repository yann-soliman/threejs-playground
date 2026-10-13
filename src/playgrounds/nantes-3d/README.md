# Nantes 3D — V5B

Diorama interactif de **toute la commune de Nantes**, dans l’architecture existante
`mount(container): Cleanup`. Three.js, TypeScript strict, HTML/CSS natifs et fichiers
statiques ; aucun backend, clé ou appel géographique depuis le navigateur.
Lien : `#/playgrounds/nantes-3d`.

## Exploration piétonne et mini-carte — V5B

**Entrer et sortir.** Choisir un quartier en vue aérienne, puis **Mode piéton**.
Le départ est cherché à moins de 400 m, sur un tracé OSM autorisé, avec une
préférence pour chemins, rues piétonnes et rues résidentielles partagées.
Les empreintes, l’eau, les murs, les accès et le terrain chargé sont vérifiés
avant le déplacement. Une descente d’une seconde est annulable par **Vue aérienne** ;
elle est immédiate avec la réduction des animations. La sortie conserve le
quartier parcouru avec un cadrage aérien de 400 m, sans retour automatique au centre.
Les boutons de zoom/reset sont réservés à la vue aérienne ; la boussole oriente
le regard vers le nord dans les deux modes.

**Commandes.** ZQSD ou WASD pour marcher ; Maj pour accélérer : 1,8 ou 3,6 m/s,
avec diagonales normalisées. Cliquer dans la scène demande la capture de souris
uniquement après ce geste ; Échap la libère. En cas de refus ou d’absence de
Pointer Lock, glisser dans la scène permet de regarder. Les yeux sont à 1,70 m ;
le regard vertical est borné à ±1,35 rad et le roulis est nul. Les touches agissent
uniquement quand le viewport a le focus ou possède la capture ; les champs,
boutons et liens restent utilisables. Sur mobile, glisser pour regarder et maintenir
les quatre flèches de déplacement. Les contrôles fonctionnels restent actifs avec
`prefers-reduced-motion`. **Inspecter devant soi** conserve la fiche bâtiment
sans sélectionner pendant un geste de regard. Les POI restent sélectionnables ;
**Rejoindre le lieu** confirme explicitement un nouveau départ sûr en mode piéton.

**Collisions et relief.** Index CPU par cases de 25 m : empreintes OSM proches
avec trous/cours, surfaces d’eau, espaces verts/places à accès restreint, murs
avec largeur affichée et tracés routiers. Aucun mesh de collision
ni rayon lancé contre l’ensemble des bâtiments. Disque de rayon 28 cm, déplacements
subdivisés en pas d’au plus 12 cm et glissement par composantes le long des murs.
L’altitude provient des triangles IGN réellement affichés au LOD proche, avec
12 cm correspondant à la chaussée. Aucun terrain n’est reconstruit pendant la marche.
Un dénivelé supérieur à 18 cm + 0,65 fois le déplacement horizontal est refusé,
avec un contrôle anticipé à un mètre pour empêcher que les petits sous-pas
ne rendent artificiellement franchissable une forte pente continue.
Cette tolérance absorbe les petits écarts d’interpolation ; elle ne constitue pas
un modèle biomécanique. Les cours sont accessibles lorsqu’un passage réel le permet.
Les bâtiments sur pilotis restent des obstacles conservateurs.

La préparation conserve le tag **`foot`** et ses restrictions dans les trois LOD.
`foot` prévaut sur `access` ; `no`, `private` et `customers` sont refusés. Autoroutes,
voies rapides, constructions, escaliers, tunnels et niveaux négatifs sont exclus.
Les niveaux positifs sans pont sont refusés. Sur un pont possédant un tablier V4B,
la marche suit ce niveau estimé plutôt que le fond du fleuve ; les ponts sans
niveau connu restent interdits. Eau et bordures d’eau sont bloquées hors tablier.
Les règles conditionnelles, clôtures absentes d’OSM et accès privés non renseignés
ne peuvent pas être déduits. Ce mode n’est pas un calcul d’itinéraire accessible.

**Tuiles.** Jusqu’à six tuiles proches, indépendamment du frustum étroit piéton,
avec anticipation à 180 m dans la direction du regard et priorité maximale
pour la tuile portant le piéton. Les budgets existants
96 Mio / 48 Mio et caches de 24 tuiles sont conservés. Une tuile n’est déclarée
marchable qu’après attachement de son modèle proche et de ses données IGN.
La couverture du disque est vérifiée avant chaque pas : à une frontière non
chargée, rester à la dernière position valide, puis reprendre avec les touches
maintenues lorsque les données arrivent. La mini-carte et les POI ne déplacent
jamais implicitement un piéton ; « Aller ici » lance la validation du départ.
Une destination invalide garde la dernière position et propose un autre lieu
ou la sortie du mode. Une erreur définitive de tuile demande un rechargement.

**Mini-carte.** Deux Canvas 2D superposés : fond OSM vectoriel mis en cache,
indicateurs légers de position, direction, POI et secteur aérien approximatif.
Le fond utilise la vue générale et les surfaces d’eau existantes ; aucun service
de carte, chargement des 329 tuiles ni renderer WebGL supplémentaire.
Nord en haut : X vers l’est, Z vers le sud, échelle identique sur les deux axes.
La projection WGS84 reste celle de Nantes (`projectCoordinates`), puis la carte
applique une translation et une échelle en mètres ; la sélection utilise l’inverse.
En compact, elle suit la cible aérienne ou le piéton ; le fond est redessiné après
un déplacement de 7 % de sa largeur, les indicateurs au rythme des dessins de scène.
**Agrandir** : glisser pour déplacer, molette ou +/− pour zoomer entre 300 et
16 000 m de largeur, cliquer pour choisir, **Aller ici** pour confirmer.
Au clavier : flèches, +/−, Entrée pour choisir le centre ; boutons natifs pour
confirmer/suivre/réduire. Les POI sont dessinés et nommés en vue agrandie.
L’attribution OpenStreetMap reste visible sur la scène et la carte.

**Coût et cycle de vie.** Le même AnimationScheduler pilote marche, descente,
caméra aérienne, eau, véhicules et soleil. Rendu continu seulement pour mouvement
ou animation ; au repos, rendu à la demande. Pas de seconde boucle rAF. Perte de focus,
masquage, sortie du viewport, annulation de capture et changement de mode relâchent
les commandes. Démontage : écouteurs, capture, observer, Canvas et index libérés.
La cadence cible reste 24 images/s ; les déplacements utilisent le temps écoulé,
avec un plafond de 2 s par pas de simulation sur un appareil extrêmement lent
pour éviter un bond prolongé. Les sous-pas conservent les collisions à faible cadence.
En mode piéton : pixel ratio limité à 1, distance de rendu 2 km, brouillard local
et zone d’ombre ±180 m ; détails architecturaux proches conservés.

**Limites.** Glissement par axes, pas de moteur physique, saut, intérieur, escalier
ni navigation à plusieurs niveaux. Fragments routiers et tabliers simplifiés ;
certains espaces réellement accessibles peuvent être refusés. Les intersections
d’accès sont traitées conservativement. La carte représente surtout les axes
principaux de la vue générale ; elle n’est pas un fond cadastral exhaustif.
La représentation IGN des triangles à 20 m peut différer localement du MNT natif
à 5 m. Pas de garantie de fluidité sur GPU logiciel ou téléphone peu puissant.

### Validation V5B — 12 octobre 2026

`npm ci`, `npm run typecheck`, `npm test` (**101 tests Vitest**, dont 16 tests
piéton/carte), `npm run nantes:test-data` (**19 tests Python**) et
`npm run build` réussis. Les tests couvrent aussi une vraie frontière de tuile
Nantes avec les triangles IGN et les empreintes des deux propriétaires : cette
traversée est une simulation automatisée CPU, pas une traversée filmée au navigateur.
Les 989 fichiers OSM sont identiques à la préparation hors réseau du PBF existant ;
les 331 fichiers IGN sont inchangés. Les 1 320 JSON sont présents et identiques
sous `dist/nantes/`. Ajout de `foot` : 6 248 fragments proches renseignés,
231 810 octets supplémentaires de fichiers OSM, sans modification géométrique.

Production testée sous Chromium : ordinateur 1 440 × 1 100, mobile simulé
390 × 844 avec tactile et réduction des animations. Bouffay, Île de Nantes et
Chantenay ; marche, blocage effectif contre une façade, saisie dans un champ,
regard tactile, capture/Échap, regard par glissement sans capture, carte agrandie,
zoom/pan/sélection au clavier, confirmation d’un déplacement, POI sans déplacement
implicite, retour aérien, interruption et démontage vérifiés. Une façade réelle
(`way/85438998`) a été inspectée depuis la rue. Captures des rues et des cartes
sur ordinateur/mobile inspectées. Aucune erreur JavaScript applicative, erreur
HTTP d’asset ni débordement horizontal observé. Eau, 32 véhicules et lecture
solaire ont également fonctionné ensemble ; maximum **un rAF natif**, zéro au
repos sans animations, au masquage et après démontage.

Le rendu utilise un **GPU logiciel** : sur le court appui de marche mesuré à
Bouffay, deux intervalles de dessin de **3 500 et 3 692 ms**, soit environ
**0,28 image/s** ; cette expérience reste très lente dans cet environnement.
À Bouffay : quatre tuiles / **74,6 Mio** de buffers estimés sur ordinateur,
trois tuiles / **42,6 Mio** sur mobile simulé ; à Chantenay : **92,7 / 44,7 Mio**.
Ces nombres excluent le pilote et ne mesurent pas la mémoire GPU effective.
Pas de mesure sur GPU physique, téléphone réel ou Safari. Le bundle reste chargé
à la demande, sans nouvelle dépendance ; l’avertissement Vite existant au-delà de
500 ko demeure.

## Ville interactive — V5A

**Eau.** Trois rides de longueurs différentes remplacent les deux oscillations
très discrètes de V4A : couleur, normale et reflets évoluent sur une horloge unique
avec coordonnées mondiales. Un filtrage par dérivées écran atténue les petites
rides trop lointaines pour éviter le moiré. Les niveaux d’eau IGN restent fixes,
les tuiles et la vue générale partagent la phase ; aucun déplacement de surface,
réflexion de scène, texture téléchargée ou reconstruction par image.
La case **Animer l’eau** conserve la phase à l’arrêt. Cadence cible de 24 images/s
à proximité, avec le délai adaptatif existant pour les GPU lents ; ce n’est pas
une garantie de fluidité sur tous les appareils.

**Circulation.** Le sélecteur propose **Désactivée / Faible / Normale**,
avec Normale par défaut. Plafonds : **0 / 32 / 96 véhicules** ; **0 / 16 / 48**
si le viewport fait moins de 600 px au montage. Seules les tuiles proches/moyennes
actives alimentent des routes dont le milieu est dans le frustum et à moins de
1 800 m de la cible ; aucune voiture à la vue municipale ni au-delà de 2 600 m
de distance caméra/cible. La densité effective dépend des routes admissibles.

La préparation OSM conserve désormais `oneway`, `access`, `motor_vehicle`,
`vehicle`, `junction`, `maxspeed` en plus de `lanes`, `bridge`, `tunnel` et `layer`.
Les **989 fichiers géographiques** ont été régénérés hors réseau depuis le même
PBF : coordonnées, empreintes, identifiants et compteurs sont inchangés.
Les **331 assets terrain restent inchangés**. Les règles de circulation excluent
chemins, rues piétonnes, pistes cyclables, voies de service et accès restreints,
ainsi que tunnels et niveaux négatifs. `oneway=-1` inverse le tracé ; les sens
uniques et ronds-points sont respectés. Une voie unique à sens unique est centrée.
La tangente est lissée autour des virages sans remplacer le tracé OSM ; altitude
et inclinaison longitudinale suivent les triangles routiers affichés, ou le
niveau du tablier estimé V4B pour les ponts.

Modèle déterministe et décoratif : **2 à 6 m/s**, ralenti si les dessins sont
espacés sur GPU lent. Les voitures rapetissent sur les neuf derniers/premiers
mètres des fragments pour masquer le recyclage des trajets incomplets.
Pas de recherche d’itinéraire, priorité, collision, feu, réglementation horaire,
ni respect exhaustif des limitations `maxspeed` ; ces données sont conservées
pour de futures versions. Le changement de LOD peut modifier légèrement un tracé
simplifié. Les règles d’accès conditionnelles et voies réversibles ne sont pas
interprétées ; la circulation ne constitue pas une simulation de trafic réelle.

Carrosserie colorée, habitacle vitré sombre et quatre roues simplifiées :
**trois InstancedMesh pour toute la scène**, géométries/matériaux réutilisés,
sans ombre individuelle. Aucun buffer automobile avant la première route animée.
Retrait à la désactivation/décharge, puis libération des buffers au démontage.

**Bâtiments.** Cliquer ou toucher un bâtiment ouvre une fiche et un surlignage
ambre. La fiche indique nom ou « Bâtiment », type OSM, hauteur, niveaux,
identifiant et lien vers l’objet OSM. Les hauteurs provenant seulement de niveaux
ou du générateur portent **Hauteur estimée** ; les couleurs de façade, fenêtres
et autres détails procéduraux ne sont pas présentés comme des faits. Aucun
numéro de rue ou adresse n’est inventé ; les valeurs du type restent les tags OSM.

Un index par cases de 50 m contient uniquement les empreintes des tuiles actives
aux LOD proche/moyen. Le rayon teste les prismes géographiques candidats, y compris
leurs cours, sans mesh détaillé ni proxy GPU par bâtiment. Les lots de bâtiments
restent intacts ; seul le bâtiment sélectionné crée deux meshes de surlignage.
La sélection suit un remplacement de LOD par identifiant et se ferme à la décharge
ou avec son bouton. Déplacement de plus de 5 px, multitouch, annulation ou appui
long ne sont pas assimilés à un clic. Le picking approxime les toits comme des
prismes : il ne teste pas exactement les pans inclinés ni toutes les occlusions
par le terrain ou la végétation.

**Cycle de vie.** Caméra, soleil, eau et voitures partagent toujours un seul rAF.
L’onglet masqué et le viewport hors écran suspendent tout ; fermeture : requêtes,
écouteurs, index, sélection, instances, matériaux et géométries libérés.
`prefers-reduced-motion` fige l’eau, désactive circulation/lecture et conserve les
changements manuels. Eau, lecture et circulation désactivées : rendu au repos.
Le diagnostic ajoute véhicules, appels circulation et état de l’eau à la cadence
et aux métriques existantes. Les buffers automobiles fixes ne sont pas inclus
dans l’estimation du cache de tuiles ; ils ajoutent moins de 30 ko au plafond de 96.

### Vérifications V5A

Installation propre, TypeScript, **85 tests Vitest**, **19 tests Python** et build
réussis. Tests ciblés : restrictions/sens uniques, interpolation/virages/altitudes,
ponts, limites de densité, retrait et disposal, cartes et champs OSM, estimations,
rayons/cours, glissement/appui long, LOD/décharge, plus régressions V2/V3/V4.
Les restrictions restent identiques dans les trois LOD géographiques.
Les URLs publiques continuent à utiliser `import.meta.env.BASE_URL`.

Les nouveaux tags ajoutent **1 130 712 octets** aux données OSM ; aucun nouveau
asset externe, moteur ou dépendance runtime. Le module atteint **657,3 ko minifiés / 172,5 ko gzip**, soit environ 12,6 ko
minifiés supplémentaires ; l’avertissement Vite > 500 ko demeure. Les scènes de plus d’un million
de triangles restent coûteuses sur le GPU logiciel : 24 images/s est une cible,
pas une performance vérifiée sur GPU physique. Les mesures et captures ci-dessous
concernent Chromium logiciel uniquement, pas Safari ou un téléphone réel.

Chromium headless en production, ordinateur **1 440 × 1 100** et mobile simulé
**390 × 844** : sélection par clic/tap, fermeture, glissement sans sélection,
cadrages Île/château, nuit, densités, masquage et fermeture pendant chargement
vérifiés ; captures inspectées. Aucun asset manquant, erreur applicative ou
débordement horizontal ; au plus un rAF applicatif, aucun au repos ou après fermeture.

À caméra fixe près de la Loire, **62,6 % de 98 654 pixels identifiés comme eau**
changent de plus de 2 unités RVB entre deux captures animées (différence maximale
par pixel, moyenne 5,59/255). L’eau désactivée donne deux captures **identiques**.
La détection par couleur est approximative ; les images ont aussi été inspectées.
Voitures seules : 32 puis 96 instances, **119 puis 286 pixels** changent de plus
de 5 unités entre captures, pour **trois appels de dessin** dans les deux densités.

Sur le GPU logiciel, intervalle médian entre dessins : **3,011 s pour l’eau**,
**3,009 s / 3,010 s pour circulation faible/normale**, soit environ **0,3 image/s**.
Ce sont des séquences courtes comprenant les captures, sans prétendre à un
benchmark stable ; elles ne démontrent pas une fluidité sur GPU physique.
Au cadrage de circulation : 16 tuiles, environ 1,11 million de triangles et 60,2 Mio
de buffers de tuiles estimés. La scène reste lourde ; la cadence adaptative et le
plafonnement du déplacement limitent les sauts, mais l’animation est saccadée ici.

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
- Environ **70,7 Mo** de données OSM déployées : 68,5 Mo de tuiles, 2,1 Mo de vue générale
  et le manifeste, auxquels s’ajoutent **19,48 Mo de relief IGN** en V4B.
  Les tuiles ne sont pas toutes téléchargées au démarrage.

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

## Relief réel IGN — V4B

Le terrain couvre les **329 tuiles de toute la commune**, avec un facteur vertical
**1,0**. Source officielle : [IGN RGE ALTI 5 m, Loire-Atlantique](https://geoservices.ign.fr/rgealti),
édition **2022-12-20**, téléchargée le **11 octobre 2026**, sous
[Licence ouverte Etalab 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/).
Il s’agit d’un **MNT de sol**, pas d’un modèle de surface avec bâtiments.
Les métadonnées originales sont conservées dans `data/terrain-source.xml` et
`data/terrain-download.xml`. La date d’édition ne constitue pas une date unique
de levé : la livraison assemble des acquisitions et méthodes de précision variable.

Archive officielle départementale :
`RGEALTI_2-0_5M_ASC_LAMB93-IGN69_D044_2022-12-20.7z`, 313 638 699 octets,
SHA-256 `6047d72dff5ae023727590bf3ef703f7e1da6814211fd86614122ffaf4bb3e8f`.
Elle reste dans `work/` ; aucune dalle ASC brute n’est publiée. Seize dalles de
5 × 5 km couvrent Nantes et une marge : colonnes 0345/0350/0355/0360,
lignes 6685/6690/6695/6700. Les données ASC sont à **5 m**, sans CRS incorporé ;
la livraison atteste **RGF93 / Lambert-93 (EPSG:2154)** et les altitudes normales
**NGF-IGN69 (EPSG:5720)**. NoData : **−99999**, explicitement rejeté ; aucune
altitude aléatoire ou substitution silencieuse si la source manque.

La projection locale OSM est conservée. Chaque point local est reconverti en
WGS84 puis Lambert-93 avec PROJ ; une interpolation bilinéaire tient compte du
centre des pixels IGN. Les altitudes sont arrondies au centimètre pour le stockage,
sans prétendre à une précision centimétrique. Les sommets terrestres préparés vont
de **−0,79 à 63,40 m NGF-IGN69** ; ce sont les extrema des échantillons utilisés,
pas une recherche exhaustive des extrema du raster. Exemples sur la source :
Butte Sainte-Anne ≈ **32,43 m**, Parc des Chantiers ≈ **6,36 m**.

`public/nantes/terrain/` contient un manifeste, une vue générale et **un seul fichier
par tuile**, partagé entre les trois LOD des bâtiments. Chaque tuile comprend une
grille d’altitude de **10 m** avec halo, les socles calculés sur le MNT natif,
un tableau commun de sommets et trois index : maillages de **20/50/100 m**,
adaptés au contour communal et aux berges OSM. Les bords de tuile sont subdivisés
sur la même grille globale de 10 m aux trois niveaux ; les normales sont dérivées
d’un champ commun lissé de la vue générale pour éviter les différences d’éclairage.
Le terrain général de 100 m reste disponible jusqu’à remplacement par les tuiles.
Le masque existant retire simultanément terrain et objets généraux dans les zones
remplacées. Les découpes sont stabilisées au centimètre ; aucun socle rectangulaire.

Les fondations restent horizontales, au maximum du MNT échantillonné sur les bords
et, pour les grandes empreintes, sur une grille intérieure de 10 m. Un soubassement
rejoint le minimum local ; corps, toits, étages et fenêtres sont translatés ensemble,
sans modifier les coordonnées horizontales ni les hauteurs hors sol OSM/procédurales.
Ces socles sont une interprétation constructive, pas des fondations relevées.
Les rues sont densifiées à 10/20/50 m selon le LOD et drapées sur les triangles
réellement affichés ; places et parcs sont subdivisés avant drapage. Arbres, murs,
repères et cible de caméra suivent le relief ; la caméra reste au moins 3 m
au-dessus de l’altitude échantillonnée à sa position horizontale.

Les ponts et `layer>0` disposent d’un tablier horizontal **estimé** à partir du
maximum du MNT sur leur tracé, au moins 2 m au-dessus des eaux traversées. Ce choix
conservateur évite de les coller au lit de rivière ; il ne restitue ni les piles,
ni les arches, ni les pentes exactes. Les tunnels et `layer<0` sont omis plutôt que
plaqués sur le sol. Les ouvrages mal renseignés dans OSM restent une limite.

Les eaux connectées utilisent un niveau commun, médiane des échantillons du MNT
dans leurs polygones. Il est constant, sans bosses ni simulation de marée. Le terrain
et les parcs sont découpés autour des empreintes d’eau précises, conservées à tous
les LOD ; l’eau de la V4A reste animée par ses normales et sa couleur, sans déplacer
sa surface. Cette approximation ne décrit pas les niveaux hydrologiques actuels,
ni toutes les différences amont/aval, les écluses ou les variations de la Loire.

Le cache CPU d’altitude est séparé et borné à **24 tuiles**, avec requêtes partagées
entre LOD, annulation quand aucun lecteur ne reste et rejet des réponses tardives.
Les nouveaux buffers terrain participent au budget GPU existant ; géométries et
matériaux sont libérés avec les autres objets. Aucun service d’altitude n’est appelé
par le navigateur. Les assets utilisent tous le préfixe GitHub Pages.

### Validation et coût V4B

**19 481 049 octets supplémentaires** de relief statique : 17 222 475 octets
pour les 329 tuiles, 2 217 963 pour la vue générale et le manifeste.
220 397 sommets partagés dans les fichiers de tuiles ; 343 047 / 97 215 /
64 034 triangles terrestres au total pour proche/moyen/lointain. Les surfaces,
fondations et routes ajoutent leurs propres buffers, regroupés comme précédemment.
Le module passe de 637,6 à **644,7 ko minifiés / 168,0 ko gzip**, sans dépendance
runtime supplémentaire. L’avertissement Vite > 500 ko demeure.

Installation propre, TypeScript, **76 tests Vitest**, **18 tests Python** et build
vérifiés. Les tests couvrent interpolation native et navigateur, NoData/source
absente, projection/origine, couverture/tailles, socles complets, géométrie finie
avec orientation valide en Float32 WebGL, trous, identité des bords des trois LOD
et des grilles avec halo entre voisins, niveaux d’eau communs, tabliers/tunnels,
repères, requêtes partagées/annulations, LRU et destruction. Une seconde préparation
complète donne **les mêmes octets pour les 331 fichiers** ; ils sont également
identiques dans le build. Les **989 fichiers OSM existants sont inchangés**.

Chromium headless, GPU logiciel : parcours de Chantenay, Île de Nantes, Nantes Nord
et château à 1 440 × 1 100 ; Chantenay et château à 390 × 844 simulés. Vue générale,
jour, 22 h et rotation testés ; captures inspectées. Un second passage contrôle
les angles bas de Chantenay et les berges de l’Erdre après déplacement vers l’est. Fermeture pendant chargement
sans dessin ni rAF restant, au maximum un rAF applicatif en attente, aucun asset
manquant ou erreur applicative ; aucun téléchargement IGN depuis le navigateur.
Avec réduction des animations, la scène revient au repos.

Le premier parcours a donné **13 à 68 s** entre sélection et retour au repos sur
ordinateur, **13 à 15 s** sur mobile simulé, incluant chargement, génération et rendu
logiciel ; une préparation Python tournait aussi pendant une partie de ce passage.
Ces chiffres ne sont pas un benchmark comparatif ni des performances sur GPU physique.
La génération reste synchrone par tuile ; terrain, drapage et fondations accroissent
son coût. Les scènes détaillées demeurent lourdes sur le GPU logiciel. Au cadrage oblique
de Chantenay : 16 tuiles, 64,1 Mio de buffers estimés et environ 1,01 million de
triangles dans le dessin mesuré, ombres comprises ; le budget de 96 Mio est respecté.

Limites : édition du MNT 2022 différente de l’état OSM 2026, précision des acquisitions
variable, détails du terrain de moins de 20 m non représentés par le maillage proche,
petites variations au changement de LOD, socles interprétés et parfois élevés sur
une pente, plans d’eau constants, ouvrages approximatifs, absence de murs de quai
ou berges modélisés spécifiquement. La vue générale et les normales sont plus
lissées que le terrain proche. Pas de validation sur Safari, GPU physique ou
téléphone réel ; le contrôle de caméra ne constitue pas une collision complète
avec les bâtiments ni la simulation de déplacements au sol.

### Reproduction du relief

Installer les dépendances Python ci-dessus ; Rasterio, NumPy, pyproj et py7zr
servent uniquement à la préparation et aux tests. La commande suivante télécharge
**explicitement une seule archive officielle**, vérifie son SHA-256 et extrait
seulement les dalles utiles :

```sh
work/nantes-python/bin/python -B src/playgrounds/nantes-3d/scripts/prepare_terrain.py --download
# Puis régénération hors réseau avec les mêmes entrées :
work/nantes-python/bin/python -B src/playgrounds/nantes-3d/scripts/prepare_terrain.py
# Sortie de comparaison :
work/nantes-python/bin/python -B src/playgrounds/nantes-3d/scripts/prepare_terrain.py --output work/nantes-terrain-verification
# Équivalent avec les dépendances dans l’environnement courant :
npm run nantes:prepare-terrain
npm run nantes:test-data
```

`--archive`, `--source` et `--output` permettent des chemins différents. Pour une
nouvelle édition, vérifier le catalogue IGN, ses CRS, résolution, NoData et licence,
modifier l’URL/édition et le SHA attendu, renouveler les métadonnées originales et
la date d’extraction ; régénérer **tous** les assets terrain après les données OSM.
La sélection départementale est actuellement adaptée à Nantes ; pour une autre
commune, adapter sélection de dalles, origine et emprise. Le moteur de génération
reçoit la source, les assets géographiques et la destination indépendamment.

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


Limites géographiques actuelles : précision variable du MNT ; ponts approximatifs,
tunnels omis et niveaux superposés incomplets ;
hauteurs largement estimées ; monuments interprétés ; formes de toit approchées ;
jonctions de chaussées estimées ; limites de tuiles parfois perceptibles au changement
de LOD ; vue générale agrégée ; génération d’une tuile dense sur le thread principal en V3 (déplacée dans un worker en V5C).
Une erreur réseau conserve la vue générale et propose de recharger la page.
Les données publiques ne sont pas hashées par Vite : un rafraîchissement de page
peut être nécessaire après une nouvelle publication. Pas de mesures sur GPU physique,
Safari ni téléphone réel ; le Chromium logiciel ne représente pas ces performances.


## V5C — profilage et optimisation (13 octobre 2026)

Le rapport [PERFORMANCE.md](./PERFORMANCE.md) décrit le protocole reproductible,
les résultats avant/après, les compromis visuels et les limites des mesures.
La préparation de la vue générale et des tuiles passe par un unique worker Vite,
sans dépendance supplémentaire et sans transfert de ressources WebGL.
Les données géographiques, les trois LOD et les budgets de cache restent identiques.

Le profilage est facultatif : ouvrir `?profil=1#/playgrounds/nantes-3d`, puis appeler
`window.nantesProfile.snapshot()` dans la console. Le journal est limité à
1 024 événements et supprimé à la fermeture. Il sépare HTTP, lecture/décodage,
JSON, préparation worker, restauration des buffers et soumission du rendu.
Sans ce paramètre, les mesures et l’API globale sont désactivées.

Pour reproduire les cinq scénarios sur le build de production :

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4175
# Dans un autre terminal ; Playwright est un outil de développement facultatif.
python3 -m pip install playwright
python3 src/playgrounds/nantes-3d/scripts/benchmark_performance.py --label mesure
```

Le script utilise `/usr/bin/chromium` s’il existe, sinon le Chromium installé par
`python3 -m playwright install chromium`. Les options `--chromium` et `--url`
permettent de choisir le navigateur et le préfixe de déploiement. Les captures
et mesures JSON restent dans `work/v5c/`, ignoré par Git.
