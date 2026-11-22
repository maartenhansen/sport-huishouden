# Wijzigingslogboek

Alle noemenswaardige wijzigingen aan Sport & Huishouden.
Versienummers volgen [Semantic Versioning](https://semver.org/lang/nl/):
**MAJOR** (brekende wijziging) . **MINOR** (nieuwe functionaliteit) . **PATCH** (verbetering of foutoplossing).

## [1.0.0] - 2026-11-22

Eerste officiële versie.

### Sport
- Activiteiten plannen (datum, tijd, geplande duur) en loggen (duur, gemiddelde hartslag, intensiteit 1–5, notitie).
- Categorieën: Padel, Tennis, Squash, Joggen, Yoga, Pilates, Krachttraining.
- Knoppen **Gedaan** en **Overgeslagen** bij geplande activiteiten.

### Huishouden
- Taken met herhaling (dagen, weken, maanden of eenmalig) en een kiesbaar icoon (18 icoontjes).
- Knoppen **Gedaan** en **Overgeslagen**; de volgende keer wordt automatisch ingepland.
- Een gemiste herhaling wordt automatisch als "niet gedaan" geregistreerd en vervangen door de volgende.

### Overzicht
- Vandaag-scherm met de secties Te laat, Sport, Huishouden, Binnenkort en Vandaag gedaan.
- Kleuren: rood voor te laat, groen voor vandaag afgewerkt.
- Tellers op de tabbladen voor openstaande sport en taken.
- Geschiedenis met statistieken: afgewerkt-percentages (sport en huishouden), intensiteitsverdeling en minuten per week.
- Export naar CSV en back-up/terugzetten als JSON.

### Cloud en meldingen
- Inloggen en synchroniseren met Supabase (PostgreSQL met Row Level Security), met offline wachtrij.
- Dagoverzicht als pushmelding om 17:30 en 19:00 (Belgische tijd) als er nog iets openstaat.

### Techniek
- Installeerbare web-app (PWA) die offline werkt, gehost op https://dailyplanner.hansen-tools.be.
- Content Security Policy: de app laadt alleen eigen scripts en praat alleen met het eigen Supabase-project.
