// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fromInteractive, onRowDoubleClick } from "@/lib/doubleClick";

function row() {
  const li = document.createElement("li");
  const text = document.createElement("span");
  const button = document.createElement("button");
  li.append(text, button);
  return { li, text, button };
}

describe("double-clic d'une ligne", () => {
  it("agit sur la ligne, pas sur ses boutons", () => {
    const { li, text, button } = row();
    const action = vi.fn();
    const handler = onRowDoubleClick(action);
    const event = (target: Element) => ({ target, currentTarget: li, preventDefault: () => {} }) as never;

    handler(event(text));
    expect(action).toHaveBeenCalledTimes(1);

    handler(event(button));
    expect(action).toHaveBeenCalledTimes(1);
    expect(fromInteractive({ target: button, currentTarget: li } as never)).toBe(true);
  });

  it("une ligne qui est elle-même un bouton reste concernée", () => {
    const button = document.createElement("button");
    expect(fromInteractive({ target: button, currentTarget: button } as never)).toBe(false);
  });
});
