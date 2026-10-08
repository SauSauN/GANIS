import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { RefreshCw, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { StatusBar } from "@/components/layout/StatusBar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import {
  validateEmail,
  validatePassword,
  validateUsername,
} from "@/lib/validators";
import { useAuthStore } from "@/stores/authStore";
import {
  ROLE_LABELS,
  type Role,
  type User,
} from "@/types";

const ROLES: Role[] = ["user", "developer", "admin"];

const selectClass =
  "rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const errorMessage = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback;

/**
 * Page d'administration de GANIS.
 *
 * Réservée aux comptes ayant le rôle administrateur. Chaque action est
 * de toute façon revérifiée côté Rust.
 */
export default function Admin() {
  const currentUser = useAuthStore((state) => state.user);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setUsers(await api.listUsers());
    } catch (e) {
      setError(
        errorMessage(e, "Impossible de charger les utilisateurs."),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const roleCounts = useMemo(
    () => ({
      admin: users.filter((u) => u.role === "admin").length,
      developer: users.filter((u) => u.role === "developer").length,
      user: users.filter((u) => u.role === "user").length,
    }),
    [users],
  );

  async function handleRoleChange(userId: string, role: Role) {
    setBusyUserId(userId);
    setError(null);

    try {
      const updated = await api.updateUserRole(userId, role);

      setUsers((current) =>
        current.map((user) =>
          user.id === updated.id ? updated : user,
        ),
      );
    } catch (e) {
      setError(errorMessage(e, "Impossible de modifier le rôle."));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleting) return;

    const target = deleting;

    setBusyUserId(target.id);
    setError(null);

    try {
      await api.deleteUser(target.id);

      setUsers((current) =>
        current.filter((user) => user.id !== target.id),
      );
    } catch (e) {
      setError(
        errorMessage(e, "Impossible de supprimer le compte."),
      );
    } finally {
      setBusyUserId(null);
      setDeleting(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Administration
              </h1>
              <p className="text-sm text-muted-foreground">
                Gérez les comptes utilisateurs locaux de GANIS.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void loadUsers()}
              disabled={loading}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualiser
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Ajouter un utilisateur
            </Button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {/* Répartition des rôles */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {ROLES.slice()
            .reverse()
            .map((role) => (
              <Card key={role}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    {ROLE_LABELS[role]}s
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {roleCounts[role]}
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Utilisateurs</CardTitle>
            <CardDescription>
              Les droits sont vérifiés côté Rust. Les modifications
              agissent directement sur les comptes locaux. Vous ne
              pouvez pas modifier ni supprimer votre propre compte
              depuis cette page.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {loading && users.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chargement…
              </p>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun utilisateur enregistré.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Utilisateur</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead>Création</TableHead>
                      <TableHead className="text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {users.map((user) => {
                      const isCurrentUser =
                        currentUser?.id === user.id;
                      const isBusy = busyUserId === user.id;

                      return (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span>{user.username}</span>
                              {isCurrentUser && (
                                <span className="text-xs text-muted-foreground">
                                  Compte actuel
                                </span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>{user.email ?? "—"}</TableCell>

                          <TableCell>
                            <select
                              value={user.role}
                              disabled={isCurrentUser || isBusy}
                              onChange={(event) =>
                                void handleRoleChange(
                                  user.id,
                                  event.target.value as Role,
                                )
                              }
                              className={`h-9 ${selectClass}`}
                              aria-label={`Rôle de ${user.username}`}
                            >
                              {ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {ROLE_LABELS[role]}
                                </option>
                              ))}
                            </select>
                          </TableCell>

                          <TableCell>
                            {new Date(
                              user.createdAt,
                            ).toLocaleDateString("fr-FR")}
                          </TableCell>

                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={isCurrentUser || isBusy}
                              title={
                                isCurrentUser
                                  ? "Vous ne pouvez pas supprimer votre propre compte"
                                  : "Supprimer le compte"
                              }
                              aria-label={`Supprimer ${user.username}`}
                              onClick={() => setDeleting(user)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Création d'un compte */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <CreateUserForm
          onCancel={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void loadUsers();
          }}
        />
      </Dialog>

      {/* Confirmation de suppression */}
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce compte ?</DialogTitle>
            <DialogDescription>
              Le compte « {deleting?.username} » sera supprimé avec
              tous ses projets. Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleting(null)}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StatusBar />
    </div>
  );
}

interface CreateUserFormProps {
  onCancel: () => void;
  onCreated: () => void;
}

/**
 * Formulaire de création d'un compte par l'administrateur.
 * Monté uniquement lorsque le dialogue est ouvert : les champs
 * sont donc réinitialisés à chaque ouverture.
 */
function CreateUserForm({ onCancel, onCreated }: CreateUserFormProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const problem =
      validateUsername(username) ??
      validatePassword(password) ??
      validateEmail(email);

    if (problem) {
      setError(problem);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.createUser({
        username: username.trim(),
        password,
        email: email.trim() || undefined,
        role,
      });
      onCreated();
    } catch (e) {
      setError(errorMessage(e, "Impossible de créer le compte."));
      setSubmitting(false);
    }
  }

  return (
    <DialogContent>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Ajouter un utilisateur</DialogTitle>
          <DialogDescription>
            Le compte est créé localement, avec le rôle choisi.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-username">Nom d'utilisateur</Label>
            <Input
              id="new-username"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-email">
              Adresse e-mail (facultatif)
            </Label>
            <Input
              id="new-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">Mot de passe</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-role">Rôle</Label>
            <select
              id="new-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className={`h-9 w-full ${selectClass}`}
            >
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="mt-6 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Création…" : "Créer le compte"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}