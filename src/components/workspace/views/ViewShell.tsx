import type { ReactNode } from "react";

interface ViewShellProps {
  title: string;
  description: string;
  children: ReactNode;
}

/** Cadre commun des vues de la zone centrale : titre, description, contenu. */
export function ViewShell({ title, description, children }: ViewShellProps) {
  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        {children}
      </div>
    </div>
  );
}