//! Texte balisé des projets d'exemple.
//!
//! Les longs textes (scènes, notes, documents) ne sont pas écrits dans le
//! JSON mais dans des fichiers texte lisibles, découpés en sections :
//!
//! ```text
//! === clé-de-la-section ===
//! Premier paragraphe, qui peut tenir
//! sur plusieurs lignes.
//!
//! Deuxième paragraphe, avec *italique*, **gras** et une mention :
//! [[char:jeanne|Jeanne]].
//! ```
//!
//! Ce module découpe ces fichiers et convertit leur texte, soit en HTML
//! (texte des scènes, synopsis), soit en document de l'éditeur de notes
//! (JSON Tiptap). Les mentions désignent une fiche par sa clé :
//! `char:` personnage, `loc:` lieu, `node:` élément du découpage.

use std::collections::BTreeMap;

use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

/// Trouve l'identifiant d'une fiche : (sorte, clé) → identifiant.
pub type Resolve<'a> = dyn Fn(&str, &str) -> AppResult<String> + 'a;

fn invalid(message: impl Into<String>) -> AppError {
    AppError::internal(format!("Données d'exemple : {}", message.into()))
}

// ----------------------------------------------------------------------------
// Sections
// ----------------------------------------------------------------------------

/// Sections d'un fichier (`=== clé ===`), dans l'ordre du fichier. Ce qui
/// précède la première section (présentation du fichier) est ignoré.
pub fn sections(text: &str) -> AppResult<Vec<(String, String)>> {
    let mut out: Vec<(String, String)> = Vec::new();
    let mut current: Option<(String, Vec<&str>)> = None;
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(key) = trimmed.strip_prefix("===").and_then(|rest| rest.strip_suffix("===")) {
            if let Some((key, lines)) = current.take() {
                out.push((key, lines.join("\n").trim().to_owned()));
            }
            let key = key.trim();
            if key.is_empty() || out.iter().any(|(k, _)| k == key) {
                return Err(invalid(format!("section vide ou en double : « {key} »")));
            }
            current = Some((key.to_owned(), Vec::new()));
        } else if let Some((_, lines)) = current.as_mut() {
            lines.push(line);
        }
    }
    if let Some((key, lines)) = current.take() {
        out.push((key, lines.join("\n").trim().to_owned()));
    }
    Ok(out)
}

/// Sections sous forme de dictionnaire.
pub fn section_map(text: &str) -> AppResult<BTreeMap<String, String>> {
    Ok(sections(text)?.into_iter().collect())
}

