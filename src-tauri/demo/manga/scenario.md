// Scénario du manga d'exemple « Kazemusubi — Le garçon qui dénouait le vent ».
// Une page par bloc « === page <clé> | chapitre: <clé> … », une case par
// « --- case ». Format décrit dans src-tauri/src/services/demo_service/script.rs
// et ../README.md. Les clés des personnages et des lieux sont celles de projet.json.

// ===========================================================================
// Chapitre 1 — Le garçon qui dénouait le vent (18 pages, définitif)
// ===========================================================================

=== page c1p01 | chapitre: ch1 | rythme: pause
résumé: Ouverture : l'archipel d'Amaori, où les fileuses de la Guilde tissent le vent pour qui paie la dîme.

--- case
plan: extremeWide
rythme: pause
lieu: archipel
moment: Prologue
action: L'archipel vu du ciel : des dizaines d'îles et, sur les plus grandes, des tours de pierre coiffées de métiers à tisser géants. De chaque tour partent des fils de couleur qui montent jusqu'aux nuages.
dessin: Case sur les deux tiers de la page. Fils de vent translucides, couleur selon le vent (voir la note « Charte des fils »).
> récit: Dans l'archipel d'Amaori, le vent ne souffle pas.
> récit: Il se tisse.

--- case
plan: wide
lieu: tour-amaori
moment: Prologue
action: Au sommet de la Tour-métier d'Amaori, des fileuses en manteau blanc actionnent un métier haut comme une maison. Les fils de vent passent entre les lices.
décor: Charpente de bois sombre, lices de bambou, cloches à vent.
> récit: Les fileuses de la Guilde font la pluie, le calme et la brise.
> récit: Pour qui paie la dîme.

