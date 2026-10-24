import type { Editor } from "@tiptap/core";
import { readText as readNativeClipboard } from "@tauri-apps/plugin-clipboard-manager";
import { isTauri } from "@/lib/api";

/*
 * Menu Édition : annuler, rétablir, couper, copier, coller, tout
 * sélectionner, appliqués au dernier champ utilisé (zone de texte, champ
 * de saisie ou éditeur de note).
 *
 * Ouvrir un menu peut déplacer le clavier sur le menu : le dernier champ
 * actif est donc mémorisé (`trackEditableFocus`) et retrouvé avant
 * d'agir.
 */

let lastEditable: HTMLElement | null = null;

/** Vrai pour un champ où l'on tape du texte. */
export function isEditable(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
  if (element instanceof HTMLInputElement) {
    return (
      !element.readOnly &&
      !element.disabled &&
      ["text", "search", "email", "url", "tel", "password", "number", ""].includes(element.type)
    );
  }
  return false;
}

/** À appeler une fois : suit le dernier champ de saisie utilisé. */
export function trackEditableFocus(): () => void {
  const onFocus = (event: FocusEvent) => {
    if (isEditable(event.target as Element)) lastEditable = event.target as HTMLElement;
  };
  document.addEventListener("focusin", onFocus);
  return () => document.removeEventListener("focusin", onFocus);
}

/** Champ visé : celui qui a le clavier, sinon le dernier utilisé (s'il est encore affiché). */
function target(): HTMLElement | null {
  const active = document.activeElement;
  if (isEditable(active)) return active;
  if (lastEditable && lastEditable.isConnected) return lastEditable;
  return null;
}

/** Vrai s'il existe un champ où appliquer une action d'édition. */
export function hasEditTarget(): boolean {
  return target() !== null;
}

/** Éditeur de note (TipTap) qui contient l'élément, s'il y en a un. */
function tiptapOf(element: HTMLElement): Editor | null {
  const root = element.closest(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null;
  return root?.editor ?? null;
}

export type EditAction = "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll";

/**
 * Applique une action d'édition au champ visé. Renvoie `false` s'il n'y a
 * aucun champ (l'appelant peut alors faire autre chose, comme annuler la
 * dernière suppression) ou si le système a refusé (presse-papiers).
 */
export async function runEditAction(action: EditAction): Promise<boolean> {
  const element = target();
  if (!element) return false;

  element.focus();
  const editor = tiptapOf(element);

  if (editor) {
    switch (action) {
      case "undo":
        return editor.commands.undo();
      case "redo":
        return editor.commands.redo();
      case "selectAll":
        return editor.commands.selectAll();
      case "paste": {
        const text = await readClipboard();
        return text !== null && editor.commands.insertContent(text);
      }
      default:
        return document.execCommand(action);
    }
  }

  switch (action) {
    case "selectAll":
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.select();
        return true;
      }
      return document.execCommand("selectAll");
    case "paste": {
      const text = await readClipboard();
      return text !== null && document.execCommand("insertText", false, text);
    }
    default:
      return document.execCommand(action);
  }
}

/**
 * Texte du presse-papiers.
 *
 * Dans l'application, la WebView refuse `navigator.clipboard.readText()`
 * (pas de geste « coller » du système) : le texte est lu par le
 * presse-papiers natif (extension officielle de Tauri, permission
 * `clipboard-manager:allow-read-text`). Dans un navigateur de
 * développement, l'API du navigateur sert de secours.
 */
async function readClipboard(): Promise<string | null> {
  if (isTauri()) {
    try {
      return await readNativeClipboard();
    } catch {
      /* presse-papiers vide ou sans texte : essai suivant */
    }
  }

  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}