/// Blocs de texte séparés par des lignes vides ; les lignes d'un même bloc
/// sont réunies par une espace, sauf après une barre oblique inverse finale
/// (`\`), qui force un retour à la ligne.
fn paragraphs(text: &str) -> Vec<Vec<String>> {
    let mut out = Vec::new();
    let mut current: Vec<String> = Vec::new();
    for line in text.lines() {
        if line.trim().is_empty() {
            if !current.is_empty() {
                out.push(std::mem::take(&mut current));
            }
        } else {
            current.push(line.trim().to_owned());
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

// ----------------------------------------------------------------------------
// Texte en ligne : gras, italique, mentions
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
enum Inline {
    Text { text: String, bold: bool, italic: bool },
    Break,
    Mention { kind: &'static str, id: String, label: String },
}

fn mention_kind(short: &str) -> Option<&'static str> {
    match short {
        "char" => Some("character"),
        "loc" => Some("location"),
        "node" => Some("node"),
        _ => None,
    }
}

/// Découpe une ligne de texte balisé.
fn inline(text: &str, resolve: &Resolve) -> AppResult<Vec<Inline>> {
    let mut out = Vec::new();
    let (mut bold, mut italic) = (false, false);
    let mut buffer = String::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;

    let flush = |buffer: &mut String, out: &mut Vec<Inline>, bold: bool, italic: bool| {
        if !buffer.is_empty() {
            out.push(Inline::Text { text: std::mem::take(buffer), bold, italic });
        }
    };

    while i < chars.len() {
        let c = chars[i];
        if c == '\\' && i + 1 < chars.len() && matches!(chars[i + 1], '*' | '[' | '\\') {
            buffer.push(chars[i + 1]);
            i += 2;
        } else if c == '\u{1}' {
            // Retour à la ligne forcé (voir `paragraphs`).
            flush(&mut buffer, &mut out, bold, italic);
            out.push(Inline::Break);
            i += 1;
        } else if c == '[' && chars.get(i + 1) == Some(&'[') {
            let rest: String = chars[i + 2..].iter().collect();
            let end = rest.find("]]").ok_or_else(|| invalid(format!("mention non fermée dans « {text} »")))?;
            let inner = &rest[..end];
            let (target, label) = inner.split_once('|').ok_or_else(|| invalid(format!("mention sans libellé : [[{inner}]]")))?;
            let (short, key) = target.split_once(':').ok_or_else(|| invalid(format!("mention sans sorte : [[{inner}]]")))?;
            let kind = mention_kind(short.trim()).ok_or_else(|| invalid(format!("sorte de mention inconnue : [[{inner}]]")))?;
            let id = resolve(short.trim(), key.trim())?;
            flush(&mut buffer, &mut out, bold, italic);
            out.push(Inline::Mention { kind, id, label: label.trim().to_owned() });
            i += 2 + rest[..end].chars().count() + 2;
        } else if c == '*' && chars.get(i + 1) == Some(&'*') {
            flush(&mut buffer, &mut out, bold, italic);
            bold = !bold;
            i += 2;
        } else if c == '*' {
            flush(&mut buffer, &mut out, bold, italic);
            italic = !italic;
            i += 1;
        } else {
            buffer.push(c);
            i += 1;
        }
    }
    if bold || italic {
        return Err(invalid(format!("gras ou italique non fermé dans « {text} »")));
    }
    flush(&mut buffer, &mut out, bold, italic);
    Ok(out)
}

/// Lignes d'un bloc réunies : espace, ou retour forcé après `\`.
fn join_lines(lines: &[String]) -> String {
    let mut out = String::new();
    for (index, line) in lines.iter().enumerate() {
        if index > 0 {
            out.push(if lines[index - 1].ends_with('\\') { '\u{1}' } else { ' ' });
        }
        out.push_str(line.strip_suffix('\\').map(str::trim_end).unwrap_or(line));
    }
    out
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn inline_html(parts: &[Inline]) -> String {
    let mut out = String::new();
    for part in parts {
        match part {
            Inline::Text { text, bold, italic } => {
                let mut piece = escape(text);
                if *italic {
                    piece = format!("<em>{piece}</em>");
                }
                if *bold {
                    piece = format!("<strong>{piece}</strong>");
                }
                out.push_str(&piece);
            }
            Inline::Break => out.push_str("<br>"),
            Inline::Mention { kind, id, label } => out.push_str(&format!(
                r#"<span data-mention="" data-kind="{kind}" data-id="{}" data-label="{}">{}</span>"#,
                escape(id),
                escape(label),
                escape(label)
            )),
        }
    }
    out
}

fn inline_nodes(parts: &[Inline]) -> Vec<Value> {
    parts
        .iter()
        .map(|part| match part {
            Inline::Text { text, bold, italic } => {
                let mut marks = Vec::new();
                if *bold {
                    marks.push(json!({ "type": "bold" }));
                }
                if *italic {
                    marks.push(json!({ "type": "italic" }));
                }
                if marks.is_empty() {
                    json!({ "type": "text", "text": text })
                } else {
                    json!({ "type": "text", "text": text, "marks": marks })
                }
            }
            Inline::Break => json!({ "type": "hardBreak" }),
            Inline::Mention { kind, id, label } => {
                json!({ "type": "entityMention", "attrs": { "kind": kind, "id": id, "label": label } })
            }
        })
        .collect()
}

fn plain(parts: &[Inline]) -> String {
    parts
        .iter()
        .map(|part| match part {
            Inline::Text { text, .. } => text.as_str(),
            Inline::Break => " ",
            Inline::Mention { label, .. } => label.as_str(),
        })
        .collect()
}

// ----------------------------------------------------------------------------
// HTML (scènes, synopsis)
// ----------------------------------------------------------------------------

/// Texte d'une scène ou d'un synopsis : un `<p>` par paragraphe.
pub fn to_html(text: &str, resolve: &Resolve) -> AppResult<String> {
    let mut out = String::new();
    for block in paragraphs(text) {
        let parts = inline(&join_lines(&block), resolve)?;
        out.push_str("<p>");
        out.push_str(&inline_html(&parts));
        out.push_str("</p>");
    }
    Ok(out)
}

// ----------------------------------------------------------------------------
// Document de l'éditeur de notes (Tiptap)
// ----------------------------------------------------------------------------

fn paragraph(parts: &[Inline]) -> Value {
    let content = inline_nodes(parts);
    if content.is_empty() {
        json!({ "type": "paragraph" })
    } else {
        json!({ "type": "paragraph", "content": content })
    }
}

/// Note convertie : document JSON et extrait (premier paragraphe).
pub struct NoteDoc {
    pub content: String,
    pub excerpt: String,
}

/// Convertit le texte d'une note.
///
/// Reconnu, en début de ligne : `#`, `##`, `###` (titres), `- ` (liste),
/// `1. ` (liste numérotée), `- [ ] ` / `- [x] ` (cases à cocher), `> `
/// (citation), `| … |` (tableau, la ligne `|---|` sépare l'en-tête),
/// `:::encadré couleur` … `:::` (encadré), `:::enchaînement` … `:::` (cases
/// enchaînées, une par ligne `- `), `:::schéma` … `:::` (schéma, en JSON).
/// Le reste forme des paragraphes.
pub fn to_note(text: &str, resolve: &Resolve) -> AppResult<NoteDoc> {
    let lines: Vec<&str> = text.lines().collect();
    let mut blocks = blocks(&lines, resolve)?;
    // L'éditeur ajoute un paragraphe après un bloc final qui n'en est pas
    // un : la note paraîtrait modifiée dès son ouverture.
    if blocks.last().map(|b| b["type"] != "paragraph").unwrap_or(true) {
        blocks.push(json!({ "type": "paragraph" }));
    }
    let excerpt = excerpt_of(&blocks);
    Ok(NoteDoc { content: json!({ "type": "doc", "content": blocks }).to_string(), excerpt })
}

fn excerpt_of(blocks: &[Value]) -> String {
    fn text_of(node: &Value, out: &mut String) {
        if let Some(text) = node["text"].as_str() {
            out.push_str(text);
        }
        if let Some(label) = node["attrs"]["label"].as_str() {
            out.push_str(label);
        }
        if let Some(children) = node["content"].as_array() {
            for child in children {
                text_of(child, out);
            }
        }
    }
    for block in blocks {
        if block["type"] == "paragraph" {
            let mut out = String::new();
            text_of(block, &mut out);
            if !out.trim().is_empty() {
                return out.chars().take(200).collect();
            }
        }
    }
    String::new()
}

fn list_item(parts: &[Inline]) -> Value {
    json!({ "type": "listItem", "content": [paragraph(parts)] })
}

/// Cellules d'une ligne de tableau ; une barre à l'intérieur d'une mention
/// (`[[char:x|Libellé]]`) ne sépare pas deux cellules.
fn table_cells(line: &str) -> Vec<String> {
    let inner = line.trim();
    let inner = inner.strip_prefix('|').unwrap_or(inner);
    let inner = inner.strip_suffix('|').unwrap_or(inner);
    let mut cells = Vec::new();
    let mut current = String::new();
    let mut depth = 0usize;
    let chars: Vec<char> = inner.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        match chars[i] {
            '[' if chars.get(i + 1) == Some(&'[') => {
                depth += 1;
                current.push_str("[[");
                i += 2;
                continue;
            }
            ']' if chars.get(i + 1) == Some(&']') && depth > 0 => {
                depth -= 1;
                current.push_str("]]");
                i += 2;
                continue;
            }
            '|' if depth == 0 => cells.push(std::mem::take(&mut current).trim().to_owned()),
            c => current.push(c),
        }
        i += 1;
    }
    cells.push(current.trim().to_owned());
    cells
}

fn blocks(lines: &[&str], resolve: &Resolve) -> AppResult<Vec<Value>> {
    let mut out = Vec::new();
    let mut i = 0;
    let mut pending: Vec<String> = Vec::new();

    macro_rules! flush_paragraph {
        () => {
            if !pending.is_empty() {
                let parts = inline(&join_lines(&pending), resolve)?;
                out.push(paragraph(&parts));
                pending.clear();
            }
        };
    }

    while i < lines.len() {
        let line = lines[i].trim_end();
        let trimmed = line.trim_start();

        if trimmed.is_empty() {
            flush_paragraph!();
            i += 1;
            continue;
        }

        // Blocs ::: … :::
        if let Some(head) = trimmed.strip_prefix(":::") {
            flush_paragraph!();
            let head = head.trim();
            let end = lines[i + 1..]
                .iter()
                .position(|l| l.trim() == ":::")
                .map(|p| i + 1 + p)
                .ok_or_else(|| invalid(format!("bloc « :::{head} » non fermé")))?;
            let inner = &lines[i + 1..end];
            let (name, arg) = head.split_once(' ').unwrap_or((head, ""));
            match name {
                "encadré" => {
                    let color = if arg.trim().is_empty() { "yellow" } else { arg.trim() };
                    if !crate::services::note_service::STICKY_COLORS.contains(&color) {
                        return Err(invalid(format!("couleur d'encadré inconnue : {color}")));
                    }
                    let mut content = blocks(inner, resolve)?;
                    if content.is_empty() {
                        content.push(json!({ "type": "paragraph" }));
                    }
                    out.push(json!({ "type": "callout", "attrs": { "color": color }, "content": content }));
                }
                "enchaînement" => {
                    let mut items = Vec::new();
                    for item in inner.iter().map(|l| l.trim()).filter(|l| !l.is_empty()) {
                        let text = item.strip_prefix("- ").ok_or_else(|| invalid("enchaînement : une case par ligne « - »"))?;
                        items.push(json!({ "type": "chainItem", "content": [paragraph(&inline(text, resolve)?)] }));
                    }
                    if items.is_empty() {
                        return Err(invalid("enchaînement vide"));
                    }
                    out.push(json!({ "type": "chain", "content": items }));
                }
                "schéma" => {
                    let data: Value = serde_json::from_str(&inner.join("\n")).map_err(|e| invalid(format!("schéma illisible : {e}")))?;
                    let height = if arg.trim() == "grand" { "large" } else { "small" };
                    out.push(json!({ "type": "diagram", "attrs": { "data": data, "height": height } }));
                }
                other => return Err(invalid(format!("bloc inconnu : :::{other}"))),
            }
            i = end + 1;
            continue;
        }

        // Titres
        let heading = [("### ", 3), ("## ", 2), ("# ", 1)].into_iter().find_map(|(p, level)| trimmed.strip_prefix(p).map(|t| (t, level)));
        if let Some((title, level)) = heading {
            flush_paragraph!();
            let parts = inline(title.trim(), resolve)?;
            out.push(json!({ "type": "heading", "attrs": { "level": level }, "content": inline_nodes(&parts) }));
            i += 1;
            continue;
        }

        // Cases à cocher
        if trimmed.starts_with("- [ ] ") || trimmed.starts_with("- [x] ") {
            flush_paragraph!();
            let mut items = Vec::new();
            while i < lines.len() {
                let l = lines[i].trim();
                let (checked, text) = if let Some(t) = l.strip_prefix("- [ ] ") {
                    (false, t)
                } else if let Some(t) = l.strip_prefix("- [x] ") {
                    (true, t)
                } else {
                    break;
                };
                items.push(json!({ "type": "taskItem", "attrs": { "checked": checked }, "content": [paragraph(&inline(text, resolve)?)] }));
                i += 1;
            }
            out.push(json!({ "type": "taskList", "content": items }));
            continue;
        }

        // Listes
        if trimmed.starts_with("- ") {
            flush_paragraph!();
            let mut items = Vec::new();
            while i < lines.len() {
                let Some(text) = lines[i].trim().strip_prefix("- ") else { break };
                items.push(list_item(&inline(text, resolve)?));
                i += 1;
            }
            out.push(json!({ "type": "bulletList", "content": items }));
            continue;
        }
        if numbered_item(trimmed).is_some() {
            flush_paragraph!();
            let mut items = Vec::new();
            while i < lines.len() {
                let Some(text) = numbered_item(lines[i].trim()) else { break };
                items.push(list_item(&inline(text, resolve)?));
                i += 1;
            }
            out.push(json!({ "type": "orderedList", "attrs": { "start": 1 }, "content": items }));
            continue;
        }

        // Citation
        if trimmed.starts_with('>') {
            flush_paragraph!();
            let mut quoted: Vec<&str> = Vec::new();
            while i < lines.len() {
                let l = lines[i].trim();
                let Some(rest) = l.strip_prefix('>') else { break };
                quoted.push(rest.strip_prefix(' ').unwrap_or(rest));
                i += 1;
            }
            let inner = blocks(&quoted, resolve)?;
            out.push(json!({ "type": "blockquote", "content": inner }));
            continue;
        }

        // Tableau
        if trimmed.starts_with('|') {
            flush_paragraph!();
            let mut rows: Vec<Vec<String>> = Vec::new();
            let mut header = false;
            while i < lines.len() && lines[i].trim().starts_with('|') {
                let cells = table_cells(lines[i]);
                if cells.iter().all(|c| !c.is_empty() && c.chars().all(|ch| ch == '-' || ch == ':')) {
                    header = rows.len() == 1;
                } else {
                    rows.push(cells);
                }
                i += 1;
            }
            let width = rows.iter().map(Vec::len).max().unwrap_or(0);
            let mut table_rows = Vec::new();
            for (index, mut row) in rows.into_iter().enumerate() {
                row.resize(width, String::new());
                let cell_type = if header && index == 0 { "tableHeader" } else { "tableCell" };
                let mut cells = Vec::new();
                for cell in row {
                    cells.push(json!({ "type": cell_type, "attrs": { "colspan": 1, "rowspan": 1, "colwidth": null }, "content": [paragraph(&inline(&cell, resolve)?)] }));
                }
                table_rows.push(json!({ "type": "tableRow", "content": cells }));
            }
            out.push(json!({ "type": "table", "content": table_rows }));
            continue;
        }

        pending.push(trimmed.to_owned());
        i += 1;
    }
    flush_paragraph!();
    Ok(out)
}

fn numbered_item(line: &str) -> Option<&str> {
    let digits = line.chars().take_while(char::is_ascii_digit).count();
    if digits == 0 {
        return None;
    }
    line[digits..].strip_prefix(". ")
}

// ----------------------------------------------------------------------------
// Texte brut (documents .txt, .md, .docx)
// ----------------------------------------------------------------------------

/// Paragraphes en texte brut (balises retirées, mentions remplacées par
/// leur libellé), pour un document Word.
pub fn plain_paragraphs(text: &str) -> AppResult<Vec<String>> {
    let none = |_: &str, _: &str| -> AppResult<String> { Ok(String::new()) };
    paragraphs(text)
        .into_iter()
        .map(|block| {
            let joined = join_lines(&block);
            // Un titre « # » est gardé tel quel (voir `images::docx`).
            if let Some(title) = joined.strip_prefix("# ") {
                return Ok(format!("# {}", plain(&inline(title, &none)?)));
            }
            Ok(plain(&inline(&joined, &none)?))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resolve(kind: &str, key: &str) -> AppResult<String> {
        match (kind, key) {
            ("char", "lea") => Ok("id-lea".to_owned()),
            ("loc", "port") => Ok("id-port".to_owned()),
            _ => Err(invalid(format!("{kind}:{key} inconnu"))),
        }
    }

    #[test]
    fn sections_are_split_in_order() {
        let text = "Présentation ignorée\n=== un ===\nA\n\n=== deux ===\nB\nC\n";
        let s = sections(text).unwrap();
        assert_eq!(s, vec![("un".to_owned(), "A".to_owned()), ("deux".to_owned(), "B\nC".to_owned())]);
        assert!(sections("=== a ===\n=== a ===\n").is_err());
    }

    #[test]
    fn html_has_paragraphs_marks_and_mentions() {
        let html = to_html("Un *mot* et **deux**\nsur deux lignes.\n\n— [[char:lea|Léa]] & <moi>.", &resolve).unwrap();
        assert_eq!(
            html,
            "<p>Un <em>mot</em> et <strong>deux</strong> sur deux lignes.</p><p>— <span data-mention=\"\" data-kind=\"character\" data-id=\"id-lea\" data-label=\"Léa\">Léa</span> &amp; &lt;moi&gt;.</p>"
        );
        assert_eq!(to_html("Vers un\\\nvers deux", &resolve).unwrap(), "<p>Vers un<br>vers deux</p>");
        assert!(to_html("[[char:inconnu|X]]", &resolve).is_err());
        assert!(to_html("*non fermé", &resolve).is_err());
        assert_eq!(to_html("Prix : 3 \\* 4", &resolve).unwrap(), "<p>Prix : 3 * 4</p>");
    }

    #[test]
    fn notes_cover_every_block() {
        let text = "# Titre\nIntro avec [[loc:port|le port]].\n\n- a\n- b\n\n1. un\n2. deux\n\n- [ ] faire\n- [x] fait\n\n> Citation\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n:::encadré blue\nAttention.\n:::\n\n:::enchaînement\n- avant\n- après\n:::\n\n:::schéma\n{\"boxes\":[],\"links\":[]}\n:::";
        let note = to_note(text, &resolve).unwrap();
        let doc: Value = serde_json::from_str(&note.content).unwrap();
        let types: Vec<&str> = doc["content"].as_array().unwrap().iter().map(|b| b["type"].as_str().unwrap()).collect();
        assert_eq!(
            types,
            ["heading", "paragraph", "bulletList", "orderedList", "taskList", "blockquote", "table", "callout", "chain", "diagram", "paragraph"]
        );
        assert_eq!(note.excerpt, "Intro avec le port.");
        assert_eq!(doc["content"][6]["content"][0]["content"][0]["type"], "tableHeader");
        assert_eq!(doc["content"][6]["content"][1]["content"][0]["type"], "tableCell");
        assert_eq!(doc["content"][1]["content"][1]["attrs"]["id"], "id-port");
        // Une mention dans un tableau reste dans sa cellule.
        let table = to_note("| Qui | Où |\n|---|---|\n| [[char:lea|Léa]] | ici |", &resolve).unwrap();
        let table: Value = serde_json::from_str(&table.content).unwrap();
        assert_eq!(table["content"][0]["content"][1]["content"].as_array().unwrap().len(), 2);
        // Se termine toujours par un paragraphe.
        assert_eq!(doc["content"].as_array().unwrap().last().unwrap()["type"], "paragraph");
        assert!(to_note(":::encadré rouge\nx\n:::", &resolve).is_err());
        assert!(to_note(":::encadré\nx", &resolve).is_err());
    }

    #[test]
    fn plain_paragraphs_drop_markup() {
        let p = plain_paragraphs("# Lettre\n\n*Chère* [[char:x|Léa]],\nbonjour.").unwrap();
        assert_eq!(p, vec!["# Lettre".to_owned(), "Chère Léa, bonjour.".to_owned()]);
    }
}