--- case
plan: insert
lieu: tour-amaori
moment: Prologue
action: Le registre de la dîme ouvert sur un pupitre : colonnes de noms d'îles et de sommes. La dernière ligne est barrée de rouge.
continuité: Le registre de la dîme réapparaît au tome 2 (procès d'Ume, chapitres 8 et 9).
> écrit: KESEN — DÎME DE VENT : IMPAYÉE

=== page c1p02 | chapitre: ch1 | rythme: transition | pdv: kai
résumé: Kesen, l'île pauvre. Kai ravaude les filets avec Tetsu et voit les fils de vent s'emmêler au-dessus du port.

--- case
plan: extremeWide
lieu: ile-kesen
moment: Jour 1 — matin
action: L'île de Kesen : falaise grise, village de bois serré autour d'un port minuscule. Sur la crête, la tour-métier de Kesen, éteinte, sans un seul fil.
dessin: La tour éteinte doit se lire d'un coup d'œil : comparer avec les tours de la page 1.
> récit: Kesen. L'île la plus pauvre de l'archipel.
> récit: Sa tour-métier est éteinte depuis trente ans.

--- case
plan: medium
lieu: quai
moment: Jour 1 — matin
persos: kai = Veste bleue, bandeau rouge ; tetsu = Ciré jaune
action: Kai, assis en tailleur sur le quai, un filet sur les genoux, la navette entre les dents. Tetsu pose à côté de lui un panier presque vide.
> tetsu: Trois sardines. Pour toute la matinée.
> kai: Le vent est mal noué, aujourd'hui.

--- case
plan: pov
lieu: quai
moment: Jour 1 — matin
persos: kai = Veste bleue, bandeau rouge
action: Ce que voit Kai : au-dessus du port, des fils de vent gris s'emmêlent en nœuds serrés.
dessin: Vue subjective de Kai. Les nœuds ressemblent à ceux d'un filet mal ravaudé.
> kai (pensée): Comme un filet que personne ne répare.

--- case
plan: medium
lieu: quai
moment: Jour 1 — matin
persos: kai = Veste bleue, bandeau rouge ; tetsu = Ciré jaune
action: Tetsu suit son regard et ne voit que le ciel. Kai hausse les épaules.
> tetsu: Mal noué ? Le vent ? Tu redis tes bêtises de gamin.
> kai: Laisse tomber.

=== page c1p03 | chapitre: ch1 | rythme: suspense
résumé: Un navire de la Guilde entre au port ; le capitaine Daigo cloue l'avis : Kesen recevra les vents bruts au troisième jour.

--- case
plan: wide
lieu: quai
moment: Jour 1 — midi
action: Un navire blanc entre au port, voiles marquées du fuseau et de la navette de la Guilde. Les villageois s'écartent du quai.
> sfx: DONG… DONG…

--- case
plan: lowAngle
lieu: quai
moment: Jour 1 — midi
persos: daigo = Manteau noir des Gardes, aiguille de fer à la ceinture
action: Daigo descend la passerelle, deux gardes du Fil derrière lui.
dessin: Contre-plongée : il doit paraître immense.
> daigo: Habitants de Kesen.

--- case
plan: medium
lieu: quai
moment: Jour 1 — midi
persos: daigo = Manteau noir des Gardes, aiguille de fer à la ceinture
action: Daigo plante l'avis sur le poteau du quai avec la pointe de son aiguille de fer.
> sfx: TCHAK

--- case
plan: insert
lieu: quai
moment: Jour 1 — midi
action: L'avis, cloué de travers.
> écrit: PAR ORDRE DU GRAND MÉTIER : KESEN N'A PAS ACQUITTÉ LA DÎME. AU TROISIÈME JOUR, L'ÎLE RECEVRA LES VENTS BRUTS.

=== page c1p04 | chapitre: ch1 | rythme: action | pdv: kai
résumé: Kai proteste devant tout le village ; Daigo le jette dans les filets.

--- case
plan: wide
lieu: quai
moment: Jour 1 — midi
persos: tetsu = Ciré jaune
action: Les villageois murmurent ; une vieille femme serre un châle contre elle.
> voix: Les vents bruts… Mais les bateaux sont dehors !

--- case
plan: medium
rythme: action
lieu: quai
moment: Jour 1 — midi
persos: kai = Veste bleue, bandeau rouge ; daigo = Manteau noir des Gardes, aiguille de fer à la ceinture
action: Kai saute sur une caisse pour être à hauteur de Daigo.
> kai: On n'a pas l'argent ! La pêche est vide depuis que vous nous coupez la brise !

--- case
plan: closeUp
lieu: quai
moment: Jour 1 — midi
persos: daigo = Manteau noir des Gardes, aiguille de fer à la ceinture
action: Daigo, sans colère, presque las.
> daigo: Le vent a un prix, petit. Comme le reste.

--- case
plan: full
rythme: action
lieu: quai
moment: Jour 1 — midi
persos: kai = Veste bleue, bandeau rouge ; daigo = Manteau noir des Gardes, aiguille de fer à la ceinture ; tetsu = Ciré jaune
action: D'un revers de son aiguille, Daigo envoie Kai rouler dans un tas de filets.
> sfx: VLAN
> tetsu: Kai !

=== page c1p05 | chapitre: ch1 | rythme: pause | pdv: kai
résumé: À la maison, grand-mère Ume file à son vieux fuseau. Kai lui avoue qu'il voit les fils.

--- case
plan: wide
lieu: maison-amaya
moment: Jour 1 — soir
persos: ume = Fuseau à la ceinture, toux
action: Intérieur pauvre. Un métier à tisser de bois dort sous une toile dans un coin. Ume, près du feu, file ; elle tousse.
décor: Filets pendus aux poutres, coffre de bois fermé à clé.
continuité: Le coffre fermé à clé sera ouvert au chapitre 2, page 7.
> sfx: KOF KOF

--- case
plan: medium
lieu: maison-amaya
moment: Jour 1 — soir
persos: kai = Veste bleue, bandeau rouge, égratignures au front ; ume = Fuseau à la ceinture, toux
action: Kai rentre, le front écorché, et se laisse tomber près du feu.
> kai: Trois jours, grand-mère. Ils vont nous envoyer une tempête dans trois jours.

--- case
plan: closeUp
lieu: maison-amaya
moment: Jour 1 — soir
persos: ume = Fuseau à la ceinture, toux
action: Le fuseau d'Ume tourne ; un fil rouge très fin en sort.
dessin: Le fil rouge est le même que celui du bandeau de Kai : c'est le motif de la série.
> ume: Alors on rentrera les bateaux et on attendra. Comme toujours.

--- case
plan: medium
lieu: maison-amaya
moment: Jour 1 — soir
persos: kai = Veste bleue, bandeau rouge, égratignures au front
action: Kai, tête baissée, joue avec un bout de filet.
> kai: Je les vois, tu sais. Les fils. Au-dessus du port, ils sont tout emmêlés.

=== page c1p06 | chapitre: ch1 | rythme: reveal | pdv: kai
résumé: Ume comprend que Kai voit les fils sans lunettes de trame et lui fait promettre de ne jamais en toucher un.

--- case
plan: insert
rythme: reveal
lieu: maison-amaya
moment: Jour 1 — soir
action: Le fuseau échappe aux doigts d'Ume et roule au sol.
> sfx: TOC

--- case
plan: medium
lieu: maison-amaya
moment: Jour 1 — soir
persos: ume = Fuseau à la ceinture, toux ; kai = Veste bleue, bandeau rouge, égratignures au front
action: Ume agrippe le poignet de Kai, avec une force qu'on ne lui soupçonnait pas.
> ume: Sans lunettes ? Tu les vois sans lunettes de trame ?

--- case
plan: closeUp
lieu: maison-amaya
moment: Jour 1 — soir
persos: kai = Veste bleue, bandeau rouge, égratignures au front
action: Kai, surpris, presque vexé.
> kai: Ben… oui. Depuis toujours. Pas toi ?

--- case
plan: closeUp
rythme: suspense
lieu: maison-amaya
moment: Jour 1 — soir
persos: ume = Fuseau à la ceinture, toux
action: Ume, grave, les yeux dans les yeux.
> ume: Écoute-moi bien, Kai. Ne touche jamais un fil de vent. Jamais. Promets-le.

--- case
plan: medium
lieu: maison-amaya
moment: Jour 1 — soir
persos: kai = Veste bleue, bandeau rouge, égratignures au front
action: Kai détourne les yeux vers la fenêtre.
> kai: …Promis.

=== page c1p07 | chapitre: ch1 | rythme: transition | pdv: kai
résumé: La nuit, sur le toit, Kai regarde les fils se serrer ; Tetsu ne voit que des nuages.

--- case
plan: extremeWide
rythme: pause
lieu: village-kesen
moment: Nuit 1
action: Le village endormi sous un ciel strié de fils gris qui se nouent lentement.
> récit: Cette nuit-là, Kai ne dormit pas.

--- case
plan: wide
lieu: maison-amaya
moment: Nuit 1
persos: kai = Veste bleue, bandeau rouge ; tetsu = Ciré jaune
action: Kai et Tetsu assis sur le toit de la maison Amaya, une couverture sur les épaules.
> tetsu: Tu les vois encore ?

--- case
plan: medium
lieu: maison-amaya
moment: Nuit 1
persos: kai = Veste bleue, bandeau rouge
action: Kai pointe le ciel du doigt.
> kai: Là. Ils serrent les nœuds. Comme quand on prépare un filet… sauf que le poisson, c'est nous.

--- case
plan: closeUp
lieu: maison-amaya
moment: Nuit 1
persos: tetsu = Ciré jaune
action: Tetsu plisse les yeux, sincère.
> tetsu: Moi, je vois des nuages.

=== page c1p08 | chapitre: ch1 | rythme: suspense | tourne
résumé: Troisième jour, à l'aube : les mouettes-tempête s'enfuient toutes ensemble ; le bateau du père de Tetsu est encore en mer ; un nœud noir se forme.

--- case
plan: wide
rythme: action
lieu: quai
moment: Jour 3 — aube
action: Toutes les mouettes-tempête du port s'envolent d'un coup.
dessin: Nuée d'oiseaux qui traverse la case en diagonale.
> sfx: FRRRRRRT

--- case
plan: medium
lieu: quai
moment: Jour 3 — aube
persos: tetsu = Ciré jaune
action: Tetsu, un filet à la main, regarde les oiseaux partir.
> tetsu: Les mouettes-tempête… Elles fuient toujours avant les vents bruts.

--- case
plan: wide
lieu: quai
moment: Jour 3 — aube
persos: tetsu = Ciré jaune
action: Au large, une petite barque, le Kamome, encore en mer.
> tetsu: Papa n'est pas rentré !

--- case
plan: extremeWide
rythme: suspense
lieu: ile-kesen
moment: Jour 3 — aube
action: Le ciel se fend : tous les fils gris tirent vers le centre et forment un énorme nœud noir au-dessus de l'île.
dessin: Grande case en bas de page : tourné de page sur le nœud.
> sfx: GRRRMMMM

=== page c1p09 | chapitre: ch1 | rythme: action
résumé: La tempête frappe Kesen.

--- case
plan: extremeWide
rythme: action
lieu: village-kesen
moment: Jour 3 — matin
action: La tempête s'abat sur le port : vagues par-dessus les quais, barques fracassées, toits arrachés.
dessin: Pleine page. Lignes de vitesse en diagonale ; les fils du nœud deviennent des tourbillons noirs.
> sfx: VWOOOOOOOM

--- case
plan: wide
rythme: action
lieu: village-kesen
moment: Jour 3 — matin
action: En incrustation, des villageois courent, pliés en deux sous la pluie.
> voix: Aux abris !

=== page c1p10 | chapitre: ch1 | rythme: suspense | pdv: kai
résumé: Nami, la petite sœur de Tetsu, est coincée au bout de la jetée ; Kai court et voit un fil à portée de main.

--- case
plan: wide
lieu: jetee
moment: Jour 3 — matin
persos: nami = Robe trempée
action: Au bout de la jetée, Nami s'agrippe à une bitte d'amarrage ; les vagues passent par-dessus elle.
> nami: Tetsu !!

--- case
plan: medium
lieu: quai
moment: Jour 3 — matin
persos: tetsu = Ciré jaune, trempé
action: Tetsu se débat, retenu par deux villageois.
> tetsu: NAMI !

--- case
plan: american
rythme: action
lieu: jetee
moment: Jour 3 — matin
persos: kai = Veste bleue, bandeau rouge
action: Kai court sur la jetée contre le vent, plié en deux.
> kai (pensée): Trop loin… Elle est trop loin !

--- case
plan: pov
rythme: suspense
lieu: jetee
moment: Jour 3 — matin
persos: kai = Veste bleue, bandeau rouge
action: Ce que voit Kai : un fil du nœud, épais comme une corde, pend juste devant lui.
dessin: Le fil doit paraître tangible. Écho visuel de la page 6 (la promesse).
> kai (pensée): Ne touche jamais un fil de vent.

=== page c1p11 | chapitre: ch1 | rythme: reveal | pdv: kai
résumé: Kai attrape le fil, se brûle la main et tire.

--- case
plan: extremeCloseUp
rythme: reveal
lieu: jetee
moment: Jour 3 — matin
persos: kai = Veste bleue, bandeau rouge
action: La main droite de Kai se referme sur le fil.
> sfx: ZZT

--- case
plan: closeUp
lieu: jetee
moment: Jour 3 — matin
persos: kai = Main droite brûlée, veste bleue, bandeau rouge
action: Le visage de Kai crispé de douleur ; le fil fume dans sa paume.
continuité: Main droite brûlée à partir de cette case.
> kai: Gnnnh… !

--- case
plan: full
rythme: action
lieu: jetee
moment: Jour 3 — matin
persos: kai = Main droite brûlée, veste bleue, bandeau rouge
action: Il tire de toutes ses forces, les pieds plantés dans les planches.
> kai: Pardon, grand-mère…
> sfx: KRRRRR

--- case
plan: insert
lieu: jetee
moment: Jour 3 — matin
action: Le nœud noir commence à glisser.
> sfx: … CLIC

=== page c1p12 | chapitre: ch1 | rythme: reveal
résumé: Le nœud se défait ; la tempête s'effiloche d'un coup.

--- case
plan: extremeWide
rythme: reveal
lieu: ile-kesen
moment: Jour 3 — matin
persos: kai = Main droite brûlée, veste bleue, bandeau rouge
action: Le grand nœud noir se défait ; les fils se dénouent en rubans qui s'envolent ; la lumière perce les nuages. Kai, minuscule, au bout de la jetée, le bras levé.
dessin: Pleine page, la seule du chapitre sans texte de personnage. Les fils redeviennent clairs en se dénouant (du gris au bleu pâle).
> sfx: FWAAAAAAAH

=== page c1p13 | chapitre: ch1 | rythme: pause
résumé: Silence. Nami est sauve ; les villageois regardent Kai sans comprendre.

--- case
plan: wide
rythme: pause
lieu: village-kesen
moment: Jour 3 — matin
action: Le port sous un ciel lavé ; la mer se calme d'un coup.
> récit: Puis il n'y eut plus un souffle.

--- case
plan: medium
lieu: jetee
moment: Jour 3 — matin
persos: tetsu = Ciré jaune, trempé ; nami = Robe trempée
action: Tetsu serre Nami dans ses bras.
> nami: Le vent… Il est parti tout seul ?

--- case
plan: full
lieu: jetee
moment: Jour 3 — matin
persos: kai = Main droite brûlée, veste bleue, bandeau rouge
action: Kai à genoux, la main droite fumante serrée contre sa poitrine.
> kai: Ha… ha…

--- case
plan: wide
rythme: suspense
lieu: quai
moment: Jour 3 — matin
action: À l'arrière-plan, les villageois regardent Kai, méfiants.
> voix: C'est le petit Amaya qui a fait ça ?

=== page c1p14 | chapitre: ch1 | rythme: suspense | pdv: mio
résumé: Dans la baie, une apprentie de la Guilde, Mio, a tout vu à travers ses lunettes de trame.

--- case
plan: wide
lieu: ile-kesen
moment: Jour 3 — matin
persos: mio = Manteau de la Guilde, lunettes de trame, gants de soie
action: Un esquif blanc de la Guilde, voile repliée, immobile dans la baie. Une silhouette debout à la proue.

--- case
plan: closeUp
rythme: reveal
lieu: ile-kesen
moment: Jour 3 — matin
persos: mio = Manteau de la Guilde, lunettes de trame, gants de soie
action: Mio relève ses lunettes de trame, livide.
dessin: Première apparition de Mio : visage net, regard dur, mèche collée par la pluie.
> mio: Impossible…

--- case
plan: pov
lieu: ile-kesen
moment: Jour 3 — matin
persos: mio = Manteau de la Guilde, lunettes de trame, gants de soie
action: À travers les lunettes : des fils dénoués qui flottent au-dessus du port comme des cheveux.
dessin: Vue à travers les lunettes : cercle, léger grain. Moins précis que la vue de Kai page 2.
> mio (pensée): Trois jours de tissage… Défaits à la main.

--- case
plan: medium
lieu: ile-kesen
moment: Jour 3 — matin
persos: mio = Manteau de la Guilde, lunettes relevées, gants de soie
action: Mio serre le bastingage.
> mio: Un dénoueur. Sur Kesen.

=== page c1p15 | chapitre: ch1 | rythme: action
résumé: Mio débarque et accuse Kai d'avoir défait un tissage de la Guilde.

--- case
plan: american
rythme: action
lieu: quai
moment: Jour 3 — matin
persos: mio = Manteau de la Guilde, lunettes relevées, gants de soie
action: Mio saute de l'esquif sur le quai, manteau blanc claquant.
> mio: Toi !

--- case
plan: wide
lieu: jetee
moment: Jour 3 — matin
persos: kai = Main droite brûlée, veste bleue, bandeau rouge ; tetsu = Ciré jaune, trempé ; nami = Robe trempée
action: Kai, Tetsu et Nami se retournent.

--- case
plan: closeUp
lieu: jetee
moment: Jour 3 — matin
persos: mio = Manteau de la Guilde, lunettes relevées, gants de soie
action: Mio, furieuse.
> mio: Qu'est-ce que tu as fait ? C'était un tissage de la Guilde !

--- case
plan: closeUp
lieu: jetee
moment: Jour 3 — matin
persos: kai = Main droite brûlée, veste bleue, bandeau rouge
action: Kai, le regard droit.
> kai: C'était une tempête. Sur des gens.

--- case
plan: medium
rythme: pause
lieu: jetee
moment: Jour 3 — matin
persos: mio = Manteau de la Guilde, lunettes relevées, gants de soie
action: Mio, déstabilisée une seconde, récite.
> mio: Une tempête commandée. Payée. Réglementaire.

=== page c1p16 | chapitre: ch1 | rythme: suspense
résumé: Ume arrive, chasse Mio ; Mio remarque son fuseau.

--- case
plan: wide
lieu: jetee
moment: Jour 3 — matin
persos: ume = Fuseau à la ceinture, toux, appuyée sur un bâton ; mio = Manteau de la Guilde, lunettes relevées, gants de soie
action: Ume s'avance sur la jetée, appuyée sur un bâton.
> ume: Va-t'en, petite fileuse.

--- case
plan: closeUp
lieu: jetee
moment: Jour 3 — matin
persos: mio = Manteau de la Guilde, lunettes relevées, gants de soie
action: Mio fixe le fuseau à la ceinture d'Ume.
continuité: Le fuseau d'Ume : bois noir, bague de cuivre gravée du sceau de la Guilde.
> mio (pensée): Ce fuseau… Un fuseau de la Guilde.

--- case
plan: medium
lieu: jetee
moment: Jour 3 — matin
persos: ume = Fuseau à la ceinture, toux, appuyée sur un bâton ; kai = Main droite brûlée, veste bleue, bandeau rouge
action: Ume prend la main brûlée de Kai et la regarde longuement.
> ume: Tu avais promis.

--- case
plan: closeUp
lieu: jetee
moment: Jour 3 — matin
persos: kai = Main droite brûlée, veste bleue, bandeau rouge
action: Kai ne baisse pas les yeux.
> kai: Nami allait se noyer.

=== page c1p17 | chapitre: ch1 | rythme: transition
résumé: Le soir, Ume bande la main de Kai ; Mio, au pied de la tour éteinte, hésite à écrire « dénoueur » dans son rapport.

--- case
plan: medium
lieu: maison-amaya
moment: Jour 3 — soir
persos: ume = Fuseau à la ceinture, toux ; kai = Main droite bandée, veste bleue, bandeau rouge
action: Ume enroule un bandage autour de la main de Kai, sans un mot de plus.
continuité: Main droite bandée à partir d'ici (jusqu'au chapitre 4).
> ume: Demain, tu ne sors pas.

