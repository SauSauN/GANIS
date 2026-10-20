// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { Dialog, DialogTitle } from "./dialog";

function Form({ onClose, guardInput }: { onClose: () => void; guardInput?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} guardInput={guardInput}>
      <DialogTitle>Note</DialogTitle>
      <textarea aria-label="texte" value={value} onChange={(e) => setValue(e.target.value)} />
    </Dialog>
  );
}

const backdrop = () => screen.getByRole("dialog").parentElement!;

afterEach(cleanup);

describe("Dialog", () => {
  it("se ferme au clic sur le fond tant que rien n'est saisi", () => {
    const onClose = vi.fn();
    render(<Form onClose={onClose} />);

    fireEvent.click(backdrop());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("demande confirmation avant de perdre une saisie", () => {
    const onClose = vi.fn();
    render(<Form onClose={onClose} />);

    fireEvent.input(screen.getByLabelText("texte"), { target: { value: "Chapitre 3" } });
    fireEvent.click(backdrop());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    // Échap pendant la question : retour à la saisie.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    // Confirmer l'abandon ferme la fenêtre.
    fireEvent.keyDown(document, { key: "Escape" });
    const discard = screen.getAllByRole("button").find((b) => b.textContent && /Abandonner|Discard/.test(b.textContent))!;
    fireEvent.click(discard);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ferme sans question quand la garde est désactivée", () => {
    const onClose = vi.fn();
    render(<Form onClose={onClose} guardInput={false} />);

    fireEvent.input(screen.getByLabelText("texte"), { target: { value: "recherche" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
