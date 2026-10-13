# Nantes 3D — mesures V5C

## Protocole et portée

Comparaison du commit V5B `8f5ba69` et de V5C, le 13 octobre 2026 : build de
production, Chromium headless, 1 440 × 1 100, DPR 1, cache HTTP désactivé,
ANGLE/Vulkan **SwiftShader**, donc GPU logiciel. Aucun GPU physique disponible.
Un passage par version, mêmes points d’intérêt, même ordre et mêmes options.
Ce ne sont ni une moyenne statistique ni des performances garanties sur téléphone.
Le script `scripts/benchmark_performance.py` conserve captures, événements,
intervalles entre dessins, tâches longues, mémoire principale et état du chargeur.

A charge la vue générale et attend le repos. B rejoint Bouffay, C Chantenay.
D retourne à Bouffay, entre en mode piéton, marche et tourne la caméra ; un second
passage franchit réellement une limite de tuile sur l’allée du Port Maillard.
E rejoint l’île de Nantes avec eau animée, circulation normale et lecture solaire
actives, puis observe au moins six dessins. B et C utilisent le 21 juin à 14 h.
Les effets sont coupés pour les mesures statiques A–D et activés pour E.
Le temps jusqu’au repos inclut les attentes de stabilité du protocole.

## Goulots et changements

La préparation initiale synchrone occupait 685 ms du thread principal ; les tuiles
détaillées de Bouffay cumulaient 1 157 ms. La génération des murs/toits, la fusion,
les fenêtres et les recherches d’altitude produisaient allocations et calculs
répétés. Le rendu piéton soumettait plus d’un million de triangles, y compris
les grands lots dont une petite partie seulement était visible.

- `geometry-client.ts` pilote un seul worker, une tâche en cours et une file.
  `geometry-worker.ts` prépare les modèles et leurs bornes sans renderer.
  `geometry-wire.ts` transfère des ArrayBuffers uniques et restaure géométries,
  instances et matériaux avec les uniformes d’atmosphère vivants. Le renderer
  et l’allocation GPU restent sur le thread principal. Les réponses périmées
  ne sont pas attachées ; une annulation conserve la place de la tâche active
  jusqu’à sa réponse. Une indisponibilité/erreur du worker déclenche le repli
  synchrone ; la fermeture rejette les tâches et termine le worker.
- Les gros lots détaillés (au moins 8 000 triangles) sont répartis en cases de
  250 m pour permettre le culling du rendu et des ombres. Aucun triangle n’est
  coupé ou supprimé à une frontière ; les bornes incluent ses vrais sommets.
  La vue générale reste fusionnée. Un premier essai trop fin augmentait trop
  les appels de dessin et a été abandonné.
- Les corps omettent leurs faces couvertes par le toit et leurs dessous enterrés.
  Les dessous des volumes surélevés restent présents. Les toits plats évitent
  les subdivisions de faîtage inutiles. Empreintes et altitudes sont conservées.
- Vitres et cadres partagent un seul plan instancié, avec bordure de 11 cm,
  rugosité distincte et éclairage nocturne limité à la vitre. Le retrait ancien
  de 2,5 cm entre vitre et cadre disparaît : compromis visible documenté,
  sans suppression des fenêtres ni uniformisation des façades.
- L’échantillonnage du relief utilise des cases adaptées et des coefficients
  barycentriques précalculés. Les grandes coordonnées et les bords sont testés.

Les politiques existantes de LOD, collisions, ombres 2 048, DPR adaptatif,
budgets 96/48 Mio et ordonnanceur unique restent en vigueur. Aucun nouveau
réglage graphique ni désactivation générale des effets mobiles.

## Lecture des mesures

La durée `renderer.render()` mesure la soumission JavaScript, **pas la durée GPU**.
L’extension de chronométrage GPU n’est pas disponible : durée GPU et VRAM réelles
indisponibles. Les intervalles entre dessins incluent navigateur, pilote logiciel,
ordonnanceur et interactions. Les tâches longues peuvent également inclure
l’attente du pilote ; elles ne mesurent pas uniquement le calcul JavaScript.
HTTP inclut l’ordonnancement du navigateur, lecture inclut transfert/décodage,
JSON est mesuré séparément ; leurs sommes concurrentes ne sont pas un débit réseau.
La mémoire `performance.memory` couvre le contexte principal, pas le worker.
Les buffers estimés du cache excluent textures, pilote et autres allocations.

## Comparaison avant/après

Temps jusqu’au repos pour A–C, intervalle médian entre dessins pour D–E :

| Scénario | Avant | Après | Évolution |
| --- | ---: | ---: | ---: |
| A — chargement initial | 4.46 s | 4.23 s | -5.2 % |
| B — rejoindre Bouffay | 21.67 s | 17.04 s | -21.4 % |
| C — rejoindre Chantenay | 35.69 s | 30.43 s | -14.7 % |
| D — marche et rotation | 4.33 s | 2.39 s | -44.8 % |
| D — franchissement de tuile | 2.44 s | 1.26 s | -48.2 % |
| E — eau, trafic et soleil animés | 3.01 s | 1.96 s | -34.8 % |

Les positions finales de marche dépendent du temps et de la cadence ; D compare
le même parcours commandé, sans prétendre à des images enregistrées au même point.
Le passage de frontière est confirmé avant et après. E inclut navigation et
commandes ; sa durée totale de protocole (66,48 → 24,70 s) n’est pas une mesure FPS.
La lecture solaire avance naturellement pendant les attentes.