--- case
plan: wide
lieu: tour-kesen
moment: Jour 3 — soir
action: La tour-métier de Kesen, éteinte, au crépuscule ; au pied, la lueur d'un petit campement.

--- case
plan: medium
lieu: tour-kesen
moment: Jour 3 — soir
persos: mio = Manteau ouvert, lunettes sur le front, gants de soie
action: Mio écrit à la lampe, sur un papier à en-tête de la Guilde.
> écrit: Rapport au Maître-tisserand Hiraga. Kesen, troisième jour.

--- case
plan: insert
rythme: suspense
lieu: tour-kesen
moment: Jour 3 — soir
action: La plume s'arrête au-dessus de la feuille.
> mio (pensée): Si j'écris ce mot, ils viendront le chercher.

=== page c1p18 | chapitre: ch1 | rythme: reveal | tourne | pdv: mio
résumé: Mio monte dans la tour éteinte : les fils du métier ont été coupés exprès, et le tissage défait par Kai était un nœud de punition — celui qu'on lui a fait tisser à son examen.

--- case
plan: wide
lieu: tour-kesen
moment: Jour 3 — nuit
persos: mio = Manteau ouvert, lunettes sur le front, gants de soie
action: En haut de l'escalier de la tour, un métier géant couvert de poussière et de toiles d'araignée. Ses lices pendent, tranchées.
> mio: Pourquoi ce métier est-il éteint ?

