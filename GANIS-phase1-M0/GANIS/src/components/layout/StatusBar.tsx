import { useEffect, useState } from "react";
import { Check, HardDrive, WifiOff } from "lucide-react";
import { api } from "@/lib/api";
import type { AppInfo } from "@/types";

export type SaveState = "idle" | "saving" | "error";

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "Prêt",
  saving: "Enregistrement…",
  error: "Échec de l'enregistrement",
};

export function StatusBar({ saveState = "idle" }: { saveState?: SaveState }) {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    // Teste le pont Rust. En simple navigateur (sans Tauri), l'appel échoue : on l'ignore.
    api.appInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-card px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <WifiOff className="h-3 w-3" /> Hors ligne
        </span>
        <span className="flex items-center gap-1">
          <HardDrive className="h-3 w-3" /> Projet local
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className={saveState === "error" ? "text-destructive" : "flex items-center gap-1"}>
          {saveState === "idle" && <Check className="h-3 w-3 text-success" />}
          {SAVE_LABEL[saveState]}
        </span>
        {info && <span>v{info.version}</span>}
      </div>
    </footer>
  );
}
