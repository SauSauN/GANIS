import { defineConfig } from "@playwright/test";

/**
 * Tests de bout en bout de GANIS.
 *
 * Ils pilotent la vraie application Tauri (voir `tests/ganis-app.ts`) :
 * l'exécutable de `src-tauri/target/debug` charge l'interface depuis le
 * serveur Vite ci-dessous. Une seule fenêtre GANIS à la fois : les tests
 * s'enchaînent (un seul « worker »).
 *
 *   cd src-tauri && cargo build
 *   npx playwright test
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Démarrage de l'application, chiffrement des comptes : plus lent qu'un site.
  timeout: 5 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    actionTimeout: 15_000,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
