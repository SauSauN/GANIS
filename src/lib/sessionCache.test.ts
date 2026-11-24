import { describe, expect, it, vi } from "vitest";
import { forgetSessionCaches, onSessionEnd, sessionMap } from "@/lib/sessionCache";

describe("caches de session", () => {
  it("vide toutes les maps inscrites et libère leurs valeurs", () => {
    const dropped: string[] = [];
    const images = sessionMap<string, string>((url) => dropped.push(url));
    const other = sessionMap<string, number>();
    images.set("a", "data:a");
    images.set("b", "blob:b");
    other.set("x", 1);

    forgetSessionCaches();

    expect(images.size).toBe(0);
    expect(other.size).toBe(0);
    expect(dropped).toEqual(["data:a", "blob:b"]);
  });

  it("au verrouillage, vide les caches mais pas les stores", () => {
    const images = sessionMap<string, string>();
    images.set("a", "data:a");
    const store = vi.fn();
    const stop = onSessionEnd(store);

    forgetSessionCaches("lock");
    expect(images.size).toBe(0);
    expect(store).not.toHaveBeenCalled();

    forgetSessionCaches("end");
    expect(store).toHaveBeenCalledTimes(1);
    stop();
  });

  it("continue si un cache échoue, et se désinscrit", () => {
    const broken = onSessionEnd(() => {
      throw new Error("boom");
    });
    const after = vi.fn();
    const stop = onSessionEnd(after);

    forgetSessionCaches();
    expect(after).toHaveBeenCalledTimes(1);

    stop();
    broken();
    forgetSessionCaches();
    expect(after).toHaveBeenCalledTimes(1);
  });
});