--- case
plan: insert
lieu: tour-kesen
moment: Jour 3 — nuit
action: Les fils coupés du métier : coupés net, pas usés.
dessin: Les coupures doivent être franches, volontaires.
> mio (pensée): Coupés. Exprès.

--- case
plan: overShoulder
lieu: tour-kesen
moment: Jour 3 — nuit
persos: mio = Manteau ouvert, lunettes de trame, gants de soie
action: Par la fenêtre de la tour, Mio observe avec ses lunettes les restes du tissage qui flottent encore au-dessus du port.
> mio (pensée): Et ce motif-là… Je le connais.

--- case
plan: closeUp
rythme: reveal
lieu: tour-kesen
moment: Jour 3 — nuit
persos: mio = Manteau ouvert, lunettes de trame, gants de soie
action: Le visage de Mio dans la pénombre, les yeux écarquillés.
> mio: Un nœud de punition. C'est celui de mon examen… On m'avait dit que c'était un exercice.
> récit: À suivre.

// ===========================================================================
// Chapitre 2 — La fileuse (16 pages, en relecture)
// ===========================================================================

=== page c2p01 | chapitre: ch2 | rythme: suspense | pdv: mio
résumé: À l'aube, Mio envoie son rapport sur un cerf-volant messager : elle écrit « rupture naturelle ».

--- case
plan: extremeWide
lieu: tour-kesen
moment: Jour 4 — aube
persos: mio = Manteau de la Guilde, lunettes de trame, gants de soie
action: Au sommet de la tour, Mio lâche un cerf-volant messager aux couleurs de la Guilde ; il glisse le long d'un fil de vent vers le large.

--- case
plan: insert
lieu: tour-kesen
moment: Jour 4 — aube
action: La lettre roulée et scellée, accrochée au cerf-volant. On lit la fin.
> écrit: … rupture naturelle du tissage. Aucun dénoueur constaté. M. Tsugane.

--- case
plan: closeUp
lieu: tour-kesen
moment: Jour 4 — aube
persos: mio = Manteau de la Guilde, lunettes de trame, gants de soie
action: Mio regarde le cerf-volant disparaître.
> mio (pensée): Premier mensonge à la Guilde.

=== page c2p02 | chapitre: ch2 | rythme: pause | pdv: kai
résumé: Le père de Tetsu est rentré ; le village évite Kai mais lui laisse des poissons en cachette.

--- case
plan: wide
lieu: quai
moment: Jour 4 — matin
persos: kai = Main droite bandée, veste bleue, bandeau rouge
action: Kai ravaude un filet de la main gauche. Les villageois passent en le contournant largement.

--- case
plan: medium
lieu: quai
moment: Jour 4 — matin
persos: tetsu = Ciré jaune ; kai = Main droite bandée, veste bleue, bandeau rouge
action: Tetsu pose à côté de Kai un panier plein de maquereaux.
> tetsu: Mon père est rentré. Il dit que c'est grâce à toi. Mais faut pas le répéter.

--- case
plan: insert
lieu: quai
moment: Jour 4 — matin
action: Devant la porte de la maison Amaya, trois paniers de poisson déposés sans un mot.
> kai (pensée): Ils ont peur de moi. Mais ils ont faim aussi.

=== page c2p03 | chapitre: ch2 | rythme: transition
résumé: Mio annonce qu'elle est chargée de rallumer la tour de Kesen.

--- case
plan: full
lieu: quai
moment: Jour 4 — matin
persos: mio = Manteau de la Guilde, lunettes de trame, gants de soie ; kai = Main droite bandée, veste bleue, bandeau rouge
action: Mio se plante devant Kai, un rouleau de plans sous le bras.
> mio: La Guilde m'a chargée de rallumer le métier de Kesen.

--- case
plan: closeUp
lieu: quai
moment: Jour 4 — matin
persos: kai = Main droite bandée, veste bleue, bandeau rouge
action: Kai la regarde de travers.
> kai: Pour mieux nous envoyer des tempêtes ?

--- case
plan: medium
lieu: quai
moment: Jour 4 — matin
persos: mio = Manteau de la Guilde, lunettes de trame, gants de soie
action: Mio, piquée.
> mio: Pour que vous ayez de la pluie au bon moment, idiot.

=== page c2p04 | chapitre: ch2 | rythme: suspense
résumé: Mio exige que Kai lui montre ce qu'il voit, sinon elle dira son nom ; Kai comprend qu'elle ne l'a pas dénoncé.

