// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAutoSave, setAutoSave } from "@/lib/preferences";
import {
  discardEntries,
  saveEntries,
  useUnsavedStore,
} from "@/lib/unsavedChanges";

const store = () => useUnsavedStore.getState();

beforeEach(() => {
  useUnsavedStore.setState({ entries: {}, pending: null });
  localStorage.clear();
});

describe("registre", () => {
  it("enregistre et retire une entrée", () => {
    store().register("synopsis.edit", { label: "Synopsis", save: async () => true });
    expect(Object.keys(store().entries)).toEqual(["synopsis.edit"]);

    store().unregister("synopsis.edit");
    expect(store().entries).toEqual({});
  });

  it("quitte tout de suite quand rien n'est en attente", () => {
    const proceed = vi.fn();
    store().requestLeave("quit", proceed);
    expect(proceed).toHaveBeenCalledOnce();
    expect(store().pending).toBeNull();
  });

  it("met la sortie en attente quand des modifications existent", () => {
    store().register("a", { label: "A", save: async () => true });
    const proceed = vi.fn();
    store().requestLeave("leave", proceed);
    expect(proceed).not.toHaveBeenCalled();
    expect(store().pending?.kind).toBe("leave");
  });
});

describe("enregistrement groupé", () => {
  it("renvoie les éléments en échec (y compris une exception)", async () => {
    store().register("ok", { label: "OK", save: async () => true });
    store().register("ko", { label: "KO", save: async () => false });
    store().register("boom", {
      label: "Boom",
      save: async () => {
        throw new Error("x");
      },
    });

    expect(await saveEntries(["ok", "ko", "boom", "absent"])).toEqual(["ko", "boom"]);
  });

  it("abandonne les modifications", () => {
    store().register("a", { label: "A", save: async () => true });
    store().register("b", { label: "B", save: async () => true });
    discardEntries(["a"]);
    expect(Object.keys(store().entries)).toEqual(["b"]);
  });
});

describe("préférence d'enregistrement automatique", () => {
  it("désactivé par défaut, 3 s", () => {
    expect(getAutoSave()).toEqual({ enabled: false, delay: 3 });
  });

  it("mémorise le choix et ignore un délai inconnu", () => {
    setAutoSave({ enabled: true, delay: 10 });
    expect(getAutoSave()).toEqual({ enabled: true, delay: 10 });

    localStorage.setItem("ganis-auto-save", JSON.stringify({ enabled: true, delay: 7 }));
    expect(getAutoSave()).toEqual({ enabled: true, delay: 3 });
  });

  it("renvoie le même objet tant que rien ne change", () => {
    setAutoSave({ enabled: true });
    expect(getAutoSave()).toBe(getAutoSave());
  });
});
