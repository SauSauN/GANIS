import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { fieldClass } from "@/components/workspace/views/PageShell";
import { buildFolderTree, type FolderNode } from "@/lib/notes";
import { cn } from "@/lib/utils";
import type { NoteFolder } from "@/types";

interface FolderSelectProps {
  id?: string;
  folders: NoteFolder[];
  value: string | null;
  onChange: (folderId: string | null) => void;
  disabled?: boolean;
  className?: string;
}

/** Liste déroulante des dossiers, en retrait selon leur profondeur. */
export function FolderSelect({ id, folders, value, onChange, disabled, className }: FolderSelectProps) {
  const { t } = useTranslation("notes");

  const options = useMemo(() => {
    const result: Array<{ id: string; label: string }> = [];
    const walk = (nodes: FolderNode[]) => {
      for (const node of nodes) {
        result.push({ id: node.folder.id, label: `${"   ".repeat(node.depth)}${node.folder.name}` });
        walk(node.children);
      }
    };
    walk(buildFolderTree(folders));
    return result;
  }, [folders]);

  return (
    <select
      id={id}
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
      className={cn(fieldClass, "h-9", className)}
    >
      <option value="">{t("folder.root")}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Dossiers dans l'ordre de l'arbre, avec un retrait selon la profondeur. */
export function useFolderOptions(folders: NoteFolder[]): Array<{ id: string; label: string }> {
  return useMemo(() => {
    const result: Array<{ id: string; label: string }> = [];
    const walk = (nodes: FolderNode[]) => {
      for (const node of nodes) {
        result.push({ id: node.folder.id, label: `${"\u00a0\u00a0\u00a0".repeat(node.depth)}${node.folder.name}` });
        walk(node.children);
      }
    };
    walk(buildFolderTree(folders));
    return result;
  }, [folders]);
}

/** Date courte dans la langue de l'interface. */
export function formatNoteDate(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
