import { describe, expect, it } from "vitest";
import { isEmailCodeComplete, normalizeEmailCode } from "./emailRecovery";

describe("code reçu par e-mail", () => {
  it("garde seulement les chiffres, six au plus", () => {
    expect(normalizeEmailCode(" 123 456 ")).toBe("123456");
    expect(normalizeEmailCode("12-34-56-78")).toBe("123456");
    expect(normalizeEmailCode("abc")).toBe("");
  });

  it("n'accepte qu'un code complet", () => {
    expect(isEmailCodeComplete("123456")).toBe(true);
    expect(isEmailCodeComplete("123 456")).toBe(true);
    expect(isEmailCodeComplete("12345")).toBe(false);
  });
});
