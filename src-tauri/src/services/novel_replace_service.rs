//! Rechercher et remplacer dans le texte des scènes (roman).
//!
//! Le texte d'un élément est le HTML de l'éditeur. La recherche ne porte que
//! sur le texte lu : les balises (mise en forme) ne sont jamais modifiées et
//! les mentions (liens vers une fiche, `<span data-mention>`) sont laissées
//! telles quelles, leur nom suit la fiche. Une occurrence ne traverse pas un
//! changement de mise en forme (« Ma<em>rc</em> » n'est pas trouvé).
//!
//! Le remplacement :
//! - ne touche que les occurrences cochées (numérotées par élément, dans
//!   l'ordre du texte) ;
//! - vérifie que chaque élément n'a pas changé depuis la recherche
//!   (`updated_at`), sinon il faut relancer la recherche ;
//! - garde une version nommée de chaque élément modifié, et renvoie l'ancien
//!   texte pour pouvoir annuler aussitôt ;
//! - sans « respecter la casse », adapte la casse du remplacement à celle de
//!   l'occurrence (« marc » → « martin » : « Marc » devient « Martin »,
//!   « MARC » devient « MARTIN »).

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::services::history_service as history;
use crate::services::novel_service;
use crate::services::structure_service::StructureNode;

/// Longueur maximale du texte cherché ou du remplacement.
const MAX_QUERY_CHARS: usize = 500;
/// Nombre maximal d'occurrences renvoyées (au-delà : `truncated`).
const MAX_MATCHES: usize = 5_000;
/// Caractères de contexte de part et d'autre d'une occurrence.
const CONTEXT_CHARS: usize = 48;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FindOptions {
    pub query: String,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub whole_word: bool,
}

/// Une occurrence : son numéro dans l'élément et le texte autour.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FindMatch {
    pub node_id: String,
    pub index: usize,
    pub before: String,
    pub text: String,
    pub after: String,
}

/// Élément où le texte a été trouvé (pour vérifier qu'il n'a pas changé).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindNode {
    pub id: String,
    pub updated_at: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindResult {
    pub matches: Vec<FindMatch>,
    pub nodes: Vec<FindNode>,
    pub total: usize,
    pub truncated: bool,
}

/// Occurrences à remplacer dans un élément.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceTarget {
    pub node_id: String,
    pub updated_at: String,
    pub indices: Vec<usize>,
}

/// Élément modifié et son texte d'avant (pour annuler).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplacedNode {
    pub node: StructureNode,
    pub before: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceResult {
    pub replaced: usize,
    pub nodes: Vec<ReplacedNode>,
}

fn invalid_query() -> AppError {
    AppError::validation("Le texte à chercher est vide ou trop long.").with_key("novel.replaceQuery")
}

fn stale() -> AppError {
    AppError::conflict("Le texte a changé depuis la recherche. Relancez la recherche.").with_key("novel.replaceStale")
}

// ----------------------------------------------------------------------------
// Découpage du HTML
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
enum Segment {
    /// Balise, gardée telle quelle.
    Tag(String),
    /// Texte (encore encodé) ; `searchable` : hors mention.
    Text { raw: String, searchable: bool },
}

fn segments(html: &str) -> Vec<Segment> {
    let mut out = Vec::new();
    let mut text = String::new();
    // Profondeur des <span> depuis l'ouverture d'une mention (0 : hors mention).
    let mut mention_depth = 0usize;
    let mut chars = html.chars();
    let flush = |text: &mut String, out: &mut Vec<Segment>, mention_depth: usize| {
        if !text.is_empty() {
            out.push(Segment::Text { raw: std::mem::take(text), searchable: mention_depth == 0 });
        }
    };
    while let Some(c) = chars.next() {
        if c != '<' {
            text.push(c);
            continue;
        }
        flush(&mut text, &mut out, mention_depth);
        let mut tag = String::from("<");
        for t in chars.by_ref() {
            tag.push(t);
            if t == '>' {
                break;
            }
        }
        let lower = tag.to_ascii_lowercase();
        let closing = lower.starts_with("</");
        let name: String = lower.trim_start_matches("</").trim_start_matches('<').chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
        if name == "span" {
            if closing {
                mention_depth = mention_depth.saturating_sub(1);
            } else if mention_depth > 0 {
                mention_depth += 1;
            } else if lower.contains("data-mention") {
                mention_depth = 1;
            }
        }
        out.push(Segment::Tag(tag));
    }
    flush(&mut text, &mut out, mention_depth);
    out
}

