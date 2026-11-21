# Récupération du mot de passe par code e-mail (Supabase)

Si on oublie son mot de passe, un code à 6 chiffres envoyé par e-mail permet
d'en choisir un nouveau **sans perdre ses projets privés**.

## Comment ça marche

- Quand on active la récupération (à l'inscription ou dans Paramètres ›
  Compte), GANIS crée un verrou `email` qui enferme la clé du compte avec un
  secret aléatoire de 32 octets. Ce secret est envoyé à Supabase (table
  `recovery_escrow`), puis effacé de l'ordinateur.
- En cas de mot de passe oublié, on demande un code et on le saisit. Supabase
  renvoie alors le secret, qui ouvre le verrou. Le nouveau mot de passe
  referme ensuite la clé du compte.
- Supabase seul ne peut rien ouvrir, car les projets chiffrés restent sur
  l'ordinateur. L'ordinateur seul non plus, car le secret est sur le
  serveur.
- **Attention :** une personne qui a accès à la boîte mail *et* à
  l'ordinateur peut ouvrir le compte.

## Mise en place

1. Créez un projet sur [supabase.com](https://supabase.com).
2. Dans **SQL Editor**, exécutez [`recovery_escrow.sql`](recovery_escrow.sql).
3. Dans **Authentication › Sign In / Providers › Email** :
   - Email activé ;
   - « Confirm email » activé ;
   - durée du code (*Email OTP Expiration*) : 600 s par exemple.
4. Dans **Authentication › Emails › Templates**, modèle **Magic Link** :
   remplacez le lien par le code, par exemple :
   ```html
   <h2>Votre code GANIS</h2>
   <p>Saisissez ce code dans GANIS : <strong>{{ .Token }}</strong></p>
   <p>Si vous n'avez rien demandé, ignorez ce message.</p>
   ```
   Faites de même pour le modèle **Confirm signup**, qui sert à la première
   activation d'une adresse.
5. Dans **Authentication › Emails › SMTP Settings**, branchez un vrai
   service d'envoi (Resend, Brevo, Postmark…). Le service intégré de
   Supabase n'envoie que quelques e-mails par heure.
6. Dans **Project Settings › API**, copiez l'URL et la clé `anon` dans un
   fichier `.env` à la racine du projet (voir `.env.example`). N'y mettez
   jamais la clé `service_role`.
7. Relancez `npm run tauri dev`. Les éléments suivants apparaissent alors :
   le lien « Mot de passe oublié ? », l'étape du code à l'inscription et la
   carte « Récupération par e-mail » dans les paramètres.

Sans `.env`, toute la fonction reste cachée et GANIS marche comme avant.