--- case
plan: overShoulder
lieu: quai
moment: Jour 4 — matin
persos: mio = Manteau de la Guilde, lunettes de trame, gants de soie ; kai = Main droite bandée, veste bleue, bandeau rouge
action: Mio baisse la voix.
> mio: Tu vas me montrer comment tu les vois. Sinon, je donne ton nom.

--- case
plan: closeUp
lieu: quai
moment: Jour 4 — matin
persos: kai = Main droite bandée, veste bleue, bandeau rouge
action: Kai réfléchit, puis sourit à moitié.
> kai: Tu l'as pas déjà donné ?

--- case
plan: closeUp
rythme: pause
lieu: quai
moment: Jour 4 — matin
persos: mio = Manteau de la Guilde, lunettes de trame, gants de soie
action: Silence de Mio. Elle détourne les yeux.
> sfx: …

=== page c2p05 | chapitre: ch2 | rythme: transition | pdv: kai
résumé: Sur la falaise, Kai montre à Mio les fils lâches et les fils serrés au-dessus de la mer.

--- case
plan: extremeWide
lieu: falaise
moment: Jour 4 — après-midi
persos: kai = Main droite bandée, veste bleue, bandeau rouge ; mio = Manteau de la Guilde, lunettes de trame, gants de soie
action: Kai et Mio au bord de la falaise ; la mer à perte de vue, des fils de vent clairs au-dessus.

--- case
plan: medium
lieu: falaise
moment: Jour 4 — après-midi
persos: kai = Main droite bandée, veste bleue, bandeau rouge
action: Kai montre du doigt différents endroits du ciel.
> kai: Là, ils sont lâches : brise de terre. Là, serrés : ça va tourner au nord avant ce soir.

--- case
plan: pov
lieu: falaise
moment: Jour 4 — après-midi
persos: mio = Manteau de la Guilde, lunettes de trame, gants de soie
action: Vue à travers les lunettes de Mio : les mêmes fils, flous, comme derrière une vitre mouillée.
> mio (pensée): Je n'en vois que la moitié.

--- case
plan: closeUp
lieu: falaise
moment: Jour 4 — après-midi
persos: mio = Manteau de la Guilde, lunettes de trame, gants de soie
action: Mio baisse ses lunettes, frustrée.
> mio: Comment tu fais sans lunettes ?
> kai: Je regarde.

=== page c2p06 | chapitre: ch2 | rythme: pause
résumé: Mio explique le tissage de la Guilde ; elle avoue qu'elle a protégé Kai parce qu'il a défait un nœud qu'aucune fileuse ne sait défaire.

--- case
plan: wide
lieu: falaise
moment: Jour 4 — après-midi
persos: mio = Manteau de la Guilde, lunettes sur le front, gants de soie ; kai = Main droite bandée, veste bleue, bandeau rouge
action: Assis dans l'herbe, Mio dessine dans la terre un schéma de trame avec un bâton.
> mio: Un bon tissage, c'est la pluie au bon moment, le calme pour la pêche. La Guilde garde les îles en vie.

--- case
plan: insert
lieu: falaise
moment: Jour 4 — après-midi
action: Le schéma dans la terre : une trame régulière, et au centre un nœud compliqué.
dessin: Le nœud dessiné reprend le motif du nœud noir de la page 8 du chapitre 1.

--- case
plan: medium
lieu: falaise
moment: Jour 4 — après-midi
persos: kai = Main droite bandée, veste bleue, bandeau rouge
action: Kai pose le doigt sur le nœud.
> kai: Et ça ? Pourquoi tu m'as pas dénoncé ?

--- case
plan: closeUp
rythme: reveal
lieu: falaise
moment: Jour 4 — après-midi
persos: mio = Manteau de la Guilde, lunettes sur le front, gants de soie
action: Mio, sans le regarder.
> mio: Parce que tu as défait à mains nues un nœud qu'aucune fileuse ne sait défaire.

=== page c2p07 | chapitre: ch2 | rythme: reveal | pdv: ume
résumé: Ume les regarde de loin, ouvre le coffre fermé à clé : un manteau blanc de la Guilde.

--- case
plan: wide
lieu: maison-amaya
moment: Jour 4 — soir
persos: ume = Fuseau à la ceinture, toux
action: Par la fenêtre, Ume voit Kai et Mio redescendre ensemble le chemin de la falaise.

--- case
plan: medium
lieu: maison-amaya
moment: Jour 4 — soir
persos: ume = Fuseau à la ceinture, toux
action: Ume tousse dans un mouchoir et le replie vite.
continuité: Ume est de plus en plus malade : garder la toux dans toutes ses apparitions.
> sfx: KOF… KOF…

--- case
plan: full
rythme: reveal
lieu: maison-amaya
moment: Jour 4 — soir
persos: ume = Fuseau à la ceinture, toux
action: Ume ouvre le coffre fermé à clé : un manteau blanc de fileuse, plié, avec l'insigne de la Guilde et un galon d'argent de maîtresse.
dessin: Le manteau est plus orné que celui de Mio : Ume était une maîtresse fileuse.
> ume: Trente ans…

=== page c2p08 | chapitre: ch2 | rythme: pause | pdv: kai
résumé: La nuit, Ume apprend à Kai la première règle : un fil s'écoute avant de se tirer. Il tient une brise sans se brûler.

--- case
plan: wide
lieu: maison-amaya
moment: Nuit 4
persos: ume = Fuseau à la ceinture, toux ; kai = Main droite bandée, veste bleue, bandeau rouge
action: Ume ouvre la fenêtre ; un fil de brise, fin et clair, entre dans la pièce.
> ume: Puisque tu ne sais pas tenir une promesse, apprends au moins à tenir un fil.

--- case
plan: closeUp
lieu: maison-amaya
moment: Nuit 4
persos: ume = Fuseau à la ceinture, toux
action: Ume, sérieuse, un doigt levé.
> ume: Première règle : un fil s'écoute avant de se tirer.

--- case
plan: extremeCloseUp
lieu: maison-amaya
moment: Nuit 4
persos: kai = Main droite bandée, veste bleue, bandeau rouge
action: La main gauche de Kai effleure le fil sans le serrer. Le fil vibre doucement.
dessin: Petites ondes autour des doigts. Pas de fumée : il ne brûle pas.
> sfx: mmmmm…

--- case
plan: closeUp
rythme: reveal
lieu: maison-amaya
moment: Nuit 4
persos: kai = Main droite bandée, veste bleue, bandeau rouge
action: Kai, émerveillé.
> kai: Il… il parle.

=== page c2p09 | chapitre: ch2 | rythme: reveal
résumé: Kai comprend qu'Ume était fileuse ; elle évoque « les Récifs » et refuse d'en dire plus.

--- case
plan: medium
lieu: maison-amaya
moment: Nuit 4
persos: kai = Main droite bandée, veste bleue, bandeau rouge ; ume = Fuseau à la ceinture, toux
action: Kai lâche le fil, qui repart par la fenêtre.
> kai: Tu savais tout ça. Tu étais fileuse, grand-mère.

--- case
plan: closeUp
lieu: maison-amaya
moment: Nuit 4
persos: ume = Fuseau à la ceinture, toux
action: Ume regarde le feu.
> ume: Pendant vingt ans. Jusqu'aux Récifs.

