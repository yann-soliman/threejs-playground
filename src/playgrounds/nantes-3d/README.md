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
Des boutons proposent la vue générale, le château, Bouffay, zoom et reset.
Le viewport est accessible au clavier : flèches pour déplacer, +/− pour zoomer,
R pour réinitialiser. L’interface française conserve le thème clair existant,
le focus visible, les liens natifs et une mise en page mobile.

## Performance et cycle de vie

- Corps, toits, corniches, surfaces, chaussées, pavements et murs regroupés par matériau.
- Fenêtres/cadres et troncs/feuillages instanciés ; **13 objets de rendu** pour cet extrait,
  au lieu d’un objet par bâtiment, fenêtre ou arbre (les ombres ajoutent leur passe).
- Rendu uniquement au changement de caméra, au redimensionnement et au chargement.
  Pas de boucle d’animation, pas de post-traitement, ombres calculées une fois après montage.
- Pixel ratio plafonné à 1,5 ; carte d’ombres 2 048² ; aucune dépendance ajoutée.
- Nettoyage des géométries, matériaux, buffers d’instances, ombres, contrôles,
  renderer et contexte WebGL ; observateur et écouteurs retirés ; fetch annulé.
  Une réponse terminée après la fermeture ne monte pas de modèle.
- Asset JSON statique hashé par Vite via `new URL('./data/city.json', import.meta.url)` :
  URL sous `/threejs-playground/assets/`, sans backend, credentials ni requête OSM.
  Snapshot brut exclu du build. L’accueil n’importe toujours pas Three.js.

Le JSON préparé pèse environ 682 Ko (188 Ko avec gzip) ; le module Three.js/Nantes
environ 606 Ko minifiés (155 Ko gzip). Vite signale un chunk supérieur à 500 Ko,
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
Les tests du routeur existants restent inchangés.

Validation réellement effectuée sur le build de production avec Chromium headless,
WebGL 2 et GPU logiciel, aux formats 1 440 × 1 000 et 390 × 844 : liens directs,
chargement JSON sous le préfixe Pages, vue château, zoom/reset, rotation par glisser,
pan par clic droit et clavier, rechargement et abandon pendant le chargement.
Aucune erreur de page, réponse HTTP en échec, requête OSM au runtime ou débordement
horizontal observé. Les captures aériennes, château et mobile ont été inspectées
visuellement. Cette validation ne mesure pas les performances sur un GPU physique.

Limites : terrain plat ; hauteur de nombreux bâtiments inconnue ; monuments
interprétés et non reconstruits en détail ; pas de distinction fine des parties
ou des étages souterrains, ponts/tunnels ni des façades mitoyennes ; fenêtres
procédurales parfois masquées dans les cours ; modèles de toits approchés ;
clipping des polygones concaves au bord susceptible de créer des raccords artificiels.
Pas de tuiles, de textures photographiques, de simulation d’eau ni de LOD.
Safari, téléphones physiques et performances GPU de matériels modestes restent à vérifier.
