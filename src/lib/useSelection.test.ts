// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSelection } from "./useSelection";

describe("useSelection", () => {
  it("sélectionne, désélectionne et sélectionne tout", () => {
    const { result } = renderHook(({ ids }) => useSelection(ids), { initialProps: { ids: ["a", "b", "c"] } });

    act(() => result.current.toggle("b"));
    expect(result.current.selected).toEqual(["b"]);
    expect(result.current.partial).toBe(true);

    act(() => result.current.toggleAll());
    expect(result.current.selected).toEqual(["a", "b", "c"]);
    expect(result.current.allSelected).toBe(true);

    act(() => result.current.toggleAll());
    expect(result.current.count).toBe(0);
  });

  it("oublie les éléments qui ne sont plus affichés", () => {
    const { result, rerender } = renderHook(({ ids }) => useSelection(ids), { initialProps: { ids: ["a", "b"] } });

    act(() => result.current.toggleAll());
    rerender({ ids: ["b"] });

    expect(result.current.selected).toEqual(["b"]);
    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.allSelected).toBe(true);
  });

  it("retire les éléments traités", () => {
    const { result } = renderHook(() => useSelection(["a", "b", "c"]));

    act(() => result.current.toggleAll());
    act(() => result.current.drop(["a", "c"]));

    expect(result.current.selected).toEqual(["b"]);
  });
});
