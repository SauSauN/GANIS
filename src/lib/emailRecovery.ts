/**
 * Récupération du mot de passe par code e-mail, avec Supabase.
 *
 * Principe : chaque compte peut avoir un verrou « email » (côté Rust) qui
 * enferme la clé du compte avec un secret aléatoire. Ce secret est gardé
 * par Supabase dans la table `recovery_escrow`, lisible seulement après
 * vérification d'un code à 6 chiffres envoyé par e-mail. Il n'est jamais
 * gardé sur cet appareil.
 *
 * - Supabase seul ne peut rien ouvrir : les projets chiffrés restent sur
 *   cet ordinateur.
 * - Cet ordinateur seul non plus : le secret est sur le serveur.
 *
 * Configuration : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (fichier
 * `.env`, voir `.env.example` et `supabase/recovery_escrow.sql`). Sans
 * elles, la fonction est simplement cachée.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { api } from "@/lib/api";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Vrai si Supabase est configuré pour cette version de GANIS. */
export const EMAIL_RECOVERY_ENABLED = Boolean(URL && ANON_KEY);

/** Longueur du code envoyé par e-mail (réglage Supabase par défaut). */
export const EMAIL_CODE_LENGTH = 6;

const TABLE = "recovery_escrow";

let client: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  if (!EMAIL_RECOVERY_ENABLED) {
    throw new EmailRecoveryError("notConfigured");
  }

  // Session Supabase gardée en mémoire seulement : elle ne sert que le
  // temps d'une vérification, et rien n'est écrit dans le navigateur.
  client ??= createClient(URL!, ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return client;
}

/** Problème connu, traduit par l'interface (`emailRecovery.errors.*`). */
export type EmailRecoveryIssue =
  | "notConfigured"
  | "network"
  | "rateLimited"
  | "codeInvalid"
  | "noAccount"
  | "saveFailed";

export class EmailRecoveryError extends Error {
  constructor(public readonly issue: EmailRecoveryIssue) {
    super(issue);
    this.name = "EmailRecoveryError";
  }
}

function toIssue(error: { status?: number; code?: string; message?: string }): EmailRecoveryIssue {
  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    return "rateLimited";
  }
  if (error.code === "otp_expired" || error.status === 403 || error.status === 401) {
    return "codeInvalid";
  }
  if (error.code === "otp_disabled" || error.code === "user_not_found" || error.status === 422) {
    return "noAccount";
  }
  return "network";
}

/** Garde seulement les chiffres du code saisi. */
export function normalizeEmailCode(input: string): string {
  return input.replace(/\D/g, "").slice(0, EMAIL_CODE_LENGTH);
}

export function isEmailCodeComplete(input: string): boolean {
  return normalizeEmailCode(input).length === EMAIL_CODE_LENGTH;
}

/**
 * Envoie un code à 6 chiffres à `email`.
 *
 * `createUser` : vrai à l'activation (l'adresse devient un compte
 * Supabase), faux pour un mot de passe oublié (aucune adresse inconnue
 * n'est créée).
 */
export async function sendEmailCode(email: string, createUser: boolean): Promise<void> {
  let result;
  try {
    result = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: createUser },
    });
  } catch {
    throw new EmailRecoveryError("network");
  }

  if (result.error) {
    throw new EmailRecoveryError(toIssue(result.error));
  }
}

/** Vérifie le code reçu. Ouvre une session Supabase (en mémoire). */
export async function verifyEmailCode(email: string, code: string): Promise<string> {
  let result;
  try {
    result = await supabase().auth.verifyOtp({
      email: email.trim(),
      token: normalizeEmailCode(code),
      type: "email",
    });
  } catch {
    throw new EmailRecoveryError("network");
  }

  const userId = result.data.user?.id;
  if (result.error || !userId) {
    throw new EmailRecoveryError(result.error ? toIssue(result.error) : "codeInvalid");
  }

  return userId;
}

/** Ferme la session Supabase. Sans effet si aucune n'est ouverte. */
export async function endEmailSession(): Promise<void> {
  if (!client) return;
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // Session en mémoire : elle disparaît de toute façon à la fermeture.
  }
}

/**
 * Active la récupération par e-mail du compte local (code déjà vérifié) :
 * Rust crée le verrou et rend un secret, envoyé aussitôt à Supabase.
 *
 * Si l'envoi échoue, le verrou est conservé mais inutilisable ; une
 * nouvelle activation le remplacera.
 */
export async function enableEmailRecovery(input: {
  supabaseUserId: string;
  username: string;
  password: string;
}): Promise<void> {
  const { userId, secret } = await api.enableEmailRecovery({
    username: input.username,
    password: input.password,
  });

  let result;
  try {
    result = await supabase()
      .from(TABLE)
      .upsert(
        {
          user_id: input.supabaseUserId,
          local_user_id: userId,
          secret,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,local_user_id" },
      );
  } catch {
    throw new EmailRecoveryError("saveFailed");
  }

  if (result.error) {
    throw new EmailRecoveryError("saveFailed");
  }
}

/** Secrets gardés pour l'adresse vérifiée (un par compte de l'appareil). */
export async function fetchRecoverySecrets(): Promise<string[]> {
  let result;
  try {
    result = await supabase().from(TABLE).select("secret").limit(10);
  } catch {
    throw new EmailRecoveryError("network");
  }

  if (result.error) {
    throw new EmailRecoveryError("network");
  }

  const secrets = (result.data ?? [])
    .map((row: { secret?: unknown }) => row.secret)
    .filter((secret): secret is string => typeof secret === "string");

  if (secrets.length === 0) {
    throw new EmailRecoveryError("noAccount");
  }

  return secrets;
}
