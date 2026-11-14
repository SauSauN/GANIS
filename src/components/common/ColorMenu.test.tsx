// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorMenu } from "./ColorMenu";

afterEach(cleanup);

const options = [
  { value: "#ffffff", swatch: "#ffffff", label: "Blanc" },
  { value: "#000000", swatch: "#000000", label: "Noir" },
];

describe("ColorMenu", () => {
  it("propose les couleurs et enregistre celle qu'on choisit", () => {
    const onSelect = vi.fn();
    render(<ColorMenu label="Couleur" options={options} value="#ffffff" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /Couleur/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Noir" }));

    expect(onSelect).toHaveBeenCalledWith("#000000");
  });

  it("« Autre couleur… » enregistre la couleur choisie dans le sélecteur du système", () => {
    const onSelect = vi.fn();
    render(
      <ColorMenu label="Couleur" options={options} value="#ffffff" onSelect={onSelect} custom={{ label: "Autre couleur…" }} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Couleur/ }));
    fireEvent.click(screen.getByRole("button", { name: "Autre couleur…" }));

    // Le sélecteur du système : la couleur change pendant qu'on la règle
    // (« input »), puis il se ferme (« change »).
    const input = document.querySelector<HTMLInputElement>('input[type="color"]')!;
    fireEvent.input(input, { target: { value: "#123456" } });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onSelect).toHaveBeenLastCalledWith("#123456");
  });
});
