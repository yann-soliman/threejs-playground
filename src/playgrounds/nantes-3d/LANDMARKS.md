# Nantes 3D — monuments V8

La V8 prolonge la V7 (`0093f31`) dans le playground existant. Elle ne change ni
le périmètre communal V3, ni les autres expériences. Les cinq monuments disposent
de générateurs procéduraux dédiés, sans modèle externe, texture photographique,
dépendance JavaScript supplémentaire ou requête OSM dans le navigateur.

## Références et interprétation

Références consultées le **14 octobre 2026**, avant la modélisation. Les photographies
ont servi à examiner les silhouettes ; aucune photographie, marque ou sculpture
reproduite n'est distribuée dans les assets. Les géométries sont générées par le code.

| Monument | Référence | Éléments représentés | Données et hypothèses |
| --- | --- | --- | --- |
| Château des ducs de Bretagne | [Site du château](https://www.chateaunantes.fr/le-chateau/) | Enceinte et tours sur les emprises réelles, cour dégagée, logis, lucarnes, tours engagées avec toiture pentue, tourelle évoquant la Couronne d'Or, créneaux | Emprises et identifiants OSM conservés ; hauteur des logis, centres des tours engagées, détails et couleurs estimés. Les tours d'entrée ne sont pas des relevés architecturaux. |
| Cathédrale Saint-Pierre-et-Saint-Paul | [Description et photographies](https://fr.wikipedia.org/wiki/Cathédrale_Saint-Pierre-et-Saint-Paul_de_Nantes) | Deux tours occidentales à sommet plat, pinacles, trois portails, baie centrale avec réseau simplifié, nef haute, arcs-boutants | Emprise OSM réelle. Les 63 m cités comme hauteur générale ne sont pas une mesure indépendante des tours ; l'attribution aux pinacles, la distribution des hauteurs et les travées sont interprétées. |
| Tour LU | [Le Lieu Unique — Tour LU](https://www.lelieuunique.com/les-espaces/la-tour-lu) | Fût ocre, bandes et pilastres clairs, grande lanterne blanche, petit couronnement bleu, boîtier d'horloge et flèche ; volumes de l'ancienne usine | Parties OSM, hauteurs et niveaux minimum renseignés guident le modèle. Le point culminant OSM atteint 38 m. Rayons secondaires, vitrage, matériaux et horloge générique estimés ; pas de logo LU. |
| Grue Titan jaune | [Histoire et photographies des grues Titan](https://fr.wikipedia.org/wiki/Grues_Titan) | Quatre appuis, mât effilé, cabine, contrepoids, flèche horizontale en treillis, câble et crochet | Emprise et hauteur de 43 m OSM. Orientation de la flèche, portée de 44 m, dimensions des pièces et maillage du treillis estimés. |
| Passage Pommeraye | [Description et façades](https://fr.wikipedia.org/wiki/Passage_Pommeraye) | Volume irrégulier avec cour OSM, façades à travées, portails cintrés et colonnes, niches évoquées, verrière extérieure | Emprise réelle ; trois ancrages d'entrée issus de voies couvertes OSM. Hauteur de 22 m et verrière interprétées. La longueur du passage intérieur n'est pas appliquée au bâtiment. Aucun intérieur, escalier ou espace piéton supplémentaire. |

Les fiches affichent le nom du monument, le nom et l'identifiant OSM d'origine,
les valeurs OSM disponibles, la hauteur interprétée du modèle et ses limites.
Les POI disposent de liens OSM et vers ces références architecturales. La sélection
simple conserve l'orientation choisie par l'utilisateur ; **Observer le monument**
applique volontairement une vue adaptée. **Rejoindre le lieu** utilise toujours
la validation de départ et les collisions du mode piéton existant.

## Correspondance géographique et remplacement

`landmarks/registry.ts` cible des identifiants, jamais une zone englobante ni une
recherche approximative par nom. Les bâtiments voisins restent génériques.
Les objets ciblés sont exclus des volumes, fenêtres et décorations ordinaires
avant de générer les modèles dédiés. Les données et tags OSM source ne sont pas
modifiés ; les hypothèses visuelles résident dans les générateurs séparés.

* Château : 17 relations explicites, rôles logis/gouvernement/porte/tours/murs/salles/ruines.
* Cathédrale : `way/28379422`.
* Le Lieu Unique : `way/32428111` ; Tour LU : `way/288814717` et parties supérieures.
* Passage : `relation/4016610` ; accès `way/162056135`, `way/756402752`, `way/756402751`.
* Grue : `way/288905411`, objet OSM `man_made=crane` ajouté à sa tuile propriétaire `-3_2`.

La collision du Lieu Unique garde son empreinte source. Pour le rendu uniquement,
le script soustrait l'empreinte de la Tour LU à celle du bâtiment parent ; aucune
extrusion ordinaire ne subsiste derrière la tour. Les parties hautes de l'usine
commencent à 10 m pour éviter des façades superposées sur le socle dédié.
Les accès du passage sont projetés sur la façade la plus proche de leurs ancrages
OSM, sans découper de portes traversables dans la carte des obstacles.

La projection commune reste métrique : X vers l'est, Y altitude, Z vers le sud.
Les bâtiments suivent les socles IGN V4B ; la Tour LU utilise une altitude locale
stable à son centre. Les pieds de grue suivent chacun le terrain. Les socles
conservent les différences de niveau sans aplanir Nantes. Les tours/contreforts de
la cathédrale, les tours engagées du château et les appuis de grue ajoutent des obstacles explicites au joueur et
au filtre du mobilier. Le sampler des agents masque ces appuis supplémentaires.
Les empreintes originales continuent de bloquer les bâtiments et l'usine.
La flèche aérienne ne bloque pas une zone entière au sol.

## Données statiques et rafraîchissement

Source : [extrait Geofabrik Pays de la Loire](https://download.geofabrik.de/europe/france/pays-de-la-loire-latest.osm.pbf),
snapshot **2026-10-08T20:21:06Z**, préparation **2026-10-14**.
SHA-256 : `93884bcd2092431fce58a0fc824eaf8b3bc661a0df744b8feaf0b7d5b67e1814`.
Les données dérivées sont sous [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
L'attribution OpenStreetMap reste visible dans la scène et la carte.

`prepare_landmarks.py` lit 15 objets de ce PBF local et vérifie son hash contre
le manifeste communal. Il écrit deux compléments géographiques de tuile dans
`public/nantes/landmarks/`, et la petite empreinte de grue dans `data/titan.json`.
La grue est associée une seule fois à sa tuile au runtime. Les compléments ne
contiennent pas de géométrie 3D ; leurs URLs utilisent `import.meta.env.BASE_URL`.
Ils se chargent seulement lorsqu'une des deux tuiles concernées est demandée,
y compris au LOD lointain pour maintenir la découpe du bâtiment LU.

```sh
python3 -m pip install -r src/playgrounds/nantes-3d/scripts/requirements.txt
npm run nantes:prepare-landmarks -- --pbf work/v3/region.osm.pbf --prepared-at 2026-10-14
npm run nantes:test-data
```

Le script n'effectue aucun téléchargement implicite ni appel Overpass. Pour
rafraîchir le snapshot, suivre d'abord les étapes bâtiments, relief, mobilité et
rues de la documentation V3–V7 avec le même PBF, puis lancer ce complément.
Une disparition ou modification d'identifiant fait échouer explicitement la
préparation : revoir alors la correspondance patrimoniale, plutôt que produire
silencieusement un monument à un autre endroit. `--output` et `--crane-output`
permettent une reproduction dans un dossier temporaire. `--prepared-at` fixe
la date pour comparer les octets ; sinon la date du jour est utilisée.

## Géométrie, niveaux de détail et sélection

Un constructeur par tuile fusionne les volumes colorés et instance les motifs :
un lot de volumes, un lot de cubes/poutres, un lot de baies ogivales et un lot de
baies cintrées au maximum avant le découpage spatial V5C. Il n'y a pas un mesh
par fenêtre, créneau ou poutre. Les géométries sont produites par le worker
existant, transférées dans ses buffers puis découpées spatialement comme la ville.

* Proche : motifs de façade, encadrements, lucarnes, créneaux, horloge, treillis fin.
* Moyen : même implantation et silhouette, moins de motifs et de segments.
* Lointain : silhouettes essentielles, aucune fenêtre ni détail de façade ; treillis grossier.

La sélection utilise des prismes simples indexés spatialement pour atteindre les
tours hautes, la nef et la flèche. Elle renvoie toujours l'objet OSM original.
Un seul lot de lignes souligne les volumes ; les matériaux originaux restent
intacts. Ce proxy conservateur n'est pas une sélection triangle par triangle des
ornements. Le changement de LOD remplace le surlignage, le retrait de tuile le
libère. Le nettoyage du modèle et le transfert worker existants prennent en
charge toutes les géométries, matériaux et instances. Aucun renderer, rAF,
post-traitement ou lumière supplémentaire.

## Validation et performances

Les résultats et le protocole avant/après sont consignés dans
[LANDMARKS-PERFORMANCE.md](./LANDMARKS-PERFORMANCE.md).
Les reconstructions restent des interprétations architecturales : pas de relevé
laser, de restitution des sculptures/vitraux, de marque commerciale ou d'intérieur
du Passage Pommeraye. Les détails secondaires et certaines dimensions ne sont
pas des propriétés factuelles d'OpenStreetMap.
