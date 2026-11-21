import { describe, expect, it } from "vitest";
import { checkForUpdate, compareVersions, RELEASES_PAGE } from "./updates";

const reply = (status: number, body: unknown = {}) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("mises à jour", () => {
  it("compare les numéros de version", () => {
    expect(compareVersions("1.0.1", "1.0.0")).toBeGreaterThan(0);
    expect(compareVersions("v1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("0.9.0", "1.0.0")).toBeLessThan(0);
  });

  it("signale une version plus récente", async () => {
    await expect(checkForUpdate("1.0.0", reply(200, { tag_name: "v1.1.0", html_url: "https://example.test/r" }))).resolves.toEqual({
      status: "available",
      latest: "1.1.0",
      url: "https://example.test/r",
    });
    await expect(checkForUpdate("1.0.0", reply(200, { tag_name: "1.1.0" }))).resolves.toMatchObject({ url: RELEASES_PAGE });
  });

  it("à jour, aucune version publiée, erreur du serveur", async () => {
    await expect(checkForUpdate("1.1.0", reply(200, { tag_name: "v1.1.0" }))).resolves.toEqual({ status: "upToDate", latest: "1.1.0" });
    await expect(checkForUpdate("1.0.0", reply(404))).resolves.toEqual({ status: "none" });
    await expect(checkForUpdate("1.0.0", reply(500))).rejects.toThrow();
  });
});
