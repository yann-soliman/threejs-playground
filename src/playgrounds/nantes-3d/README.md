# Nantes 3D

Première maquette du centre historique : Bouffay, Château des ducs de Bretagne,
douves et alentours de la cathédrale. Le module respecte `mount(container): Cleanup`
et reste chargé à la demande via le catalogue existant.

## Emprise et source

- Emprise sud/ouest/nord/est : **47.2120, -1.5580, 47.2192, -1.5468**.
- Dimensions : **845,92 × 800,60 mètres** ; origine 47.2156, -1.5524.
- Source : [OpenStreetMap](https://www.openstreetmap.org/), via
  [Overpass API](https://overpass-api.de/api/interpreter).
- Extraction finale : **11 octobre 2026, 11:49:10 UTC** ; état de la base OSM
  **11:47:26 UTC**. Les timestamps complets et la requête sont dans `city.json`.
- Contenu : **1 293 empreintes de bâtiments**, 1 326 tronçons de voirie et chemins,
  184 espaces verts, 23 places/surfaces piétonnes, 13 surfaces d’eau,
  122 lignes de murs (dont 8 remparts historiques), 1 066 arbres cartographiés.
  Ces nombres désignent les géométries retenues, pas des adresses ni des rues uniques.
- Projection équirectangulaire locale en mètres : X vers l’est, Z vers le sud.
  Les proportions et positions sont conservées à cette échelle, avec arrondi au centimètre.

Les données et le snapshot sont distribués sous
[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
**© OpenStreetMap contributors** — [attribution et droits](https://www.openstreetmap.org/copyright).
Cette attribution est visible en permanence dans la scène. Les contributions
individuelles sont documentées dans l’historique OSM accessible par les identifiants
`way/…` et `relation/…` conservés dans les données.

## Préparer et rafraîchir les données

Python 3.12+ et sa bibliothèque standard suffisent ; aucune dépendance Python.
Depuis la racine du dépôt :

```sh
# Recréer city.json à partir du snapshot versionné, sans réseau.
npm run nantes:prepare

# Tests du traitement géographique.
npm run nantes:test-data

# Actualiser explicitement le snapshot et l’asset avec une seule requête Overpass.
npm run nantes:prepare -- --refresh

# Réutiliser l’extraction pour une autre petite emprise, dans des fichiers distincts.
npm run nantes:prepare -- --refresh --bbox 47.2120 -1.5580 47.2192 -1.5468 \
  --snapshot work/autre-osm.json.gz --output work/autre-ville.json

# Importer une réponse JSON obtenue séparément auprès d’Overpass.
npm run nantes:prepare -- --input work/reponse-overpass.json
```

`data/osm-snapshot.json.gz` conserve la réponse complète et l’emprise/date
associées. `data/city.json` conserve les coordonnées métriques, identifiants et
attributs utiles ; le SHA-256 du JSON OSM canonique permet d’en vérifier la source.
La compression du snapshot a un timestamp fixe. Une préparation locale produit
exactement les mêmes octets, sans changer la date d’extraction.

Le script assemble les contours de relations multipolygones, raccorde les ways
inversés, associe leurs cours intérieures et évite de compter leurs membres deux
fois. Il découpe les surfaces et lignes à l’emprise ; les bâtiments ouverts ou
incomplets sont listés dans `meta.skippedBuildings` (aucun dans cet extrait).
Une réponse Overpass signalant une extraction incomplète est refusée.

La requête limitée à 1 500 m maximum par côté sélectionne bâtiments, routes,
espaces verts, eau, murs et remparts avec `out geom`. Aucun rafraîchissement
automatique, aucune interrogation depuis le navigateur. Ne pas lancer plusieurs
rafraîchissements en parallèle ; limiter leur fréquence, respecter les réponses
429/504 et `Retry-After`, et consulter les
[règles d’utilisation Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances).
Le script ne réessaie pas automatiquement les erreurs. Une requête échouée ne
remplace pas le snapshot existant.

Après un rafraîchissement, contrôler les compteurs, le diff des données, l’emprise
et la vue, puis exécuter les vérifications ci-dessous avant de versionner les deux assets.

## Géographie factuelle et interprétation visuelle

`types.ts` décrit uniquement les données sources ; les `tags` sont des valeurs OSM.
`buildings.ts` produit séparément les styles estimés, avec `heightSource` et
`roofSource`. Aucun attribut estimé n’est ajouté au fichier géographique.

- Hauteur : `height` (mètres ou pieds), sinon `building:levels × 3,15 m`, sinon
  3 à 5 niveaux déterministes pour les bâtiments ordinaires. Petites annexes et
  ruines ont des estimations basses. Les dimensions sont bornées pour éviter
  les valeurs aberrantes. Le nombre de niveaux est utilisé pour répartir fenêtres et bandeaux.
- Monuments : estimations explicites pour la cathédrale (32 m), les églises (22 m),
  les bâtiments nommés « Tour … » non ruinés (18 m), Grand Logis et Grand Gouvernement
  (21 m), lorsque les attributs de hauteur/niveaux manquent. Ces chiffres servent
  au rendu et **ne constituent pas des mesures architecturales**.
- Toits : `roof:shape`, `roof:height` et `roof:colour` quand disponibles ; sinon
  choix déterministe de toiture plate, à deux pans, à croupes ou mansardée.
  Les pans suivent l’empreinte triangulée, y compris les cours. Les formes
  `skillion`, `gabled`, `hipped`, `pyramidal`, `mansard` et `gambrel` ont des
  approximations dédiées ; les autres formes utilisent une approximation à deux pans.
- Façades : `building:colour` et `building:material` guident une palette de pierre,
  enduit, brique, verre, béton et bois. Fenêtres, cadres, vitrines occasionnelles
  et bandeaux d’étage sont procéduraux ; aucune texture ou modèle externe.
- Routes : largeurs OSM lorsqu’elles sont utilisables, sinon estimations par classe.
  Pavements distincts et chemins piétons plus clairs. Murs : hauteur/largeur taguées,
  sinon estimations de 9 m/2,5 m pour les remparts et 1,6 m/0,4 m pour les murs ordinaires.
- Végétation : positions des arbres OSM ; taille, forme et couleur du feuillage estimées.

## Rendu et navigation

Lumière ambiante hémisphérique, soleil directionnel avec ombres douces,
tonemapping et brouillard léger à grande distance. Socle de diorama, eau calme,
palette naturelle, cours ouvertes et volumes irréguliers.

OrbitControls permet rotation, zoom et déplacement (clic droit ou deux doigts).
Les vues « Vue d’ensemble », « Le château » et « Bouffay », ainsi que les boutons
zoom et reset, restent disponibles. Le clavier fonctionne lorsque la scène a le
focus : flèches pour déplacer, +/− pour zoomer, **R** pour réinitialiser,
**N** pour orienter au nord. La boussole est aussi un bouton accessible par Tab,
Entrée ou Espace ; N/E/S/W correspondent au nord/est/sud/ouest.

### Boussole et transitions V2

La rose circulaire suit l’azimut de la caméra ; les lettres restent lisibles et
le nord est distingué par une aiguille couleur terre cuite. Cliquer la boussole
place le nord en haut de l’écran **sans modifier la cible, la distance ni
l’inclinaison**. Avec X vers l’est et Z vers le sud, cela correspond à l’azimut 0.
Les angles sont déroulés pour éviter un tour artificiel au passage de ±π.

Les vues, points d’intérêt, le reset et la réorientation au nord utilisent une
transition de **1,4 seconde**, avec accélération et décélération douces et rotation
par le chemin le plus court. Un nouveau choix remplace le précédent depuis la
position actuelle. Un geste souris/tactile, une molette, un zoom ou un déplacement
clavier annule le trajet. Si `prefers-reduced-motion: reduce` est activé,
la navigation devient immédiate. Les choix de lieux conservent l’orientation et
l’inclinaison actuelles ; seule leur distance de cadrage change intentionnellement.

### Points d’intérêt

Le sélecteur « Lieux à explorer » propose quatre lieux. Une sélection affiche
son nom, un repère discret et un lien vers sa position OpenStreetMap. Les raccourcis
château/Bouffay utilisent la même sélection. Un seul repère est affiché ; il suit
la projection de la caméra, disparaît hors du champ et peut être masqué. La vue
générale et le reset effacent la sélection. Une manipulation manuelle garde le
repère mais retire l’état actif du raccourci de vue.

`pois.ts` contient une liste typée et extensible, sans API externe. Chaque entrée
possède `id`, `name`, `coordinates` ([latitude, longitude] WGS84), `source`
(identifiant OSM), `distance` et `markerHeight`. Les coordonnées sont des centres
d’emprise calculés depuis les géométries du snapshot du 11 octobre 2026 :

| Lieu | Ancrage OSM | Latitude | Longitude |
| --- | --- | --- | --- |
| Château des ducs de Bretagne | Grand Logis, relation/17369788 | 47.21586895 | -1.549972 |
| Quartier du Bouffay | Place du Bouffay, way/160751210 | 47.21477925 | -1.5532396 |
| Cathédrale Saint-Pierre-et-Saint-Paul | way/28379422 | 47.21837155 | -1.55020215 |
| Église Sainte-Croix | way/28810231 | 47.21536645 | -1.55395435 |

La place et le Grand Logis servent d’ancrages représentatifs du quartier et du
château. `distance` et `markerHeight` sont des réglages de présentation estimés,
pas des mesures OSM. Le repère est un élément HTML projeté au-dessus du volume
procédural ; il n’effectue pas de test d’occlusion avec les bâtiments.

Pour ajouter un lieu : ajouter une entrée dans `pointsOfInterest`, avec un
identifiant unique, un nom français, des coordonnées vérifiées dans l’emprise et
un identifiant source. Ajuster le cadrage et la hauteur du repère après aperçu.
Le sélecteur et le lien OSM se construisent automatiquement. Mettre à jour le test
d’ancrage si la source est une autre géométrie ou un point OSM. Les sources hors
emprise sont refusées. La projection utilise `meta.origin`, comme le diorama.

`navigation.ts` sépare les poses et le pilote `CameraNavigator` de l’interface.
`index.ts` raccorde ce pilote à OrbitControls et aux événements DOM. Aucune
modification du routeur, du catalogue, des données géographiques ni du générateur
de bâtiments n’est nécessaire pour cette V2.

## Performance et cycle de vie

- Corps, toits, corniches, surfaces, chaussées, pavements et murs regroupés par matériau.
- Fenêtres/cadres et troncs/feuillages instanciés ; **13 objets de rendu** pour cet extrait,
  au lieu d’un objet par bâtiment, fenêtre ou arbre (les ombres ajoutent leur passe).
- Rendu uniquement au changement de caméra, au redimensionnement et au chargement.
  Une seule chaîne `requestAnimationFrame` pendant les transitions ; aucun callback
  restant après arrivée, interruption ou fermeture. Pas de post-traitement ;
  ombres calculées une fois après montage.
- Pixel ratio plafonné à 1,5 ; carte d’ombres 2 048² ; aucune dépendance ajoutée.
- Nettoyage des géométries, matériaux, buffers d’instances, ombres, contrôles,
  renderer et contexte WebGL ; observateur et écouteurs retirés ; fetch annulé.
  Une réponse terminée après la fermeture ne monte pas de modèle. La transition
  et les callbacks tardifs sont annulés ; les écouteurs du sélecteur et du geste
  de début OrbitControls sont retirés. Le repère HTML n’ajoute aucun draw call.
- Asset JSON statique hashé par Vite via `new URL('./data/city.json', import.meta.url)` :
  URL sous `/threejs-playground/assets/`, sans backend, credentials ni requête OSM.
  Snapshot brut exclu du build. L’accueil n’importe toujours pas Three.js.

Le JSON préparé pèse environ 682 Ko (188 Ko avec gzip) ; le module Three.js/Nantes
environ 612 Ko minifiés (157 Ko gzip). Vite signale un chunk supérieur à 500 Ko,
chargé uniquement à l’ouverture de l’expérience. GitHub Pages décide de la compression HTTP.

## Vérifications et limites

```sh
npm ci
npm run typecheck
npm test
npm run nantes:test-data
npm run nantes:prepare
npm run build
npm run preview
```

Tests Vitest : provenance/emprise, interprétation des tags, géométries finies sur
les 1 293 empreintes réelles, rayon traversant une cour, batching et nettoyage.
Tests Python : raccordement des relations, clipping, rejet des réponses incomplètes,
déduplication. Le traitement local a été vérifié par égalité SHA-256 avant/après.
Les tests du routeur existants restent inchangés. Les tests V2 couvrent
l’orientation du nord projeté, le passage de ±π, l’easing, l’arrivée, l’interruption,
le remplacement et la destruction des transitions, la réduction des animations,
la sélection des lieux, les liens OSM et la concordance des ancrages avec l’asset.
Le pilote est testé avec une horloge contrôlée, sans timer ni contexte WebGL.

Validation réellement effectuée sur le build de production avec Chromium headless,
WebGL 2 et GPU logiciel, aux formats 1 440 × 1 000 et 390 × 844 : liens directs,
chargement JSON sous le préfixe Pages, vue château, zoom/reset, rotation par glisser,
pan par clic droit et clavier, rechargement et abandon pendant le chargement.
Aucune erreur de page, réponse HTTP en échec, requête OSM au runtime ou débordement
horizontal observé. Les captures aériennes, château et mobile ont été inspectées
visuellement. Cette validation ne mesure pas les performances sur un GPU physique.


Validation V2 également effectuée sur le build de production dans Chromium, aux
mêmes formats : boussole par clic/Entrée, repère et cadrage préservés au nord,
choix successifs de lieux, lien OSM, interruptions clavier/molette, reset,
fermeture pendant transition et remontage. L’instrumentation du navigateur
confirme au maximum un callback d’animation de l’application en attente et aucun
dessin WebGL au repos. Le mode de réduction des animations ne démarre aucun rAF.
Aucune erreur de page, réponse HTTP en échec, requête OSM au runtime ou débordement
horizontal observé. Les captures V2 sur ordinateur et mobile simulé ont été
inspectées ; gestes sur téléphone physique et Safari restent à vérifier.

Limites : terrain plat ; hauteur de nombreux bâtiments inconnue ; monuments
interprétés et non reconstruits en détail ; pas de distinction fine des parties
ou des étages souterrains, ponts/tunnels ni des façades mitoyennes ; fenêtres
procédurales parfois masquées dans les cours ; modèles de toits approchés ;
clipping des polygones concaves au bord susceptible de créer des raccords artificiels.
Pas de tuiles, de textures photographiques, de simulation d’eau ni de LOD.
Safari, téléphones physiques et performances GPU de matériels modestes restent à vérifier.
