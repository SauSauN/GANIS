/**
 * Lancement de la vraie application GANIS pour les tests de bout en bout.
 *
 * Les tests pilotent l'exécutable Tauri (backend Rust compris), pas une
 * maquette : WebView2 ouvre un port de débogage (CDP) auquel Playwright se
 * connecte. Chaque lancement utilise un dossier de données temporaire
 * (`GANIS_DATA_DIR`) et un profil WebView2 temporaire : les projets et les
 * comptes de l'utilisateur ne sont jamais touchés.
 *
 * Prérequis : Windows (WebView2), `cargo build` dans `src-tauri` et le
 * serveur Vite sur le port 1420 (lancé par `playwright.config.ts`).
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const EXE = path.join(ROOT, "src-tauri", "target", "debug", "ganis.exe");

export interface GanisApp {
  browser: Browser;
  page: Page;
  dataDir: string;
  close: () => Promise<void>;
  /** Relance l'application sur le même dossier de données. */
  restart: () => Promise<GanisApp>;
}

/** Efface le dossier temporaire ; WebView2 peut le garder verrouillé un instant. */
async function removeDir(dir: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.warn(`Dossier de test non effacé : ${dir}`);
}

let nextPort = 9300 + Math.floor(Math.random() * 400);

async function waitForCdp(port: number, child: ChildProcess, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`GANIS s'est arrêté (code ${child.exitCode})`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      // Pas encore prêt.
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Port de débogage ${port} injoignable`);
}

async function appPage(browser: Browser, timeoutMs = 60_000): Promise<Page> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const context of browser.contexts()) {
      const page = context.pages().find((p) => p.url().startsWith("http://localhost:1420"));
      if (page) return page;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Fenêtre GANIS introuvable");
}

/** Lance GANIS. Sans `dataDir`, un dossier vide est créé (premier lancement). */
export async function launchGanis(dataDir?: string): Promise<GanisApp> {
  if (!existsSync(EXE)) {
    throw new Error(`${EXE} absent : lancez d'abord « cd src-tauri && cargo build ».`);
  }
  const fresh = !dataDir;
  const dir = dataDir ?? mkdtempSync(path.join(tmpdir(), "ganis-e2e-"));
  const port = nextPort++;

  const child = spawn(EXE, [], {
    env: {
      ...process.env,
      GANIS_DATA_DIR: path.join(dir, "data"),
      WEBVIEW2_USER_DATA_FOLDER: path.join(dir, "webview"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
    stdio: "ignore",
  });

  await waitForCdp(port, child);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = await appPage(browser);
  await page.waitForLoadState("domcontentloaded");

  const stop = async () => {
    await browser.close().catch(() => {});
    if (child.exitCode === null) {
      child.kill();
      await new Promise((r) => child.once("exit", r));
    }
  };

  const app: GanisApp = {
    browser,
    page,
    dataDir: dir,
    close: async () => {
      await stop();
      if (fresh) await removeDir(dir);
    },
    restart: async () => {
      await stop();
      const next = await launchGanis(dir);
      // Le nouveau lancement fera le ménage à la place de l'ancien.
      const close = next.close;
      next.close = async () => {
        await close();
        await removeDir(dir);
      };
      return next;
    },
  };
  return app;
}
