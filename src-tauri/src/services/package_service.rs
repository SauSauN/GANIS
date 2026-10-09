//! Service des packages créés par les utilisateurs.
//!
//! Un package créé localement s'utilise directement : pas de
//! téléchargement, pas d'installation. Seul son auteur le voit, le
//! modifie ou le supprime. Le partage (.ganixpkg, catalogue) viendra plus
//! tard et réutilisera `package_id` et `version`.
//!
//! Un thème est purement déclaratif : il ne contient que des couleurs
//! hexadécimales et un arrondi, tous vérifiés ici. Aucune autre valeur
//! n'atteint la feuille de style de l'interface.

use crate::error::{AppError, AppResult};
use crate::models::package::{PackageRow, PackageType, ThemeData, UserPackage};
use crate::models::user::User;
use crate::utils::{new_id, now_utc};
use sqlx::SqlitePool;

/// Longueur maximale du nom d'un package, en caractères.
pub const NAME_MAX: usize = 60;

/// Longueur maximale de la description d'un package, en caractères.
pub const DESCRIPTION_MAX: usize = 300;

/// Arrondi maximal des coins d'un thème, en rem.
pub const RADIUS_MAX: f64 = 1.5;

/// Longueur maximale de la partie « nom » de l'identifiant public.
const SLUG_MAX: usize = 40;

// ----------------------------------------------------------------------------
// Validation (fonctions pures, testées plus bas)
// ----------------------------------------------------------------------------

/// Vrai pour une couleur `#RRGGBB`.
pub fn is_hex_color(value: &str) -> bool {
    let bytes = value.as_bytes();

    bytes.len() == 7
        && bytes[0] == b'#'
        && bytes[1..].iter().all(|b| b.is_ascii_hexdigit())
}

/// Vérifie et normalise le nom, la description et les couleurs d'un thème.
///
/// Les couleurs sont mises en majuscules (`#5b65dc` → `#5B65DC`).
pub fn normalize_theme(
    name: &str,
    description: &str,
    mut theme: ThemeData,
) -> AppResult<(String, String, ThemeData)> {
    let name = name.trim().to_owned();
    let description = description.trim().to_owned();

    if name.is_empty() {
        return Err(AppError::validation("Le nom du thème ne peut pas être vide.")
            .with_key("package.nameEmpty"));
    }

    if name.chars().count() > NAME_MAX {
        return Err(AppError::validation(format!(
            "Le nom du thème ne peut pas dépasser {NAME_MAX} caractères."
        ))
        .with_key("package.nameTooLong")
        .with_param("max", NAME_MAX));
    }

    if description.chars().count() > DESCRIPTION_MAX {
        return Err(AppError::validation(format!(
            "La description ne peut pas dépasser {DESCRIPTION_MAX} caractères."
        ))
        .with_key("package.descriptionTooLong")
        .with_param("max", DESCRIPTION_MAX));
    }

    for palette in [&theme.light, &theme.dark] {
        for (key, value) in palette.entries() {
            if !is_hex_color(value.trim()) {
                return Err(AppError::validation(format!(
                    "La couleur « {key} » n'est pas valide (format attendu : #RRGGBB)."
                ))
                .with_key("package.invalidColor")
                .with_param("name", key));
            }
        }
    }

    for palette in [&mut theme.light, &mut theme.dark] {
        for value in [
            &mut palette.background,
            &mut palette.foreground,
            &mut palette.card,
            &mut palette.sidebar,
            &mut palette.primary,
            &mut palette.primary_foreground,
            &mut palette.secondary,
            &mut palette.muted_foreground,
            &mut palette.border,
            &mut palette.destructive,
            &mut palette.success,
            &mut palette.warning,
        ] {
            *value = value.trim().to_ascii_uppercase();
        }
    }

    if !theme.radius.is_finite() || !(0.0..=RADIUS_MAX).contains(&theme.radius) {
        return Err(AppError::validation(format!(
            "L'arrondi doit être compris entre 0 et {RADIUS_MAX} rem."
        ))
        .with_key("package.invalidRadius")
        .with_param("max", RADIUS_MAX));
    }

    // Trois décimales suffisent et évitent les valeurs du type 0.30000000000000004.
    theme.radius = (theme.radius * 1000.0).round() / 1000.0;

    Ok((name, description, theme))
}

