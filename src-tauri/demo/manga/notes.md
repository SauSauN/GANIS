Notes du manga d'exemple « Hanaori » : synopsis et notes de travail.
« === synopsis === » : synopsis envoyé à l'éditrice (gardé comme version
nommée) ; « === synopsis-actuel === » : synopsis actuel ;
« === note:<clé> === » : texte d'une note. Balisage : voir ../README.md.

=== synopsis ===
Dans l'archipel d'Hanaori, **Sora**, apprentie cartographe née sans magie, hérite d'une carte qui trace une marée invisible. Quand le Culte des Sept Lunes enlève sa petite sœur, elle a quarante-neuf jours pour la retrouver.

=== synopsis-actuel ===
Dans l'archipel d'Hanaori, six lunes règlent les marées et donnent à presque tous la Lunéa, le pouvoir de les plier. Une septième lune a disparu il y a mille ans, dévorée par une ombre que l'on appelle le Mangeur de lunes.

**Sora Amane**, seize ans, est une sans-lune : elle ne plie rien. Apprentie cartographe, elle compense en dessinant tout ce qu'elle voit. À la mort de son grand-père **Haruo**, elle hérite d'une carte qui, sous les lunes, révèle une septième marée. La nuit même, la grande prêtresse **Aya Hoshino** enlève sa petite sœur **Yuzu**, qui porte sur la nuque le croissant du sang de la septième lune.

Il reste quarante-neuf jours avant la Conjonction, la nuit où les lunes s'alignent. Avec l'épéiste **Kaede Mori**, la mécanicienne **Mika Tsurugi**, l'équipage pirate de **Daisuke Kuroba**, l'enfant d'écume **Noé** et, bientôt, le prince rival **Jin Hayabusa**, Sora suit la septième marée jusqu'aux Archives englouties, où la prophétie lui apprend que le Culte veut nourrir le Mangeur de lunes avec sa sœur.

Le vieux moine **Oboro** lui révèle ce qu'elle est : la seule à lire les marées sans les plier, et la seule que le Mangeur de lunes ne peut pas dévorer. Sur l'Île blanche, Sora retrouvera aussi sa mère, **Rei**, devenue l'Oracle masquée du Culte pour retarder le Rite de l'intérieur. Pour refermer le ciel, il faudra qu'une sans-lune entre dans la bouche de l'ombre.

=== note:mode-emploi ===
# Bienvenue dans « Hanaori »
Ce manga est un **projet d'exemple complet** de GANIS : une histoire entière, du prologue à l'épilogue, avec vingt-trois personnages, utilisée pour montrer chaque fonctionnalité. Tout est modifiable.

:::encadré blue
Pour repartir de l'exemple d'origine : mettez ce projet à la corbeille depuis le tableau de bord, fermez GANIS, puis lancez `npm run seed:manga` depuis le dépôt.
:::

## Visite en douze étapes
1. **Scénario › Chemin de fer** : les deux tomes en planches, de droite à gauche. Le [[node:ch2|chapitre 2]] a une planche déposée sans page : l'alerte est volontaire.
2. **Une page** : ouvrez [[node:c1p04|la page 4 du chapitre 1]] : le dessin, le cadrage dynamique, les cases repliables une par une.
3. **Versions** : [[node:c1p03|la page 3 du chapitre 1]] garde une version nommée : comparez-la, restaurez-la.
4. **Recherche** (loupe en haut, ou Ctrl+F) : cherchez « Larme », « sans-lune » ou « septième marée ».
5. **Scénario › Continuité** : suivez la tache de [[char:yuzu|Yuzu]], la clochette ou le carnet de [[char:sora|Sora]].
6. **Scénario › Suivi** : statuts par chapitre et alertes de volume ([[node:c4p02|ch. 4, p. 2]] dépasse les seuils ; il manque deux pages au [[node:ch6|chapitre 6]]).
7. **Trame** : quatre intrigues, le passé au-dessus du moment 1 (le festin de Kagami, le départ de Rei), la tension, les mystères et leurs indices.
8. **Personnages › Relations** : le graphe est déjà disposé. Shiro est un animal **et** un personnage. Les fiches ont la carte « Pouvoirs ».
9. **Objets, Faune et flore, Factions** : la carte, la Larme, la Baleine lunaire, le Culte et son Cercle intérieur.
10. **Peuples** et **Magie** : la Voie des Sept Lunes, les Sans-Lune, la Lunéa, ses écoles et ses techniques. Regardez les cartes « Qui en fait partie » et « Qui la maîtrise ».
11. **Documents** : [[node:ch3|chapitre 3]] pour les retours de l'éditrice et leurs versions.
12. **Détails › Corbeille** et **Historique** : une page coupée, un personnage retiré, et le journal.

