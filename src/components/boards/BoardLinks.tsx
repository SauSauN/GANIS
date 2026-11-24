import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, Link2, Search } from "lucide-react";
import { BOARD_LINK_ICONS, type LinkTarget, useLinkTargets } from "@/components/boards/useLinkTargets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BOARD_LINK_KINDS, MAX_BOARD_LINKS, type BoardLink } from "@/lib/boards";
import { cn } from "@/lib/utils";

const keyOf = (link: BoardLink) => `${link.kind}:${link.id}`;

/** Sans accents ni majuscules, pour chercher « foret » et trouver « Forêt ». */
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

interface BoardLinksProps {
  /** Dans la barre d'outils de la planche : sans bandeau propre. */
  inline?: boolean;
  projectId: string;
  links: BoardLink[];
  onChange: (links: BoardLink[]) => void;
}

/**
 * Bouton « Lien » d'une planche (avec le nombre d'éléments liés) : il ouvre
 * une petite fenêtre où les éléments liés viennent en tête de liste, suivis
 * de tous les autres, rangés par sorte. Les éléments supprimés depuis ne
 * comptent pas (ils reviennent s'ils sont restaurés de la corbeille).
 */
export function BoardLinks({ inline = false, projectId, links, onChange }: BoardLinksProps) {
  const { t } = useTranslation("workspaceHome");
  const targets = useLinkTargets(projectId);
  const [picking, setPicking] = useState(false);
  const shown = links.map((link) => targets.find(link)).filter((target): target is LinkTarget => !!target);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", inline ? "" : "border-b bg-card/30 px-3 py-1.5")}>
      {/* Comme « Image », « Couleurs »… : un bouton qui ouvre le choix. */}
      <Button variant="outline" size="sm" onClick={() => setPicking(true)} title={t("boards.links.pickTitle")}>
        <Link2 />
        {t("boards.links.button")}
        {/* Nombre d'éléments liés (ils se voient dans la fenêtre, en tête de liste). */}
        {shown.length > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary tabular-nums">{shown.length}</span>}
      </Button>

      {picking && <LinkPicker targets={targets} links={links} onChange={onChange} onClose={() => setPicking(false)} />}
    </div>
  );
}

/** Petite fenêtre de choix : recherche, éléments rangés par sorte, un clic lie ou délie. */
function LinkPicker({
  targets,
  links,
  onChange,
  onClose,
}: {
  targets: ReturnType<typeof useLinkTargets>;
  links: BoardLink[];
  onChange: (links: BoardLink[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("workspaceHome");
  const [query, setQuery] = useState("");
  const needle = fold(query.trim());
  const linked = new Set(links.map(keyOf));
  const full = links.length >= MAX_BOARD_LINKS;

  // Les éléments liés en tête (même pendant une recherche, s'ils y répondent),
  // puis les autres, rangés par sorte.
  const matches = (target: LinkTarget) => !needle || fold(target.name).includes(needle);
  const chosen = links.map((link) => targets.find(link)).filter((target): target is LinkTarget => !!target && matches(target));
  const groups = useMemo(
    () =>
      BOARD_LINK_KINDS.map((kind) => ({
        kind,
        options: targets.byKind[kind].filter((target) => !linked.has(keyOf(target)) && matches(target)),
      })).filter((group) => group.options.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targets, needle, links],
  );
  const total = BOARD_LINK_KINDS.reduce((sum, kind) => sum + targets.byKind[kind].length, 0);

  function toggle(target: LinkTarget) {
    if (linked.has(keyOf(target))) onChange(links.filter((link) => keyOf(link) !== keyOf(target)));
    else if (!full) onChange([...links, { kind: target.kind, id: target.id }]);
  }

  return createPortal(
    <Dialog open onOpenChange={(open) => !open && onClose()} className="w-[min(94vw,40rem)] max-w-[min(94vw,40rem)]">
      <DialogHeader>
        <DialogTitle>{t("boards.links.pickTitle")}</DialogTitle>
        <DialogDescription>{t("boards.links.pickDescription")}</DialogDescription>
      </DialogHeader>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} autoFocus onChange={(event) => setQuery(event.target.value)} placeholder={t("boards.links.search")} aria-label={t("boards.links.search")} className="pl-8" />
      </div>

      <div className="scrollbar-visible mt-3 max-h-[55vh] space-y-4 pr-1">
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("boards.links.empty")}</p>
        ) : groups.length === 0 && chosen.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("boards.links.noMatch")}</p>
        ) : (
          <>
          {chosen.length > 0 && (
            <section aria-labelledby="link-group-chosen" className="rounded-lg border border-primary/30 bg-primary/5 p-1.5">
              <h3 id="link-group-chosen" className="mb-1 flex items-center gap-1.5 px-1 text-[0.7rem] font-semibold tracking-wide text-primary uppercase">
                <Check className="size-3.5" aria-hidden="true" />
                {t("boards.links.chosen", { count: chosen.length })}
              </h3>
              <ul className="space-y-0.5">
                {chosen.map((target) => {
                  const Icon = BOARD_LINK_ICONS[target.kind];
                  return (
                    <li key={keyOf(target)}>
                      <button
                        type="button"
                        onClick={() => toggle(target)}
                        aria-pressed
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <span className="flex size-4 shrink-0 items-center justify-center rounded border border-primary bg-primary text-primary-foreground">
                          <Check className="size-3" aria-hidden="true" />
                        </span>
                        <Icon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{target.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{t(`boards.links.kinds.${target.kind}`)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {groups.map((group) => {
            const Icon = BOARD_LINK_ICONS[group.kind];
            return (
              <section key={group.kind} aria-labelledby={`link-group-${group.kind}`}>
                <h3 id={`link-group-${group.kind}`} className="mb-1 flex items-center gap-1.5 px-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  <Icon className="size-3.5" aria-hidden="true" />
                  {t(`boards.links.kinds.${group.kind}`)}
                </h3>
                <ul className="space-y-0.5">
                  {group.options.map((target) => {
                    const on = linked.has(keyOf(target));
                    return (
                      <li key={target.id}>
                        <button
                          type="button"
                          onClick={() => toggle(target)}
                          aria-pressed={on}
                          disabled={!on && full}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40",
                            on && "bg-primary/10 font-medium",
                          )}
                        >
                          <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                            {on && <Check className="size-3" aria-hidden="true" />}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{target.name}</span>
                          {on && <span className="shrink-0 text-xs text-primary">{t("boards.links.linked")}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          </>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>{t("boards.links.done")}</Button>
      </div>
    </Dialog>,
    document.body,
  );
}
