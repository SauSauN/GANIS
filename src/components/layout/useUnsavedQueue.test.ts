// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUnsavedQueue } from "./useUnsavedQueue";
import { useUnsavedStore } from "@/lib/unsavedChanges";

const store = () => useUnsavedStore.getState();

/** Élément modifié dont l'enregistrement le retire du registre (comme un écran). */
function addEntry(id: string, ok = true) {
  const save = vi.fn(async () => {
    if (ok) store().unregister(id);
    return ok;
  });

  store().register(id, { label: id.toUpperCase(), save });

  return save;
}

describe("questions « Enregistrer ? » une par une", () => {
  beforeEach(() => {
    useUnsavedStore.setState({ entries: {}, pending: null });
  });

  it("demande pour chaque élément et applique le choix à lui seul", async () => {
    const saveA = addEntry("a");
    const saveB = addEntry("b");
    addEntry("c");

    const shown: string[] = [];
    const resolved: string[] = [];
    const onFinished = vi.fn();

    const { result } = renderHook(() => useUnsavedQueue());

    act(() => {
      result.current.start(["a", "b", "c"], {
        onShow: (id) => shown.push(id),
        onResolved: (id) => resolved.push(id),
        onFinished,
      });
    });

    expect(result.current.question).toMatchObject({ id: "a", label: "A", current: 1, total: 3 });

    // A : enregistrer.
    await act(async () => result.current.save());
    expect(saveA).toHaveBeenCalledOnce();
    expect(saveB).not.toHaveBeenCalled();
    expect(result.current.question).toMatchObject({ id: "b", current: 2 });

    // B : ne pas enregistrer.
    act(() => result.current.discard());
    expect(saveB).not.toHaveBeenCalled();
    expect(store().entries).not.toHaveProperty("b");
    expect(result.current.question).toMatchObject({ id: "c", current: 3, hasNext: false });

    // C : enregistrer, fin.
    await act(async () => result.current.save());

    expect(shown).toEqual(["a", "b", "c"]);
    expect(resolved).toEqual(["a", "b", "c"]);
    expect(onFinished).toHaveBeenCalledOnce();
    expect(result.current.question).toBeNull();
  });

  it("« Annuler » arrête tout sans toucher aux éléments suivants", async () => {
    addEntry("a");
    const saveB = addEntry("b");
    addEntry("c");

    const resolved: string[] = [];
    const onFinished = vi.fn();
    const onCancelled = vi.fn();

    const { result } = renderHook(() => useUnsavedQueue());

    act(() => {
      result.current.start(["a", "b", "c"], {
        onResolved: (id) => resolved.push(id),
        onFinished,
        onCancelled,
      });
    });

    await act(async () => result.current.save());
    act(() => result.current.cancel());

    expect(resolved).toEqual(["a"]);
    expect(saveB).not.toHaveBeenCalled();
    expect(Object.keys(store().entries)).toEqual(["b", "c"]);
    expect(onCancelled).toHaveBeenCalledOnce();
    expect(onFinished).not.toHaveBeenCalled();
    expect(result.current.question).toBeNull();
  });

  it("un échec d'enregistrement garde la question sur cet élément", async () => {
    addEntry("a", false);
    addEntry("b");

    const resolved: string[] = [];
    const { result } = renderHook(() => useUnsavedQueue());

    act(() => {
      result.current.start(["a", "b"], { onResolved: (id) => resolved.push(id) });
    });

    await act(async () => result.current.save());

    expect(result.current.failed).toBe(true);
    expect(result.current.question?.id).toBe("a");
    expect(resolved).toEqual([]);

    // L'utilisateur choisit finalement de ne pas l'enregistrer.
    act(() => result.current.discard());
    expect(result.current.failed).toBe(false);
    expect(result.current.question?.id).toBe("b");
  });

  it("passe sans question un élément déjà enregistré", () => {
    addEntry("b");

    const resolved: string[] = [];
    const onFinished = vi.fn();
    const { result } = renderHook(() => useUnsavedQueue());

    // « a » n'a plus de modification au moment de la question.
    act(() => {
      result.current.start(["a", "b"], {
        onResolved: (id) => resolved.push(id),
        onFinished,
      });
    });

    expect(resolved).toEqual(["a"]);
    expect(result.current.question?.id).toBe("b");

    // « b » est enregistré automatiquement pendant que la question est affichée.
    act(() => store().unregister("b"));

    expect(resolved).toEqual(["a", "b"]);
    expect(onFinished).toHaveBeenCalledOnce();
    expect(result.current.question).toBeNull();
  });
});