=== note:fiche-serie ===
# Fiche de la série
| Rubrique | Choix |
| --- | --- |
| Titre | Hanaori — L'Archipel des sept lunes |
| Format | Manga, deux tomes, lecture de droite à gauche |
| Public | Shōnen, à partir de 12 ans |
| Héroïne | [[char:sora|Sora Amane]], sans-lune, cartographe |
| Thème | Ce qui nous manque n'est pas toujours une faiblesse. |

## Promesse au lecteur
Une aventure maritime avec un équipage, un monde aux règles claires, et une héroïne qui gagne sans jamais devenir la plus forte.

=== note:regles-lunea ===
# La Lunéa : règles
:::encadré purple
Règle d'or : on ne plie que la marée de **sa** lune, et rien sans marée.
:::

- Six lunes, six marées : argent (vitesse, brume), rouge (force), bleue (courants), et trois autres à définir au tome 2.
- La septième lune est éteinte : seul le sang de [[char:yuzu|Yuzu]] en garde la marée.
- Les sans-lune ne plient rien, mais voient toutes les marées : voir [[node:c4p02|la leçon d'Oboro]].
- Le Mangeur de lunes ne dévore que ce qui a une lune.

## Ordre des révélations
:::enchaînement
- La carte trace une septième marée (ch. 1)
- La prophétie parle de l'enfant du sang (ch. 3)
- Sora lit sans plier (ch. 4)
- Une sans-lune ne peut pas être dévorée (ch. 6)
:::

=== note:culte ===
# Le Culte et la Conjonction
Le Culte des Sept Lunes est une branche radicale de la Voie. Il est dirigé par [[char:aya|Aya Hoshino]] et conseillé par l'Oracle masquée.

- Le Cercle de la Septième ne compte que sept masques.
- Le Rite de la Conjonction demande la Larme, la Partition des marées et l'enfant du sang.
- Le Régent [[char:masaru|Masaru]] finance le Culte qu'il interdit.

> Ils croient rallumer une lune. Ils ouvrent une bouche.

=== note:archipel ===
# Repères de l'archipel
- [[loc:kazeshima|Kazeshima]] : l'île de Sora, au nord.
- [[loc:brume|Port-Brume]] : le port des pirates et de la Guilde.
- [[loc:capitale|Tsukishiro]] : la capitale, sur son lac de reflets.
- [[loc:sunashima|Sunashima]] : les dunes de sel et l'observatoire.
- [[loc:ile-blanche|L'Île blanche]] : n'apparaît que les nuits de Conjonction.

## Distances (en jours de mer)
| De | À | Jours |
| --- | --- | --- |
| Kazeshima | Port-Brume | 3 |
| Port-Brume | Archives | 5 |
| Archives | Tsukishiro | 6 |
| Tsukishiro | Sunashima | 11 |

=== note:charte ===
# Charte graphique
Une couleur par lune, voir le document « Charte des lunes » du tome 1.

- [x] Septième lune et septième marée en blanc cassé, jamais argent.
- [x] Kagami : jamais de contour, toujours un vide dans les reflets.
- [ ] Choisir la couleur des trois lunes du tome 2.

=== note:continuite ===
# Continuité à surveiller
- [x] La tache de Yuzu et celle de Shiro ont la même forme.
- [x] La clochette reste à Sora du chapitre 1 au chapitre 5.
- [ ] Le crayon derrière l'oreille de Sora : vérifier chaque case du chapitre 6.
- [ ] Kiyoshi ne parle jamais : relire chaque bulle avant export.

=== note:idees ===
# Idées écartées
- Une huitième lune cachée : trop de règles.
- Sora qui gagne la Lunéa à la fin : contraire au thème.
- Faire de Kaede la mère de Sora : trop proche du twist de Rei.

=== note:brouillon-coupe ===
# Brouillon sans suite
Scène du marché où Kaede affronte trois gardes. Coupée au storyboard : faisait doublon avec la poursuite sur les toits.

=== note:lexique ===
# Lexique des marées
| Mot | Sens |
| --- | --- |
| Ressac | Premier rang de la Lunéa |
| Raz | Le plus haut rang |
| Sans-lune | Née sans lune |

Voir aussi le glossaire du projet (Détails › Glossaire).

=== note:planning ===
# Planning du tome 2
- [x] Storyboard du chapitre 4
- [x] Crayonné du chapitre 4
- [ ] Encrage du chapitre 5
- [ ] Lettrage du chapitre 6

:::encadré orange
Remise à l'éditrice : 15 décembre.
:::

=== note:references ===
# Références visuelles
- Les villages de pêcheurs de la mer intérieure de Seto.
- Les estampes de vagues pour la Lunéa d'argent.
- Les phares de bois des côtes du Hokkaidō.

Les images sont dans Détails › Galerie, dossier « Références ».
