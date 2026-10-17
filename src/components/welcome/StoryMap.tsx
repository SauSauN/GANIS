/**
 * Illustration de l'accueil : un plateau de trame en miniature.
 *
 * Trois intrigues parallèles portent des scènes ; des personnages y sont
 * reliés par des fils, deux d'entre eux par une relation, et un lieu
 * ancre une scène. C'est la façon dont GANIS organise un récit, dessinée
 * avec les couleurs du thème actif (clair, sombre ou personnalisé).
 *
 * Décorative : masquée aux lecteurs d'écran. Les fils se tracent une fois
 * à l'ouverture (désactivé si l'utilisateur limite les animations).
 */

/** Intrigues : ordonnée et intensité du trait. */
const LANES = [
  { y: 262, tone: "var(--primary)", width: 2 },
  { y: 318, tone: "color-mix(in oklab, var(--primary) 55%, var(--background))", width: 1.5 },
  { y: 374, tone: "color-mix(in oklab, var(--muted-foreground) 45%, var(--background))", width: 1.5 },
];

/** Scènes posées sur les intrigues (`lane` = index dans LANES). */
const SCENES = [
  { id: "s1", x: 64, lane: 0, accent: true },
  { id: "s2", x: 196, lane: 0 },
  { id: "s3", x: 352, lane: 0, accent: true },
  { id: "s4", x: 470, lane: 0 },
  { id: "s5", x: 132, lane: 1 },
  { id: "s6", x: 286, lane: 1, accent: true },
  { id: "s7", x: 420, lane: 1 },
  { id: "s8", x: 230, lane: 2 },
  { id: "s9", x: 506, lane: 2 },
];

/** Personnages : position et scènes où ils apparaissent. */
const CHARACTERS = [
  { id: "c1", x: 108, y: 92, scenes: ["s1", "s5"] },
  { id: "c2", x: 268, y: 54, scenes: ["s2", "s6", "s8"] },
  { id: "c3", x: 424, y: 104, scenes: ["s3", "s7"] },
];

/** Lieu (épingle) et la scène qu'il ancre. */
const PLACE = { x: 520, y: 176, scene: "s4" };

const CARD_W = 52;
const CARD_H = 28;

function sceneCenter(id: string) {
  const scene = SCENES.find((item) => item.id === id)!;
  return { x: scene.x + CARD_W / 2, y: LANES[scene.lane].y };
}

/** Fil courbe d'un point haut vers une scène. */
function thread(from: { x: number; y: number }, to: { x: number; y: number }) {
  const midY = (from.y + to.y) / 2;
  return `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y - CARD_H / 2}`;
}

export function StoryMap({ className }: { className?: string }) {
  let order = 0;
  const delay = () => ({ animationDelay: `${120 + order++ * 70}ms` });

  return (
    <svg
      viewBox="0 0 580 420"
      aria-hidden
      focusable="false"
      className={className}
      fill="none"
    >
      {/* Chapitres : repères verticaux discrets */}
      {[170, 330, 470].map((x) => (
        <line
          key={x}
          x1={x}
          x2={x}
          y1={226}
          y2={404}
          stroke="var(--border)"
          strokeDasharray="2 6"
        />
      ))}

      {/* Intrigues */}
      {LANES.map((lane) => (
        <path
          key={lane.y}
          d={`M 16 ${lane.y} C 180 ${lane.y - 10}, 380 ${lane.y + 10}, 564 ${lane.y}`}
          stroke={lane.tone}
          strokeWidth={lane.width}
          strokeLinecap="round"
          pathLength={1}
          className="story-draw"
          style={delay()}
        />
      ))}

      {/* Relation entre deux personnages */}
      <path
        d={`M ${CHARACTERS[0].x + 20} ${CHARACTERS[0].y - 8} Q 180 30, ${CHARACTERS[1].x - 20} ${CHARACTERS[1].y}`}
        stroke="var(--muted-foreground)"
        strokeOpacity={0.5}
        strokeDasharray="3 5"
      />

      {/* Fils personnage → scènes */}
      {CHARACTERS.flatMap((character) =>
        character.scenes.map((sceneId) => (
          <path
            key={`${character.id}-${sceneId}`}
            d={thread({ x: character.x, y: character.y + 22 }, sceneCenter(sceneId))}
            stroke="var(--primary)"
            strokeOpacity={0.45}
            strokeWidth={1.25}
            pathLength={1}
            className="story-draw"
            style={delay()}
          />
        )),
      )}

      {/* Fil lieu → scène */}
      <path
        d={thread({ x: PLACE.x, y: PLACE.y + 6 }, sceneCenter(PLACE.scene))}
        stroke="var(--muted-foreground)"
        strokeOpacity={0.6}
        strokeWidth={1.25}
        pathLength={1}
        className="story-draw"
        style={delay()}
      />

      {/* Scènes */}
      {SCENES.map((scene) => {
        const y = LANES[scene.lane].y - CARD_H / 2;
        return (
          <g key={scene.id} className="story-fade" style={delay()}>
            <rect
              x={scene.x}
              y={y}
              width={CARD_W}
              height={CARD_H}
              rx={6}
              fill={
                scene.accent
                  ? "color-mix(in oklab, var(--primary) 14%, var(--card))"
                  : "var(--card)"
              }
              stroke={scene.accent ? "var(--primary)" : "var(--border)"}
              strokeOpacity={scene.accent ? 0.6 : 1}
            />
            {/* Lignes de texte suggérées */}
            <line
              x1={scene.x + 9}
              x2={scene.x + CARD_W - 14}
              y1={y + 11}
              y2={y + 11}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.55}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <line
              x1={scene.x + 9}
              x2={scene.x + CARD_W - 24}
              y1={y + 18}
              y2={y + 18}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.3}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {/* Personnages */}
      {CHARACTERS.map((character, index) => (
        <g key={character.id} className="story-fade" style={delay()}>
          <circle
            cx={character.x}
            cy={character.y}
            r={22}
            fill="var(--card)"
            stroke={index === 1 ? "var(--primary)" : "var(--border)"}
            strokeWidth={index === 1 ? 1.5 : 1}
          />
          {/* Silhouette */}
          <circle
            cx={character.x}
            cy={character.y - 5}
            r={6}
            fill="color-mix(in oklab, var(--primary) 70%, var(--card))"
          />
          <path
            d={`M ${character.x - 11} ${character.y + 13} a 11 9 0 0 1 22 0`}
            fill="color-mix(in oklab, var(--primary) 40%, var(--card))"
          />
        </g>
      ))}

      {/* Lieu */}
      <g className="story-fade" style={delay()}>
        <ellipse
          cx={PLACE.x}
          cy={PLACE.y + 8}
          rx={16}
          ry={4}
          fill="var(--muted-foreground)"
          fillOpacity={0.15}
        />
        <path
          d={`M ${PLACE.x} ${PLACE.y + 6} C ${PLACE.x - 4} ${PLACE.y - 4}, ${PLACE.x - 13} ${PLACE.y - 10}, ${PLACE.x - 13} ${PLACE.y - 20} a 13 13 0 0 1 26 0 C ${PLACE.x + 13} ${PLACE.y - 10}, ${PLACE.x + 4} ${PLACE.y - 4}, ${PLACE.x} ${PLACE.y + 6} Z`}
          fill="var(--card)"
          stroke="var(--muted-foreground)"
          strokeOpacity={0.7}
        />
        <circle
          cx={PLACE.x}
          cy={PLACE.y - 20}
          r={4.5}
          fill="var(--muted-foreground)"
          fillOpacity={0.7}
        />
      </g>
    </svg>
  );
}
