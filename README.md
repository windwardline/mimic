# Mimic

Convert **D&D Beyond character sheet PDF exports** into JSON files you can import into **Roll20**.

D&D Beyond's "Export to PDF" produces a form-fillable PDF based on the official WotC 5e character sheet template. Mimic reads the AcroForm field values straight out of that PDF — no OCR, no scraping — and rebuilds the character as a [VTT Enhancement Suite](https://justas-d.github.io/roll20-enhancement-suite/) (`schema_version: 1`) JSON file targeting the **D&D 5th Edition by Roll20** character sheet.

## Usage

1. In D&D Beyond, open your character sheet and choose **Export to PDF**. Upload the PDF as-is — printed or flattened copies lose their form data.
2. Drop the PDF on [the app](http://localhost:3000). A `roll20_<name>.json` file downloads.
3. In Roll20 (with the VTT Enhancement Suite browser extension installed), open the **Journal** tab and use the **Import Character** button to load the JSON.

## What gets converted

- Identity: name, class & level (multiclass supported), race, background, alignment, XP, inspiration
- Abilities: scores, modifiers, saving throw bonuses + proficiencies
- All 18 skills with bonuses + proficiencies
- Combat: AC, initiative, speed, HP (current/max/temp), hit dice, death saves, proficiency bonus, passive Perception
- The three weapon rows → `repeating_attack` entries
- Spellcasting: class, ability, save DC, attack bonus, slots per level, and every spell name (with prepared state) → `repeating_spell-*` entries
- Currency, equipment, proficiencies & languages, personality/ideals/bonds/flaws, features & traits
- Details page: appearance, allies, faction, backstory, treasure

Free-text blocks (equipment, features) are imported in the sheet's "simple" text mode, since the PDF has no structured item data.

## Development

```bash
npm run dev        # start the dev server
npm test           # run the test suite
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

The test suite builds synthetic PDFs with the exact WotC field names (including their trailing-space quirks). To also test against the real template, download the [official fillable sheet](https://media.wizards.com/2016/dnd/downloads/5E_CharacterSheet_Fillable.pdf) (not committed — it's WotC's file) and run:

```bash
WOTC_TEMPLATE_PDF=/path/to/5E_CharacterSheet_Fillable.pdf npm test
```

## How it works

| Stage | Module | Job |
| --- | --- | --- |
| Extract | `src/lib/pdf-extractor.ts` | pdf-lib AcroForm read, whitespace-normalized field names |
| Parse | `src/lib/sheet-parser.ts` | raw fields → typed `CharacterSheet` model |
| Build | `src/lib/roll20-builder.ts` | model → VTTES v1 JSON with OGL-sheet attribute names |

`src/lib/wotc-fields.ts` holds the field map for the WotC template, including the geometry-derived identities of the anonymous "Check Box NN" fields (save/skill proficiencies, death saves, spell prepared markers) and the spell-page level layout.
