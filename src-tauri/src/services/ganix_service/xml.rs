//! XML du `.ganix` : petit arbre de lecture, écriture, manifeste et empreintes.

use super::*;

// ----------------------------------------------------------------------------
// XML : petit arbre pour le manifeste et les empreintes
// ----------------------------------------------------------------------------

#[derive(Debug, Default)]
pub(super) struct XmlNode {
    pub(super) name: String,
    pub(super) attributes: BTreeMap<String, String>,
    pub(super) text: String,
    pub(super) children: Vec<XmlNode>,
}

impl XmlNode {
    fn child(&self, name: &str) -> Option<&XmlNode> {
        self.children.iter().find(|child| child.name == name)
    }

    fn attr(&self, name: &str) -> Option<&str> {
        self.attributes.get(name).map(String::as_str)
    }
}

pub(super) fn reader_config<R>(reader: &mut Reader<R>) {
    let config = reader.config_mut();
    config.expand_empty_elements = true;
    config.check_end_names = true;
    config.trim_text(false);
}

pub(super) fn element_name(start: &BytesStart<'_>) -> AppResult<String> {
    Ok(start.name().as_ref().to_owned())
}

pub(super) fn attributes_of(start: &BytesStart<'_>) -> AppResult<BTreeMap<String, String>> {
    let mut attributes = BTreeMap::new();

    for attribute in start.attributes() {
        let attribute = attribute.map_err(|e| damaged(format!("XML : attribut invalide : {e}")))?;
        let key = attribute.key.as_ref().to_owned();
        let value = attribute
            .normalized_value(quick_xml::XmlVersion::Implicit1_0)
            .map_err(|e| damaged(format!("XML : attribut invalide : {e}")))?
            .into_owned();
        attributes.insert(key, value);
    }

    Ok(attributes)
}

/// Texte d'une référence d'entité (`&amp;`, `&#233;`…). Seules les entités
/// prédéfinies du XML sont acceptées : aucune entité déclarée par le fichier.
pub(super) fn resolve_reference(reference: &quick_xml::events::BytesRef<'_>) -> AppResult<String> {
    if reference.is_char_ref() {
        return reference
            .resolve_char_ref()
            .ok()
            .flatten()
            .map(String::from)
            .ok_or_else(|| damaged("XML : référence de caractère invalide"));
    }

    let name = reference.xml10_content();
    quick_xml::escape::resolve_predefined_entity(&name)
        .map(str::to_owned)
        .ok_or_else(|| unsafe_archive(format!("XML : entité inconnue &{name};")))
}

/// Lit un petit document XML (déjà limité en taille) en arbre.
pub(super) fn parse_tree(bytes: &[u8]) -> AppResult<XmlNode> {
    let mut reader = Reader::from_reader(bytes);
    reader_config(&mut reader);

    let mut stack: Vec<XmlNode> = Vec::new();
    let mut root: Option<XmlNode> = None;
    let mut nodes = 0usize;
    let mut buf = Vec::new();

    loop {
        let event = reader
            .read_event_into(&mut buf)
            .map_err(|e| damaged(format!("XML invalide : {e}")))?;

        match event {
            Event::Decl(_) | Event::Comment(_) => {}
            Event::DocType(_) | Event::PI(_) => {
                return Err(unsafe_archive("XML : DTD ou instruction refusée"));
            }
            Event::Start(start) => {
                nodes += 1;
                if root.is_some() || stack.len() >= MAX_XML_DEPTH || nodes > MAX_XML_NODES {
                    return Err(damaged("XML : structure inattendue"));
                }
                stack.push(XmlNode {
                    name: element_name(&start)?,
                    attributes: attributes_of(&start)?,
                    ..XmlNode::default()
                });
            }
            Event::End(_) => {
                let node = stack.pop().ok_or_else(|| damaged("XML : fin inattendue"))?;
                match stack.last_mut() {
                    Some(parent) => parent.children.push(node),
                    None => root = Some(node),
                }
            }
            Event::Text(text) => {
                if let Some(node) = stack.last_mut() {
                    node.text.push_str(&text.xml10_content());
                }
            }
            Event::CData(data) => {
                if let Some(node) = stack.last_mut() {
                    node.text.push_str(&data.xml10_content());
                }
            }
            Event::GeneralRef(reference) => {
                let text = resolve_reference(&reference)?;
                if let Some(node) = stack.last_mut() {
                    node.text.push_str(&text);
                }
            }
            Event::Empty(_) => unreachable!("expand_empty_elements"),
            Event::Eof => break,
        }

        buf.clear();
    }

    root.ok_or_else(|| damaged("XML vide"))
}

// ----------------------------------------------------------------------------
// XML : écriture
// ----------------------------------------------------------------------------

pub(super) type XmlWriter<W> = Writer<W>;

pub(super) fn xml_error(e: impl std::fmt::Display) -> AppError {
    io_error("Écriture du XML", e)
}

pub(super) fn write_decl<W: Write>(writer: &mut XmlWriter<W>) -> AppResult<()> {
    writer
        .write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), None)))
        .map_err(xml_error)
}

