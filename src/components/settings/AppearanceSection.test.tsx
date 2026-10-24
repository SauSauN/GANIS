// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/i18n";

vi.mock("@/components/packages/useInstalledThemes", () => ({ useInstalledThemes: () => ({ system: [], mine: [] }) }));

const { AppearanceSection } = await import("./AppearanceSection");

afterEach(cleanup);

describe("Apparence › images du panneau du milieu", () => {
  it("agrandit, réduit et revient à la taille par défaut, dans les bornes", () => {
    localStorage.removeItem("ganis-panel-image-size");
    render(
      <MemoryRouter>
        <AppearanceSection />
      </MemoryRouter>,
    );
    const size = () => document.documentElement.style.getPropertyValue("--panel-thumb");

    fireEvent.click(screen.getByRole("button", { name: "Agrandir les images" }));
    expect(size()).toBe("1.75rem");
    expect(screen.getByText(/28 px/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Taille par défaut/ }));
    expect(size()).toBe("1.5rem");

    const smaller = screen.getByRole("button", { name: "Réduire les images" });
    fireEvent.click(smaller);
    fireEvent.click(smaller);
    expect(size()).toBe("1rem");
    expect((smaller as HTMLButtonElement).disabled).toBe(true);
  });
});
