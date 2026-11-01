Notes du manga d'exemple « Kodama-sen » : synopsis et notes de travail.
« === synopsis === » : synopsis envoyé à l'éditrice (gardé comme version
nommée) ; « === synopsis-actuel === » : synopsis actuel ;
« === note:<clé> === » : texte d'une note. Balisage : voir ../README.md.

=== synopsis ===
Dans la vallée d'Ashiro, condamnée par un barrage, **Hina**, apprentie contrôleuse muette, entend les dernières paroles des morts. Elle a trente jours pour les recueillir avant que l'eau ne les efface.

=== synopsis-actuel ===
Dans la vallée d'Ashiro, les dernières paroles des morts restent là où elles ont été dites, sous la forme de phalènes de papier. Seuls ceux qui ont perdu leur voix peuvent les entendre.

**Hina Sakuraba**, quatorze ans, est de ceux-là. Muette depuis l'avalanche qui a tué son frère **Ren** dans le tunnel n° 7, elle est apprentie contrôleuse sur la dernière ligne de la vallée, auprès du vieux mécanicien **Tokubei Mori**, le seul adulte qu'elle aime. Dans trente jours, la Compagnie Hokuto mettra le barrage en eau et les voix mourront, noyées sous la cote 412.

Avec l'enfant **Nobu**, la corneille **Kuro** et un jeune arpenteur de la Compagnie, **Sōta Aoki**, Hina recueille les voix dans des lanternes et les rend aux familles. Quand elle force enfin le tunnel n° 7, la voix de Ren lui dit la vérité : l'avalanche était un tir de mine, et c'est Tokubei qui tenait le détonateur.

La directrice **Madoka Ishigami** veut, elle, que ce tunnel disparaisse : sa fille Haruki y est morte le même jour, par un ordre qu'elle a signé. Et la cote réelle du barrage, 438, noiera aussi le village de relogement. Pour sauver les vivants, il faudra que les morts parlent à tout le monde. Il faudra aussi que Hina accepte le marché du Puits des voix : donner son unique mot, et ne plus jamais rien entendre.

=== note:mode-emploi ===
# Bienvenue dans « Kodama-sen »
Ce manga est un **projet d'exemple complet** de GANIS : une histoire entière, du prologue à l'épilogue, utilisée pour montrer chaque fonctionnalité. Tout est modifiable.

:::encadré blue
Pour repartir de l'exemple d'origine : mettez ce projet à la corbeille depuis le tableau de bord, fermez GANIS, puis lancez `npm run seed:manga` depuis le dépôt.
:::

## Visite en dix étapes
1. **Scénario › Chemin de fer** : les deux tomes en planches, de droite à gauche. Regardez [[node:c3p04|la page 4 du chapitre 3]] : son tourné de page est mal placé, l'alerte est volontaire.
2. **Une page** : ouvrez [[node:c1p02|la page 2 du chapitre 1]] : le dessin à gauche, les cases à droite, repliables une par une.
3. **Versions** : [[node:c1p04|la page 4 du chapitre 1]] garde une version nommée : comparez-la, restaurez-la.
4. **Recherche** (Ctrl+K) : cherchez « Chiyo », « bois est rentré » ou « cote ».
5. **Scénario › Continuité** : suivez Hina (écharpe, casquette) ou Kuro (son aile).
6. **Scénario › Suivi** : statuts par chapitre et alertes de volume ([[node:c4p02|ch. 4, p. 2]] dépasse le seuil).
7. **Trame** : quatre intrigues, le passé au-dessus du moment 1, la tension, les mystères et leurs indices.
8. **Personnages › Relations** : le graphe est déjà disposé. Kuro est un animal **et** un personnage.
9. **Documents** : [[node:ch3|chapitre 3]] pour les retours de l'éditrice et leurs versions ; [[node:ch2|chapitre 2]] pour la lecture de planches déposées sur le chapitre.
10. **Détails › Corbeille** et **Historique** : une scène coupée, un personnage retiré, et le journal.

=== note:fiche-serie ===
# Fiche de la série
| Rubrique | Choix |
|---|---|
| Titre | Kodama-sen — La ligne des échos |
| Genre | Seinen doux, fantastique ferroviaire |
| Public | À partir de 13 ans |
| Format | Récit complet en 2 tomes, noir et blanc, sens de lecture japonais |
| Équipe | Scénario et découpage ; dessin ; lettrage ; éditrice |

