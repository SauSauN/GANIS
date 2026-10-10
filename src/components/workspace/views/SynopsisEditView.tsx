import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import { useTranslation } from "react-i18next";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Plus, RefreshCw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useProjectSynopsis,
  useSynopsisStore,
} from "@/stores/synopsisStore";
import type { WorkspaceFeature } from "@/components/workspace/modules";

/** Limites appliquées aussi côté Rust (voir `synopsis_service.rs`). */
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;

type SaveStatus = "idle" | "saved" | "error";

/** Dernière version enregistrée (ou chargée) : sert à repérer les modifications. */
interface Baseline {
  content: string;
  genres: string[];
  subgenres: string[];
  tone: string[];
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

interface SynopsisEditViewProps {
  projectId: string;
  feature: WorkspaceFeature;
}

/**
 * Liste de tags éditable.
 *
 * Utilisée pour :
 * - Genres
 * - Sous-genres
 * - Ton
 */
interface TagListProps {
  id: string;
  label: string;
  placeholder: string;
  values: string[];
  disabled?: boolean;
  onChange: (values: string[]) => void;
}

function TagList({
  id,
  label,
  placeholder,
  values,
  disabled,
  onChange,
}: TagListProps) {
  const { t } = useTranslation(["synopsis", "common"]);
  const [draft, setDraft] = useState("");

  const full = values.length >= MAX_TAGS;

  function addTag() {
    const value = draft.trim();

    if (!value || full) {
      return;
    }

    // Évite les doublons sans tenir compte de la casse.
    const exists = values.some(
      (item) => item.toLowerCase() === value.toLowerCase(),
    );

    if (!exists) {
      onChange([...values, value]);
    }

    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addTag();
    }
  }

