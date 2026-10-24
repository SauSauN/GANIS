//! Scénario de manga des projets d'exemple, page par page et case par case.
//!
//! Format (fichier texte, une page par bloc) :
//!
//! ```text
//! === page c1p01 | chapitre: c1 | rythme: action | tourne
//! résumé: Ce que la page raconte.
//!
//! --- case
//! plan: wide
//! rythme: action
//! lieu: port
//! moment: Aube
//! persos: nagi = Filet sur l'épaule ; mio = Cheveux mouillés
//! action: Ce qui se passe dans la case.
//! décor: Ce qu'on voit autour.
//! dessin: Indications au dessinateur.
//! continuité: Ce qu'il faut garder d'une case à l'autre.
//! > récit: Récitatif.
//! > nagi: Réplique de Nagi.
//! > nagi (pensée): Pensée de Nagi.
//! > sfx: ONOMATOPÉE
//! > écrit: Texte du décor (panneau, lettre…).
//! > voix: Réplique d'un figurant sans fiche.
//! ```
//!
//! - En-tête de page : clé de la page (créée dans le découpage), clé de son
//!   chapitre, et facultativement `rythme:` (fonction de la page), `tourne`
//!   (la page se termine sur un « tourné de page ») et `pdv:` (personnage
//!   du point de vue).
//! - `plan` : un cadrage de `manga_service::FRAMINGS` ; `rythme` : un de
//!   `manga_service::RHYTHMS`.
//! - `lieu`, `persos`, et les interlocuteurs des textes sont des clés de
//!   fiches (lieux, personnages) du projet.
//! - Une ligne qui commence par deux espaces continue la ligne précédente.
//! - Une page sans case existe dans le découpage, prête à être scénarisée.

use crate::error::{AppError, AppResult};
use crate::services::manga_service::{FRAMINGS, RHYTHMS};

fn invalid(line: usize, message: impl Into<String>) -> AppError {
    AppError::internal(format!("Scénario d'exemple, ligne {line} : {}", message.into()))
}

/// Texte d'une case.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextDef {
    /// `dialogue`, `thought`, `narration`, `sfx` ou `sign`.
    pub kind: &'static str,
    /// Clé du personnage qui parle (dialogue, pensée).
    pub speaker: Option<String>,
    pub content: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PanelDef {
    pub framing: String,
    pub rhythm: Option<String>,
    pub location: Option<String>,
    pub moment: String,
    /// (clé du personnage, état utile à la continuité).
    pub cast: Vec<(String, String)>,
    pub action: String,
    pub setting: String,
    pub artist_notes: String,
    pub continuity: String,
    pub texts: Vec<TextDef>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PageDef {
    pub key: String,
    pub chapter: String,
    pub rhythm: Option<String>,
    pub page_turn: bool,
    pub pov: Option<String>,
    pub summary: String,
    pub panels: Vec<PanelDef>,
}

/// Lignes logiques : une ligne et ses lignes de continuation (deux espaces).
fn logical_lines(text: &str) -> Vec<(usize, String)> {
    let mut out: Vec<(usize, String)> = Vec::new();
    for (index, line) in text.lines().enumerate() {
        if line.starts_with("  ") && !line.trim().is_empty() {
            if let Some((_, last)) = out.last_mut() {
                last.push(' ');
                last.push_str(line.trim());
                continue;
            }
        }
        out.push((index + 1, line.trim_end().to_owned()));
    }
    out
}

/// Lit tout le scénario.
pub fn parse(text: &str) -> AppResult<Vec<PageDef>> {
    let mut pages: Vec<PageDef> = Vec::new();

    for (number, line) in logical_lines(text) {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }

        if let Some(header) = trimmed.strip_prefix("=== page ") {
            let mut parts = header.split('|').map(str::trim);
            let key = parts.next().unwrap_or_default().to_owned();
            if key.is_empty() || pages.iter().any(|p| p.key == key) {
                return Err(invalid(number, format!("clé de page vide ou en double : « {key} »")));
            }
            let mut page = PageDef { key, ..Default::default() };
            for part in parts {
                if part == "tourne" {
                    page.page_turn = true;
                    continue;
                }
                let (name, value) = part.split_once(':').ok_or_else(|| invalid(number, format!("« {part} » : nom: valeur attendu")))?;
                let value = value.trim().to_owned();
                match name.trim() {
                    "chapitre" => page.chapter = value,
                    "rythme" => page.rhythm = Some(rhythm(number, &value)?),
                    "pdv" => page.pov = Some(value),
                    other => return Err(invalid(number, format!("réglage de page inconnu : {other}"))),
                }
            }
            if page.chapter.is_empty() {
                return Err(invalid(number, "page sans chapitre"));
            }
            pages.push(page);
            continue;
        }

        let page = pages.last_mut().ok_or_else(|| invalid(number, "texte avant la première page"))?;

        if trimmed == "--- case" {
            page.panels.push(PanelDef::default());
            continue;
        }

        if let Some(summary) = trimmed.strip_prefix("résumé:") {
            if !page.panels.is_empty() {
                return Err(invalid(number, "le résumé se place avant les cases"));
            }
            page.summary = summary.trim().to_owned();
            continue;
        }

        let panel = page.panels.last_mut().ok_or_else(|| invalid(number, "champ de case avant « --- case »"))?;

        if let Some(spoken) = trimmed.strip_prefix('>') {
            let (who, content) = spoken.split_once(':').ok_or_else(|| invalid(number, "texte de case : « > qui: texte » attendu"))?;
            let who = who.trim();
            let content = content.trim().to_owned();
            if content.is_empty() {
                return Err(invalid(number, "texte de case vide"));
            }
            let text = match who {
                "récit" => TextDef { kind: "narration", speaker: None, content },
                "sfx" => TextDef { kind: "sfx", speaker: None, content },
                "écrit" => TextDef { kind: "sign", speaker: None, content },
                // Réplique d'un figurant sans fiche (une voix dans la foule).
                "voix" => TextDef { kind: "dialogue", speaker: None, content },
                _ => match who.strip_suffix("(pensée)") {
                    Some(speaker) => TextDef { kind: "thought", speaker: Some(speaker.trim().to_owned()), content },
                    None => TextDef { kind: "dialogue", speaker: Some(who.to_owned()), content },
                },
            };
            panel.texts.push(text);
            continue;
        }

        let (name, value) = trimmed.split_once(':').ok_or_else(|| invalid(number, format!("ligne incomprise : « {trimmed} »")))?;
        let value = value.trim().to_owned();
        match name.trim() {
            "plan" => {
                if !FRAMINGS.contains(&value.as_str()) {
                    return Err(invalid(number, format!("cadrage inconnu : {value}")));
                }
                panel.framing = value;
            }
            "rythme" => panel.rhythm = Some(rhythm(number, &value)?),
            "lieu" => panel.location = Some(value).filter(|v| !v.is_empty()),
            "moment" => panel.moment = value,
            "persos" => {
                for entry in value.split(';').map(str::trim).filter(|e| !e.is_empty()) {
                    let (key, state) = entry.split_once('=').map(|(k, s)| (k.trim(), s.trim())).unwrap_or((entry, ""));
                    if panel.cast.iter().any(|(k, _)| k == key) {
                        return Err(invalid(number, format!("personnage en double dans la case : {key}")));
                    }
                    panel.cast.push((key.to_owned(), state.to_owned()));
                }
            }
            "action" => panel.action = value,
            "décor" => panel.setting = value,
            "dessin" => panel.artist_notes = value,
            "continuité" => panel.continuity = value,
            other => return Err(invalid(number, format!("champ de case inconnu : {other}"))),
        }
    }
    Ok(pages)
}

