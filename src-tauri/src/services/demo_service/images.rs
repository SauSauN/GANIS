//! Fichiers générés pour les projets d'exemple : images PNG et documents
//! Word (.docx).
//!
//! Rien n'est copié d'ailleurs : les images sont dessinées ici (portraits
//! stylisés, paysages, planches de couleurs), les documents Word écrits à
//! partir du texte des données. Les projets d'exemple n'embarquent donc
//! aucune ressource dont la licence serait à vérifier.

use std::io::Write;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Deserialize;

use crate::error::{AppError, AppResult};

/// Couleur RVB.
pub type Rgb = [u8; 3];

/// Image décrite dans les données d'un projet d'exemple.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum ImageSpec {
    /// Silhouette (tête et épaules) sur un fond dégradé.
    Portrait { background: Rgb, figure: Rgb },
    /// Ciel, horizon ondulé et sol.
    Landscape {
        sky: Rgb,
        ground: Rgb,
        #[serde(default = "default_width")]
        width: u32,
        #[serde(default = "default_height")]
        height: u32,
    },
    /// Bandes verticales des couleurs données (palette, planche d'ambiance).
    Swatches {
        colors: Vec<Rgb>,
        #[serde(default = "default_width")]
        width: u32,
        #[serde(default = "default_height")]
        height: u32,
    },
}

fn default_width() -> u32 {
    240
}

fn default_height() -> u32 {
    160
}

const MAX_SIDE: u32 = 1_200;

impl ImageSpec {
    /// Octets PNG de l'image.
    pub fn png(&self) -> AppResult<Vec<u8>> {
        let check = |w: u32, h: u32| {
            if w == 0 || h == 0 || w > MAX_SIDE || h > MAX_SIDE {
                Err(AppError::internal(format!("Image d'exemple de taille invalide ({w}×{h})")))
            } else {
                Ok(())
            }
        };
        match self {
            ImageSpec::Portrait { background, figure } => Ok(portrait(*background, *figure)),
            ImageSpec::Landscape { sky, ground, width, height } => {
                check(*width, *height)?;
                Ok(landscape(*sky, *ground, *width, *height))
            }
            ImageSpec::Swatches { colors, width, height } => {
                check(*width, *height)?;
                if colors.is_empty() {
                    return Err(AppError::internal("Planche de couleurs sans couleur"));
                }
                Ok(swatches(colors, *width, *height))
            }
        }
    }

    /// Image encodée en base64 (format attendu par les services d'images).
    pub fn base64(&self) -> AppResult<String> {
        Ok(BASE64.encode(self.png()?))
    }
}

// ----------------------------------------------------------------------------
// PNG
// ----------------------------------------------------------------------------

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
        }
    }
    !crc
}

fn adler32(data: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for &byte in data {
        a = (a + byte as u32) % 65_521;
        b = (b + a) % 65_521;
    }
    (b << 16) | a
}

/// Image PNG (RVB) d'après une fonction de couleur, compressée « stockée ».
pub fn png(width: u32, height: u32, pixel: impl Fn(u32, u32) -> Rgb) -> Vec<u8> {
    let mut raw = Vec::with_capacity(((width * 3 + 1) * height) as usize);
    for y in 0..height {
        raw.push(0);
        for x in 0..width {
            raw.extend_from_slice(&pixel(x, y));
        }
    }
    let mut zlib = vec![0x78, 0x01];
    for (index, chunk) in raw.chunks(65_535).enumerate() {
        let last = (index + 1) * 65_535 >= raw.len();
        zlib.push(u8::from(last));
        zlib.extend_from_slice(&(chunk.len() as u16).to_le_bytes());
        zlib.extend_from_slice(&(!(chunk.len() as u16)).to_le_bytes());
        zlib.extend_from_slice(chunk);
    }
    zlib.extend_from_slice(&adler32(&raw).to_be_bytes());

    let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
    let mut chunk = |kind: &[u8], data: &[u8]| {
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        let mut body = kind.to_vec();
        body.extend_from_slice(data);
        out.extend_from_slice(&body);
        out.extend_from_slice(&crc32(&body).to_be_bytes());
    };
    let mut header = Vec::new();
    header.extend_from_slice(&width.to_be_bytes());
    header.extend_from_slice(&height.to_be_bytes());
    header.extend_from_slice(&[8, 2, 0, 0, 0]);
    chunk(b"IHDR", &header);
    chunk(b"IDAT", &zlib);
    chunk(b"IEND", &[]);
    out
}

