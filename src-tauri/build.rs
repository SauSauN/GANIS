fn main() {
    // `sqlx::migrate!` embarque les fichiers SQL à la compilation :
    // sans cette directive, un nouveau fichier de migration n'est pas
    // toujours détecté par Cargo.
    println!("cargo:rerun-if-changed=migrations");

    tauri_build::build()
}