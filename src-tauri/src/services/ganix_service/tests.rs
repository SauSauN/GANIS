    use super::*;
    use crate::db::project_db::init_project_db;

    /// Plus petite image PNG valide (1×1).
    const PNG: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82,
    ];

    /// Texte piégé : caractères spéciaux XML, retours à la ligne Windows,
    /// caractère de contrôle, espaces de début et de fin.
    const TRICKY: &str = "  <b>Aldric</b> & « Mira » \"q\" 'a'\r\nligne 2\u{1}\tfin  ";

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ganis-ganix-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn project(name: &str) -> Project {
        Project {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_owned(),
            description: "Une saga & des « guillemets »".to_owned(),
            project_type: ProjectType::Novel,
            status: ProjectStatus::InProgress,
            is_favorite: false,
            is_archived: false,
            created_at: now_utc(),
            updated_at: now_utc(),
            last_opened_at: None,
            name_sealed: None,
            description_sealed: None,
            wrapped_key: None,
            visibility: Default::default(),
            deleted_at: None,
            public_key: None,
        }
    }

    /// Base de projet chiffrée : deux personnages (dont un au texte piégé),
    /// un portrait PNG, deux images de galerie identiques, un synopsis.
    async fn encrypted_project(dir: &Path) -> SqlitePool {
        let pool = init_project_db(dir, &SecretKey::generate()).await.unwrap();

        for (id, first, last) in [("c1", "Aldric", "VENN"), ("c2", TRICKY, "")] {
            sqlx::query(
                "INSERT INTO characters (id, first_name, last_name, role, status, fields, created_at, updated_at) \
                 VALUES (?, ?, ?, 'main', 'alive', '{\"origin\":\"Valona\"}', 'x', 'x')",
            )
            .bind(id)
            .bind(first)
            .bind(last)
            .execute(&pool)
            .await
            .unwrap();
        }

        sqlx::query("INSERT INTO character_portraits (character_id, mime, data, updated_at) VALUES ('c1', 'image/png', ?, 'x')")
            .bind(PNG)
            .execute(&pool)
            .await
            .unwrap();

        for (id, position) in [("i1", 0), ("i2", 1)] {
            sqlx::query(
                "INSERT INTO character_images (id, character_id, mime, data, position, created_at) \
                 VALUES (?, 'c1', 'image/png', ?, ?, 'x')",
            )
            .bind(id)
            .bind(PNG)
            .bind(position)
            .execute(&pool)
            .await
            .unwrap();
        }

        sqlx::query("UPDATE synopsis SET content = ? WHERE id = 'default'")
            .bind("Il était une fois…\n\nFin.")
            .execute(&pool)
            .await
            .unwrap();

        // Notes : dossier, note (document JSON de l'éditeur) et post-it
        // (coordonnées décimales).
        for sql in [
            "INSERT INTO note_folders (id, parent_id, name, position, created_at, updated_at) VALUES ('f1', NULL, 'Recherches', 0, 'x', 'x')",
            "INSERT INTO notes (id, folder_id, title, content, excerpt, pinned, created_at, updated_at) \
             VALUES ('n1', 'f1', 'Magie', '{\"type\":\"doc\",\"content\":[{\"type\":\"diagram\",\"attrs\":{\"data\":{\"boxes\":[]}}}]}', 'Magie & <ambre>', 1, 'x', 'x')",
            "INSERT INTO sticky_notes (id, text, color, x, y, width, height, z, created_at, updated_at) \
             VALUES ('s1', 'Idée', 'pink', 12.5, -3.25, 220, 180, 2, 'x', 'x')",
        ] {
            sqlx::query(sql).execute(&pool).await.unwrap();
        }

        pool
    }

    /// Toutes les lignes de toutes les tables, sous une forme comparable.
    async fn dump(pool: &SqlitePool) -> BTreeMap<String, Vec<String>> {
        let mut conn = pool.acquire().await.unwrap();
        let tables = user_tables(&mut conn).await.unwrap();
        let mut out = BTreeMap::new();

        for (table, columns) in tables {
            let select = columns.iter().map(|c| format!("quote({})", quote_ident(c))).collect::<Vec<_>>().join(" || '|' || ");
            let mut rows: Vec<String> = sqlx::query_scalar(&format!("SELECT {select} FROM {}", quote_ident(&table)))
                .fetch_all(&mut *conn)
                .await
                .unwrap();
            rows.sort();
            out.insert(table, rows);
        }

        out
    }

    fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let mut zip = zip::ZipWriter::new(File::create(path).unwrap());
        for (name, data) in entries {
            zip.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
            zip.write_all(data).unwrap();
        }
        zip.finish().unwrap();
    }

    fn entries(path: &Path) -> Vec<(String, Vec<u8>)> {
        let mut archive = zip::ZipArchive::new(File::open(path).unwrap()).unwrap();
        (0..archive.len())
            .map(|i| {
                let mut entry = archive.by_index(i).unwrap();
                let mut data = Vec::new();
                entry.read_to_end(&mut data).unwrap();
                (entry.name().to_owned(), data)
            })
            .collect()
    }

    fn entry(path: &Path, name: &str) -> Vec<u8> {
        entries(path).into_iter().find(|(n, _)| n == name).unwrap().1
    }

    /// Archive refaite avec un `project.xml` modifié (empreintes à jour).
    fn with_data(good: &Path, target: &Path, data: &[u8]) {
        let mut files = entries(good);
        let checksums = String::from_utf8(entry(good, CHECKSUMS)).unwrap().replace(
            &sha256_hex(&entry(good, DATA)),
            &sha256_hex(data),
        );
        for (name, content) in files.iter_mut() {
            if name == DATA {
                *content = data.to_vec();
            } else if name == CHECKSUMS {
                *content = checksums.as_bytes().to_vec();
            }
        }
        let refs: Vec<(&str, &[u8])> = files.iter().map(|(n, d)| (n.as_str(), d.as_slice())).collect();
        write_zip(target, &refs);
    }

    async fn stage(path: &Path) -> AppResult<(Manifest, Counts)> {
        let dir = temp_dir("stage");
        let result = stage_files(&dir, path).await;
        std::fs::remove_dir_all(dir).unwrap();
        result
    }

    fn key<T>(result: AppResult<T>) -> String {
        match result {
            Err(e) => format!("{e:?}"),
            Ok(_) => "ok".to_owned(),
        }
    }

    #[test]
    fn helpers() {
        assert!(version_le("0.1.0", "0.1.0"));
        assert!(version_le("0.1", "0.2.0"));
        assert!(!version_le("1.0.0", "0.9.9"));
        assert_eq!(suggested_file_name("Les Royaumes : tome 1"), "Les Royaumes _ tome 1.ganix");
        assert_eq!(suggested_file_name("  ...  "), "projet.ganix");

        let hash = sha256_hex(PNG);
        let name = asset_entry_name(&hash, "png");
        assert!(allowed_name(&name));
        assert!(allowed_name("project.xml"));
        assert!(!allowed_name("project.sqlite"));
        assert!(!allowed_name("assets/00/abc.png"));
        assert!(!allowed_name(&name.replace(".png", ".exe")));
        assert!(!allowed_name("autre.txt"));

        assert!(xml_safe("Bonjour\n\tà tous & <vous>"));
        assert!(!xml_safe("a\r\nb"));
        assert!(!xml_safe("a\u{1}b"));
    }

    #[tokio::test]
    async fn export_is_xml_only_and_rebuilds_the_same_data() {
        let dir = temp_dir("roundtrip");
        let source = encrypted_project(&dir.join("source")).await;
        let target = dir.join("Mon projet.ganix");

        write_ganix(&source, &project("Mon projet"), &target, &dir.join("work")).await.unwrap();
        assert!(target.exists());
        assert!(!part_path(&target).exists());
        assert!(!dir.join("work").exists());

        // Que du XML et des images ; aucune base de données.
        let names: Vec<String> = entries(&target).into_iter().map(|(n, _)| n).collect();
        let image = asset_entry_name(&sha256_hex(PNG), "png");
        assert_eq!(names, vec![MANIFEST.to_owned(), CHECKSUMS.to_owned(), DATA.to_owned(), image.clone()]);
        for (_, data) in entries(&target) {
            assert!(!data.starts_with(b"SQLite format 3"));
        }

        // XML lisible.
        let xml = String::from_utf8(entry(&target, DATA)).unwrap();
        assert!(xml.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        assert!(xml.contains("<table name=\"characters\">"));
        assert!(xml.contains("<first_name>Aldric</first_name>"));
        assert!(xml.contains(&format!("<data type=\"asset\">{image}</data>")));
        assert!(xml.contains("<first_name type=\"text-base64\">"));
        assert!(!xml.contains("_sqlx_migrations"));

        let manifest_text = String::from_utf8(entry(&target, MANIFEST)).unwrap();
        assert!(manifest_text.contains("<name>Mon projet</name>"));
        assert!(!manifest_text.contains("owner") && !manifest_text.contains("wrapped"));

        let manifest = verify_archive(&target).unwrap();
        assert_eq!(manifest.project.name, "Mon projet");
        assert_eq!(manifest.project.description, "Une saga & des « guillemets »");
        assert_eq!(manifest.schema_version, current_schema_version());
        assert_eq!(manifest.content.counts.characters, 2);
        assert_eq!(manifest.content.assets.count, 1);
        assert!(!manifest.encryption.enabled);

        // Import : la base reconstruite contient exactement les mêmes lignes.
        let staging = dir.join("staging");
        std::fs::create_dir_all(&staging).unwrap();
        let (_, counts) = stage_files(&staging, &target).await.unwrap();
        assert_eq!(counts.characters, 2);

        let rebuilt = open_plain(&staging.join(STAGED_DB)).await.unwrap();
        assert_eq!(dump(&rebuilt).await, dump(&source).await);
        let tricky: String = sqlx::query_scalar("SELECT first_name FROM characters WHERE id = 'c2'")
            .fetch_one(&rebuilt)
            .await
            .unwrap();
        assert_eq!(tricky, TRICKY);
        rebuilt.close().await;

        // Les fichiers extraits ont disparu ; seule la base reconstruite reste.
        assert!(!staging.join(DATA).exists());
        assert!(!staging.join(STAGED_ASSETS).exists());

        source.close().await;
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn large_documents_are_written_apart_and_come_back() {
        let dir = temp_dir("documents");
        let source = encrypted_project(&dir.join("source")).await;
        sqlx::query(
            "INSERT INTO structure_nodes (id, parent_id, level, title, summary, position, created_at, updated_at) \
             VALUES ('ch1', NULL, 0, 'Chapitre 1', '', 0, 'x', 'x')",
        )
        .execute(&source)
        .await
        .unwrap();
        let big: Vec<u8> = (0..200_000u32).map(|i| (i % 251) as u8).collect();
        crate::services::document_service::add(&source, "ch1", "Chapitre 1.pdf", &big).await.unwrap();
        crate::services::document_service::add(&source, "ch1", "notes.txt", b"petit").await.unwrap();

        let target = dir.join("Docs.ganix");
        write_ganix(&source, &project("Docs"), &target, &dir.join("work")).await.unwrap();

        let bin = asset_entry_name(&sha256_hex(&big), "bin");
        assert!(entries(&target).iter().any(|(name, _)| *name == bin));
        let xml = String::from_utf8(entry(&target, DATA)).unwrap();
        assert!(xml.contains(&format!("<data type=\"asset\">{bin}</data>")));

        let staging = dir.join("staging");
        std::fs::create_dir_all(&staging).unwrap();
        stage_files(&staging, &target).await.unwrap();
        let rebuilt = open_plain(&staging.join(STAGED_DB)).await.unwrap();
        assert_eq!(dump(&rebuilt).await, dump(&source).await);
        rebuilt.close().await;

        source.close().await;
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn tampered_or_unsafe_archives_are_refused() {
        let dir = temp_dir("unsafe");
        let source = encrypted_project(&dir.join("source")).await;
        let good = dir.join("bon.ganix");
        write_ganix(&source, &project("P"), &good, &dir.join("work")).await.unwrap();
        source.close().await;

        let manifest = entry(&good, MANIFEST);
        let checksums = entry(&good, CHECKSUMS);
        let data = entry(&good, DATA);
        let image_name = asset_entry_name(&sha256_hex(PNG), "png");

        // Données modifiées sans mettre à jour l'empreinte.
        let mut altered = data.clone();
        let last = altered.len() - 2;
        altered[last] ^= 0x01;
        let path = dir.join("altere.ganix");
        write_zip(&path, &[(MANIFEST, &manifest), (CHECKSUMS, &checksums), (DATA, &altered), (&image_name, PNG)]);
        assert!(key(verify_archive(&path)).contains("ganix.damaged"));

        // Chemin dangereux, fichier non autorisé, ancienne base SQLite.
        for (name, extra) in [("assets/../../x", &b"x"[..]), ("virus.exe", b"x"), ("project.sqlite", b"SQLite format 3\0")] {
            let path = dir.join("intrus.ganix");
            write_zip(&path, &[(MANIFEST, &manifest), (CHECKSUMS, &checksums), (DATA, &data), (&image_name, PNG), (name, extra)]);
            assert!(key(verify_archive(&path)).contains("ganix.unsafe"), "{name}");
        }

        // Fichier manquant.
        let path = dir.join("manque.ganix");
        write_zip(&path, &[(MANIFEST, &manifest), (CHECKSUMS, &checksums), (DATA, &data)]);
        assert!(key(verify_archive(&path)).contains("ganix.damaged"));

        // Pas de manifeste / pas un ZIP.
        let path = dir.join("sans.ganix");
        write_zip(&path, &[(DATA, &data)]);
        assert!(key(verify_archive(&path)).contains("ganix.notGanix"));
        let path = dir.join("texte.ganix");
        std::fs::write(&path, b"pas une archive").unwrap();
        assert!(key(verify_archive(&path)).contains("ganix.damaged"));

        // Version trop récente.
        let newer = String::from_utf8(manifest.clone()).unwrap().replace("formatVersion=\"1\"", "formatVersion=\"99\"");
        let path = dir.join("recent.ganix");
        write_zip(&path, &[(MANIFEST, newer.as_bytes()), (CHECKSUMS, &checksums), (DATA, &data), (&image_name, PNG)]);
        assert!(key(verify_archive(&path)).contains("ganix.tooNew"));

        // Image dont le contenu n'est pas une image (empreinte cohérente).
        let fake = b"MZ pas une image";
        let fake_name = asset_entry_name(&sha256_hex(fake), "png");
        let fake_data = String::from_utf8(data.clone()).unwrap().replace(&image_name, &fake_name);
        let fake_checksums = String::from_utf8(checksums.clone())
            .unwrap()
            .replace(&image_name, &fake_name)
            .replace(&sha256_hex(PNG), &sha256_hex(fake))
            .replace(&sha256_hex(&data), &sha256_hex(fake_data.as_bytes()));
        let path = dir.join("image.ganix");
        write_zip(&path, &[(MANIFEST, &manifest), (CHECKSUMS, fake_checksums.as_bytes()), (DATA, fake_data.as_bytes()), (&fake_name, fake)]);
        let result = key(stage(&path).await);
        assert!(result.contains("ganix.unsafe"), "{result}");

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn file_from_an_older_schema_is_migrated() {
        let dir = temp_dir("old");
        let older = current_schema_version() - 1;

        // Projet resté à la version précédente du schéma.
        let source = open_plain(&dir.join("ancien.db")).await.unwrap();
        run_migrations(&source, &migrator_up_to(older)).await.unwrap();
        sqlx::query(
            "INSERT INTO characters (id, first_name, last_name, role, status, fields, created_at, updated_at) \
             VALUES ('c1', 'Aldric', 'VENN', 'main', 'alive', '{}', 'x', 'x')",
        )
        .execute(&source)
        .await
        .unwrap();

        let file = dir.join("ancien.ganix");
        write_ganix(&source, &project("Ancien"), &file, &dir.join("work")).await.unwrap();
        source.close().await;
        assert_eq!(verify_archive(&file).unwrap().schema_version, older);

        let staging = dir.join("staging");
        std::fs::create_dir_all(&staging).unwrap();
        let (_, counts) = stage_files(&staging, &file).await.unwrap();
        assert_eq!(counts.characters, 1);

        // Installation : chiffrement, migrations restantes, schéma final strict.
        let key = SecretKey::generate();
        let pool = prepare_database(&staging.join(STAGED_DB), &dir.join("installe"), &key).await.unwrap();
        let mut conn = pool.acquire().await.unwrap();
        assert_eq!(schema_version_of(&mut conn).await.unwrap(), current_schema_version());
        drop(conn);
        pool.close().await;

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn xml_cannot_change_the_schema_or_break_links() {
        let dir = temp_dir("xml");
        let source = encrypted_project(&dir.join("source")).await;
        let good = dir.join("bon.ganix");
        write_ganix(&source, &project("P"), &good, &dir.join("work")).await.unwrap();
        source.close().await;

        let xml = String::from_utf8(entry(&good, DATA)).unwrap();
        let cases = [
            // Table inconnue.
            (xml.replace("<table name=\"characters\">", "<table name=\"piege\">"), "ganix.unsafe"),
            // Colonne inconnue.
            (xml.replace("<first_name>Aldric</first_name>", "<pirate>Aldric</pirate>"), "ganix.unsafe"),
            // Entité déclarée (DTD) : refusée.
            (
                xml.replacen("<project ", "<!DOCTYPE project [<!ENTITY x \"boum\">]><project ", 1),
                "ganix.unsafe",
            ),
            // Portrait d'un personnage inexistant : lien cassé.
            (xml.replace("<character_id>c1</character_id>", "<character_id>fantome</character_id>"), "ganix.damaged"),
            // Valeur numérique invalide.
            (xml.replace("<position type=\"integer\">1</position>", "<position type=\"integer\">un</position>"), "ganix.damaged"),
            // Document tronqué.
            (xml[..xml.len() / 2].to_owned(), "ganix.damaged"),
        ];

        for (i, (data, expected)) in cases.iter().enumerate() {
            assert_ne!(data, &xml, "cas {i} : remplacement sans effet");
            let path = dir.join(format!("cas{i}.ganix"));
            with_data(&good, &path, data.as_bytes());
            let result = key(stage(&path).await);
            assert!(result.contains(expected), "cas {i} : {result}");
        }

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn export_and_import_report_their_progress() {
        let dir = temp_dir("progress");
        let source = encrypted_project(&dir.join("source")).await;
        let target = dir.join("P.ganix");
        let seen = std::sync::Mutex::new(Vec::<Progress>::new());
        let record = |p: Progress| seen.lock().unwrap().push(p);

        write_ganix_reporting(&source, &project("P"), &target, &dir.join("work"), &record)
            .await
            .unwrap();

        {
            let seen = seen.lock().unwrap();
            let data: Vec<_> = seen.iter().filter(|p| p.stage == Stage::Data).collect();
            let last = data.last().unwrap();
            assert!(last.total > 0 && last.done == last.total);
            assert!(seen.iter().any(|p| p.stage == Stage::Files && p.done == 1 && p.total == 1));
            assert_eq!(seen.last().unwrap().stage, Stage::Verify);
        }

        seen.lock().unwrap().clear();
        let staging = temp_dir("progress-staging");
        stage_files_reporting(&staging, &target, &record).await.unwrap();

        let seen = seen.lock().unwrap();
        let build: Vec<_> = seen.iter().filter(|p| p.stage == Stage::Build).collect();
        let last = build.last().unwrap();
        assert!(last.total > 0 && last.done == last.total);

        std::fs::remove_dir_all(staging).unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }
