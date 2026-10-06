import { useEffect, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import type { User } from "@/types";

/**
 * Page d'administration de GANIS.
 *
 * Accessible uniquement aux utilisateurs avec le rôle 'admin'.
 * Permet de visualiser et gérer les comptes utilisateurs locaux.
 */
export default function Admin() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchUsers() {
      try {
        setLoading(true);
        const fetched = await api.listUsers();
        if (!cancelled) {
          setUsers(fetched);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Impossible de charger les utilisateurs.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Administration
            </h1>
            <p className="text-sm text-muted-foreground">
              Gérez les comptes utilisateurs locaux de GANIS.
            </p>
          </div>
          <Button disabled title="Disponible prochainement">
            Ajouter un utilisateur
          </Button>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Utilisateurs</CardTitle>
            <CardDescription>
              Liste des comptes enregistrés sur cet appareil.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            )}

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            {!loading && !error && users.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aucun utilisateur enregistré.
              </p>
            )}

            {!loading && !error && users.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom d'utilisateur</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Date de création</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.username}
                      </TableCell>
                      <TableCell>{user.email ?? "—"}</TableCell>
                      <TableCell className="capitalize">
                        {user.role}
                      </TableCell>
                      <TableCell>
                        {new Date(user.createdAt).toLocaleDateString("fr-FR")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
      <StatusBar />
    </div>
  );
}