/// Texte lu d'un segment (entités décodées).
fn decode(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(start) = rest.find('&') {
        out.push_str(&rest[..start]);
        let tail = &rest[start..];
        let Some(end) = tail.find(';').filter(|&end| end <= 10) else {
            out.push('&');
            rest = &tail[1..];
            continue;
        };
        let entity = &tail[1..end];
        let decoded = match entity {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "nbsp" => Some('\u{a0}'),
            _ if entity.starts_with("#x") || entity.starts_with("#X") => u32::from_str_radix(&entity[2..], 16).ok().and_then(char::from_u32),
            _ if entity.starts_with('#') => entity[1..].parse().ok().and_then(char::from_u32),
            _ => None,
        };
        match decoded {
            Some(c) => {
                out.push(c);
                rest = &tail[end + 1..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// Texte réencodé comme le fait l'éditeur.
fn encode(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '\u{a0}' => out.push_str("&nbsp;"),
            _ => out.push(c),
        }
    }
    out
}

// ----------------------------------------------------------------------------
// Recherche dans un texte
// ----------------------------------------------------------------------------

fn fold(c: char, case_sensitive: bool) -> char {
    let c = if c == '\u{a0}' { ' ' } else { c };
    if case_sensitive {
        c
    } else {
        c.to_lowercase().next().unwrap_or(c)
    }
}

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// Positions (en caractères) des occurrences dans `text`, sans chevauchement.
fn find_in(text: &[char], query: &[char], options: &FindOptions) -> Vec<usize> {
    let mut found = Vec::new();
    if query.is_empty() || text.len() < query.len() {
        return found;
    }
    let query: Vec<char> = query.iter().map(|&c| fold(c, options.case_sensitive)).collect();
    let mut i = 0;
    while i + query.len() <= text.len() {
        let hit = query.iter().enumerate().all(|(k, &q)| fold(text[i + k], options.case_sensitive) == q);
        let bounded = !options.whole_word
            || ((i == 0 || !is_word_char(text[i - 1])) && (i + query.len() == text.len() || !is_word_char(text[i + query.len()])));
        if hit && bounded {
            found.push(i);
            i += query.len();
        } else {
            i += 1;
        }
    }
    found
}

/// Casse du remplacement adaptée à l'occurrence (recherche sans casse).
fn adapt_case(found: &str, replacement: &str) -> String {
    let letters: Vec<char> = found.chars().filter(|c| c.is_alphabetic()).collect();
    if letters.len() >= 2 && letters.iter().all(|c| c.is_uppercase()) {
        return replacement.to_uppercase();
    }
    let mut chars = replacement.chars();
    match (found.chars().next(), chars.next()) {
        (Some(first), Some(r)) if first.is_uppercase() && r.is_lowercase() => r.to_uppercase().chain(chars).collect(),
        _ => replacement.to_owned(),
    }
}

fn snippet(chars: &[char], from: usize, to: usize) -> String {
    chars[from..to].iter().map(|&c| if c == '\u{a0}' || c == '\n' { ' ' } else { c }).collect()
}

/// Occurrences d'un texte d'élément (sans les appliquer).
fn matches_in(node_id: &str, html: &str, options: &FindOptions, query: &[char]) -> Vec<FindMatch> {
    let mut out = Vec::new();
    for segment in segments(html) {
        let Segment::Text { raw, searchable: true } = segment else { continue };
        let chars: Vec<char> = decode(&raw).chars().collect();
        for start in find_in(&chars, query, options) {
            let end = start + query.len();
            let from = start.saturating_sub(CONTEXT_CHARS);
            let to = (end + CONTEXT_CHARS).min(chars.len());
            out.push(FindMatch {
                node_id: node_id.to_owned(),
                index: out.len(),
                before: format!("{}{}", if from > 0 { "…" } else { "" }, snippet(&chars, from, start)),
                text: snippet(&chars, start, end),
                after: format!("{}{}", snippet(&chars, end, to), if to < chars.len() { "…" } else { "" }),
            });
        }
    }
    out
}

/// Texte d'élément avec les occurrences `indices` remplacées ; renvoie aussi
/// le nombre de remplacements faits.
fn replace_in(html: &str, options: &FindOptions, query: &[char], replacement: &str, indices: &[usize]) -> (String, usize) {
    let mut out = String::with_capacity(html.len());
    let mut index = 0usize;
    let mut done = 0usize;
    for segment in segments(html) {
        match segment {
            Segment::Tag(tag) => out.push_str(&tag),
            Segment::Text { raw, searchable: false } => out.push_str(&raw),
            Segment::Text { raw, searchable: true } => {
                let chars: Vec<char> = decode(&raw).chars().collect();
                let starts = find_in(&chars, query, options);
                let chosen: Vec<usize> = starts
                    .into_iter()
                    .filter(|_| {
                        let keep = indices.contains(&index);
                        index += 1;
                        keep
                    })
                    .collect();
                if chosen.is_empty() {
                    // Segment intact : gardé octet pour octet.
                    out.push_str(&raw);
                    continue;
                }
                let mut text = String::new();
                let mut cursor = 0;
                for start in chosen {
                    text.extend(&chars[cursor..start]);
                    let found: String = chars[start..start + query.len()].iter().collect();
                    if options.case_sensitive {
                        text.push_str(replacement);
                    } else {
                        text.push_str(&adapt_case(&found, replacement));
                    }
                    cursor = start + query.len();
                    done += 1;
                }
                text.extend(&chars[cursor..]);
                out.push_str(&encode(&text));
            }
        }
    }
    (out, done)
}

fn checked_query(options: &FindOptions) -> AppResult<Vec<char>> {
    let query: Vec<char> = options.query.chars().collect();
    if options.query.trim().is_empty() || query.len() > MAX_QUERY_CHARS {
        return Err(invalid_query());
    }
    Ok(query)
}

// ----------------------------------------------------------------------------
// Sur tout le manuscrit
// ----------------------------------------------------------------------------

/// Cherche dans le texte de tous les éléments.
pub async fn find(pool: &SqlitePool, options: &FindOptions) -> AppResult<FindResult> {
    let query = checked_query(options)?;
    let rows: Vec<(String, String, String)> =
        sqlx::query_as("SELECT id, content, updated_at FROM structure_nodes WHERE content <> ''").fetch_all(pool).await?;

    let mut result = FindResult { matches: Vec::new(), nodes: Vec::new(), total: 0, truncated: false };
    for (id, content, updated_at) in rows {
        let found = matches_in(&id, &content, options, &query);
        if found.is_empty() {
            continue;
        }
        result.total += found.len();
        result.nodes.push(FindNode { id, updated_at, count: found.len() });
        let room = MAX_MATCHES.saturating_sub(result.matches.len());
        if found.len() > room {
            result.truncated = true;
        }
        result.matches.extend(found.into_iter().take(room));
    }
    Ok(result)
}

/// Remplace les occurrences choisies. `version_name` : nom de la version
/// gardée avant la modification de chaque élément.
pub async fn replace(
    pool: &SqlitePool,
    options: &FindOptions,
    replacement: &str,
    targets: &[ReplaceTarget],
    version_name: &str,
) -> AppResult<ReplaceResult> {
    let query = checked_query(options)?;
    if replacement.chars().count() > MAX_QUERY_CHARS {
        return Err(invalid_query());
    }

    // Tout est vérifié et calculé avant d'écrire quoi que ce soit.
    let mut planned = Vec::new();
    for target in targets.iter().filter(|t| !t.indices.is_empty()) {
        let row: Option<(String, String)> = sqlx::query_as("SELECT content, updated_at FROM structure_nodes WHERE id = ?")
            .bind(&target.node_id)
            .fetch_optional(pool)
            .await?;
        let Some((before, updated_at)) = row else { return Err(stale()) };
        if updated_at != target.updated_at {
            return Err(stale());
        }
        let (after, count) = replace_in(&before, options, &query, replacement, &target.indices);
        if count != target.indices.len() {
            return Err(stale());
        }
        planned.push((target.node_id.clone(), before, after, count));
    }

    let mut result = ReplaceResult { replaced: 0, nodes: Vec::new() };
    for (id, before, after, count) in planned {
        if let Err(error) = history::create_named_version(pool, "structureNode", &id, version_name).await {
            tracing::warn!(%error, "Remplacement : version impossible");
        }
        let node = novel_service::write_content(pool, &id, &after, true).await?;
        history::record(pool, "updated", "structureNode", &node.id, &node.title, "").await;
        result.replaced += count;
        result.nodes.push(ReplacedNode { node, before });
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(query: &str, case_sensitive: bool, whole_word: bool) -> FindOptions {
        FindOptions { query: query.to_owned(), case_sensitive, whole_word }
    }

    fn q(options: &FindOptions) -> Vec<char> {
        options.query.chars().collect()
    }

    #[test]
    fn finds_text_but_not_tags_or_mentions() {
        let html = r#"<p>Marc entre. <em>Marc</em> sourit.</p><p class="marc"><span data-mention="" data-kind="character" data-id="m" data-label="Marc">Marc</span> et marc.</p>"#;
        let o = opts("marc", false, false);
        let found = matches_in("n", html, &o, &q(&o));
        assert_eq!(found.iter().map(|m| m.text.as_str()).collect::<Vec<_>>(), vec!["Marc", "Marc", "marc"]);
        assert_eq!(found[0].after, " entre. ");
        assert_eq!(found.iter().map(|m| m.index).collect::<Vec<_>>(), vec![0, 1, 2]);

        let o = opts("marc", true, false);
        assert_eq!(matches_in("n", html, &o, &q(&o)).len(), 1);
    }

    #[test]
    fn whole_words_entities_and_accents() {
        let o = opts("Léa", false, true);
        let html = "<p>Léa, Léane et L&eacute;a ; LÉA&nbsp;!</p>";
        let found = matches_in("n", html, &o, &q(&o));
        assert_eq!(found.iter().map(|m| m.text.as_str()).collect::<Vec<_>>(), vec!["Léa", "LÉA"]);

        let o = opts("a & b", false, false);
        assert_eq!(matches_in("n", "<p>x a &amp; b y</p>", &o, &q(&o)).len(), 1);
        let o = opts("rue du", false, false);
        assert_eq!(matches_in("n", "<p>la rue&nbsp;du Sel</p>", &o, &q(&o)).len(), 1);
    }

    #[test]
    fn replaces_only_chosen_occurrences_and_adapts_case() {
        let o = opts("marc", false, true);
        let html = "<p>Marc et marc, <strong>MARC</strong> ; Marcel.</p>";
        let (out, n) = replace_in(html, &o, &q(&o), "martin", &[0, 2]);
        assert_eq!(n, 2);
        assert_eq!(out, "<p>Martin et marc, <strong>MARTIN</strong> ; Marcel.</p>");

        let (out, _) = replace_in("<p>a &lt; b</p>", &opts("b", true, false), &['b'], "<c & d>", &[0]);
        assert_eq!(out, "<p>a &lt; &lt;c &amp; d&gt;</p>");
        assert_eq!(plain_text_of(&out), "a < <c & d>");

        // Remplacer par rien supprime l'occurrence.
        let (out, _) = replace_in("<p>très très bien</p>", &opts("très ", true, false), &q(&opts("très ", true, false)), "", &[1]);
        assert_eq!(out, "<p>très bien</p>");
    }

    fn plain_text_of(html: &str) -> String {
        novel_service::plain_text(html).trim().to_owned()
    }

    #[tokio::test]
    async fn replace_keeps_versions_and_refuses_stale_text() {
        use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
        use crate::models::project::ProjectType;
        use crate::services::structure_service;
        use sqlx::sqlite::SqlitePoolOptions;

        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        let a = structure_service::create_node(&pool, ProjectType::Novel, None, 1, "A", None).await.unwrap();
        let b = structure_service::create_node(&pool, ProjectType::Novel, None, 1, "B", None).await.unwrap();
        novel_service::set_content(&pool, &a.id, "<p>Marc arrive. Marc part.</p>").await.unwrap();
        novel_service::set_content(&pool, &b.id, "<p>Sans lui.</p>").await.unwrap();

        let o = opts("Marc", true, true);
        let found = find(&pool, &o).await.unwrap();
        assert_eq!(found.total, 2);
        assert_eq!(found.nodes.len(), 1);
        let target = ReplaceTarget { node_id: a.id.clone(), updated_at: found.nodes[0].updated_at.clone(), indices: vec![0, 1] };

        let done = replace(&pool, &o, "Martin", std::slice::from_ref(&target), "Avant remplacement").await.unwrap();
        assert_eq!(done.replaced, 2);
        assert_eq!(done.nodes[0].before, "<p>Marc arrive. Marc part.</p>");
        assert_eq!(novel_service::get_content(&pool, &a.id).await.unwrap(), "<p>Martin arrive. Martin part.</p>");
        let versions = history::list_versions(&pool, "structureNode", &a.id).await.unwrap();
        assert!(versions.versions.iter().any(|v| v.name == "Avant remplacement"));

        // Même cible une seconde fois : le texte a changé depuis la recherche.
        assert!(replace(&pool, &o, "Martin", &[target], "x").await.is_err());
        assert!(find(&pool, &opts("  ", false, false)).await.is_err());
    }
}
