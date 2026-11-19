//! Limite d'imbrication des fiches rangées les unes dans les autres
//! (lieux, objets, faune et flore, factions, peuples, magie).

use crate::error::AppResult;
use sqlx::SqlitePool;

/// Nombre maximal de niveaux : une fiche à la racine compte pour 1.
pub const MAX_NESTING: i64 = 15;

/// Garde-fou des requêtes récursives (chaînes anormales).
const GUARD: i64 = 1_000;

/// Vrai si ranger `self_id` (ou une nouvelle fiche, `None`) dans `parent`
/// dépasserait `MAX_NESTING` niveaux, en comptant ce que la fiche contient
/// déjà. `table` est un nom de table interne, jamais une saisie.
pub async fn too_deep(pool: &SqlitePool, table: &str, parent: &str, self_id: Option<&str>) -> AppResult<bool> {
    // Niveau du parent : 1 + nombre de ses ancêtres.
    let parent_level: i64 = sqlx::query_scalar(&format!(
        "WITH RECURSIVE up(id, parent_id, n) AS ( \
             SELECT id, parent_id, 1 FROM {table} WHERE id = ? \
             UNION ALL \
             SELECT t.id, t.parent_id, up.n + 1 FROM {table} t JOIN up ON t.id = up.parent_id WHERE up.n < {GUARD} \
         ) SELECT COALESCE(MAX(n), 0) FROM up"
    ))
    .bind(parent)
    .fetch_one(pool)
    .await?;

    // Hauteur de la branche déplacée (1 pour une fiche sans contenu).
    let height: i64 = match self_id {
        None => 1,
        Some(id) => {
            sqlx::query_scalar(&format!(
                "WITH RECURSIVE down(id, n) AS ( \
                     SELECT id, 1 FROM {table} WHERE id = ? \
                     UNION ALL \
                     SELECT t.id, down.n + 1 FROM {table} t JOIN down ON t.parent_id = down.id WHERE down.n < {GUARD} \
                 ) SELECT COALESCE(MAX(n), 1) FROM down"
            ))
            .bind(id)
            .fetch_one(pool)
            .await?
        }
    };

    Ok(parent_level + height > MAX_NESTING)
}
