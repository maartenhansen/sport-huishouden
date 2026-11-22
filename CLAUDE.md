# Sport & Huishouden: werkafspraken

Persoonlijke PWA (vanilla JS, geen build-stap) voor het plannen en loggen van sport en huishoudtaken.
De gebruiker spreekt Nederlands en is beginner met Claude Code; leg stappen eenvoudig uit.

## Omgevingen

| | Live | Dev |
|---|---|---|
| Site | https://dailyplanner.hansen-tools.be | https://dev-dailyplanner.hansen-tools.be |
| Git | branch `main` → remote `origin` (maartenhansen/sport-huishouden) | branch `develop` → remote `dev` (maartenhansen/sport-huishouden-dev), gepusht als `develop:main` |
| Supabase | project `cyvuznstxbqjlflyjrgd` (echte gegevens) | apart dev-project (testgegevens) |

- `config.js` kiest de omgeving op basis van `location.hostname`. Alles wat geen live-host is (ook `localhost`) is **dev**.
- In dev staan lokale opslagsleutels met het achtervoegsel `-dev`, een DEV-label in beeld en het oranje icoon (`manifest-dev.webmanifest`).
- Publiceren gebeurt via `.github/workflows/pages.yml` (GitHub Actions) bij een push naar `main` van de betreffende repository. Er is geen CNAME-bestand; het domein staat per repository in Settings → Pages.
- Geheime sleutels staan in `../sport-huishouden-geheimen/push-sleutels.txt`, **buiten** de repository. Nooit committen en nooit in de chat tonen.

## Werkwijze voor elke wijziging

1. **Altijd op `develop` werken.** Nooit rechtstreeks op `main` committen.
2. Lokaal testen (launch-config `sport-huishouden`, poort 8000 = dev-omgeving), daarna publiceren naar dev:
   `git push origin develop` (back-up van de branch) en `git push dev develop:main` (dev-site).
3. Database-wijzigingen: een nieuw bestand `supabase/migrations/NNN_omschrijving.sql`. De gebruiker voert het eerst uit in het **dev**-project. Wijzigingen aan de Edge Function eerst deployen in dev.
4. De gebruiker test op de dev-site, ook op de gsm via de DEV-app.
5. **Pas na uitdrukkelijke goedkeuring van de gebruiker** naar live. Zie Release.

Test met testgegevens alleen in dev. Raak de live-database en de live-sessie niet aan zonder vraag van de gebruiker.

## Release naar live (alleen na goedkeuring)

1. Versienummer kiezen volgens SemVer: PATCH (fix of kleine verbetering), MINOR (nieuwe functionaliteit), MAJOR (brekend).
2. Op `develop`: `version.js` aanpassen en in `CHANGELOG.md` een sectie `## [x.y.z] - JJJJ-MM-DD` toevoegen. Committen.
3. Als er migraties of functiewijzigingen zijn: de gebruiker voert ze **eerst** uit in het **live**-Supabase-project. Geef de exacte stappen.
4. `git switch main && git merge --ff-only develop`, daarna `git tag -a vx.y.z -m "Versie x.y.z"`.
5. `git push origin main` en `git push origin vx.y.z`.
6. GitHub-release aanmaken met de CHANGELOG-sectie als notities (`gh release create`).
7. Controleren dat de live-site de nieuwe versie toont (de versie staat onderaan Geschiedenis), en daarna `git switch develop`.

## Structuur

- `index.html`, `styles.css`, `app.js` (schermen en logica), `sync.js` (Supabase-login en synchronisatie), `config.js`, `version.js`, `sw.js` (offline en pushmeldingen)
- `supabase/schema.sql` (tabellen + RLS), `supabase/push.sql` (meldingen + pg_cron, gebruikt Vault-secrets `project_url`, `publishable_key`, `cron_secret`), `supabase/functions/daily-summary/index.ts` (Edge Function)
- Commit-berichten in het Nederlands.
