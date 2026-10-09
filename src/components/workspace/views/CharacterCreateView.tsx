import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
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

/** Rôles proposés (libellés dans `characters.json`, `roles.*`). */
const ROLES = ["main", "secondary", "antagonist", "extra"] as const;

/** Erreur du champ « Nom » : on garde une clé, le message suit la langue. */
type NameError = "nameRequired" | "nameTooLong";

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
  const { t } = useTranslation("characters");
  const [draft, setDraft] = useState<CharacterDraft>(EMPTY_DRAFT);
  const [nameError, setNameError] = useState<NameError | null>(null);

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
      setNameError("nameRequired");
      return false;
    }

    if (name.length > MAX_NAME_LENGTH) {
      setNameError("nameTooLong");
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
          {t("create.preview")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>{t("create.identity.title")}</CardTitle>
            <CardDescription>{t("create.identity.description")}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="character-name">{t("create.identity.name")}</Label>
              <Input
                id="character-name"
                value={draft.name}
                aria-invalid={nameError !== null}
                onChange={(e) => update("name", e.target.value)}
                placeholder={t("create.identity.namePlaceholder")}
              />
              {nameError && (
                <p role="alert" className="text-sm text-destructive">
                  {t(`create.errors.${nameError}`, { max: MAX_NAME_LENGTH })}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="character-nickname">{t("create.identity.nickname")}</Label>
              <Input
                id="character-nickname"
                value={draft.nickname}
                onChange={(e) => update("nickname", e.target.value)}
                placeholder={t("create.identity.nicknamePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="character-role">{t("create.identity.role")}</Label>
              <select
                id="character-role"
                value={draft.role}
                onChange={(e) => update("role", e.target.value)}
                className={`${fieldClass} h-9`}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(`roles.${role}`)}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("create.description.title")}</CardTitle>
            <CardDescription>{t("create.description.description")}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <AreaField
              id="character-appearance"
              label={t("create.description.appearance")}
              placeholder={t("create.description.appearancePlaceholder")}
              value={draft.appearance}
              onChange={(value) => update("appearance", value)}
            />
            <AreaField
              id="character-personality"
              label={t("create.description.personality")}
              placeholder={t("create.description.personalityPlaceholder")}
              value={draft.personality}
              onChange={(value) => update("personality", value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("create.background.title")}</CardTitle>
            <CardDescription>{t("create.background.description")}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <AreaField
              id="character-background"
              label={t("create.background.history")}
              placeholder={t("create.background.historyPlaceholder")}
              value={draft.background}
              onChange={(value) => update("background", value)}
            />
            <AreaField
              id="character-motivations"
              label={t("create.background.motivations")}
              placeholder={t("create.background.motivationsPlaceholder")}
              value={draft.motivations}
              onChange={(value) => update("motivations", value)}
            />
            <AreaField
              id="character-goals"
              label={t("create.background.goals")}
              placeholder={t("create.background.goalsPlaceholder")}
              value={draft.goals}
              onChange={(value) => update("goals", value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("create.notes.title")}</CardTitle>
            <CardDescription>{t("create.notes.description")}</CardDescription>
          </CardHeader>

          <CardContent>
            <AreaField
              id="character-notes"
              label={t("create.notes.label")}
              placeholder={t("create.notes.placeholder")}
              value={draft.notes}
              onChange={(value) => update("notes", value)}
            />
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            disabled
            title={t("create.saveUnavailable")}
          >
            {t("create.save")}
          </Button>

          <Button type="button" variant="outline" onClick={handleReset}>
            {t("create.reset")}
          </Button>
        </div>
      </form>
    </ViewShell>
  );
}