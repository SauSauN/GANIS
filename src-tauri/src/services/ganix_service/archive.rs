//! Lecture et contrôle d'une archive `.ganix` (niveaux 1 et 2).

use super::*;

// ----------------------------------------------------------------------------
// Lecture et contrôle d'une archive (niveaux 1 et 2)
// ----------------------------------------------------------------------------

/// Nom d'entrée autorisé : les trois fichiers XML et les images
/// `assets/<2 car.>/<empreinte>.<png|jpg|webp|gif>`.
pub(super) fn allowed_name(name: &str) -> bool {
    matches!(name, MANIFEST | CHECKSUMS | DATA) || parse_asset_name(name).is_some()
}

pub(super) struct ArchiveIndex {
    pub(super) manifest: Manifest,
    pub(super) checksums: Checksums,
}

pub(super) fn read_small_entry(archive: &mut zip::ZipArchive<BufReader<File>>, name: &str) -> AppResult<Option<Vec<u8>>> {
    let entry = match archive.by_name(name) {
        Ok(entry) => entry,
        Err(zip::result::ZipError::FileNotFound) => return Ok(None),
        Err(e) => return Err(damaged(format!("ZIP_INVALID : {e}"))),
    };

    if entry.size() > MAX_MANIFEST_BYTES {
        return Err(damaged(format!("{name} trop grand")));
    }

    let mut bytes = Vec::new();
    entry
        .take(MAX_MANIFEST_BYTES)
        .read_to_end(&mut bytes)
        .map_err(|e| damaged(format!("{name} illisible : {e}")))?;

    Ok(Some(bytes))
}

/// Contrôle l'index du ZIP sans extraire (étape 2), lit le manifeste
/// (étapes 3-4) et les empreintes.
pub(super) fn read_index(archive: &mut zip::ZipArchive<BufReader<File>>) -> AppResult<ArchiveIndex> {
    if archive.len() > MAX_ENTRIES {
        return Err(unsafe_archive(format!("ZIP_TOO_LARGE : {} entrées", archive.len())));
    }

    let mut seen = BTreeSet::new();
    let mut total: u64 = 0;

    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|e| damaged(format!("ZIP_INVALID : {e}")))?;
        let name = entry.name().to_owned();

        if entry.is_dir() {
            continue;
        }

        let path_ok = name.chars().count() <= MAX_PATH_CHARS
            && !name.starts_with('/')
            && !name.contains('\\')
            && !name.contains(':')
            && !name.split('/').any(|part| part == ".." || part == ".")
            && entry.enclosed_name().is_some();

        if !path_ok {
            return Err(unsafe_archive(format!("ZIP_UNSAFE_PATH : {name}")));
        }
        if entry.is_symlink() {
            return Err(unsafe_archive(format!("ZIP_UNSAFE_PATH (lien symbolique) : {name}")));
        }
        if !allowed_name(&name) {
            return Err(unsafe_archive(format!("FILE_UNEXPECTED : {name}")));
        }
        if !seen.insert(name.clone()) {
            return Err(unsafe_archive(format!("ZIP_UNSAFE_PATH (doublon) : {name}")));
        }

        let size = entry.size();
        total = total.saturating_add(size);

        if total > MAX_TOTAL_UNCOMPRESSED {
            return Err(unsafe_archive("ZIP_TOO_LARGE : taille décompressée"));
        }
        if size > RATIO_MIN_BYTES && size / entry.compressed_size().max(1) > MAX_RATIO {
            return Err(unsafe_archive(format!("ZIP_BOMB_SUSPECTED : {name}")));
        }
    }

    // Manifeste.
    let manifest = parse_manifest(
        &read_small_entry(archive, MANIFEST)?.ok_or_else(|| not_ganix("MANIFEST_MISSING"))?,
    )?;

    if manifest.format_version > FORMAT_VERSION {
        return Err(too_new(format!("FORMAT_TOO_NEW : {}", manifest.format_version)));
    }
    if !version_le(&manifest.min_app_version, app_version()) {
        return Err(too_new(format!("APP_UPDATE_REQUIRED : {}", manifest.min_app_version)));
    }
    if manifest.schema_version > current_schema_version() {
        return Err(too_new(format!("SCHEMA_TOO_NEW : {}", manifest.schema_version)));
    }
    if !PROJECT_MIGRATOR.iter().any(|m| m.version == manifest.schema_version) {
        return Err(not_ganix(format!("MANIFEST_INVALID : schéma {}", manifest.schema_version)));
    }
    if manifest.content.data.file != DATA {
        return Err(not_ganix("MANIFEST_INVALID : fichier de données"));
    }
    if manifest.encryption.enabled {
        return Err(not_ganix("MANIFEST_INVALID : fichier chiffré non pris en charge"));
    }

    // Empreintes.
    let checksums = parse_checksums(
        &read_small_entry(archive, CHECKSUMS)?.ok_or_else(|| damaged("FILE_MISSING : checksums.xml"))?,
    )?;

    // Tout fichier présent (hors manifeste et empreintes) doit être listé,
    // et tout fichier listé doit être présent.
    for name in &seen {
        if name != MANIFEST && name != CHECKSUMS && !checksums.files.contains_key(name) {
            return Err(damaged(format!("FILE_UNEXPECTED : {name}")));
        }
    }
    for (name, hash) in &checksums.files {
        if !seen.contains(name) {
            return Err(damaged(format!("FILE_MISSING : {name}")));
        }
        // Une image est nommée par son empreinte.
        if let Some((name_hash, _)) = parse_asset_name(name) {
            if name_hash != hash {
                return Err(damaged(format!("CHECKSUM_MISMATCH : {name}")));
            }
        }
    }
    if !checksums.files.contains_key(DATA) {
        return Err(damaged("FILE_MISSING : project.xml"));
    }

    Ok(ArchiveIndex { manifest, checksums })
}

pub(super) fn open_archive(path: &Path) -> AppResult<zip::ZipArchive<BufReader<File>>> {
    let size = std::fs::metadata(path).map_err(unreadable)?.len();

    if size > MAX_ARCHIVE_BYTES {
        return Err(unsafe_archive("ZIP_TOO_LARGE : archive"));
    }

    let file = File::open(path).map_err(unreadable)?;
    zip::ZipArchive::new(BufReader::new(file)).map_err(|e| damaged(format!("ZIP_INVALID : {e}")))
}

/// Contrôles des niveaux 1 et 2, sans rien extraire (relecture d'un export).
pub fn verify_archive(path: &Path) -> AppResult<Manifest> {
    let mut archive = open_archive(path)?;
    let index = read_index(&mut archive)?;

    for (name, expected) in &index.checksums.files {
        let mut entry = archive.by_name(name).map_err(|e| damaged(format!("{name} : {e}")))?;
        if &sha256_reader(&mut entry)? != expected {
            return Err(damaged(format!("CHECKSUM_MISMATCH : {name}")));
        }
    }

    Ok(index.manifest)
}

