# CARPEO

Site public et back-office pour la réservation de nettoyage textile. Le serveur Node sans dépendance externe fournit une base SQLite persistante, des réservations/devis, un planning, un suivi client sécurisé, les contacts, le pipeline CRM, les tarifs partagés, les tâches, les messages en file, les exports CSV/ICS, l'audit et les sauvegardes.

En production sur Vercel, `api/[...path].mjs` utilise Supabase PostgreSQL. SQLite reste uniquement le moteur de développement local.

## Démarrage local

Node 22.5 ou plus récent est requis.

```powershell
$env:CARPEO_ADMIN_EMAIL="admin@carpeo.local"
$env:CARPEO_ADMIN_PASSWORD="un-mot-de-passe-long-et-unique"
node server.mjs
```

Ouvrir `http://127.0.0.1:8787`. Le back-office est disponible dans `/admin.html`. Le premier démarrage crée l'administrateur uniquement si la base ne contient encore aucun utilisateur.

## Production

- Créer un projet Supabase puis exécuter `supabase/schema.sql` dans le SQL Editor.
- Créer le premier utilisateur dans Supabase Authentication, puis exécuter la commande commentée à la fin du schéma pour lui attribuer le rôle `admin`.
- Ajouter `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` dans les variables Vercel. La clé service ne doit jamais être exposée au navigateur.
- Copier `.env.example` vers les variables secrètes de l'hébergeur, sans committer `.env`.
- Monter `/data` sur un volume persistant et sauvegardé.
- Mettre le service derrière HTTPS et un reverse proxy.
- Renseigner les clés Stripe puis déclarer `/api/stripe/webhook` comme webhook Stripe.
- Renseigner les identifiants des fournisseurs e-mail/SMS/WhatsApp Business/Instagram avant d'activer les envois externes.
- Configurer les vrais identifiants GA4/GTM/Meta/Google Ads dans `js/config.js` après validation du consentement.

## Vérification

```powershell
node --check server.mjs
node --test tests/backend.test.mjs
```
