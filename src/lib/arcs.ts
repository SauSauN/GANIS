/*
 * Arc d'un personnage : ce qu'il croit au départ (le mensonge) et ce qu'il
 * comprend à la fin (la vérité), son désir et son besoin, puis ses étapes,
 * chacune rattachée à un élément du découpage (chapitre, scène…), avec son
 * état intérieur de -5 (le mensonge domine) à +5 (la vérité est acceptée),
 * le choix qu'il fait et sa conséquence.
 *
 * Ce n'est pas la continuité (blessure, tenue, objet porté : `state` des
 * personnages d'une scène) ni la trame (ce qui arrive) : c'est ce qui
 * change en lui.
 *
 * Fonctions pures (testées) ; l'enregistrement est dans `stores/arcStore.ts`.
 */

export type ArcType = "positive" | "redemption" | "flat" | "circular" | "negative" | "corruption" | "disillusionment" | "tragic";

/** Types d'arc, rangés par sens du changement (pour la liste du choix). */
export const ARC_TYPE_GROUPS: Array<{ id: "up" | "steady" | "down"; types: ArcType[] }> = [
  // Il change en mieux.
  { id: "up", types: ["positive", "redemption"] },
  // Il ne change pas (ou revient au départ) : c'est lui qui change le monde, ou la boucle qui compte.
  { id: "steady", types: ["flat", "circular"] },
  // Il change en pire.
  { id: "down", types: ["negative", "corruption", "disillusionment", "tragic"] },
];
export const ARC_TYPES: ArcType[] = ARC_TYPE_GROUPS.flatMap((group) => group.types);

export const ARC_MIN = -5;
export const ARC_MAX = 5;

export interface ArcBeat {
  id: string;
  /** Élément du découpage où l'étape a lieu ; `null` : pas encore placée. */
  nodeId: string | null;
  /** État intérieur, de -5 à +5. */
  value: number;
  /** Ce qui se joue (« Affronter Hautemure »). */
  step: string;
  choice: string;
  consequence: string;
}

export interface CharacterArcData {
  version: 1;
  type: ArcType;
  lie: string;
  truth: string;
  want: string;
  need: string;
  beats: ArcBeat[];
}

const MAX_SHORT = 300;
const MAX_LONG = 2000;
const MAX_BEATS = 300;

const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

export function newArcId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function blankArc(): CharacterArcData {
  return { version: 1, type: "positive", lie: "", truth: "", want: "", need: "", beats: [] };
}

/** État intérieur lu (entier de -5 à +5 ; 0 par défaut). */
export function arcValue(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(ARC_MAX, Math.max(ARC_MIN, n)) : 0;
}

/** Arc lisible et cohérent à partir de n'importe quel JSON enregistré. */
export function normalizeArc(raw: unknown): CharacterArcData {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const beats: ArcBeat[] = [];
  for (const value of Array.isArray(o.beats) ? o.beats : []) {
    const b = (value ?? {}) as Record<string, unknown>;
    let id = typeof b.id === "string" && b.id ? b.id : newArcId();
    if (seen.has(id)) id = newArcId();
    seen.add(id);
    beats.push({
      id,
      nodeId: typeof b.nodeId === "string" && b.nodeId ? b.nodeId : null,
      value: arcValue(b.value),
      step: str(b.step, MAX_SHORT),
      choice: str(b.choice, MAX_LONG),
      consequence: str(b.consequence, MAX_LONG),
    });
    if (beats.length >= MAX_BEATS) break;
  }
  return {
    version: 1,
    type: ARC_TYPES.includes(o.type as ArcType) ? (o.type as ArcType) : "positive",
    lie: str(o.lie, MAX_SHORT),
    truth: str(o.truth, MAX_SHORT),
    want: str(o.want, MAX_SHORT),
    need: str(o.need, MAX_SHORT),
    beats,
  };
}

/** Un arc sans rien d'écrit (inutile de l'enregistrer). */
export function isEmptyArc(arc: CharacterArcData): boolean {
  return !arc.lie && !arc.truth && !arc.want && !arc.need && arc.beats.length === 0 && arc.type === "positive";
}

/**
 * Étapes dans l'ordre du récit (ordre du plan) ; celles qui ne sont pas
 * placées, ou dont l'élément n'existe plus, viennent à la fin dans l'ordre
 * où elles ont été écrites.
 */
export function orderedBeats(arc: CharacterArcData, structureOrder: ReadonlyMap<string, number>): ArcBeat[] {
  const rank = (beat: ArcBeat) => (beat.nodeId !== null && structureOrder.has(beat.nodeId) ? structureOrder.get(beat.nodeId)! : Number.POSITIVE_INFINITY);
  return arc.beats
    .map((beat, index) => ({ beat, index }))
    .sort((a, b) => rank(a.beat) - rank(b.beat) || a.index - b.index)
    .map((item) => item.beat);
}

/** Changement d'état par rapport à l'étape précédente (`null` pour la première). */
export function arcDeltas(beats: ArcBeat[]): Array<number | null> {
  return beats.map((beat, index) => (index === 0 ? null : beat.value - beats[index - 1].value));
}

/** Résumé : premier et dernier état, plus grande chute (rechute) entre deux étapes. */
export function arcSummary(beats: ArcBeat[]): { first: number; last: number; worstDrop: number } | null {
  if (!beats.length) return null;
  const deltas = arcDeltas(beats).filter((d): d is number => d !== null);
  return { first: beats[0].value, last: beats[beats.length - 1].value, worstDrop: Math.min(0, ...deltas) };
}