--- case
plan: closeUp
lieu: maison-amaya
moment: Nuit 4
persos: kai = Main droite bandée, veste bleue, bandeau rouge
action: Kai, perdu.
> kai: Les Récifs ? Les Récifs Hurlants ?

--- case
plan: wide
rythme: pause
lieu: maison-amaya
moment: Nuit 4
persos: ume = Fuseau à la ceinture, toux
action: Ume lui tourne le dos et souffle la lampe.
> ume: Dors.

=== page c2p10 | chapitre: ch2 | rythme: action | pdv: mio
résumé: Dans la tour, Mio n'arrive pas à rallumer le métier ; elle ôte son gant et touche un fil à mains nues.

--- case
plan: wide
lieu: tour-kesen
moment: Jour 5 — matin
persos: mio = Manteau de la Guilde, lunettes de trame, gants de soie
action: Mio, en sueur, tente de lancer la navette dans le vieux métier. Rien ne s'accroche.
> mio: Allez… Accroche-toi !

--- case
plan: medium
lieu: tour-kesen
moment: Jour 5 — matin
persos: kai = Main droite bandée, veste bleue, bandeau rouge ; mio = Manteau de la Guilde, lunettes de trame, gants de soie
action: Kai apparaît dans l'escalier, mains dans les poches.
> kai: Tu le tiens comme un poisson mort.

--- case
plan: closeUp
lieu: tour-kesen
moment: Jour 5 — matin
persos: mio = Manteau de la Guilde, lunettes de trame, gants de soie
action: Mio fusille Kai du regard, puis regarde son gant de soie.
> mio (pensée): Les fileuses ne touchent jamais un fil à mains nues.

--- case
plan: insert
rythme: action
lieu: tour-kesen
moment: Jour 5 — matin
persos: mio = Gant droit retiré, manteau de la Guilde, lunettes de trame
action: Mio arrache son gant droit avec les dents.
continuité: Mio sans gant droit à partir d'ici.

=== page c2p11 | chapitre: ch2 | rythme: reveal | pdv: mio
résumé: Pour la première fois, Mio entend un fil « chanter ».

--- case
plan: extremeCloseUp
lieu: tour-kesen
moment: Jour 5 — matin
persos: mio = Gant droit retiré, manteau de la Guilde, lunettes de trame
action: Les doigts nus de Mio sur un fil de vent ; il pique comme une ortie.
> sfx: TSST

--- case
plan: closeUp
rythme: reveal
lieu: tour-kesen
moment: Jour 5 — matin
persos: mio = Gant droit retiré, manteau de la Guilde, lunettes relevées
action: Mio ferme les yeux. Une larme coule.
> mio: Il chante.

--- case
plan: medium
rythme: pause
lieu: tour-kesen
moment: Jour 5 — matin
persos: kai = Main droite bandée, veste bleue, bandeau rouge ; mio = Gant droit retiré, manteau de la Guilde, lunettes relevées
action: Kai s'assoit à côté d'elle, sans se moquer.
> kai: Ouais. Celui-là, il chante faux, mais il chante.

=== page c2p12 | chapitre: ch2 | rythme: suspense
résumé: Le navire de Daigo revient : le Grand Métier a enregistré un nœud défait à la main.

--- case
plan: wide
lieu: ile-kesen
moment: Jour 5 — midi
action: Le navire blanc de la Guilde réapparaît dans la baie.
> sfx: DONG… DONG…

--- case
plan: medium
lieu: quai
moment: Jour 5 — midi
persos: daigo = Manteau noir des Gardes, aiguille de fer à la ceinture
action: Daigo sur le pont, un rouleau de papier à la main.
> daigo: « Rupture naturelle »… Le Grand Métier dit autre chose.

--- case
plan: insert
lieu: quai
moment: Jour 5 — midi
action: Le rouleau : un relevé du Grand Métier où un nœud est marqué « défait à la main ».
> écrit: KESEN — NŒUD Nº 7 : DÉFAIT À LA MAIN. ENQUÊTER.

--- case
plan: wide
rythme: suspense
lieu: tour-kesen
moment: Jour 5 — midi
persos: mio = Gant droit retiré, manteau de la Guilde, lunettes de trame ; kai = Main droite bandée, veste bleue, bandeau rouge
action: Depuis la fenêtre de la tour, Mio et Kai voient le navire accoster.
> mio: Ils savent.

=== page c2p13 | chapitre: ch2 | rythme: suspense
résumé: Daigo fouille le village ; dans la maison Amaya, il trouve le fuseau d'Ume.

--- case
plan: wide
lieu: village-kesen
moment: Jour 5 — après-midi
persos: daigo = Manteau noir des Gardes, aiguille de fer à la ceinture
action: Les gardes du Fil fouillent les maisons ; les villageois se taisent.
> daigo: Qui a vu le nœud se défaire ?

--- case
plan: medium
lieu: maison-amaya
moment: Jour 5 — après-midi
persos: daigo = Manteau noir des Gardes, aiguille de fer à la ceinture ; ume = Fuseau sur la table, toux
action: Daigo entre dans la maison Amaya sans frapper. Ume, assise, ne se lève pas.

--- case
plan: insert
rythme: reveal
lieu: maison-amaya
moment: Jour 5 — après-midi
action: Sur la table, le fuseau de bois noir à la bague de cuivre gravée.
continuité: Le fuseau quitte la ceinture d'Ume ici : posé sur la table.

=== page c2p14 | chapitre: ch2 | rythme: reveal
résumé: Daigo reconnaît « la Fileuse des Récifs », que la Guilde croyait morte.

--- case
plan: closeUp
lieu: maison-amaya
moment: Jour 5 — après-midi
persos: daigo = Manteau noir des Gardes, aiguille de fer à la ceinture
action: Daigo prend le fuseau, lit la gravure de la bague.
> daigo: Le fuseau de la Fileuse des Récifs.

--- case
plan: medium
lieu: maison-amaya
moment: Jour 5 — après-midi
persos: daigo = Manteau noir des Gardes, fuseau d'Ume en main ; ume = Toux, sans son fuseau
action: Il se tourne vers Ume.
> daigo: Ume Amaya. La Guilde te croyait morte.

--- case
plan: closeUp
lieu: maison-amaya
moment: Jour 5 — après-midi
persos: ume = Toux, sans son fuseau
action: Ume, droite, digne.
> ume: Je l'étais. Pour vous.

=== page c2p15 | chapitre: ch2 | rythme: action
résumé: Kai arrive trop tard ; Ume l'empêche de se battre ; Daigo l'arrête pour désertion.

--- case
plan: wide
rythme: action
lieu: maison-amaya
moment: Jour 5 — après-midi
persos: kai = Main droite bandée, veste bleue, bandeau rouge ; mio = Gant droit retiré, manteau de la Guilde, lunettes de trame ; daigo = Manteau noir des Gardes, fuseau d'Ume en main ; ume = Toux, sans son fuseau, poignets liés
action: Kai et Mio font irruption ; deux gardes lient les poignets d'Ume.
> kai: Lâchez-la !

--- case
plan: full
rythme: action
lieu: maison-amaya
moment: Jour 5 — après-midi
persos: kai = Main droite bandée, veste bleue, bandeau rouge ; daigo = Manteau noir des Gardes, fuseau d'Ume en main
action: Kai se jette sur Daigo, qui le bloque de son aiguille de fer.
> sfx: KLANG

