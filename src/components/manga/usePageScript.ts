import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { draftFromScript, draftSignature, inputFromDraft, type PageDraft } from "@/lib/manga";
import { notifyMangaScriptChanged, onMangaScriptChanged } from "@/lib/mangaEvents";
import type { PageScript } from "@/types";

/**
 * Scénario d'une page en cours d'édition : version enregistrée, brouillon,
 * enregistrement. Après un enregistrement, les identifiants des nouvelles
 * cases et des nouveaux textes sont reportés dans le brouillon, même si
 * l'auteur a continué d'écrire pendant ce temps.
 */
export function usePageScript(projectId: string, pageId: string, enabled: boolean) {
  const [saved, setSaved] = useState<PageScript | null>(null);
  const [draft, setDraft] = useState<PageDraft | null>(null);
  const [failed, setFailed] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const savedSignature = useMemo(() => (saved ? draftSignature(draftFromScript(saved)) : null), [saved]);
  const signature = useMemo(() => (draft ? draftSignature(draft) : null), [draft]);
  const dirty = saved !== null && draft !== null && signature !== savedSignature;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const load = useCallback(async () => {
    try {
      const script = await api.getPageScript(projectId, pageId);
      setSaved(script);
      setDraft(draftFromScript(script));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [projectId, pageId]);

  useEffect(() => {
    if (!enabled) return;
    setSaved(null);
    setDraft(null);
    void load();
    // Case déplacée ou restaurée ailleurs : relue si rien n'est en cours ici.
    return onMangaScriptChanged(projectId, () => {
      if (!dirtyRef.current) void load();
    });
  }, [enabled, load, projectId]);

  /** Enregistre le brouillon ; renvoie le scénario enregistré (ou `null`). */
  const save = useCallback(
    async (pageLabel: string): Promise<PageScript | null> => {
      const sent = draftRef.current;
      if (!sent) return null;
      const result = await api.savePageScript(projectId, pageId, inputFromDraft(sent, pageLabel));
      // Clés locales → identifiants enregistrés (même ordre que l'envoi).
      const panelIds = new Map<string, string>();
      const textIds = new Map<string, string>();
      sent.panels.forEach((panel, i) => {
        const stored = result.panels[i];
        if (!stored) return;
        panelIds.set(panel.key, stored.id);
        panel.texts.forEach((text, j) => stored.texts[j] && textIds.set(text.key, stored.texts[j].id));
      });
      setSaved(result);
      setDraft((current) =>
        current
          ? {
              ...current,
              panels: current.panels.map((panel) => ({
                ...panel,
                id: panel.id ?? panelIds.get(panel.key),
                texts: panel.texts.map((text) => ({ ...text, id: text.id ?? textIds.get(text.key) })),
              })),
            }
          : current,
      );
      notifyMangaScriptChanged(projectId);
      return result;
    },
    [projectId, pageId],
  );

  return { saved, draft, setDraft, dirty, failed, signature, save, reload: load };
}
