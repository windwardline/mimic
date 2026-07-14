import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { convertPdfToRoll20 } from './converter';
import { assertWizardCharacter } from './pdf-pipeline.test';
import { fillRealTemplate } from './testing/wizard-fixture';

/**
 * Opt-in integration test against the real WotC form-fillable template —
 * the exact file D&D Beyond's "Export to PDF" is built on. The template is
 * not committed (it's WotC's copyrighted material); download it from
 * https://media.wizards.com/2016/dnd/downloads/5E_CharacterSheet_Fillable.pdf
 * and run:
 *
 *   WOTC_TEMPLATE_PDF=/path/to/5E_CharacterSheet_Fillable.pdf npm test
 */
const templatePath = process.env.WOTC_TEMPLATE_PDF;

describe.skipIf(!templatePath)('real WotC template integration', () => {
  it('fills the official template and converts it end to end', async () => {
    const template = await readFile(templatePath!);
    const filled = await fillRealTemplate(new Uint8Array(template));
    const character = await convertPdfToRoll20(filled);
    assertWizardCharacter(character);
    expect(character.attribs.length).toBeGreaterThan(60);
  });
});