/// `<name attr…>texte</name>` (ou vide).
pub(super) fn write_text_element<W: Write>(
    writer: &mut XmlWriter<W>,
    name: &str,
    attributes: &[(&str, &str)],
    text: &str,
) -> AppResult<()> {
    let element = writer
        .create_element(name)
        .with_attributes(attributes.iter().copied());

    if text.is_empty() {
        element.write_empty().map_err(xml_error)?;
    } else {
        // Seuls & < > sont échappés : le texte (JSON des fiches…) reste lisible.
        element
            .write_text_content(BytesText::from_escaped(quick_xml::escape::partial_escape(text)))
            .map_err(xml_error)?;
    }

    Ok(())
}

pub(super) fn write_empty_element<W: Write>(
    writer: &mut XmlWriter<W>,
    name: &str,
    attributes: &[(&str, &str)],
) -> AppResult<()> {
    writer
        .create_element(name)
        .with_attributes(attributes.iter().copied())
        .write_empty()
        .map_err(xml_error)?;
    Ok(())
}

pub(super) fn manifest_xml(manifest: &Manifest) -> AppResult<Vec<u8>> {
    let mut writer = Writer::new_with_indent(Vec::new(), b' ', 2);
    write_decl(&mut writer)?;

    let format_version = manifest.format_version.to_string();
    let schema_version = manifest.schema_version.to_string();
    let content = &manifest.content;
    let counts = &content.counts;
    let n = |value: i64| value.to_string();

    writer
        .create_element("manifest")
        .with_attributes([
            ("format", manifest.format.as_str()),
            ("formatVersion", format_version.as_str()),
            ("minAppVersion", manifest.min_app_version.as_str()),
            ("createdWith", manifest.created_with.as_str()),
            ("schemaVersion", schema_version.as_str()),
        ])
        .write_inner_content(|w| {
            let e = &manifest.export;
            write_empty_element(w, "export", &[("id", &e.id), ("exportedAt", &e.exported_at), ("kind", &e.kind)])
                .map_err(std::io::Error::other)?;

            let p = &manifest.project;
            w.create_element("project")
                .with_attributes([
                    ("id", p.id.as_str()),
                    ("type", p.kind.as_str()),
                    ("status", p.status.as_str()),
                    ("createdAt", p.created_at.as_str()),
                    ("updatedAt", p.updated_at.as_str()),
                ])
                .write_inner_content(|w| {
                    write_text_element(w, "name", &[], &p.name).map_err(std::io::Error::other)?;
                    write_text_element(w, "description", &[], &p.description)
                        .map_err(std::io::Error::other)?;
                    Ok(())
                })?;

            match &manifest.author.display_name {
                Some(name) => write_text_element(w, "author", &[], name),
                None => write_empty_element(w, "author", &[]),
            }
            .map_err(std::io::Error::other)?;

            w.create_element("content").write_inner_content(|w| {
                write_empty_element(
                    w,
                    "counts",
                    &[
                        ("characters", &n(counts.characters)),
                        ("locations", &n(counts.locations)),
                        ("structureNodes", &n(counts.structure_nodes)),
                        ("relations", &n(counts.relations)),
                        ("placeLinks", &n(counts.place_links)),
                    ],
                )
                .map_err(std::io::Error::other)?;
                write_empty_element(
                    w,
                    "assets",
                    &[
                        ("count", &content.assets.count.to_string()),
                        ("totalBytes", &content.assets.total_bytes.to_string()),
                    ],
                )
                .map_err(std::io::Error::other)?;
                write_empty_element(
                    w,
                    "data",
                    &[
                        ("file", &content.data.file),
                        ("sizeBytes", &content.data.size_bytes.to_string()),
                        ("tables", &content.data.tables.to_string()),
                        ("rows", &content.data.rows.to_string()),
                    ],
                )
                .map_err(std::io::Error::other)?;
                Ok(())
            })?;

            write_empty_element(w, "packages", &[]).map_err(std::io::Error::other)?;
            write_empty_element(w, "integrity", &[("algorithm", "sha256"), ("checksumsFile", CHECKSUMS)])
                .map_err(std::io::Error::other)?;
            write_empty_element(
                w,
                "encryption",
                &[("enabled", if manifest.encryption.enabled { "true" } else { "false" })],
            )
            .map_err(std::io::Error::other)?;
            Ok(())
        })
        .map_err(xml_error)?;

    Ok(writer.into_inner())
}

pub(super) fn checksums_xml(checksums: &Checksums) -> AppResult<Vec<u8>> {
    let mut writer = Writer::new_with_indent(Vec::new(), b' ', 2);
    write_decl(&mut writer)?;

    writer
        .create_element("checksums")
        .with_attribute(("algorithm", "sha256"))
        .write_inner_content(|w| {
            for (path, hash) in &checksums.files {
                write_empty_element(w, "file", &[("path", path), ("sha256", hash)])
                    .map_err(std::io::Error::other)?;
            }
            Ok(())
        })
        .map_err(xml_error)?;

    Ok(writer.into_inner())
}

// ----------------------------------------------------------------------------
// XML : lecture du manifeste et des empreintes
// ----------------------------------------------------------------------------