--- case
plan: closeUp
lieu: maison-amaya
moment: Jour 5 — après-midi
persos: ume = Toux, sans son fuseau, poignets liés
action: Ume, d'une voix qui claque.
> ume: Kai ! Souviens-toi de ta promesse.

--- case
plan: medium
lieu: maison-amaya
moment: Jour 5 — après-midi
persos: daigo = Manteau noir des Gardes, fuseau d'Ume en main ; mio = Gant droit retiré, manteau de la Guilde, lunettes de trame
action: Daigo, sans un regard pour Mio.
> daigo: Elle sera jugée au Grand Métier d'Amaori pour désertion. Toi, apprentie, ton rapport m'intéresse aussi.

=== page c2p16 | chapitre: ch2 | rythme: reveal | tourne | pdv: kai
résumé: Le navire emporte Ume. Kai décide d'aller la chercher ; Mio ôte son second gant : elle l'aidera.

--- case
plan: extremeWide
rythme: pause
lieu: ile-kesen
moment: Jour 5 — soir
action: Le navire blanc quitte la baie au coucher du soleil.

--- case
plan: medium
lieu: jetee
moment: Jour 5 — soir
persos: kai = Main droite bandée, veste bleue, bandeau rouge
action: Kai au bout de la jetée, le poing bandé serré.
> kai: Je vais la chercher.

--- case
plan: medium
lieu: jetee
moment: Jour 5 — soir
persos: mio = Sans gants, manteau de la Guilde, lunettes de trame
action: Mio, à côté de lui, retire son gant gauche et le laisse tomber dans l'eau.
continuité: Mio sans gants à partir d'ici.
> mio: Alors il faut que tu apprennes à dénouer sans brûler.

--- case
plan: wide
rythme: suspense
lieu: ile-kesen
moment: Jour 5 — soir
persos: ume = Toux, sans son fuseau, poignets liés ; daigo = Manteau noir des Gardes, fuseau d'Ume en main
action: Sur le pont du navire, Ume regarde Kesen s'éloigner. Derrière elle, Daigo fait tourner le fuseau entre ses doigts.
> récit: Fin du chapitre 2.

// ===========================================================================
// Chapitre 3 — Les Récifs Hurlants (en cours : 8 pages scénarisées sur 18 prévues)
// ===========================================================================

=== page c3p01 | chapitre: ch3 | rythme: transition | pdv: kai
résumé: Le père de Tetsu prête le Kamome ; Tetsu refuse de laisser Kai partir seul.

--- case
plan: wide
lieu: quai
moment: Jour 6 — aube
persos: kai = Main droite bandée, veste bleue, bandeau rouge, sac de voyage ; tetsu = Ciré jaune, sac de voyage
action: Le Kamome à quai, voile rapiécée. Tetsu y charge des tonnelets d'eau.
> tetsu: Mon père dit qu'il te doit un bateau.

--- case
plan: medium
lieu: quai
moment: Jour 6 — aube
persos: kai = Main droite bandée, veste bleue, bandeau rouge, sac de voyage
action: Kai, gêné.
> kai: Je peux pas t'emmener, Tetsu. Amaori, c'est la Guilde.

--- case
plan: closeUp
lieu: quai
moment: Jour 6 — aube
persos: tetsu = Ciré jaune, sac de voyage
action: Tetsu, têtu, croise les bras.
> tetsu: Tu sais pas barrer. Moi, si.

=== page c3p02 | chapitre: ch3 | rythme: transition
résumé: Mio arrive avec la carte des trames : pour éviter les patrouilles, il faut passer par les Récifs Hurlants, où la Guilde ne tisse jamais.

--- case
plan: full
lieu: quai
moment: Jour 6 — aube
persos: mio = Sans gants, manteau de la Guilde retourné (doublure grise), lunettes de trame
action: Mio arrive en courant, le manteau retourné pour cacher l'insigne, une carte roulée à la main.
continuité: Manteau retourné à partir d'ici : on ne voit plus l'insigne de la Guilde.
> mio: Vous partez sans carte ? Vous êtes fous.

--- case
plan: insert
lieu: quai
moment: Jour 6 — aube
action: La carte des trames : l'archipel, les routes de vent tissées en couleur, et une zone vide entourée de dents : les Récifs Hurlants.
dessin: La zone des Récifs est blanche sur la carte : aucun fil.
> écrit: RÉCIFS HURLANTS — NON TISSÉ

--- case
plan: medium
lieu: quai
moment: Jour 6 — aube
persos: mio = Sans gants, manteau de la Guilde retourné (doublure grise), lunettes de trame ; tetsu = Ciré jaune, sac de voyage
action: Mio pose le doigt sur la zone blanche.
> mio: Les patrouilles surveillent toutes les routes tissées. Sauf celle-là.
> tetsu: Parce que personne n'en revient.

=== page c3p03 | chapitre: ch3 | rythme: pause
résumé: Nami donne à Kai le fil rouge du fuseau d'Ume ; le Kamome part ; quelques villageois saluent de loin.

--- case
plan: medium
lieu: quai
moment: Jour 6 — aube
persos: nami = Robe sèche, châle ; kai = Main droite bandée, veste bleue, bandeau rouge, sac de voyage
action: Nami tend à Kai une pelote de fil rouge.
> nami: C'était sur le rouet de ta grand-mère. Pour que tu retrouves le chemin.

--- case
plan: insert
lieu: quai
moment: Jour 6 — aube
persos: kai = Main droite bandée, veste bleue, bandeau rouge, fil rouge au poignet
action: Kai noue le fil rouge à son poignet bandé.
continuité: Fil rouge au poignet droit de Kai à partir d'ici.

--- case
plan: extremeWide
rythme: pause
lieu: ile-kesen
moment: Jour 6 — matin
action: Le Kamome quitte le port. Sur la falaise et le quai, quelques villageois lèvent la main, sans oser crier.
> récit: Ce matin-là, Kesen ne dit rien. Mais Kesen regardait.

=== page c3p04 | chapitre: ch3 | rythme: pause
résumé: En mer, Mio apprend à Kai à lire la carte, Kai lui apprend à écouter ; Tetsu barre et se moque d'eux.

--- case
plan: wide
lieu: archipel
moment: Jour 6 — midi
persos: kai = Main droite bandée, veste bleue, bandeau rouge, fil rouge au poignet ; mio = Sans gants, manteau retourné, lunettes de trame ; tetsu = Ciré jaune
action: Le Kamome en pleine mer ; Mio et Kai penchés sur la carte, Tetsu à la barre.
> mio: Ce trait bleu, c'est un courant tissé : on le suit jusqu'à la deuxième île.

--- case
plan: medium
lieu: archipel
moment: Jour 6 — midi
persos: kai = Main droite bandée, veste bleue, bandeau rouge, fil rouge au poignet ; mio = Sans gants, manteau retourné, lunettes de trame
action: Kai prend la main nue de Mio et la lève vers un fil au-dessus du bateau.
> kai: Ou alors tu fermes les yeux et tu demandes au fil où il va.

