import { describe, expect, it } from "vitest";
import { checkPassword, isWeakPassword } from "@/lib/validators";

describe("checkPassword", () => {
  it("needs 12 characters with a letter and a digit", () => {
    expect(checkPassword("plume-violette-1")).toBeNull();
    expect(checkPassword("court1")).toBe("passwordTooShort");
    expect(checkPassword("seulementdeslettres")).toBe("passwordNeedsLetterAndDigit");
    expect(checkPassword(`a1${"x".repeat(127)}`)).toBe("passwordTooLong");
  });

  it("refuses common passwords, even with digits around them", () => {
    expect(checkPassword("motdepasse123")).toBe("passwordWeak");
    expect(checkPassword("Azerty2024!!")).toBe("passwordWeak");
    expect(checkPassword("aaaaaaaaaaaa1")).toBe("passwordWeak");
    expect(isWeakPassword("123456789012")).toBe(true);
  });

  it("refuses the username inside the password", () => {
    expect(checkPassword("alice-plume-12", "alice")).toBe("passwordWeak");
    expect(checkPassword("plume-violette-1", "alice")).toBeNull();
  });
});
