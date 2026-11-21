import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { inputFromSceneDraft, sceneDraftFromScript, sceneDraftSignature, type SceneDraft } from "@/lib/series";
import { notifySeriesScriptChanged, onSeriesScriptChanged } from "@/stores/seriesStore";
import type { SceneScript } from "@/types";

/**
 * Scénario d'une scène en cours d'édition : version enregistrée, brouillon,
 * enregistrement. Après un enregistrement, les identifiants des nouveaux
 * éléments sont reportés dans le brouillon, même si l'auteur a continué
 * d'écrire pendant ce temps.
 */
export function useSceneScript(projectId: string, sceneId: string, enabled: boolean) {
  const [saved, setSaved] = useState<SceneScript | null>(null);
  const [draft, setDraft] = useState<SceneDraft | null>(null);
  const [failed, setFailed] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const savedSignature = useMemo(() => (saved ? sceneDraftSignature(sceneDraftFromScript(saved)) : null), [saved]);
  const signature = useMemo(() => (draft ? sceneDraftSignature(draft) : null), [draft]);
  const dirty = saved !== null && draft !== null && signature !== savedSignature;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  // Vrai pendant la notification de notre propre enregistrement : pas de
  // relecture (elle remonterait les champs et ferait perdre le curseur).
  const notifying = useRef(false);

  const load = useCallback(async () => {
    try {
      const script = await api.getSceneScript(projectId, sceneId);
      setSaved(script);
      setDraft(sceneDraftFromScript(script));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [projectId, sceneId]);

  useEffect(() => {
    if (!enabled) return;
    setSaved(null);
    setDraft(null);
    void load();
    // Version restaurée, scène sortie de la corbeille… : relue si rien n'est en cours ici.
    return onSeriesScriptChanged(projectId, () => {
      if (!dirtyRef.current && !notifying.current) void load();
    });
  }, [enabled, load, projectId]);

  /** Enregistre le brouillon ; renvoie le scénario enregistré (ou `null`). */
  const save = useCallback(async (): Promise<SceneScript | null> => {
    const sent = draftRef.current;
    if (!sent) return null;
    const result = await api.saveSceneScript(projectId, sceneId, inputFromSceneDraft(sent));
    // Clés locales → identifiants enregistrés (même ordre que l'envoi).
    const ids = new Map<string, string>();
    sent.blocks.forEach((block, i) => result.blocks[i] && ids.set(block.key, result.blocks[i].id));
    setSaved(result);
    setDraft((current) => (current ? { ...current, blocks: current.blocks.map((b) => ({ ...b, id: b.id ?? ids.get(b.key) })) } : current));
    // Les écouteurs sont appelés pendant `dispatchEvent` : le drapeau suffit.
    notifying.current = true;
    try {
      notifySeriesScriptChanged(projectId);
    } finally {
      notifying.current = false;
    }
    return result;
  }, [projectId, sceneId]);

  return { saved, draft, setDraft, dirty, failed, signature, save, reload: load };
}
