// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { findFeature } from "@/components/workspace/modules";
import en from "@/i18n/locales/en/tutorials.json";
import fr from "@/i18n/locales/fr/tutorials.json";
import { useHelpStore } from "@/lib/shortcuts";
import {
  showTutorialOnce,
  TUTORIALS,
  tutorialForModule,
  tutorialForProject,
  tutorialsFor,
  useTutorialStore,
  type TutorialId,
} from "@/lib/tutorials";

const IDS = Object.keys(TUTORIALS) as TutorialId[];

beforeEach(() => {
  localStorage.clear();
  useTutorialStore.setState({ open: null, step: 0, resume: null });
  useHelpStore.setState({ open: null });
});

describe("textes", () => {
  it.each([
    ["fr", fr],
    ["en", en],
  ])("%s : chaque étape a son titre, son texte et ses points", (_language, locale) => {
    for (const id of IDS) {
      const texts = locale[id];
      expect(texts.title).toBeTruthy();
      expect(texts.name).toBeTruthy();
      expect(texts.intro).toBeTruthy();
      const steps = texts.steps as Record<string, { title: string; text: string; points: string[] }>;
      expect(Object.keys(steps).sort()).toEqual(TUTORIALS[id].steps.map((step) => step.id).sort());
      for (const step of Object.values(steps)) {
        expect(step.title).toBeTruthy();
        expect(step.text).toBeTruthy();
        expect(Array.isArray(step.points)).toBe(true);
      }
    }
  });
});

describe("registre", () => {
  it("chaque étape ouvre une fonctionnalité qui existe", () => {
    for (const id of IDS) {
      for (const step of TUTORIALS[id].steps) {
        if (step.open) expect(findFeature(step.open), `${id}.${step.id}`).toBeDefined();
      }
    }
  });

  it("le mode de démarrage suit le type de projet", () => {
    expect(tutorialForProject("novel")).toBe("novel");
    expect(tutorialForProject("manga")).toBe("manga");
    for (const type of ["film", "series", "game", "rpg", "custom"]) expect(tutorialForProject(type)).toBe("story");
  });

  it("les modules du roman et du manga mènent à leur mode de démarrage", () => {
    expect(tutorialForModule("manuscript")).toBe("novel");
    expect(tutorialForModule("script")).toBe("manga");
    expect(tutorialForModule("items")).toBe("items");
    expect(tutorialForModule("species")).toBe("species");
    expect(tutorialForModule("search")).toBeNull();
  });

  it("un projet liste son mode de démarrage en premier, et aucun autre", () => {
    const list = tutorialsFor("manga");
    expect(list[0]).toBe("manga");
    expect(list).not.toContain("novel");
    expect(list).not.toContain("story");
  });
});

describe("ouverture automatique", () => {
  it("n'a lieu qu'une fois", () => {
    showTutorialOnce("items");
    expect(useTutorialStore.getState().open).toBe("items");
    useTutorialStore.getState().close();
    showTutorialOnce("items");
    expect(useTutorialStore.getState().open).toBeNull();
  });

  it("attend qu'aucune autre fenêtre d'aide ne soit ouverte", () => {
    useHelpStore.setState({ open: "whatsNew" });
    showTutorialOnce("species");
    expect(useTutorialStore.getState().open).toBeNull();
    useHelpStore.setState({ open: null });
    showTutorialOnce("species");
    expect(useTutorialStore.getState().open).toBe("species");
  });

  it("ne remplace pas un tutoriel déjà ouvert, et ne le compte pas comme vu", () => {
    showTutorialOnce("novel");
    showTutorialOnce("items");
    expect(useTutorialStore.getState().open).toBe("novel");
    useTutorialStore.getState().close();
    showTutorialOnce("items");
    expect(useTutorialStore.getState().open).toBe("items");
  });
});

describe("reprise", () => {
  it("reprend à l'étape quittée pour essayer une fonctionnalité", () => {
    const store = useTutorialStore.getState();
    store.show("manga");
    store.pause(3);
    expect(useTutorialStore.getState().open).toBeNull();
    store.show("manga");
    expect(useTutorialStore.getState().step).toBe(3);
  });

  it("repart du début après une fermeture, ou pour un autre tutoriel", () => {
    const store = useTutorialStore.getState();
    store.show("manga");
    store.pause(3);
    store.show("novel");
    expect(useTutorialStore.getState().step).toBe(0);
    store.pause(2);
    store.show("novel");
    store.close();
    store.show("novel");
    expect(useTutorialStore.getState().step).toBe(0);
  });
});