  function removeTag(tag: string) {
    onChange(values.filter((item) => item !== tag));
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>

      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2.5 py-1 text-xs font-medium"
            >
              {tag}

              <button
                type="button"
                aria-label={t("tags.removeNamed", { tag })}
                title={t("tags.remove")}
                disabled={disabled}
                onClick={() => removeTag(tag)}
                className="flex h-4 w-4 items-center justify-center rounded hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          disabled={disabled || full}
          maxLength={MAX_TAG_LENGTH}
          placeholder={
            full ? t("tags.full", { max: MAX_TAGS }) : placeholder
          }
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />

        <Button
          type="button"
          variant="outline"
          onClick={addTag}
          disabled={disabled || full || !draft.trim()}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t("tags.add")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Vue d'édition du synopsis.
 *
 * La vue utilise la même largeur et les mêmes espacements
 * que l'accueil du projet.
 *
 * Protections :
 * - elle n'affiche et n'enregistre que le synopsis de son propre projet ;
 * - l'enregistrement est impossible tant que le synopsis n'a pas été
 *   chargé (sinon un chargement échoué écraserait le texte existant par
 *   un éditeur vide) ;
 * - l'éditeur n'est rempli qu'une fois par projet : un chargement tardif
 *   ou un enregistrement ne remplace jamais ce que l'utilisateur tape.
 */
export function SynopsisEditView({
  projectId,
  feature,
}: SynopsisEditViewProps) {
  const { t } = useTranslation(["synopsis", "common"]);
  const { synopsis, loading, saving, error } =
    useProjectSynopsis(projectId);

  const fetchSynopsis = useSynopsisStore((state) => state.fetchSynopsis);
  const updateSynopsis = useSynopsisStore(
    (state) => state.updateSynopsis,
  );

  const [genres, setGenres] = useState<string[]>([]);
  const [subgenres, setSubgenres] = useState<string[]>([]);
  const [tone, setTone] = useState<string[]>([]);

  const [saveStatus, setSaveStatus] =
    useState<SaveStatus>("idle");

  /** Texte actuel de l'éditeur (HTML), mis à jour à chaque frappe. */
  const [contentHtml, setContentHtml] = useState("");

  /** Version de référence ; `null` tant que le synopsis n'est pas chargé. */
  const [baseline, setBaseline] = useState<Baseline | null>(null);

  /** Enregistrement en cours : un second appel attend le premier. */
  const inFlight = useRef<Promise<boolean> | null>(null);

  /**
   * Projet pour lequel l'éditeur a déjà été rempli.
   */
  const hydratedFor = useRef<string | null>(null);

  /**
   * Minuterie du message « Synopsis enregistré ».
   */
  const statusTimer = useRef<number | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Un clic sur un lien ne doit pas faire quitter l'application.
        link: { openOnClick: false },
      }),
    ],
    content: "",
    onUpdate: ({ editor: current }) => setContentHtml(current.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[240px]",
      },
    },
  });

  // -------------------------------------------------------------------------
  // Chargement
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (projectId) {
      void fetchSynopsis(projectId);
    }
  }, [projectId, fetchSynopsis]);

  // -------------------------------------------------------------------------
  // Remplissage de l'éditeur (une seule fois par projet)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!synopsis) {
      hydratedFor.current = null;
      return;
    }

    if (!editor || hydratedFor.current === projectId) {
      return;
    }

    setGenres(synopsis.genres);
    setSubgenres(synopsis.subgenres);
    setTone(synopsis.tone);
    editor.commands.setContent(synopsis.content || "");

    // Référence : le texte tel que l'éditeur le restitue (HTML normalisé).
    const html = editor.getHTML();
    setContentHtml(html);
    setBaseline({
      content: html,
      genres: synopsis.genres,
      subgenres: synopsis.subgenres,
      tone: synopsis.tone,
    });

    hydratedFor.current = projectId;
  }, [synopsis, editor, projectId]);

  // -------------------------------------------------------------------------
  // Nettoyage de la minuterie
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (statusTimer.current !== null) {
        window.clearTimeout(statusTimer.current);
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // Enregistrement
  // -------------------------------------------------------------------------

  /**
   * Enregistre ; renvoie `false` en cas d'échec. Utilisé par le bouton,
   * l'enregistrement automatique et la question « Enregistrer ? ».
   */
  function handleSave(): Promise<boolean> {
    if (!inFlight.current) {
      inFlight.current = doSave().finally(() => {
        inFlight.current = null;
      });
    }

    return inFlight.current;
  }

  async function doSave(): Promise<boolean> {
    if (!editor || !synopsis) {
      return false;
    }

    setSaveStatus("idle");

    const content = editor.getHTML();

    try {
      const saved = await updateSynopsis(projectId, {
        content,
        genres,
        subgenres,
        tone,
      });

      // Les listes enregistrées ont été nettoyées par le backend.
      // Le texte de l'éditeur n'est volontairement pas remplacé.
      setGenres(saved.genres);
      setSubgenres(saved.subgenres);
      setTone(saved.tone);

      // Ce qui a été tapé pendant l'enregistrement reste « non enregistré ».
      setBaseline({
        content,
        genres: saved.genres,
        subgenres: saved.subgenres,
        tone: saved.tone,
      });

      setSaveStatus("saved");

      if (statusTimer.current !== null) {
        window.clearTimeout(statusTimer.current);
      }

      statusTimer.current = window.setTimeout(() => {
        setSaveStatus("idle");
      }, 3000);

      return true;
    } catch {
      setSaveStatus("error");
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Modifications non enregistrées (point sur l'onglet, question à la
  // fermeture, enregistrement automatique)
  // -------------------------------------------------------------------------

  const dirty =
    baseline !== null &&
    (contentHtml !== baseline.content ||
      !sameList(genres, baseline.genres) ||
      !sameList(subgenres, baseline.subgenres) ||
      !sameList(tone, baseline.tone));

  useUnsavedChanges({
    dirty,
    save: handleSave,
    // Texte stable (et non un tableau recréé à chaque rendu) : le délai
    // ne repart qu'à une vraie modification.
    revision: JSON.stringify([contentHtml, genres, subgenres, tone]),
  });

  // -------------------------------------------------------------------------
  // Affichage
  // -------------------------------------------------------------------------

  const loadFailed = !synopsis && !loading && error !== null;

  return (
    <main className="flex min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 pb-24 lg:px-10">
        {/* ================================================================
            EN-TÊTE
            ================================================================ */}

        <header className="mb-6">

          <h1 className="sr-only">{feature.label}</h1>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {feature.description}
          </p>
        </header>

        {/* ================================================================
            ERREUR
            ================================================================ */}

        {error && (
          <div
            role="alert"
            className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            <p>{error}</p>

            {loadFailed && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void fetchSynopsis(projectId)}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("retry")}
              </Button>
            )}
          </div>
        )}

        {/* ================================================================
            SYNOPSIS

            Couleur de fond unique (`bg-card`), en-tête compris :
            gap-0 / py-0 évitent la bande vide au-dessus de l'en-tête,
            ring-0 + border donnent le même contour que les autres blocs.
            ================================================================ */}

        <Card className="mb-8 gap-0 border py-0 shadow-sm ring-0">
          <CardHeader className="border-b px-6 py-5">
            <CardTitle className="text-base">
              {t("card.title")}
            </CardTitle>

            <CardDescription>
              {t("card.description")}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-8 px-6 py-6">
            {/* ------------------------------------------------------------
                Contenu
                ------------------------------------------------------------ */}

            <div className="space-y-2">
              <Label>{t("content")}</Label>

              {/* Fond transparent : l'éditeur prend la couleur de la carte. */}
              <div className="rounded-lg border border-input bg-transparent p-4 focus-within:ring-2 focus-within:ring-ring">
                <EditorContent editor={editor} />
              </div>
            </div>

            {/* ------------------------------------------------------------
                Genres
                ------------------------------------------------------------ */}

            <div className="border-t pt-6">
              <TagList
                id="synopsis-genres"
                label={t("genres.label")}
                placeholder={t("genres.placeholder")}
                values={genres}
                disabled={loading || !synopsis}
                onChange={setGenres}
              />
            </div>

            {/* ------------------------------------------------------------
                Sous-genres
                ------------------------------------------------------------ */}

            <div className="border-t pt-6">
              <TagList
                id="synopsis-subgenres"
                label={t("subgenres.label")}
                placeholder={t("subgenres.placeholder")}
                values={subgenres}
                disabled={loading || !synopsis}
                onChange={setSubgenres}
              />
            </div>

            {/* ------------------------------------------------------------
                Ton
                ------------------------------------------------------------ */}

            <div className="border-t pt-6">
              <TagList
                id="synopsis-tone"
                label={t("tone.label")}
                placeholder={t("tone.placeholder")}
                values={tone}
                disabled={loading || !synopsis}
                onChange={setTone}
              />
            </div>
          </CardContent>
        </Card>

        {/* ================================================================
            ACTIONS
            ================================================================ */}

        <div className="flex min-h-10 items-center gap-4">
          <Button
            onClick={() => void handleSave()}
            disabled={saving || loading || !synopsis}
          >
            <Save className="mr-2 h-4 w-4" />

            {saving
              ? t("common:actions.saving")
              : t("common:actions.save")}
          </Button>

          {saveStatus === "saved" && (
            <p
              role="status"
              className="text-sm text-success"
            >
              {t("saved")}
            </p>
          )}

          {saveStatus === "error" && (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {t("saveFailed")}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}