/// Partie lisible d'un identifiant public : minuscules ASCII, chiffres et
/// tirets (« Nuit étoilée ! » → `nuit-etoilee`).
pub fn slugify(value: &str) -> String {
    let mut slug = String::new();

    for c in value.chars().flat_map(fold_accent) {
        if c.is_ascii_alphanumeric() {
            slug.push(c.to_ascii_lowercase());
        } else if !slug.is_empty() && !slug.ends_with('-') {
            slug.push('-');
        }
    }

    let mut slug: String = slug.chars().take(SLUG_MAX).collect();

    while slug.ends_with('-') {
        slug.pop();
    }

    slug
}

/// Retire les accents courants (le reste est remplacé par un tiret).
fn fold_accent(c: char) -> std::iter::Once<char> {
    let folded = match c {
        'à' | 'á' | 'â' | 'ä' | 'ã' | 'å' | 'À' | 'Á' | 'Â' | 'Ä' | 'Ã' | 'Å' => 'a',
        'ç' | 'Ç' => 'c',
        'è' | 'é' | 'ê' | 'ë' | 'È' | 'É' | 'Ê' | 'Ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' | 'Ì' | 'Í' | 'Î' | 'Ï' => 'i',
        'ñ' | 'Ñ' => 'n',
        'ò' | 'ó' | 'ô' | 'ö' | 'õ' | 'Ò' | 'Ó' | 'Ô' | 'Ö' | 'Õ' => 'o',
        'ù' | 'ú' | 'û' | 'ü' | 'Ù' | 'Ú' | 'Û' | 'Ü' => 'u',
        'ý' | 'ÿ' | 'Ý' => 'y',
        other => other,
    };

    std::iter::once(folded)
}

/// Identifiant public de base d'un package : `auteur.nom` (§21.2).
pub fn base_package_id(username: &str, name: &str) -> String {
    let author = match slugify(username) {
        s if s.is_empty() => "local".to_owned(),
        s => s,
    };

    let package = match slugify(name) {
        s if s.is_empty() => "theme".to_owned(),
        s => s,
    };

    format!("{author}.{package}")
}

/// Version suivante après une modification : le correctif augmente
/// (`1.0.0` → `1.0.1`). Une version illisible repart de `1.0.1`.
pub fn bump_patch(version: &str) -> String {
    let parts: Vec<u64> = version
        .split('.')
        .map(|p| p.parse::<u64>())
        .collect::<Result<_, _>>()
        .unwrap_or_default();

    match parts.as_slice() {
        [major, minor, patch] => format!("{major}.{minor}.{}", patch + 1),
        _ => "1.0.1".to_owned(),
    }
}

// ----------------------------------------------------------------------------
// Accès aux données
// ----------------------------------------------------------------------------

const SELECT_COLUMNS: &str = "id, owner_id, package_id, package_type, name, description, \
                              version, data, created_at, updated_at";

