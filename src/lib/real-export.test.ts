import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { convertPdfToRoll20 } from './converter';
import { extractSheetFields } from './pdf-extractor';
import { ABILITIES } from './ddb-fields';

/**
 * Opt-in integration test against a real D&D Beyond export (not committed —
 * it's someone's character). Point it at any file produced by DDB's
 * "Export to PDF" and run:
 *
 *   DDB_EXPORT_PDF=/path/to/Character_12345.pdf npm test
 */
const exportPath = process.env.DDB_EXPORT_PDF;

describe.skipIf(!exportPath)('real D&D Beyond export integration', () => {
  it('extracts the widget fields DDB writes without an AcroForm', async () => {
    const bytes = new Uint8Array(await readFile(exportPath!));
    const extracted = await extractSheetFields(bytes);
    expect(extracted.fields.length).toBeGreaterThan(100);
    expect(extracted.text.get('CharacterName')).toBeTruthy();
    for (const ability of ABILITIES) {
      expect(extracted.text.get(ability.scoreField)).toMatch(/^\d+$/);
    }
  });

  it('converts end to end into a plausible VTTES character', async () => {
    const bytes = new Uint8Array(await readFile(exportPath!));
    const character = await convertPdfToRoll20(bytes);

    expect(character.schema_version).toBe(1);
    expect(character.name.length).toBeGreaterThan(0);
    expect(character.attribs.length).toBeGreaterThan(40);

    const byName = new Map(character.attribs.map((a) => [a.name, a]));
    for (const ability of ABILITIES) {
      const score = byName.get(ability.key)?.current;
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(1);
      expect(score).toBeLessThanOrEqual(30);
    }
    expect(byName.get('hp')).toBeDefined();
    expect(byName.get('npc')?.current).toBe(0);

    for (const a of character.attribs) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.current).not.toBeUndefined();
      expect(a.max).not.toBeUndefined();
    }
  });
});
