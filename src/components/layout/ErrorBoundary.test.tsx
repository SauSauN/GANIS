// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { ErrorBoundary } from "./ErrorBoundary";

let broken = true;

function Fragile() {
  if (broken) throw new TypeError("x is undefined");
  return <p>Contenu</p>;
}

function Harness() {
  const [, rerender] = useState(0);
  return (
    <>
      <button onClick={() => rerender((n) => n + 1)}>rafraîchir</button>
      <ErrorBoundary scope="tab">
        <Fragile />
      </ErrorBoundary>
    </>
  );
}

afterEach(cleanup);

describe("ErrorBoundary", () => {
  it("affiche un écran de secours puis réessaie", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Harness />);

    // Message clair, sans le détail technique tant qu'on ne le demande pas.
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/x is undefined/)).toBeNull();

    broken = false;
    fireEvent.click(screen.getAllByRole("button").find((b) => /Réessayer|Try again/.test(b.textContent ?? ""))!);
    expect(screen.getByText("Contenu")).toBeTruthy();
  });
});
