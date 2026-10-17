//! Recherche globale dans un projet : personnages, lieux, éléments du
//! découpage, notes (titre et contenu), dossiers de notes et post-it.
//!
//! La recherche ne tient compte ni de la casse ni des accents (« chateau »
//! trouve « Château »). Tous les mots tapés doivent apparaître (dans
//! n'importe quel ordre). Les résultats dont le titre correspond passent
//! devant ceux trouvés seulement dans le texte.

use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;

use crate::error::AppResult;

const MAX_QUERY_CHARS: usize = 200;
const MAX_RESULTS: usize = 60;
const SNIPPET_CHARS: usize = 140;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    /// character, location, structureNode, document (id : celui de
    /// l'élément du découpage), note, noteFolder, sticky.
    pub kind: String,
    pub id: String,
    pub title: String,
    /// Passage du texte autour du premier mot trouvé (vide si trouvé dans le titre seul).
    pub snippet: String,
    /// Vrai : trouvé dans le titre.
    pub in_title: bool,
}

/// Minuscules sans accents ni ligatures (alphabet latin).
pub fn fold(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars().flat_map(char::to_lowercase) {
        match c {
            'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'ā' => out.push('a'),
            'ç' | 'ć' | 'č' => out.push('c'),
            'è' | 'é' | 'ê' | 'ë' | 'ē' | 'ę' | 'ě' => out.push('e'),
            'ì' | 'í' | 'î' | 'ï' | 'ī' => out.push('i'),
            'ñ' | 'ń' | 'ň' => out.push('n'),
            'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ø' | 'ō' => out.push('o'),
            'ù' | 'ú' | 'û' | 'ü' | 'ū' | 'ů' => out.push('u'),
            'ý' | 'ÿ' => out.push('y'),
            'š' | 'ś' => out.push('s'),
            'ž' | 'ź' | 'ż' => out.push('z'),
            'ł' => out.push('l'),
            'ß' => out.push_str("ss"),
            'œ' => out.push_str("oe"),
            'æ' => out.push_str("ae"),
            '’' | '‘' => out.push('\''),
            other => out.push(other),
        }
    }
    out
}

/// Texte d'un document de l'éditeur (JSON) : les nœuds `text` mis bout à bout.
fn document_text(content: &str) -> String {
    fn walk(value: &Value, out: &mut String) {
        match value {
            Value::Object(map) => {
                if let Some(Value::String(text)) = map.get("text") {
                    out.push_str(text);
                }
                // Libellés des boîtes et flèches d'un schéma.
                if let Some(Value::String(label)) = map.get("label") {
                    out.push(' ');
                    out.push_str(label);
                }
                for (key, child) in map {
                    if key != "text" && key != "label" {
                        walk(child, out);
                    }
                }
                if map.get("type").and_then(Value::as_str).is_some_and(|t| t != "text") {
                    out.push(' ');
                }
            }
            Value::Array(items) => items.iter().for_each(|item| walk(item, out)),
            _ => {}
        }
    }
    let mut out = String::new();
    if let Ok(value) = serde_json::from_str::<Value>(content) {
        walk(&value, &mut out);
    }
    out
}

/// Valeurs texte d'un objet JSON de champs (`fields`), sans les identifiants.
fn fields_text(fields: &str) -> String {
    let Ok(Value::Object(map)) = serde_json::from_str::<Value>(fields) else {
        return String::new();
    };
    let mut out = String::new();
    for value in map.values() {
        match value {
            Value::String(text) if !looks_like_id(text) => {
                out.push_str(text);
                out.push(' ');
            }
            Value::Array(items) => {
                for item in items {
                    if let Value::String(text) = item {
                        out.push_str(text);
                        out.push(' ');
                    }
                }
            }
            _ => {}
        }
    }
    out
}

/// Identifiant (UUID) : ne doit pas être cherché comme du texte.
fn looks_like_id(text: &str) -> bool {
    text.len() == 36 && text.chars().filter(|c| *c == '-').count() == 4
}

/// Passage autour de la position (en caractères) du premier mot trouvé.
fn snippet(text: &str, folded: &str, word: &str) -> String {
    let Some(byte) = folded.find(word) else {
        return String::new();
    };
    // `fold` peut changer la longueur (« œ » → « oe ») : position approchée.
    let index = folded[..byte].chars().count();
    let chars: Vec<char> = text.chars().collect();
    let start = index.saturating_sub(SNIPPET_CHARS / 3).min(chars.len());
    let end = (start + SNIPPET_CHARS).min(chars.len());
    let mut out: String = chars[start..end].iter().collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");
    if start > 0 {
        out.insert(0, '…');
    }
    if end < chars.len() {
        out.push('…');
    }
    out
}

struct Candidate {
    kind: &'static str,
    id: String,
    title: String,
    body: String,
}