--- case
plan: closeUp
lieu: archipel
moment: Jour 6 — midi
persos: tetsu = Ciré jaune
action: Tetsu, à la barre, lève les yeux au ciel.
> tetsu: Vous voulez que je vous laisse seuls avec votre ficelle ?

=== page c3p05 | chapitre: ch3 | rythme: reveal | pdv: mio
résumé: La nuit, Mio avoue : elle a menti dans son rapport, et elle a tissé un nœud de punition à son examen.

--- case
plan: wide
rythme: pause
lieu: archipel
moment: Nuit 6
persos: mio = Sans gants, manteau retourné, lunettes de trame ; kai = Main droite bandée, veste bleue, bandeau rouge, fil rouge au poignet
action: Nuit étoilée. Tetsu dort sur les filets ; Kai et Mio veillent à la proue.
> kai: Pourquoi t'as menti, dans ton rapport ?

--- case
plan: closeUp
lieu: archipel
moment: Nuit 6
persos: mio = Sans gants, manteau retourné, lunettes de trame
action: Mio serre ses genoux contre elle.
> mio: Parce que la tempête de Kesen était un nœud de punition.

--- case
plan: closeUp
rythme: reveal
lieu: archipel
moment: Nuit 6
persos: mio = Sans gants, manteau retourné, lunettes de trame
action: Mio regarde ses mains nues.
> mio: J'en ai tissé un, Kai. À mon examen. Et quelque part, une île l'a reçu.

--- case
plan: medium
lieu: archipel
moment: Nuit 6
persos: kai = Main droite bandée, veste bleue, bandeau rouge, fil rouge au poignet
action: Kai ne répond rien. Il défait le fil rouge de son poignet, en coupe un morceau avec les dents et le noue au poignet de Mio.
continuité: Mio porte aussi un brin de fil rouge au poignet à partir d'ici.

=== page c3p06 | chapitre: ch3 | rythme: reveal | tourne
résumé: À l'aube, les Récifs Hurlants : des fils sauvages, jamais tissés. Kai comprend qu'ils ne sont pas emmêlés, mais libres.

--- case
plan: extremeWide
rythme: reveal
lieu: recifs
moment: Jour 7 — aube
action: Les Récifs Hurlants surgissent de la brume : des rochers comme des dents, la mer qui gronde, et au-dessus des centaines de fils sauvages qui ondulent en tous sens.
dessin: Double page si possible. Les fils sauvages sont plus fins, plus colorés et plus vivants que les fils tissés.
> sfx: HOOOOOOOUUUU

--- case
plan: medium
lieu: recifs
moment: Jour 7 — aube
persos: tetsu = Ciré jaune
action: Tetsu, blême, à la barre.
> tetsu: Les Récifs…

--- case
plan: closeUp
rythme: reveal
lieu: recifs
moment: Jour 7 — aube
persos: kai = Main droite bandée, veste bleue, bandeau rouge, fil rouge au poignet
action: Kai, ébloui, le visage levé vers les fils.
> kai: Ils ne sont pas emmêlés. Ils sont… libres.

=== page c3p07 | chapitre: ch3 | rythme: action | pdv: kai
résumé: L'entrée dans les Récifs : un mur de fils barre la passe. Kai applique la première règle d'Ume et ouvre un passage sans se brûler.

--- case
plan: wide
rythme: suspense
lieu: recifs
moment: Jour 7 — aube
persos: tetsu = Ciré jaune ; kai = Main droite bandée, veste bleue, bandeau rouge, fil rouge au poignet ; mio = Sans gants, manteau retourné, lunettes de trame, fil rouge au poignet
action: Le Kamome s'engage entre deux rochers. Devant l'étrave, des dizaines de fils sauvages tendus d'un rocher à l'autre, comme un rideau.
décor: Rochers noirs couverts d'algues, écume, brume basse.
> tetsu: Si on passe là-dedans, on chavire.

--- case
plan: closeUp
lieu: recifs
moment: Jour 7 — aube
persos: kai = Main droite bandée, veste bleue, bandeau rouge, fil rouge au poignet
action: Kai ferme les yeux et tend la main gauche, paume ouverte, sans toucher.
continuité: Il utilise la main gauche : la droite est encore bandée.
> kai (pensée): Un fil s'écoute avant de se tirer.

--- case
plan: extremeCloseUp
rythme: reveal
lieu: recifs
moment: Jour 7 — aube
persos: kai = Main droite bandée, veste bleue, bandeau rouge, fil rouge au poignet
action: Les doigts de Kai effleurent un fil ; le fil s'écarte de lui-même, comme une herbe qu'on caresse.
dessin: Mêmes petites ondes qu'au chapitre 2, page 8. Pas de fumée.
> sfx: fffuu…

--- case
plan: wide
rythme: action
lieu: recifs
moment: Jour 7 — aube
persos: kai = Main droite bandée, veste bleue, bandeau rouge, fil rouge au poignet ; mio = Sans gants, manteau retourné, lunettes de trame, fil rouge au poignet ; tetsu = Ciré jaune
action: Le rideau de fils s'ouvre en deux devant le Kamome, qui passe au milieu.
> mio: Tu ne les dénoues pas… Tu leur demandes de s'écarter.

=== page c3p08 | chapitre: ch3 | rythme: action | tourne | pdv: mio
résumé: Une lame de fond. La carte ne sert plus à rien ; Mio ferme les yeux, écoute les fils à mains nues et guide Tetsu à la voix.

--- case
plan: extremeWide
rythme: action
lieu: recifs
moment: Jour 7 — matin
action: Une vague énorme se lève derrière le Kamome, plus haute que le mât.
dessin: Le bateau minuscule dans le coin inférieur ; la vague occupe toute la case.
> sfx: VRRRRROOOOM

--- case
plan: insert
lieu: recifs
moment: Jour 7 — matin
action: La carte des trames, trempée, sur le pont : dans la zone des Récifs, rien que du blanc.
continuité: La carte est abîmée à partir d'ici (coin déchiré, encre coulée).

--- case
plan: closeUp
rythme: reveal
lieu: recifs
moment: Jour 7 — matin
persos: mio = Sans gants, manteau retourné, lunettes sur le front, fil rouge au poignet
action: Mio relève ses lunettes, ferme les yeux et lève ses deux mains nues vers les fils.
dessin: Écho de la page 4 de ce chapitre (« tu demandes au fil où il va »).
> mio: Tetsu… Barre à gauche. Maintenant !

--- case
plan: full
rythme: action
lieu: recifs
moment: Jour 7 — matin
persos: tetsu = Ciré jaune ; kai = Main droite bandée, veste bleue, bandeau rouge, fil rouge au poignet
action: Tetsu pousse la barre de tout son poids ; Kai s'agrippe au mât. Le Kamome glisse sur le flanc de la vague.
> tetsu: Accrochez-vous !!

--- case
plan: wide
rythme: suspense
lieu: recifs
moment: Jour 7 — matin
persos: mio = Sans gants, manteau retourné, lunettes sur le front, fil rouge au poignet
action: La vague se brise derrière eux. Dans le calme qui suit, Mio, les mains encore levées, ouvre les yeux.
> mio (pensée): Je les ai entendus. Sans lunettes.

=== page c3p09 | chapitre: ch3
résumé: À scénariser : une voile noire à l'horizon, celle des Dénoueurs.
