import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { convertPdfToRoll20 } from './converter';
import { extractSheetFields, PdfExtractionError } from './pdf-extractor';
import type { Vttes1Character } from './roll20-builder';
import { buildDdbStylePdf } from './testing/wizard-fixture';

export function assertWizardCharacter(character: Vttes1Character) {
  expect(character.schema_version).toBe(1);
  expect(character.name).toBe('Elaria Moonwhisper');
  expect(character.avatar).toBe('');
  expect(character.bio).toContain('Feywild');

  const byName = new Map(character.attribs.map((a) => [a.name, a]));
  expect(byName.get('strength')?.current).toBe(8);
  expect(byName.get('strength_mod')?.current).toBe(-1);
  expect(byName.get('intelligence')?.current).toBe(18);
  expect(byName.get('intelligence_save_prof')?.current).toBe('(@{pb})');
  expect(byName.get('wisdom_save_prof')?.current).toBe('(@{pb})');
  expect(byName.get('charisma_save_prof')).toBeUndefined();
  expect(byName.get('arcana_prof')?.current).toBe('(@{pb}*@{arcana_type})');
  expect(byName.get('stealth_bonus')?.current).toBe(2);
  expect(byName.get('stealth_prof')).toBeUndefined();
  expect(byName.get('ac')?.current).toBe(12);
  expect(byName.get('initiative_bonus')?.current).toBe(2);
  expect(byName.get('speed')?.current).toBe(30);
  expect(byName.get('hp')).toMatchObject({ current: 28, max: 32 });
  expect(byName.get('hp_temp')?.current).toBe(5);
  expect(byName.get('hit_dice')).toMatchObject({ current: '4', max: '5' });
  expect(byName.get('hitdietype')?.current).toBe('d6');
  expect(byName.get('pb')?.current).toBe(3);
  expect(byName.get('passive_wisdom')?.current).toBe(13);
  expect(byName.get('class')?.current).toBe('Wizard');
  expect(byName.get('level')?.current).toBe(5);
  expect(byName.get('race')?.current).toBe('High Elf');
  expect(byName.get('experience')?.current).toBe(6500);
  expect(byName.get('inspiration')?.current).toBe('on');
  expect(byName.get('deathsave_succ1')?.current).toBe('on');
  expect(byName.get('deathsave_succ2')).toBeUndefined();
  expect(byName.get('gp')?.current).toBe(125);
  expect(byName.get('other_proficiencies_and_languages')?.current).toBe(
    'Common, Elvish, Draconic'
  );
  expect(byName.get('spellcasting_ability')?.current).toBe('@{intelligence_mod}+');
  expect(byName.get('spell_save_dc')?.current).toBe(15);
  expect(byName.get('lvl1_slots_total')?.current).toBe(4);
  expect(byName.get('lvl1_slots_expended')?.current).toBe(3);
  expect(byName.get('lvl3_slots_expended')?.current).toBe(1);

  const spellNames = character.attribs.filter((a) => a.name.endsWith('_spellname'));
  expect(spellNames.map((a) => a.current).sort()).toEqual(
    ['Fire Bolt', 'Fireball', 'Mage Hand', 'Magic Missile', 'Misty Step', 'Shield'].sort()
  );
  const fireball = spellNames.find((a) => a.current === 'Fireball');
  expect(fireball?.name).toMatch(/^repeating_spell-3_/);
  const magicMissile = spellNames.find((a) => a.current === 'Magic Missile');
  const mmPrefix = magicMissile!.name.replace(/_spellname$/, '');
  expect(byName.get(`${mmPrefix}_spellprepared`)?.current).toBe('1');

  const attackNames = character.attribs.filter((a) => a.name.endsWith('_atkname'));
  expect(attackNames.map((a) => a.current).sort()).toEqual(['Dagger', 'Fire Bolt']);

  // VTTES v1 hard requirements: every attrib carries name/current/max.
  for (const a of character.attribs) {
    expect(typeof a.name).toBe('string');
    expect(a.current).not.toBeUndefined();
    expect(a.max).not.toBeUndefined();
  }
}

describe('convertPdfToRoll20 (end to end)', () => {
  it('converts a filled DDB-style PDF into a VTTES v1 character', async () => {
    const pdf = await buildDdbStylePdf();
    const character = await convertPdfToRoll20(pdf);
    assertWizardCharacter(character);
  });

  it('rejects files that are not PDFs', async () => {
    const notAPdf = new TextEncoder().encode('{"character": {"name": "old json"}}');
    await expect(extractSheetFields(notAPdf)).rejects.toBeInstanceOf(PdfExtractionError);
  });

  it('rejects PDFs without any form fields (flattened/printed exports)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const flat = await doc.save();
    await expect(extractSheetFields(flat)).rejects.toThrow(/form fields/i);
  });
});
