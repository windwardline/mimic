# Mimic

Convert **D&D Beyond character sheet PDF exports** into JSON files you can import into **Roll20**.

D&D Beyond's "Export to PDF" (PDFsharp-generated) stores every value as a form-field *widget annotation* on the page — but without a usable AcroForm catalog entry, so ordinary form APIs see an empty document. Mimic walks the page annotations directly, reads the raw field values — no OCR, no scraping — and rebuilds the character as a [VTT Enhancement Suite](https://justas-d.github.io/roll20-enhancement-suite/) (`schema_version: 1`) JSON file targeting the **D&D 5th Edition by Roll20** character sheet.

Flattened copies (a browser's print-to-PDF, a viewer's "save as") lose the widgets but keep the values in the page text layer at the same positions — Mimic detects this and falls back to a geometry-based text extractor ([flattened-extractor.ts](src/lib/flattened-extractor.ts)) that maps the loose text back onto the template's field rectangles. Everything converts except checkbox state (death saves, inspiration), which flattening reduces to vector art.

## Usage

1. In D&D Beyond, open your character sheet and choose **Export to PDF**. Upload the PDF as-is; flattened copies (print-to-PDF, viewer re-saves) also work, minus death-save/inspiration pips.
2. Drop the PDF on [the app](http://localhost:3000). A `roll20_<name>.json` file downloads.
3. In Roll20 (with the VTT Enhancement Suite browser extension installed), open the **Journal** tab and use the **Import Character** button to load the JSON.

## What gets converted

- Identity: name, class & level (multiclass supported), species, background, alignment, XP (milestone-aware), inspiration
- Abilities: scores, modifiers, saving throw bonuses + "•" proficiency markers
- All 18 skills with bonuses, "P" proficiency and "E" expertise markers (expertise sets the sheet's ×2 multiplier)
- Combat: AC, initiative, speed, HP (current/max/temp), multiclass hit dice ("10d8 + 4d8"), death saves, proficiency bonus, passive Perception
- All six weapon rows (with notes) → `repeating_attack` entries, including flat damage like unarmed strikes
- Spellcasting: class, ability, save DC, attack bonus (multiclass "WIS / CHA" headers use the primary class), slot totals per level (pact magic slots included), and every spell with its level block, always-prepared marker, ritual tag, casting time, range, components, duration, save ability and source → `repeating_spell-*` entries
- Itemized equipment ("Eq Name0"…) → `repeating_inventory` rows with quantity and per-item weight; attuned items flagged
- Currency, proficiencies & languages, personality/ideals/bonds/flaws, features & traits
- Details page: appearance, gender/faith/size, allies & organizations, backstory, additional notes
- Defenses, save modifiers, senses and the actions text land in the character bio

## Development

```bash
npm run dev        # start the dev server
npm test           # run the test suite
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

The test suite builds a synthetic PDF that reproduces the real exports' structure: widget annotations with no AcroForm, duplicated spell-page field names, trailing-space field name quirks, and PDFsharp's newline-wrapped hex strings. To also test against a real export (not committed — it's someone's character), run:

```bash
DDB_EXPORT_PDF=/path/to/Character_12345.pdf npm test
```

## How it works

| Stage | Module | Job |
| --- | --- | --- |
| Extract | `src/lib/pdf-extractor.ts` | walk page /Annots with pdf-lib, decode /T + /V, reading order with page/position |
| Parse | `src/lib/sheet-parser.ts` | raw fields → typed `CharacterSheet` model |
| Build | `src/lib/roll20-builder.ts` | model → VTTES v1 JSON with OGL-sheet attribute names |

`src/lib/ddb-fields.ts` holds the field map observed in real DDB exports: proficiency *text markers* ("•", "P", "E") instead of checkboxes, the six weapon rows, itemized equipment indices, and the spell-page grammar ("=== 3rd LEVEL ===" headers whose blocks continue across page breaks, "4 Slots OOOO | 2 Pact OO" slot lines, "[R]" ritual tags).
