// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

describe("sanitizeHtml", () => {
  it("keeps text formatting", () => {
    const html = "<h1>Chapitre 1</h1><p><strong>Kai</strong> <em>court</em>.</p><ul><li>un</li></ul><table><tr><td colspan=\"2\">x</td></tr></table>";
    expect(sanitizeHtml(html)).toBe(
      "<h1>Chapitre 1</h1><p><strong>Kai</strong> <em>court</em>.</p><ul><li>un</li></ul><table><tbody><tr><td colspan=\"2\">x</td></tr></tbody></table>",
    );
  });

  it("removes scripts, styles, events and outside links", () => {
    const out = sanitizeHtml(
      '<p onclick="alert(1)" style="color:red">a<script>alert(1)</script></p><style>p{}</style><iframe src="x"></iframe><a href="https://evil.example">lien</a><a href="javascript:alert(1)">js</a><img src="https://evil.example/x.png" onerror="alert(1)"><svg><script>1</script></svg>',
    );
    expect(out).toBe("<p>a</p>lienjs");
  });

  it("keeps embedded images and footnote anchors only", () => {
    const out = sanitizeHtml('<p><img src="data:image/png;base64,iVBORw0K" alt="planche"><a href="#footnote-1" id="footnote-ref-1">[1]</a></p><p><img src="data:text/html;base64,PHNjcmlwdD4="></p>');
    expect(out).toBe('<p><img src="data:image/png;base64,iVBORw0K" alt="planche"><a href="#footnote-1" id="footnote-ref-1">[1]</a></p><p></p>');
  });

  it("unwraps unknown tags but keeps their text", () => {
    expect(sanitizeHtml("<custom-tag><b>gras</b></custom-tag><font color=red>f</font>")).toBe("<b>gras</b>f");
  });
});
