import { useRef, useState, type ComponentProps, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  checkEmail,
  checkPassword,
  checkUsername,
  type ValidationIssue,
} from "@/lib/validators";

/**
 * Pièces communes aux formulaires de création de compte (inscription,
 * premier compte) : une erreur sous chaque champ, reliée par
 * `aria-describedby`, `aria-invalid` (bordure rouge), et un bouton pour
 * afficher le mot de passe.
 */

export type AccountField = "username" | "email" | "password" | "confirm";

const FIELD_ORDER: AccountField[] = ["username", "email", "password", "confirm"];

interface AccountValues {
  username: string;
  email: string;
  password: string;
  confirm: string;
}

/** Problème de chaque champ (null : correct). */
function issuesOf(values: AccountValues): Record<AccountField, ValidationIssue | null> {
  return {
    username: checkUsername(values.username),
    email: checkEmail(values.email),
    password: checkPassword(values.password, values.username),
    confirm: values.password !== values.confirm ? "passwordMismatch" : null,
  };
}

/**
 * Validation champ par champ.
 *
 * Une erreur s'affiche quand on quitte le champ ou à l'envoi, puis suit la
 * saisie. La confirmation est vérifiée pendant la frappe dès qu'elle ne
 * peut plus correspondre (elle n'est plus le début du mot de passe).
 */
export function useAccountValidation(values: AccountValues, ids: Record<AccountField, string>) {
  const [touched, setTouched] = useState<Record<AccountField, boolean>>({
    username: false,
    email: false,
    password: false,
    confirm: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const refs = {
    username: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  } satisfies Record<AccountField, RefObject<HTMLInputElement | null>>;

  const issues = issuesOf(values);

  const confirmDiverged = values.confirm !== "" && !values.password.startsWith(values.confirm);

  const shown = (field: AccountField): ValidationIssue | null => {
    const visible = submitted || touched[field] || (field === "confirm" && confirmDiverged);
    return visible ? issues[field] : null;
  };

  /** À l'envoi : toutes les erreurs apparaissent, le premier champ en faute reçoit le focus. */
  const validateAll = (): boolean => {
    setSubmitted(true);
    const first = FIELD_ORDER.find((field) => issues[field] !== null);
    if (first) refs[first].current?.focus();
    return first === undefined;
  };

  /** Propriétés à donner au champ : lien vers son erreur, état invalide. */
  const fieldProps = (field: AccountField, describedBy?: string) => {
    const issue = shown(field);
    const errorId = `${ids[field]}-error`;
    const described = [issue ? errorId : null, describedBy].filter(Boolean).join(" ") || undefined;
    return {
      id: ids[field],
      ref: refs[field],
      "aria-invalid": issue ? true : undefined,
      "aria-describedby": described,
      onBlur: () => setTouched((current) => (current[field] ? current : { ...current, [field]: true })),
    };
  };

  return { shown, validateAll, fieldProps, errorId: (field: AccountField) => `${ids[field]}-error` };
}

/** Message d'erreur sous un champ (rien si le champ est correct). */
export function FieldError({ id, issue }: { id: string; issue: ValidationIssue | null }) {
  const { t } = useTranslation("common");
  if (!issue) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {t(`validation.${issue}`)}
    </p>
  );
}

/** Champ mot de passe avec un bouton pour afficher ou masquer la saisie. */
export function PasswordInput({
  className,
  placeholder,
  ...props
}: Omit<ComponentProps<typeof Input>, "type"> & { placeholder: string }) {
  const { t } = useTranslation("common");
  const [visible, setVisible] = useState(false);
  const label = visible ? t("password.hide") : t("password.show");

  return (
    <div className="relative">
      <Input {...props} placeholder={placeholder} type={visible ? "text" : "password"} className={cn("pr-9", className)} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