Les métriques suivantes proviennent du dernier dessin de chaque scénario.
Les compteurs `renderer.info` peuvent inclure les passes d’ombres lorsqu’elles
sont recalculées pendant ce dessin. Comparer des états semblables ; ces compteurs
ne mesurent ni la durée ni le coût complet du GPU.

| Scénario | Appels avant → après | Triangles avant → après | Buffers de cache avant → après | Mémoire JS principale avant → après |
| --- | ---: | ---: | ---: | ---: |
| A — chargement initial | 9 → 9 | 329,822 → 269,960 | 0.0 → 0.0 Mio | 70.6 → 34.7 Mio |
| B — rejoindre Bouffay | 109 → 328 | 1,851,685 → 1,230,793 | 74.6 → 59.4 Mio | 183.4 → 104.0 Mio |
| C — rejoindre Chantenay | 217 → 472 | 1,763,685 → 1,282,817 | 90.9 → 84.3 Mio | 156.4 → 135.4 Mio |
| D — marche et rotation | 61 → 151 | 1,272,229 → 732,680 | 94.9 → 89.4 Mio | 150.1 → 139.6 Mio |
| D — franchissement de tuile | 52 → 86 | 1,114,023 → 589,886 | 94.9 → 89.4 Mio | 150.3 → 140.1 Mio |
| E — eau, trafic et soleil animés | 255 → 416 | 1,540,238 → 1,102,432 | 80.1 → 87.6 Mio | 137.8 → 141.4 Mio |

Les appels augmentent avec le découpage, tandis que les triangles diminuent
(−42 % pendant la marche). Les buffers E augmentent de 80,1 à 87,6 Mio : davantage
de cache est conservé dans ce parcours, toujours sous le budget de 96 Mio.
Le worker ajoute 207,81 ko minifiés, environ 58,32 ko gzip, chargés uniquement
avec Nantes. Le module Nantes/Three reste à 708,33 ko (185,89 ko gzip) ;
l’avertissement Vite de module supérieur à 500 ko subsiste.

## CPU, latence et mémoire

La préparation initiale passe de 684,6 ms synchrones à 813,0 ms dans le worker,
plus 1,5 ms de restauration/échantillonnage et 1,8 ms de montage principal.
À Bouffay, 1 156,6 ms synchrones deviennent 1 421,0 ms dans le worker et 37,9 ms
sur le principal ; à Chantenay, 919,4 ms deviennent 1 439,4 ms et 59,0 ms.
Le travail total augmente avec le découpage/transfert, mais le principal est
libéré d’environ 97 % et 94 % de cette préparation détaillée. La durée aller-retour
inclut l’attente des messages et du navigateur ; elle n’est pas le temps CPU.
Le JSON représente 29,7 / 23,6 / 55,2 ms pour A/B/C après optimisation,
et reste sur le principal : ce n’est pas le premier goulot identifié.

La plus longue tâche navigateur baisse de 725 à 642 ms pour A,
3 580 à 2 095 ms pour B, 3 636 à 2 649 ms pour C,
4 576 à 2 621 ms pour D et 3 503 à 2 247 ms pour E.
Des pauses importantes subsistent sur SwiftShader. La cadence médiane de marche
reste environ 0,42 image/s ; aucune affirmation de fluidité sur GPU réel.
La première tuile partielle peut arriver plus tard à Bouffay avec le worker,
même quand le quartier complet arrive plus vite. Le script distingue événements
de construction et dessins, mais ne détermine pas automatiquement le premier
rendu perceptuellement utile. Les pauses GC et la mémoire totale worker/pilote
ne sont pas mesurées fiablement.

## Validation et limites

Installation propre, typage strict, build de production, **110 tests Vitest**
et **19 tests Python**. Neuf nouveaux tests couvrent lots sans perte de triangles,
instances, buffers uniques/transférés, matériaux et uniformes nocturnes/eau,
annulation, réponses périmées, erreur/repli, terminaison, relief et faces masquées.
Les assets géographiques versionnés sont inchangés.

Navigateur réel automatisé : cinq scénarios complets, vrai franchissement de
frontière, eau/voitures/lecture solaire actives, absence d’erreurs JavaScript
et HTTP, une seule chaîne rAF. Captures avant/après de Bouffay et Chantenay
comparées visuellement, captures finales et mobile simulé inspectées : aucun trou
évident ni bâtiment/terrain manquant observé dans ces cadrages. Ce n’est pas une
preuve exhaustive sur les 329 tuiles ; les bordures de fenêtres ont changé.

Deux cycles mobiles simulés (390 × 844, tactile, animations réduites) :
Bouffay → Chantenay → Bouffay, entrée/sortie piéton, inspection devant soi,
mini-carte et fermeture pendant chargement. Même cache au retour, moins de
48 Mio ; aucun débordement horizontal ni erreur applicative. Après fermeture :
zéro worker, zéro callback rAF Nantes, zéro canvas et zéro buffer GL suivi ;
API de profil supprimée et tous les contextes WebGL perdus. Certains objets
internes de textures/programmes sont invalidés par la perte du contexte,
sans suppression individuelle observée : la VRAM réelle reste inconnue.

Aucun test sur GPU physique, Safari ou téléphone réel. Les grandes tuiles,
la soumission GPU et le parsing principal restent des limites. Les compromis
visuels se limitent aux cadres/vitres coplanaires et faces couvertes ; ni
l’éclairage dynamique ni les ombres ni la couverture de collisions ne sont supprimés.