fn rhythm(line: usize, value: &str) -> AppResult<String> {
    if RHYTHMS.contains(&value) {
        Ok(value.to_owned())
    } else {
        Err(invalid(line, format!("rythme inconnu : {value}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_page_is_read_case_by_case() {
        let text = "// commentaire\n=== page p1 | chapitre: c1 | rythme: action | tourne | pdv: nagi\nrésumé: Nagi court.\n\n--- case\nplan: wide\nrythme: pause\nlieu: port\nmoment: Aube\npersos: nagi = Filet ; mio\naction: Nagi court\n  sur le quai.\n> récit: Kesen.\n> nagi: Vite !\n> mio (pensée): Encore lui.\n> sfx: TAP\n> écrit: À VENDRE\n> voix: Hé !\n\n=== page p2 | chapitre: c1\n";
        let pages = parse(text).unwrap();
        assert_eq!(pages.len(), 2);
        let p = &pages[0];
        assert_eq!((p.key.as_str(), p.chapter.as_str(), p.page_turn), ("p1", "c1", true));
        assert_eq!(p.rhythm.as_deref(), Some("action"));
        assert_eq!(p.pov.as_deref(), Some("nagi"));
        assert_eq!(p.summary, "Nagi court.");
        let c = &p.panels[0];
        assert_eq!(c.action, "Nagi court sur le quai.");
        assert_eq!(c.cast, vec![("nagi".to_owned(), "Filet".to_owned()), ("mio".to_owned(), String::new())]);
        let kinds: Vec<&str> = c.texts.iter().map(|t| t.kind).collect();
        assert_eq!(kinds, ["narration", "dialogue", "thought", "sfx", "sign", "dialogue"]);
        assert_eq!(c.texts[5].speaker, None);
        assert_eq!(c.texts[2].speaker.as_deref(), Some("mio"));
        assert!(pages[1].panels.is_empty());
    }

    #[test]
    fn mistakes_are_reported_with_their_line() {
        for bad in [
            "action: avant toute page",
            "=== page p1\n",
            "=== page p1 | chapitre: c\n--- case\nplan: trèsLarge\n",
            "=== page p1 | chapitre: c\n--- case\nrythme: lent\n",
            "=== page p1 | chapitre: c\n--- case\ncouleur: bleu\n",
            "=== page p1 | chapitre: c\naction: hors case\n",
            "=== page p1 | chapitre: c\n=== page p1 | chapitre: c\n",
            "=== page p1 | chapitre: c\n--- case\n> nagi:\n",
        ] {
            assert!(parse(bad).is_err(), "devait échouer : {bad}");
        }
        let error = format!("{:?}", parse("=== page p1 | chapitre: c\n--- case\nplan: x\n").unwrap_err());
        assert!(error.contains("ligne 3"), "{error}");
    }
}
