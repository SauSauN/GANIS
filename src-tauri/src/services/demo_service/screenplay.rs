//! Scénario des séries et des films des projets d'exemple, scène par scène.
//!
//! Format (fichier `scenes.md`, une scène par bloc) :
//!
//! ```text
//! === scène s01 | dans: seq1 | int | lieu: cuisine | moment: night | pdv: lea
//! titre: L'aube en cuisine
//! résumé: Ce que la scène raconte.
//! état: lea = Tablier taché, main bandée
//!
//! > action: Ce que l'on voit et entend à l'écran.
//! > lea: Réplique de Léa.
//! > lea (à voix basse): Réplique avec sa didascalie.
//! > transition: CUT TO:
//! > plan: GROS PLAN SUR LE COUTEAU
//! > note: Note de travail (jamais imprimée).
//! ```
//!
//! - En-tête : clé de la scène (créée dans le découpage), `dans:` (clé de
//!   l'épisode ou de la séquence qui la contient), puis facultativement
//!   `int` / `ext` / `intExt`, `lieu:` (clé d'un lieu), `moment:` (une
//!   valeur de `series_service::SCENE_TIMES`) et `pdv:` (personnage du
//!   point de vue).
//! - `état:` donne l'état d'un personnage dans la scène (continuité) ;
//!   plusieurs personnages se séparent par `;`.
//! - Les personnages qui parlent et ceux qui ont un état sont reliés à la
//!   scène ; le lieu de l'en-tête aussi.
//! - Une ligne qui commence par deux espaces continue la ligne précédente ;
//!   `//` commence un commentaire. Ce qui précède la première scène
//!   (présentation du fichier) est ignoré.

use crate::error::{AppError, AppResult};
use crate::services::series_service::{SCENE_PLACES, SCENE_TIMES};

fn invalid(line: usize, message: impl Into<String>) -> AppError {
    AppError::internal(format!("Scénario d'exemple (scènes), ligne {line} : {}", message.into()))
}