pub(super) fn required<'a>(node: &'a XmlNode, attribute: &str) -> AppResult<&'a str> {
    node.attr(attribute)
        .ok_or_else(|| not_ganix(format!("MANIFEST_INVALID : {}@{attribute} manquant", node.name)))
}

pub(super) fn number<T: std::str::FromStr>(node: &XmlNode, attribute: &str) -> AppResult<T> {
    required(node, attribute)?
        .trim()
        .parse()
        .map_err(|_| not_ganix(format!("MANIFEST_INVALID : {}@{attribute}", node.name)))
}

pub(super) fn optional_number<T: std::str::FromStr + Default>(node: Option<&XmlNode>, attribute: &str) -> T {
    node.and_then(|n| n.attr(attribute))
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or_default()
}

pub(super) fn parse_manifest(bytes: &[u8]) -> AppResult<Manifest> {
    let root = parse_tree(bytes).map_err(|e| not_ganix(format!("MANIFEST_INVALID : {:?}", e.detail())))?;

    if root.name != "manifest" {
        return Err(not_ganix("MANIFEST_INVALID : élément racine"));
    }

    let format = required(&root, "format")?.to_owned();
    if format != "ganix" {
        return Err(not_ganix(format!("MANIFEST_INVALID : format {format}")));
    }

    let export = root.child("export").ok_or_else(|| not_ganix("MANIFEST_INVALID : export"))?;
    let project = root.child("project").ok_or_else(|| not_ganix("MANIFEST_INVALID : project"))?;
    let name = project
        .child("name")
        .map(|n| n.text.clone())
        .filter(|n| !n.trim().is_empty())
        .ok_or_else(|| not_ganix("MANIFEST_INVALID : nom du projet"))?;

    let content = root.child("content");
    let counts = content.and_then(|c| c.child("counts"));
    let assets = content.and_then(|c| c.child("assets"));
    let data = content
        .and_then(|c| c.child("data"))
        .ok_or_else(|| not_ganix("MANIFEST_INVALID : data"))?;

    let encryption_enabled = root
        .child("encryption")
        .and_then(|e| e.attr("enabled"))
        .is_some_and(|v| v == "true");

    Ok(Manifest {
        format,
        format_version: number(&root, "formatVersion")?,
        min_app_version: required(&root, "minAppVersion")?.to_owned(),
        created_with: required(&root, "createdWith")?.to_owned(),
        schema_version: number(&root, "schemaVersion")?,
        export: ExportInfo {
            id: required(export, "id")?.to_owned(),
            exported_at: required(export, "exportedAt")?.to_owned(),
            kind: export.attr("kind").unwrap_or("full").to_owned(),
        },
        project: ProjectInfo {
            id: required(project, "id")?.to_owned(),
            name,
            description: project.child("description").map(|d| d.text.clone()).unwrap_or_default(),
            kind: required(project, "type")?.to_owned(),
            status: required(project, "status")?.to_owned(),
            created_at: project.attr("createdAt").unwrap_or_default().to_owned(),
            updated_at: project.attr("updatedAt").unwrap_or_default().to_owned(),
        },
        author: AuthorInfo {
            display_name: root
                .child("author")
                .map(|a| a.text.trim().to_owned())
                .filter(|a| !a.is_empty()),
        },
        content: ContentInfo {
            counts: Counts {
                characters: optional_number(counts, "characters"),
                locations: optional_number(counts, "locations"),
                structure_nodes: optional_number(counts, "structureNodes"),
                relations: optional_number(counts, "relations"),
                place_links: optional_number(counts, "placeLinks"),
            },
            assets: AssetsInfo {
                count: optional_number(assets, "count"),
                total_bytes: optional_number(assets, "totalBytes"),
            },
            data: DataInfo {
                file: required(data, "file")?.to_owned(),
                size_bytes: optional_number(Some(data), "sizeBytes"),
                tables: optional_number(Some(data), "tables"),
                rows: optional_number(Some(data), "rows"),
            },
        },
        encryption: EncryptionInfo { enabled: encryption_enabled },
    })
}

pub(super) fn parse_checksums(bytes: &[u8]) -> AppResult<Checksums> {
    let root = parse_tree(bytes)?;

    if root.name != "checksums" || root.attr("algorithm") != Some("sha256") {
        return Err(damaged("checksums.xml : algorithme d'empreinte inconnu"));
    }

    let mut checksums = Checksums::default();

    for file in root.children.iter().filter(|c| c.name == "file") {
        let path = file.attr("path").ok_or_else(|| damaged("checksums.xml : chemin manquant"))?;
        let hash = file
            .attr("sha256")
            .filter(|h| h.len() == 64 && h.bytes().all(|b| b.is_ascii_hexdigit()))
            .ok_or_else(|| damaged(format!("checksums.xml : empreinte invalide pour {path}")))?;

        if checksums.files.insert(path.to_owned(), hash.to_ascii_lowercase()).is_some() {
            return Err(damaged(format!("checksums.xml : doublon {path}")));
        }
    }

    Ok(checksums)
}