fn shade(color: Rgb, factor: f32) -> Rgb {
    [
        (color[0] as f32 * factor).clamp(0.0, 255.0) as u8,
        (color[1] as f32 * factor).clamp(0.0, 255.0) as u8,
        (color[2] as f32 * factor).clamp(0.0, 255.0) as u8,
    ]
}

/// Portrait stylisé : fond dégradé, tête et épaules de la couleur donnée.
pub fn portrait(background: Rgb, figure: Rgb) -> Vec<u8> {
    let size = 160;
    png(size, size, |x, y| {
        let (fx, fy) = (x as f32, y as f32);
        let head = (fx - 80.0).powi(2) + (fy - 62.0).powi(2) < 30.0f32.powi(2);
        let body = (fx - 80.0).powi(2) / 58.0f32.powi(2) + (fy - 160.0).powi(2) / 62.0f32.powi(2) < 1.0;
        if head || body {
            figure
        } else {
            shade(background, 1.0 - (fy / size as f32) * 0.35)
        }
    })
}

/// Paysage stylisé (ciel en dégradé, horizon ondulé, sol).
pub fn landscape(sky: Rgb, ground: Rgb, width: u32, height: u32) -> Vec<u8> {
    png(width, height, |x, y| {
        let horizon = height as f32 * 0.62 + (x as f32 / 11.0).sin() * 6.0;
        if (y as f32) < horizon {
            let t = y as f32 / horizon;
            [
                (sky[0] as f32 + (235.0 - sky[0] as f32) * t) as u8,
                (sky[1] as f32 + (235.0 - sky[1] as f32) * t) as u8,
                (sky[2] as f32 + (240.0 - sky[2] as f32) * t) as u8,
            ]
        } else {
            ground
        }
    })
}

/// Bandes verticales de couleurs.
pub fn swatches(colors: &[Rgb], width: u32, height: u32) -> Vec<u8> {
    let band = (width as usize).div_ceil(colors.len()).max(1);
    png(width, height, |x, _| colors[(x as usize / band).min(colors.len() - 1)])
}

// ----------------------------------------------------------------------------
// Document Word minimal (.docx)
// ----------------------------------------------------------------------------

/// Fichier Word lisible par Word, LibreOffice et l'aperçu de GANIS. Un
/// paragraphe par élément ; un paragraphe qui commence par « # » devient un
/// titre (en gras).
pub fn docx(paragraphs: &[String]) -> AppResult<Vec<u8>> {
    let escape = |text: &str| text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    let body: String = paragraphs
        .iter()
        .map(|p| match p.strip_prefix("# ") {
            Some(title) => format!(
                r#"<w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
                escape(title)
            ),
            None => format!(r#"<w:p><w:r><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#, escape(p)),
        })
        .collect();
    let files = [
        (
            "[Content_Types].xml",
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#.to_owned(),
        ),
        (
            "_rels/.rels",
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#.to_owned(),
        ),
        (
            "word/document.xml",
            format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}</w:body></w:document>"#),
        ),
    ];
    let failed = |e: &dyn std::fmt::Display| AppError::internal(format!("Document Word d'exemple : {e}"));
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (name, content) in files {
        zip.start_file(name, options).map_err(|e| failed(&e))?;
        zip.write_all(content.as_bytes()).map_err(|e| failed(&e))?;
    }
    Ok(zip.finish().map_err(|e| failed(&e))?.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn images_are_valid_png() {
        for spec in [
            ImageSpec::Portrait { background: [1, 2, 3], figure: [200, 100, 50] },
            ImageSpec::Landscape { sky: [10, 20, 30], ground: [40, 50, 60], width: 320, height: 200 },
            ImageSpec::Swatches { colors: vec![[255, 0, 0], [0, 255, 0], [0, 0, 255]], width: 100, height: 40 },
        ] {
            let bytes = spec.png().unwrap();
            assert!(bytes.starts_with(b"\x89PNG\r\n\x1a\n"));
            assert_eq!(crate::services::document_service::mime_of("x.png", &bytes), "image/png");
        }
        assert!(ImageSpec::Landscape { sky: [0; 3], ground: [0; 3], width: 0, height: 10 }.png().is_err());
        assert!(ImageSpec::Swatches { colors: vec![], width: 10, height: 10 }.png().is_err());
    }

    #[test]
    fn docx_is_a_zip_with_the_text() {
        let bytes = docx(&["# Titre".to_owned(), "Un & deux <trois>".to_owned()]).unwrap();
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        let mut xml = String::new();
        std::io::Read::read_to_string(&mut archive.by_name("word/document.xml").unwrap(), &mut xml).unwrap();
        assert!(xml.contains("Un &amp; deux &lt;trois&gt;"));
        assert!(xml.contains("<w:b/>"));
    }
}
