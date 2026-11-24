// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { NumberStepper } from "./NumberStepper";

afterEach(cleanup);

function Harness({ initial, onChange, ...props }: { initial: number | null; onChange?: (v: number | null) => void; min?: number; max?: number; step?: number; allowEmpty?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <label>
      Largeur
      <NumberStepper
        {...props}
        value={value}
        aria-label="Largeur"
        decreaseLabel="moins"
        increaseLabel="plus"
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    </label>
  );
}

const field = () => screen.getByRole("textbox", { name: "Largeur" }) as HTMLInputElement;

describe("choix « − valeur + »", () => {
  it("change d'un pas avec − et +, sans sortir des bornes", () => {
    const onChange = vi.fn();
    render(<Harness initial={240} min={80} max={260} step={20} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "plus" }));
    expect(field().value).toBe("260");
    expect(screen.getByRole("button", { name: "plus" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "moins" }));
    fireEvent.click(screen.getByRole("button", { name: "moins" }));
    expect(onChange).toHaveBeenLastCalledWith(220);
  });

  it("valide une valeur tapée à la sortie du champ, ramenée dans les bornes", () => {
    const onChange = vi.fn();
    render(<Harness initial={10} min={0} max={50} onChange={onChange} />);
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: "75" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(field());
    expect(onChange).toHaveBeenCalledWith(50);
    expect(field().value).toBe("50");
  });

  it("champ vidé : rien (valeur précédente) ou aucune valeur selon `allowEmpty`", () => {
    const strict = vi.fn();
    const { unmount } = render(<Harness initial={5} onChange={strict} />);
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: "" } });
    fireEvent.blur(field());
    expect(strict).not.toHaveBeenCalled();
    expect(field().value).toBe("5");
    unmount();

    const loose = vi.fn();
    render(<Harness initial={5} allowEmpty onChange={loose} />);
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: "" } });
    fireEvent.blur(field());
    expect(loose).toHaveBeenCalledWith(null);
  });

  it("un clic sur le libellé qui l'entoure n'appuie pas sur « − »", () => {
    const onChange = vi.fn();
    render(<Harness initial={5} onChange={onChange} />);
    fireEvent.click(screen.getByText("Largeur"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
