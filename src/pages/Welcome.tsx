import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";
import { Feather } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/authStore";

export default function Welcome() {
  const navigate = useNavigate();
  const { t } = useTranslation("welcome");

  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const loading = useAuthStore((s) => s.loading);
  const devLogin = useAuthStore((s) => s.devLogin);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const success = await login(username, password);

    if (success) {
      navigate("/dashboard");
    }
  };

  return (
    <main className="relative flex flex-1 items-center justify-center bg-background px-8 py-10">

      <div className="flex w-full max-w-5xl items-center justify-between gap-16">

        {/* Présentation GANIS */}
        <section className="flex flex-1 flex-col">
          <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Feather className="h-7 w-7" />
          </div>

          <h1 className="text-5xl font-semibold tracking-tight">
            GANIS
          </h1>

          <p className="mt-3 text-xl text-muted-foreground">
            {t("tagline")}
          </p>

          <p className="mt-6 max-w-lg text-sm leading-6 text-muted-foreground">
            {t("intro")}
          </p>

          <div className="mt-8 flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => navigate("/register")}
            >
              {t("actions.createAccount")}
            </Button>

            {import.meta.env.DEV && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  devLogin();
                  navigate("/dashboard");
                }}
              >
                {t("actions.demo")}
              </Button>
            )}
          </div>
        </section>

        {/* Panneau de connexion */}
        <section className="w-full max-w-sm">
          <div className="rounded-3xl border bg-card p-7 shadow-sm">

            <div className="mb-6">
              <h2 className="text-xl font-semibold">
                {t("login.title")}
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {t("login.subtitle")}
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">

              <div className="space-y-2">
                <Label htmlFor="username">
                  {t("login.username")}
                </Label>

                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder={t("login.username")}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">
                  {t("login.password")}
                </Label>

                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder={t("login.password")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <p
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? t("login.submitting") : t("login.submit")}
              </Button>
            </form>

            <div className="mt-6 border-t pt-5 text-center">
              <p className="text-sm text-muted-foreground">
                {t("noAccount")}{" "}
                <button
                  type="button"
                  onClick={() => navigate("/register")}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {t("actions.createAccount")}
                </button>
              </p>
            </div>

          </div>
        </section>

      </div>
    </main>
  );
}
