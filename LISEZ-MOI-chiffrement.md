# GANIS — Chiffrement des données et clé de récupération

Copiez le contenu de cette archive à la racine du projet GANIS en
remplaçant les fichiers existants (47 fichiers : 34 modifiés, 13 nouveaux).

## Avant de compiler

- **Windows** : installez Strawberry Perl (https://strawberryperl.com).
  OpenSSL, utilisé par SQLCipher, est compilé avec l'application et en a besoin.
  Le premier `npm run tauri dev` sera plus long (quelques minutes).
- macOS / Linux : rien à installer.
- Aucune nouvelle dépendance npm. Côté Rust, Cargo télécharge tout seul :
  chacha20poly1305, zeroize, base64, tauri-plugin-dialog, et SQLCipher
  (via libsqlite3-sys).

## Vérifier

    cd src-tauri && cargo test --lib     # 59 tests
    npm test                             # 28 tests

## Au premier lancement

- Les comptes existants reçoivent leur clé de récupération à leur prochaine
  connexion (écran « Vos données sont maintenant chiffrées »).
- Leurs projets sont chiffrés à ce moment-là, sans perte, même si
  l'application est fermée en plein milieu.

## Ce qui est chiffré

| Donnée                                   | Chiffrement                      |
|------------------------------------------|----------------------------------|
| Base de chaque projet (`project.db`)     | SQLCipher, une clé par projet    |
| Nom et description des projets           | Clé du compte                    |
| Adresse e-mail                           | Clé du compte                    |

Reste lisible dans `app.db`, car nécessaire pour se connecter ou sans valeur :
nom d'utilisateur, empreinte du mot de passe (Argon2id, irréversible), rôle,
dates, type / statut / favori des projets, thèmes créés (packages).

Détail de l'organisation des clés : `src-tauri/src/security/mod.rs`.
