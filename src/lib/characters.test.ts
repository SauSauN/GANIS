import { describe, expect, it } from "vitest";
import {
  CHARACTER_FIELDS,
  avatarColor,
  characterIdOfTab,
  characterTabId,
  DEFAULT_LISTS,
  emptyDraft,
  fieldsOfLevel,
  fullName,
  initials,
  isBlankDraft,
  levelProgress,
  listValues,
  nameError,
  parseList,
  sameDraft,
  serializeList,
  toInput,
} from "./characters";
import { fitWithin } from "./portraitImage";
import fr from "@/i18n/locales/fr/characters.json";
import en from "@/i18n/locales/en/characters.json";

describe("nom et initiales", () => {
  it("assemble prénom et nom", () => {
    expect(fullName({ firstName: " Aldric ", lastName: "Venn" })).toBe("Aldric Venn");
    expect(fullName({ firstName: "", lastName: "Gandalf" })).toBe("Gandalf");
  });

  it("prend le premier et le dernier mot", () => {
    expect(initials("Jean Valjean")).toBe("JV");
    expect(initials("  Marie-Anne   de Bovet ")).toBe("MB");
    expect(initials("élodie roux")).toBe("ÉR");
  });

  it("une seule lettre pour un nom d'un mot, « ? » sans lettre", () => {
    expect(initials("Gandalf")).toBe("G");
    expect(initials("R2-D2")).toBe("R");
    expect(initials("   ")).toBe("?");
  });

  it("demande au moins un prénom ou un nom", () => {
    expect(nameError("  ", "")).toBe("nameRequired");
    expect(nameError("Ana", "")).toBeNull();
    expect(nameError("", "Venn")).toBeNull();
    expect(nameError("x".repeat(101), "")).toBe("nameTooLong");
  });
});

describe("niveaux de la fiche", () => {
  const keys = (level: "basic" | "intermediate" | "advanced") =>
    fieldsOfLevel(level).map((field) => field.key);

  it("15 champs par niveau (avec nom, rôle, statut, image et galerie)", () => {
    expect(keys("basic")).toHaveLength(11);
    expect(keys("intermediate")).toHaveLength(14);
    expect(keys("advanced")).toHaveLength(15);
    expect(keys("basic")).toContain("birthDate");
    expect(keys("intermediate")).toContain("colorPalette");
    expect(keys("advanced")).toContain("plannedArc");
  });

  it("chaque champ et chaque valeur par défaut ont leur libellé en français et en anglais", () => {
    for (const field of CHARACTER_FIELDS) {
      expect(fr.fields[field.key as keyof typeof fr.fields], field.key).toBeTruthy();
      expect(en.fields[field.key as keyof typeof en.fields], field.key).toBeTruthy();
    }

    for (const [list, values] of Object.entries(DEFAULT_LISTS)) {
      for (const value of values) {
        const frList = fr.lists[list as keyof typeof DEFAULT_LISTS] as Record<string, string>;
        const enList = en.lists[list as keyof typeof DEFAULT_LISTS] as Record<string, string>;
        expect(frList[value], `${list}.${value}`).toBeTruthy();
        expect(enList[value], `${list}.${value}`).toBeTruthy();
      }
    }
  });

  it("progression sur 15", () => {
    const draft = { ...emptyDraft(), firstName: "Ana", fields: { age: "30", eyes: "Verts" } };

    // nom + rôle + statut + âge + image
    expect(levelProgress(draft, "basic", { portrait: true, gallery: 0 })).toEqual({ filled: 5, total: 15 });
    // yeux + galerie
    expect(levelProgress(draft, "intermediate", { portrait: false, gallery: 2 }).filled).toBe(2);
    expect(levelProgress(draft, "advanced", { portrait: false, gallery: 0 }).filled).toBe(0);
  });
});

describe("listes", () => {
  it("valeurs par défaut tant que la liste n'est pas personnalisée", () => {
    expect(listValues({}, "role")).toEqual(DEFAULT_LISTS.role);
    expect(listValues({ role: ["Héros"] }, "role")).toEqual(["Héros"]);
  });

  it("étiquettes et couleurs en JSON", () => {
    expect(parseList(serializeList(["a", "b"]))).toEqual(["a", "b"]);
    expect(serializeList([])).toBe("");
    expect(parseList("Loyal")).toEqual(["Loyal"]);
    expect(parseList(undefined)).toEqual([]);
  });
});

describe("brouillon", () => {
  it("ignore les espaces et les champs vides pour comparer", () => {
    const a = { ...emptyDraft(), firstName: "Ana", fields: { nickname: "Jo" } };
    const b = { ...emptyDraft(), firstName: " Ana ", fields: { nickname: "Jo ", notes: "", traits: "[]" } };

    expect(sameDraft(a, b)).toBe(true);
    expect(sameDraft(a, { ...a, lastName: "Venn" })).toBe(false);
    expect(sameDraft(a, { ...a, fields: { nickname: "Jojo" } })).toBe(false);
  });

  it("nettoie la fiche avant l'envoi (et retire les champs inconnus)", () => {
    expect(
      toInput({ ...emptyDraft(), firstName: " Ana ", fields: { nickname: " Jo ", notes: "  ", species: "Elfe" } }),
    ).toEqual({ ...emptyDraft(), firstName: "Ana", fields: { nickname: "Jo" } });
    expect(isBlankDraft({ ...emptyDraft(), fields: { notes: "  " } })).toBe(true);
  });
});

describe("divers", () => {
  it("onglet de fiche", () => {
    expect(characterIdOfTab(characterTabId("abc"))).toBe("abc");
    expect(characterIdOfTab("characters.list")).toBeNull();
  });

  it("couleur stable par identifiant", () => {
    expect(avatarColor("abc")).toBe(avatarColor("abc"));
  });

  it("réduction de la photo en gardant les proportions", () => {
    expect(fitWithin(3000, 1500, 768)).toEqual({ width: 768, height: 384 });
    expect(fitWithin(400, 300, 768)).toEqual({ width: 400, height: 300 });
  });
});