fn to_public(row: PackageRow, author: &str) -> AppResult<UserPackage> {
    let theme: ThemeData = serde_json::from_str(&row.data).map_err(|e| {
        AppError::internal(e).with_detail(format!(
            "Données illisibles pour le package {}",
            row.package_id
        ))
    })?;

    Ok(UserPackage {
        id: row.id,
        package_id: row.package_id,
        package_type: row.package_type,
        name: row.name,
        description: row.description,
        version: row.version,
        author: author.to_owned(),
        theme,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

fn not_found() -> AppError {
    AppError::not_found("Package introuvable.").with_key("package.notFound")
}

/// Package d'un utilisateur, ou `NOT_FOUND` s'il n'existe pas ou
/// appartient à quelqu'un d'autre (on ne révèle pas son existence).
async fn find_owned(pool: &SqlitePool, owner_id: &str, id: &str) -> AppResult<PackageRow> {
    sqlx::query_as::<_, PackageRow>(&format!(
        "SELECT {SELECT_COLUMNS} FROM packages WHERE id = ? AND owner_id = ?"
    ))
    .bind(id)
    .bind(owner_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::database(e).with_detail("Échec de la lecture du package"))?
    .ok_or_else(not_found)
}

/// Packages créés par un utilisateur, du plus récent au plus ancien.
///
/// Un package aux données illisibles est ignoré (et journalisé) au lieu
/// d'empêcher l'affichage des autres.
pub async fn list_for_owner(pool: &SqlitePool, owner: &User) -> AppResult<Vec<UserPackage>> {
    let rows = sqlx::query_as::<_, PackageRow>(&format!(
        "SELECT {SELECT_COLUMNS} FROM packages WHERE owner_id = ? ORDER BY updated_at DESC"
    ))
    .bind(&owner.id)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::database(e).with_detail("Échec de la liste des packages"))?;

    let mut packages = Vec::with_capacity(rows.len());

    for row in rows {
        let package_id = row.package_id.clone();

        match to_public(row, &owner.username) {
            Ok(package) => packages.push(package),
            Err(e) => tracing::warn!(
                package = %package_id,
                detail = ?e.detail(),
                "Package ignoré : données illisibles"
            ),
        }
    }

    Ok(packages)
}

/// Premier identifiant public libre à partir de `base`
/// (`base`, puis `base-2`, `base-3`…).
async fn free_package_id(pool: &SqlitePool, base: &str) -> AppResult<String> {
    for n in 1..=1000 {
        let candidate = if n == 1 { base.to_owned() } else { format!("{base}-{n}") };

        let taken: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM packages WHERE package_id = ?")
            .bind(&candidate)
            .fetch_one(pool)
            .await
            .map_err(|e| {
                AppError::database(e).with_detail("Échec de la vérification de l'identifiant")
            })?;

        if taken == 0 {
            return Ok(candidate);
        }
    }

    Err(AppError::conflict("Impossible de trouver un identifiant libre pour ce package.")
        .with_key("package.idUnavailable"))
}

/// Crée un thème appartenant à `owner`.
pub async fn create_theme(
    pool: &SqlitePool,
    owner: &User,
    name: &str,
    description: &str,
    theme: ThemeData,
) -> AppResult<UserPackage> {
    let (name, description, theme) = normalize_theme(name, description, theme)?;

    let package_id = free_package_id(pool, &base_package_id(&owner.username, &name)).await?;
    let id = new_id();
    let now = now_utc();
    let data = serde_json::to_string(&theme)?;

    sqlx::query(
        r#"
        INSERT INTO packages
            (id, owner_id, package_id, package_type, name, description,
             version, data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, '1.0.0', ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&owner.id)
    .bind(&package_id)
    .bind(PackageType::Theme.as_str())
    .bind(&name)
    .bind(&description)
    .bind(&data)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| AppError::database(e).with_detail("Échec de la création du thème"))?;

    let row = find_owned(pool, &owner.id, &id).await?;

    to_public(row, &owner.username)
}

/// Remplace le nom, la description et les couleurs d'un thème de `owner`.
///
/// L'identifiant public ne change pas ; la version augmente.
pub async fn update_theme(
    pool: &SqlitePool,
    owner: &User,
    id: &str,
    name: &str,
    description: &str,
    theme: ThemeData,
) -> AppResult<UserPackage> {
    let current = find_owned(pool, &owner.id, id).await?;
    let (name, description, theme) = normalize_theme(name, description, theme)?;
    let data = serde_json::to_string(&theme)?;

    sqlx::query(
        r#"
        UPDATE packages
        SET name = ?, description = ?, data = ?, version = ?, updated_at = ?
        WHERE id = ? AND owner_id = ?
        "#,
    )
    .bind(&name)
    .bind(&description)
    .bind(&data)
    .bind(bump_patch(&current.version))
    .bind(now_utc())
    .bind(id)
    .bind(&owner.id)
    .execute(pool)
    .await
    .map_err(|e| AppError::database(e).with_detail("Échec de la mise à jour du thème"))?;

    let row = find_owned(pool, &owner.id, id).await?;

    to_public(row, &owner.username)
}

/// Supprime un package de `owner`.
pub async fn delete(pool: &SqlitePool, owner_id: &str, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM packages WHERE id = ? AND owner_id = ?")
        .bind(id)
        .bind(owner_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::database(e).with_detail("Échec de la suppression du package"))?;

    if result.rows_affected() == 0 {
        return Err(not_found());
    }

    Ok(())
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::package::ThemePalette;

    fn palette(color: &str) -> ThemePalette {
        ThemePalette {
            background: color.into(),
            foreground: color.into(),
            card: color.into(),
            sidebar: color.into(),
            primary: color.into(),
            primary_foreground: color.into(),
            secondary: color.into(),
            muted_foreground: color.into(),
            border: color.into(),
            destructive: color.into(),
            success: color.into(),
            warning: color.into(),
        }
    }

    fn theme(color: &str) -> ThemeData {
        ThemeData { light: palette(color), dark: palette(color), radius: 0.625 }
    }

    #[test]
    fn hex_colors() {
        assert!(is_hex_color("#5B65DC"));
        assert!(is_hex_color("#abcdef"));
        assert!(!is_hex_color("#abc"));
        assert!(!is_hex_color("5B65DC"));
        assert!(!is_hex_color("#5B65DG"));
        assert!(!is_hex_color("#5B65DC;"));
        assert!(!is_hex_color("red"));
        assert!(!is_hex_color("#5B65DC} body{display:none"));
    }

    #[test]
    fn normalize_trims_and_uppercases() {
        let (name, description, data) =
            normalize_theme("  Aube  ", " Doux ", theme(" #5b65dc ")).unwrap();
        assert_eq!(name, "Aube");
        assert_eq!(description, "Doux");
        assert_eq!(data.light.primary, "#5B65DC");
        assert_eq!(data.dark.warning, "#5B65DC");
    }

    #[test]
    fn normalize_rejects_bad_input() {
        let err = normalize_theme("  ", "", theme("#000000")).unwrap_err();
        assert_eq!(err.key, Some("package.nameEmpty"));

        let err = normalize_theme(&"a".repeat(NAME_MAX + 1), "", theme("#000000")).unwrap_err();
        assert_eq!(err.key, Some("package.nameTooLong"));

        let err =
            normalize_theme("A", &"a".repeat(DESCRIPTION_MAX + 1), theme("#000000")).unwrap_err();
        assert_eq!(err.key, Some("package.descriptionTooLong"));

        let mut bad = theme("#000000");
        bad.dark.border = "url(x)".into();
        let err = normalize_theme("A", "", bad).unwrap_err();
        assert_eq!(err.key, Some("package.invalidColor"));

        for radius in [-0.1, RADIUS_MAX + 0.1, f64::NAN, f64::INFINITY] {
            let mut bad = theme("#000000");
            bad.radius = radius;
            let err = normalize_theme("A", "", bad).unwrap_err();
            assert_eq!(err.key, Some("package.invalidRadius"));
        }
    }

    #[test]
    fn theme_json_rejects_unknown_or_missing_keys() {
        let ok = serde_json::to_value(theme("#000000")).unwrap();
        assert!(serde_json::from_value::<ThemeData>(ok.clone()).is_ok());

        let mut extra = ok.clone();
        extra["light"]["script"] = "#000000".into();
        assert!(serde_json::from_value::<ThemeData>(extra).is_err());

        let mut missing = ok;
        missing["dark"].as_object_mut().unwrap().remove("primary");
        assert!(serde_json::from_value::<ThemeData>(missing).is_err());
    }

    #[test]
    fn slugs_and_ids() {
        assert_eq!(slugify("Nuit étoilée !"), "nuit-etoilee");
        assert_eq!(slugify("  --Été__2026--  "), "ete-2026");
        assert_eq!(slugify("!!!"), "");
        assert_eq!(slugify(&"x".repeat(80)).len(), SLUG_MAX);
        assert_eq!(base_package_id("Nelly_S", "Forêt profonde"), "nelly-s.foret-profonde");
        assert_eq!(base_package_id("___", "???"), "local.theme");
    }

    #[test]
    fn versions() {
        assert_eq!(bump_patch("1.0.0"), "1.0.1");
        assert_eq!(bump_patch("2.3.9"), "2.3.10");
        assert_eq!(bump_patch("abc"), "1.0.1");
    }

    // --- Base de données (SQLite en mémoire) --------------------------------

    async fn pool_with_user(id: &str, username: &str) -> (SqlitePool, User) {
        // Une seule connexion : chaque connexion `:memory:` a sa propre base.
        let options = sqlx::sqlite::SqliteConnectOptions::new()
            .in_memory(true)
            .foreign_keys(true);
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        crate::db::migrations::run_migrations(&pool, &crate::db::migrations::APP_MIGRATOR)
            .await
            .unwrap();

        let user = add_user(&pool, id, username).await;
        (pool, user)
    }

    async fn add_user(pool: &SqlitePool, id: &str, username: &str) -> User {
        let now = now_utc();
        sqlx::query(
            "INSERT INTO users (id, username, email, role, password_hash, password_salt, \
             created_at, updated_at) VALUES (?, ?, NULL, 'developer', 'h', 's', ?, ?)",
        )
        .bind(id)
        .bind(username)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();

        crate::services::user_service::find_by_id(pool, id).await.unwrap().unwrap()
    }

    #[tokio::test]
    async fn crud_and_ownership() {
        let (pool, alice) = pool_with_user("u1", "alice").await;
        let bob = add_user(&pool, "u2", "bob").await;

        let a = create_theme(&pool, &alice, "Aube", "", theme("#111111")).await.unwrap();
        assert_eq!(a.package_id, "alice.aube");
        assert_eq!(a.version, "1.0.0");
        assert_eq!(a.author, "alice");

        // Même nom : identifiant suivant.
        let b = create_theme(&pool, &alice, "Aube", "", theme("#222222")).await.unwrap();
        assert_eq!(b.package_id, "alice.aube-2");

        // Modification : identifiant stable, version augmentée.
        let a2 = update_theme(&pool, &alice, &a.id, "Aube dorée", "x", theme("#333333"))
            .await
            .unwrap();
        assert_eq!(a2.package_id, "alice.aube");
        assert_eq!(a2.version, "1.0.1");
        assert_eq!(a2.theme.light.primary, "#333333");

        // Bob ne voit ni ne modifie les thèmes d'Alice.
        assert!(list_for_owner(&pool, &bob).await.unwrap().is_empty());
        let err = update_theme(&pool, &bob, &a.id, "Vol", "", theme("#000000"))
            .await
            .unwrap_err();
        assert_eq!(err.key, Some("package.notFound"));
        let err = delete(&pool, &bob.id, &a.id).await.unwrap_err();
        assert_eq!(err.key, Some("package.notFound"));

        assert_eq!(list_for_owner(&pool, &alice).await.unwrap().len(), 2);
        delete(&pool, &alice.id, &a.id).await.unwrap();
        assert_eq!(list_for_owner(&pool, &alice).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn unreadable_rows_are_skipped() {
        let (pool, alice) = pool_with_user("u1", "alice").await;
        create_theme(&pool, &alice, "Bon", "", theme("#111111")).await.unwrap();

        sqlx::query(
            "INSERT INTO packages (id, owner_id, package_id, package_type, name, data, \
             created_at, updated_at) VALUES ('x', 'u1', 'alice.casse', 'theme', 'Cassé', \
             '{oops', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let list = list_for_owner(&pool, &alice).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Bon");
    }
}