## Concept en une phrase
Une apprentie contrôleuse muette a trente jours pour recueillir les dernières paroles des morts avant qu'un barrage ne noie sa vallée.

## Promesses au lecteur
1. Après le prologue, Hina n'a **qu'une seule réplique** dans toute la série.
2. Chaque dernière parole doit être banale : personne ne meurt en faisant une belle phrase.
3. Personne n'est un monstre : ni Madoka, ni Oda, ni Tokubei.

=== note:regles ===
# Les échos : règles
## Le marché
- Une voix perdue pour une voix gardée : seuls les muets entendent les **phalènes-échos**.
- Une phalène garde **une seule phrase**, la dernière dite à cet endroit.
- Une **lanterne-écho** les conserve ; l'eau les tue.
- Au [[loc:puits|Puits des voix]], on peut rendre toutes les voix d'un coup, une seule fois, en payant de son unique mot.

:::encadré pink
Exception voulue : [[char:kuro|Kuro]] voit les phalènes, sans les entendre. Personne n'explique pourquoi.
:::

## Ce qu'elles ne font pas
- [ ] Répondre à une question.
- [ ] Mentir.
- [x] Dire exactement ce qui a été dit, même si c'est sans intérêt.

=== note:compagnie ===
# La Compagnie Hokuto
> « Personne ne meurt, dans mon calcul. Sauf ce qui est déjà mort. »

## Les deux cotes
| Cote | Usage | Conséquence |
|---|---|---|
| 412 | Publique, marquée dans toute la vallée | Noie Ashiro et Mitsumata |
| 438 | Réelle, calcul du déversoir | Noie aussi le tunnel n° 7 et le village de relogement |

:::schéma
{"boxes":[{"id":"conseil","label":"Conseil Hokuto","x":240,"y":0,"color":"pink"},{"id":"madoka","label":"Madoka, directrice","x":40,"y":120,"color":"blue"},{"id":"oda","label":"Oda, sécurité","x":440,"y":120,"color":"orange"},{"id":"sota","label":"Sōta, arpenteur","x":40,"y":240,"color":"green"}],"links":[{"id":"l1","source":"conseil","target":"madoka","label":"mandate"},{"id":"l2","source":"conseil","target":"oda","label":"paie"},{"id":"l3","source":"madoka","target":"sota","label":"dirige"}]}
:::

=== note:charte ===
# Charte graphique
## Codes
- **Bulles d'écho** : bord pointillé, jamais de queue.
- **Souvenir** : gouttières noires, trame de points.
- **Ardoise** : écriture manuscrite capitale, toujours cadrée dans la case.
- **Hina** : aucune bulle après le prologue, sauf [[node:c6p08|une]].

## Palette de couverture
Noir de locomotive, neige, rouge écharpe, bleu de cote.

:::enchaînement
- Crayonné du storyboard
- Validation éditrice
- Encrage
- Trames
- Lettrage
:::

=== note:continuite ===
# Continuité à surveiller
| Élément | Depuis | Détail |
|---|---|---|
| [[char:hina|Hina]], écharpe | [[node:c5p06|ch. 5, p. 6]] | Perdue, rendue au [[node:c6p04|ch. 6, p. 4]] |
| [[char:oda|Oda]], griffure | [[node:c5p06|ch. 5, p. 6]] | Joue gauche, jusqu'à la fin |
| [[char:tokubei|Tokubei]], annulaire | Avant le prologue | Phalange absente, sauf dans le souvenir |
| Casquette de [[char:ren|Ren]] | [[node:pr03|Prologue, p. 3]] | Portée par Hina, abandonnée au [[node:c6p10|ch. 6, p. 10]] |

=== note:lieux ===
# Repères de la vallée
[[loc:vallee|La vallée d'Ashiro]] descend du col vers la gorge. La [[loc:ligne|ligne]] dessert [[loc:ashiro|Ashiro]] et [[loc:mitsumata|Mitsumata]] par le [[loc:viaduc|viaduc]], passe sous la montagne par le [[loc:tunnel7|tunnel n° 7]] et finit au [[loc:barrage|barrage]].

=== note:idees ===
# Idées écartées
- Un frère jumeau de Sōta à la Compagnie : inutile.
- Une scène de cérémonie au sanctuaire au chapitre 2 : coupée, voir la corbeille.
- Hina qui retrouve sa voix à la fin : **non**. Elle l'a donnée.

=== note:brouillon-coupe ===
# Brouillon sans suite
Fin alternative où le train traverse le lac. Trop facile.
