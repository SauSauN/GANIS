import { useState, type FormEvent } from "react";
import { Info } from "lucide-react";
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
import { ViewShell } from "@/components/workspace/views/ViewShell";
import type { WorkspaceFeature } from "@/components/workspace/modules";

const MAX_NAME_LENGTH = 200;

const ROLES = [
  { value: "main", label: "Personnage principal" },
  { value: "secondary", label: "Personnage secondaire" },
  { value: "antagonist", label: "Antagoniste" },
  { value: "extra", label: "Figurant" },
] as const;

interface CharacterDraft {
  name: string;
  nickname: string;
  role: string;
  appearance: string;
  personality: string;
  background: string;
  motivations: string;
  goals: string;
  notes: string;
}

const EMPTY_DRAFT: CharacterDraft = {
  name: "",
  nickname: "",
  role: "main",
  appearance: "",
  personality: "",
  background: "",
  motivations: "",
  goals: "",
  notes: "",
};

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

interface AreaFieldProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

function AreaField({ id, label, placeholder, value, onChange }: AreaFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={3}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${fieldClass} resize-none py-2`}
      />
    </div>
  );
}

/**
 * Formulaire de création d'un personnage.
 *
 * Les champs suivent la fiche décrite dans le cahier des charges :
 * identité, description, parcours et motivations, notes.
 * Le brouillon est conservé tant que l'onglet reste ouvert.
 */
export function CharacterCreateView({ feature }: { feature: WorkspaceFeature }) {
  const [draft, setDraft] = useState<CharacterDraft>(EMPTY_DRAFT);
  const [nameError, setNameError] = useState<string | null>(null);

  function update<K extends keyof CharacterDraft>(
    field: K,
    value: CharacterDraft[K],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));

    if (field === "name") {
      setNameError(null);
    }
  }

  function validate(): boolean {
    const name = draft.name.trim();

    if (!name) {
      setNameError("Le nom du personnage est requis.");
      return false;
    }

    if (name.length > MAX_NAME_LENGTH) {
      setNameError(
        `Le nom ne peut pas dépasser ${MAX_NAME_LENGTH} caractères.`,
      );
      return false;
    }

    return true;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    validate();
  }

  function handleReset() {
    setDraft(EMPTY_DRAFT);
    setNameError(null);
  }

  return (
    <ViewShell title={feature.label} description={feature.description}>
      <div
        role="note"
        className="flex gap-3 rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          Aperçu de l'interface de création. L'enregistrement des
          personnages sera activé avec la base de données du projet.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Identité</CardTitle>
            <CardDescription>
              Comment s'appelle le personnage et quel rôle joue-t-il ?
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="character-name">Nom</Label>
              <Input
                id="character-name"
                value={draft.name}
                aria-invalid={nameError !== null}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Nom du personnage"
              />
              {nameError && (
                <p role="alert" className="text-sm text-destructive">
                  {nameError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="character-nickname">Surnom</Label>
              <Input
                id="character-nickname"
                value={draft.nickname}
                onChange={(e) => update("nickname", e.target.value)}
                placeholder="Surnom ou alias (facultatif)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="character-role">Rôle dans l'intrigue</Label>
              <select
                id="character-role"
                value={draft.role}
                onChange={(e) => update("role", e.target.value)}
                className={`${fieldClass} h-9`}
              >
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
            <CardDescription>
              Ce qui se voit et ce qui se devine du personnage.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <AreaField
              id="character-appearance"
              label="Apparence physique"
              placeholder="Taille, silhouette, traits marquants, style vestimentaire…"
              value={draft.appearance}
              onChange={(value) => update("appearance", value)}
            />
            <AreaField
              id="character-personality"
              label="Personnalité"
              placeholder="Caractère, qualités, défauts, manies…"
              value={draft.personality}
              onChange={(value) => update("personality", value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parcours et motivations</CardTitle>
            <CardDescription>
              D'où vient le personnage et ce qui le fait avancer.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <AreaField
              id="character-background"
              label="Histoire personnelle"
              placeholder="Passé, famille, événements fondateurs…"
              value={draft.background}
              onChange={(value) => update("background", value)}
            />
            <AreaField
              id="character-motivations"
              label="Motivations"
              placeholder="Ce qui le pousse à agir…"
              value={draft.motivations}
              onChange={(value) => update("motivations", value)}
            />
            <AreaField
              id="character-goals"
              label="Objectifs et conflits"
              placeholder="Ce qu'il cherche à obtenir, ce qui s'y oppose…"
              value={draft.goals}
              onChange={(value) => update("goals", value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes privées</CardTitle>
            <CardDescription>
              Remarques libres, visibles uniquement dans ce projet.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <AreaField
              id="character-notes"
              label="Notes"
              placeholder="Idées, références, questions ouvertes…"
              value={draft.notes}
              onChange={(value) => update("notes", value)}
            />
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            disabled
            title="L'enregistrement sera disponible avec la base de données du projet"
          >
            Enregistrer le personnage
          </Button>

          <Button type="button" variant="outline" onClick={handleReset}>
            Réinitialiser
          </Button>
        </div>
      </form>
    </ViewShell>
  );
}