// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { TUTORIALS, useTutorialStore } from "@/lib/tutorials";
import { TutorialDialog } from "./TutorialDialog";

beforeEach(async () => {
  await i18n.changeLanguage("fr");
  useTutorialStore.setState({ open: null, step: 0, resume: null });
});

afterEach(cleanup);

describe("TutorialDialog", () => {
  it("n'affiche rien tant qu'aucun tutoriel n'est ouvert", () => {
    render(<TutorialDialog projectType="novel" onOpenFeature={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("parcourt les étapes jusqu'à la fin", () => {
    useTutorialStore.getState().show("species");
    render(<TutorialDialog projectType="novel" onOpenFeature={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Tutoriel : Faune et flore" })).toBeTruthy();
    expect(screen.getByText("Étape 1 sur 5")).toBeTruthy();

    for (let i = 1; i < TUTORIALS.species.steps.length; i++) fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
    expect(screen.getByText("Étape 5 sur 5")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "C'est parti !" }));
    expect(useTutorialStore.getState().open).toBeNull();
  });

  it("ouvre la fonctionnalité de l'étape, puis reprend au même endroit", () => {
    const onOpenFeature = vi.fn();
    useTutorialStore.getState().show("manga");
    render(<TutorialDialog projectType="manga" onOpenFeature={onOpenFeature} />);

    fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir : Plan du récit" }));
    expect(onOpenFeature).toHaveBeenCalledWith("structure.plan");
    expect(screen.queryByRole("dialog")).toBeNull();

    useTutorialStore.getState().show("manga");
    expect(useTutorialStore.getState().step).toBe(1);
  });

  it("nomme le découpage et le type du projet", () => {
    useTutorialStore.getState().show("story");
    render(<TutorialDialog projectType="film" onOpenFeature={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Démarrer un projet : Film" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Découpez le récit" }));
    expect(screen.getByText(/par défaut : Actes, séquences, scènes\./)).toBeTruthy();
  });

  it("ne propose pas une fonctionnalité réservée à un autre type de projet", () => {
    useTutorialStore.getState().show("story");
    render(<TutorialDialog projectType="novel" onOpenFeature={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Lisez toute l'histoire" }));
    expect(screen.queryByRole("button", { name: /^Ouvrir/ })).toBeNull();
  });
});
