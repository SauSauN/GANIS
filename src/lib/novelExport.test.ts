// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { documentToText, htmlToBlocks } from "@/lib/novelExport";

describe("export du manuscrit", () => {
  it("garde les paragraphes et la mise en forme", () => {
    const blocks = htmlToBlocks("<p>Il <em>savait</em> qu'elle <strong>mentait</strong>.</p><p>  Deux  </p><hr><p>Trois<br>lignes</p>");
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toEqual({
      type: "paragraph",
      indent: true,
      runs: [
        { text: "Il " },
        { text: "savait", italics: true },
        { text: " qu'elle " },
        { text: "mentait", bold: true },
        { text: "." },
      ],
    });
    expect(blocks[1].type === "paragraph" && blocks[1].runs[0].text).toBe("Deux");
    expect(blocks[2]).toEqual({ type: "sceneBreak" });
    expect(blocks[3].type === "paragraph" && blocks[3].runs.map((r) => r.text).join("")).toBe("Trois\nlignes");
  });

  it("produit un texte brut lisible", () => {
    const text = documentToText({
      title: "La Cité des brumes",
      subtitle: ["Nelly"],
      titlePage: true,
      blocks: [{ type: "heading", level: 2, text: "Chapitre 1" }, ...htmlToBlocks("<p>Léa entra.</p>"), { type: "sceneBreak" }, ...htmlToBlocks("<p>Il pleuvait.</p>")],
    });
    expect(text).toBe("La Cité des brumes\nNelly\n\nCHAPITRE 1\n\nLéa entra.\n\n* * *\n\nIl pleuvait.\n");
  });
});