/// Cherche `query` dans tout le projet.
pub async fn search(pool: &SqlitePool, query: &str) -> AppResult<Vec<SearchHit>> {
    let query: String = query.chars().take(MAX_QUERY_CHARS).collect();
    let words: Vec<String> = fold(&query).split_whitespace().map(str::to_owned).collect();
    if words.is_empty() {
        return Ok(Vec::new());
    }

    let mut candidates: Vec<Candidate> = Vec::new();

    let rows: Vec<(String, String, String, String)> =
        sqlx::query_as("SELECT id, first_name, last_name, fields FROM characters").fetch_all(pool).await?;
    candidates.extend(rows.into_iter().map(|(id, first, last, fields)| Candidate {
        kind: "character",
        id,
        title: format!("{first} {last}").trim().to_owned(),
        body: fields_text(&fields),
    }));

    let rows: Vec<(String, String, String)> =
        sqlx::query_as("SELECT id, name, fields FROM locations").fetch_all(pool).await?;
    candidates.extend(rows.into_iter().map(|(id, name, fields)| Candidate {
        kind: "location",
        id,
        title: name,
        body: fields_text(&fields),
    }));

    let rows: Vec<(String, String, String)> =
        sqlx::query_as("SELECT id, title, summary FROM structure_nodes").fetch_all(pool).await?;
    candidates.extend(rows.into_iter().map(|(id, title, summary)| Candidate {
        kind: "structureNode",
        id,
        title,
        body: summary,
    }));

    let rows: Vec<(String, String, String)> =
        sqlx::query_as("SELECT id, title, content FROM notes WHERE id NOT IN (SELECT note_id FROM system_notes)").fetch_all(pool).await?;
    candidates.extend(rows.into_iter().map(|(id, title, content)| Candidate {
        kind: "note",
        id,
        title,
        body: document_text(&content),
    }));

    let rows: Vec<(String, String)> = sqlx::query_as("SELECT id, name FROM note_folders").fetch_all(pool).await?;
    candidates.extend(rows.into_iter().map(|(id, name)| Candidate {
        kind: "noteFolder",
        id,
        title: name,
        body: String::new(),
    }));

    // Documents rangés dans le découpage : l'identifiant est celui de
    // l'élément qui les contient (le résultat ouvre sa fiche).
    let rows = crate::services::document_service::search_rows(pool).await?;
    candidates.extend(rows.into_iter().map(|(node_id, name, note, text)| Candidate {
        kind: "document",
        id: node_id,
        title: name,
        body: if text.is_empty() { note } else { format!("{note} {text}") },
    }));

    // Événements de la trame (document JSON).
    let rows = crate::services::plot_service::search_rows(pool).await?;
    candidates.extend(rows.into_iter().map(|(id, title, body)| Candidate { kind: "plotEvent", id, title, body }));

    let rows: Vec<(String, String)> = sqlx::query_as("SELECT id, text FROM sticky_notes").fetch_all(pool).await?;
    candidates.extend(rows.into_iter().map(|(id, text)| Candidate {
        kind: "sticky",
        id,
        title: String::new(),
        body: text,
    }));

    let mut hits: Vec<(u8, SearchHit)> = Vec::new();
    for candidate in candidates {
        let title = fold(&candidate.title);
        let body = fold(&candidate.body);
        if !words.iter().all(|word| title.contains(word.as_str()) || body.contains(word.as_str())) {
            continue;
        }
        let in_title = words.iter().all(|word| title.contains(word.as_str()));
        let starts = words.first().is_some_and(|word| title.starts_with(word.as_str()));
        let rank = if in_title && starts { 0 } else if in_title { 1 } else { 2 };
        let first_in_body = words.iter().find(|word| body.contains(word.as_str()));
        hits.push((
            rank,
            SearchHit {
                kind: candidate.kind.to_owned(),
                id: candidate.id,
                snippet: match (in_title, first_in_body) {
                    (false, Some(word)) => snippet(&candidate.body, &body, word),
                    _ => String::new(),
                },
                title: candidate.title,
                in_title,
            },
        ));
    }

    hits.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| fold(&a.1.title).cmp(&fold(&b.1.title))));
    Ok(hits.into_iter().take(MAX_RESULTS).map(|(_, hit)| hit).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use crate::services::note_service::{self, NoteUpdate};
    use sqlx::sqlite::SqlitePoolOptions;

    #[test]
    fn folding_and_document_text() {
        assert_eq!(fold("Château d'Œil ÉTÉ"), "chateau d'oeil ete");
        let doc = r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Le donjon"}]},{"type":"diagram","attrs":{"data":{"boxes":[{"label":"Mage"}]}}}]}"#;
        let text = document_text(doc);
        assert!(text.contains("Le donjon") && text.contains("Mage"));
        assert!(fields_text(r#"{"origin":"Valona","ruler":"123e4567-e89b-12d3-a456-426614174000","tags":["brave"]}"#).contains("brave"));
    }

    #[tokio::test]
    async fn finds_items_without_accents_and_ranks_titles_first() {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        sqlx::query(
            "INSERT INTO characters (id, first_name, last_name, role, status, fields, created_at, updated_at) \
             VALUES ('c1', 'Aldric', 'Venn', 'main', 'alive', '{\"origin\":\"Le château du Nord\"}', 'x', 'x')",
        )
        .execute(&pool)
        .await
        .unwrap();
        let note = note_service::create_note(&pool, None, "Château d'Ambre").await.unwrap();
        note_service::update_note(
            &pool,
            &note.id,
            &NoteUpdate {
                content: Some(r#"{"type":"doc","content":[{"type":"text","text":"Le trône est vide."}]}"#.into()),
                ..NoteUpdate::default()
            },
        )
        .await
        .unwrap();

        let hits = search(&pool, "CHATEAU").await.unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].kind, "note");
        assert!(hits[0].in_title);
        assert_eq!(hits[1].kind, "character");
        assert!(hits[1].snippet.contains("château"));

        assert_eq!(search(&pool, "trone vide").await.unwrap().len(), 1);
        assert!(search(&pool, "   ").await.unwrap().is_empty());
        assert!(search(&pool, "licorne").await.unwrap().is_empty());
    }
}