/// Élément du scénario d'une scène.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockDef {
    /// `action`, `dialogue`, `transition`, `shot` ou `note`.
    pub kind: &'static str,
    /// Clé du personnage qui parle (réplique).
    pub speaker: Option<String>,
    pub parenthetical: String,
    pub content: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SceneDef {
    pub key: String,
    /// Clé de l'épisode ou de la séquence qui contient la scène.
    pub parent: String,
    pub title: String,
    pub summary: String,
    pub place: Option<String>,
    pub location: Option<String>,
    pub time: Option<String>,
    pub pov: Option<String>,
    /// (clé du personnage, état dans la scène).
    pub states: Vec<(String, String)>,
    pub blocks: Vec<BlockDef>,
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

/// Lit toutes les scènes.
pub fn parse(text: &str) -> AppResult<Vec<SceneDef>> {
    let mut scenes: Vec<SceneDef> = Vec::new();

    for (number, line) in logical_lines(text) {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }

        if let Some(header) = trimmed.strip_prefix("=== scène ") {
            let mut parts = header.split('|').map(str::trim);
            let key = parts.next().unwrap_or_default().to_owned();
            if key.is_empty() || scenes.iter().any(|s| s.key == key) {
                return Err(invalid(number, format!("clé de scène vide ou en double : « {key} »")));
            }
            let mut scene = SceneDef { key, ..Default::default() };
            for part in parts {
                if SCENE_PLACES.contains(&part) {
                    scene.place = Some(part.to_owned());
                    continue;
                }
                let (name, value) = part.split_once(':').ok_or_else(|| invalid(number, format!("« {part} » : nom: valeur attendu")))?;
                let value = value.trim().to_owned();
                match name.trim() {
                    "dans" => scene.parent = value,
                    "lieu" => scene.location = Some(value),
                    "moment" => {
                        if !SCENE_TIMES.contains(&value.as_str()) {
                            return Err(invalid(number, format!("moment inconnu : {value}")));
                        }
                        scene.time = Some(value);
                    }
                    "pdv" => scene.pov = Some(value),
                    other => return Err(invalid(number, format!("réglage de scène inconnu : {other}"))),
                }
            }
            if scene.parent.is_empty() {
                return Err(invalid(number, "scène sans « dans: »"));
            }
            scenes.push(scene);
            continue;
        }

        // Ce qui précède la première scène présente le fichier : ignoré.
        let Some(scene) = scenes.last_mut() else { continue };

        if let Some(spoken) = trimmed.strip_prefix('>') {
            let (who, content) = spoken.split_once(':').ok_or_else(|| invalid(number, "élément : « > qui: texte » attendu"))?;
            let who = who.trim();
            let content = content.trim().to_owned();
            if content.is_empty() {
                return Err(invalid(number, "élément vide"));
            }
            let block = match who {
                "action" => BlockDef { kind: "action", speaker: None, parenthetical: String::new(), content },
                "transition" => BlockDef { kind: "transition", speaker: None, parenthetical: String::new(), content },
                "plan" => BlockDef { kind: "shot", speaker: None, parenthetical: String::new(), content },
                "note" => BlockDef { kind: "note", speaker: None, parenthetical: String::new(), content },
                _ => {
                    let (speaker, parenthetical) = match who.split_once('(') {
                        Some((speaker, rest)) => {
                            let paren = rest.strip_suffix(')').ok_or_else(|| invalid(number, "didascalie : « qui (didascalie) » attendu"))?;
                            (speaker.trim(), paren.trim())
                        }
                        None => (who, ""),
                    };
                    if speaker.is_empty() {
                        return Err(invalid(number, "réplique sans personnage"));
                    }
                    BlockDef { kind: "dialogue", speaker: Some(speaker.to_owned()), parenthetical: parenthetical.to_owned(), content }
                }
            };
            scene.blocks.push(block);
            continue;
        }

        let (name, value) = trimmed.split_once(':').ok_or_else(|| invalid(number, format!("ligne incomprise : « {trimmed} »")))?;
        let value = value.trim().to_owned();
        if !scene.blocks.is_empty() {
            return Err(invalid(number, format!("« {} » se place avant les éléments de la scène", name.trim())));
        }
        match name.trim() {
            "titre" => scene.title = value,
            "résumé" => scene.summary = value,
            "état" => {
                for entry in value.split(';').map(str::trim).filter(|e| !e.is_empty()) {
                    let (key, state) = entry.split_once('=').ok_or_else(|| invalid(number, "état : « clé = état » attendu"))?;
                    let key = key.trim();
                    if scene.states.iter().any(|(k, _)| k == key) {
                        return Err(invalid(number, format!("état en double : {key}")));
                    }
                    scene.states.push((key.to_owned(), state.trim().to_owned()));
                }
            }
            other => return Err(invalid(number, format!("champ de scène inconnu : {other}"))),
        }
    }
    Ok(scenes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_scene_is_read_block_by_block() {
        let text = "// commentaire\n=== scène s1 | dans: e1 | int | lieu: cuisine | moment: night | pdv: lea\ntitre: La cuisine\nrésumé: Léa entre.\nétat: lea = Main bandée ; sam = Ivre\n\n> action: Léa entre\n  sans bruit.\n> lea (à voix basse): Il y a quelqu'un ?\n> sam: Moi.\n> plan: GROS PLAN\n> transition: CUT TO:\n> note: À couper ?\n\n=== scène s2 | dans: e1\n";
        let scenes = parse(text).unwrap();
        assert_eq!(scenes.len(), 2);
        let s = &scenes[0];
        assert_eq!((s.key.as_str(), s.parent.as_str(), s.title.as_str()), ("s1", "e1", "La cuisine"));
        assert_eq!((s.place.as_deref(), s.location.as_deref(), s.time.as_deref(), s.pov.as_deref()), (Some("int"), Some("cuisine"), Some("night"), Some("lea")));
        assert_eq!(s.states, vec![("lea".to_owned(), "Main bandée".to_owned()), ("sam".to_owned(), "Ivre".to_owned())]);
        assert_eq!(s.blocks[0].content, "Léa entre sans bruit.");
        assert_eq!((s.blocks[1].speaker.as_deref(), s.blocks[1].parenthetical.as_str()), (Some("lea"), "à voix basse"));
        let kinds: Vec<&str> = s.blocks.iter().map(|b| b.kind).collect();
        assert_eq!(kinds, ["action", "dialogue", "dialogue", "shot", "transition", "note"]);
        assert!(scenes[1].blocks.is_empty());
        assert!(parse("Présentation du fichier.
> action: ignorée
").unwrap().is_empty());
    }

    #[test]
    fn mistakes_are_reported_with_their_line() {
        for bad in [
            "=== scène s1\n",
            "=== scène s1 | dans: e | moment: midi\n",
            "=== scène s1 | dans: e | couleur: bleu\n",
            "=== scène s1 | dans: e\ncouleur: bleu\n",
            "=== scène s1 | dans: e\n=== scène s1 | dans: e\n",
            "=== scène s1 | dans: e\n> lea:\n",
            "=== scène s1 | dans: e\n> action: x\nrésumé: trop tard\n",
            "=== scène s1 | dans: e\n> lea (bas: x\n",
        ] {
            assert!(parse(bad).is_err(), "devait échouer : {bad}");
        }
        let error = format!("{:?}", parse("=== scène s1 | dans: e\n\nfoo: x\n").unwrap_err());
        assert!(error.contains("ligne 3"), "{error}");
    }
}
