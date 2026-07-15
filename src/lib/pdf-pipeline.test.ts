import { PDFDocument, PDFHexString, PDFString } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { convertPdfToRoll20 } from './converter';
import { decodeTextObject, extractSheetFields, PdfExtractionError } from './pdf-extractor';
import type { Vttes1Character } from './roll20-builder';
import { buildDdbStylePdf } from './testing/ddb-fixture';

export function assertSeraphineCharacter(character: Vttes1Character) {
  expect(character.schema_version).toBe(1);
  expect(character.name).toBe('Seraphine Duskwhisper');
  expect(character.avatar).toBe('');
  expect(character.bio).toContain('Feywild');
  expect(character.bio).toContain('Darkvision');

  const byName = new Map(character.attribs.map((a) => [a.name, a]));

  // Abilities and saves ("•" marker → proficient).
  expect(byName.get('strength')?.current).toBe(8);
  expect(byName.get('strength_mod')?.current).toBe(-1);
  expect(byName.get('wisdom')?.current).toBe(18);
  expect(byName.get('wisdom_save_bonus')?.current).toBe(7);
  expect(byName.get('wisdom_save_prof')?.current).toBe('(@{pb})');
  expect(byName.get('intelligence_save_prof')?.current).toBe('(@{pb})');
  expect(byName.get('charisma_save_prof')).toBeUndefined();

  // Skills: "P" → proficient, "E" → expertise (type multiplier 2).
  expect(byName.get('arcana_prof')?.current).toBe('(@{pb}*@{arcana_type})');
  expect(byName.get('arcana_type')).toBeUndefined();
  expect(byName.get('history_prof')?.current).toBe('(@{pb}*@{history_type})');
  expect(byName.get('history_type')?.current).toBe('2');
  expect(byName.get('history_bonus')?.current).toBe(9);
  expect(byName.get('stealth_bonus')?.current).toBe(2);
  expect(byName.get('stealth_prof')).toBeUndefined();

  // Combat block.
  expect(byName.get('ac')?.current).toBe(18);
  expect(byName.get('initiative_bonus')?.current).toBe(2);
  expect(byName.get('speed')?.current).toBe(30);
  expect(byName.get('hp')).toMatchObject({ current: 38, max: 45 });
  expect(byName.get('hp_temp')).toBeUndefined(); // "--" carries no number
  expect(byName.get('pb')?.current).toBe(3);
  expect(byName.get('passive_wisdom')?.current).toBe(17);

  // Multiclass hit dice: "5d8 + 2d6" → 7 total, primary die d8.
  expect(byName.get('hit_dice')).toMatchObject({ current: '7', max: '7' });
  expect(byName.get('hitdietype')?.current).toBe('d8');

  expect(byName.get('deathsave_succ1')?.current).toBe('on');
  expect(byName.get('deathsave_succ2')?.current).toBe('on');
  expect(byName.get('deathsave_succ3')).toBeUndefined();
  expect(byName.get('deathsave_fail1')?.current).toBe('on');

  // Identity. XP is "(Milestone)" → no experience attribute.
  expect(byName.get('class')?.current).toBe('Cleric');
  expect(byName.get('class_display')?.current).toBe('Cleric 5 / Wizard 2');
  expect(byName.get('level')?.current).toBe(7);
  expect(byName.get('base_level')?.current).toBe(5);
  expect(byName.get('race')?.current).toBe('High Elf');
  expect(byName.get('background')?.current).toBe('Sage');
  expect(byName.get('alignment')?.current).toBe('Neutral Good');
  expect(byName.get('experience')).toBeUndefined();
  expect(byName.get('inspiration')?.current).toBe('on');
  expect(byName.get('npc')?.current).toBe(0);

  expect(byName.get('cp')?.current).toBe(15);
  expect(byName.get('gp')?.current).toBe(125);

  // Itemized inventory with per-item weight (stack weight / qty).
  const itemNames = character.attribs.filter((a) => a.name.endsWith('_itemname'));
  expect(itemNames.map((a) => a.current).sort()).toEqual(
    ['Bolts', 'Spellbook', 'Stone of Good Luck (Luckstone)'].sort()
  );
  const bolts = itemNames.find((a) => a.current === 'Bolts')!;
  const boltsPrefix = bolts.name.replace(/_itemname$/, '');
  expect(byName.get(`${boltsPrefix}_itemcount`)?.current).toBe(20);
  expect(byName.get(`${boltsPrefix}_itemweight`)?.current).toBe(0.075);
  const luckstone = itemNames.find((a) => String(a.current).startsWith('Stone of Good Luck'))!;
  const luckstonePrefix = luckstone.name.replace(/_itemname$/, '');
  expect(byName.get(`${luckstonePrefix}_itemmodifiers`)?.current).toBe('Attuned');

  expect(byName.get('simpletraits')?.current).toBe('simple');
  expect(byName.get('features_and_traits')?.current).toContain('CLERIC FEATURES');
  expect(byName.get('features_and_traits')?.current).toContain('WIZARD FEATURES');

  // Attacks, including flat damage and notes.
  const attackNames = character.attribs.filter((a) => a.name.endsWith('_atkname'));
  expect(attackNames.map((a) => a.current).sort()).toEqual(
    ['Fire Bolt', 'Mace', 'Unarmed Strike'].sort()
  );
  const mace = attackNames.find((a) => a.current === 'Mace')!;
  const macePrefix = mace.name.replace(/_atkname$/, '');
  expect(byName.get(`${macePrefix}_dmgbase`)?.current).toBe('1d6-1');
  expect(byName.get(`${macePrefix}_dmgtype`)?.current).toBe('Bludgeoning');
  expect(byName.get(`${macePrefix}_atk_desc`)?.current).toBe('Simple');

  // Spellcasting header: primary class of "Cleric / Wizard" drives ability/DC.
  expect(byName.get('spellcasting_ability')?.current).toBe('@{wisdom_mod}+');
  expect(byName.get('spell_save_dc')?.current).toBe(15);
  expect(byName.get('spell_attack_bonus')?.current).toBe(7);

  // Slot totals come from "N Slots" headers; pact slots are added in.
  expect(byName.get('lvl1_slots_total')?.current).toBe(4);
  expect(byName.get('lvl1_slots_expended')?.current).toBe(4);
  expect(byName.get('lvl2_slots_total')?.current).toBe(5);

  const spellNames = character.attribs.filter((a) => a.name.endsWith('_spellname'));
  // "Bless" appears twice in the PDF (page break duplicate) — deduped.
  expect(spellNames.map((a) => a.current).sort()).toEqual(
    ['Bless', 'Detect Magic', 'Fire Bolt', 'Magic Missile', 'Misty Step', 'Sacred Flame'].sort()
  );

  const spellByName = (name: string) => {
    const attr = spellNames.find((a) => a.current === name)!;
    return attr.name.replace(/_spellname$/, '');
  };

  // Level blocks: cantrips, then 1st level continuing ACROSS the page break.
  expect(spellByName('Sacred Flame')).toMatch(/^repeating_spell-cantrip_/);
  expect(spellByName('Magic Missile')).toMatch(/^repeating_spell-1_/);
  expect(spellByName('Misty Step')).toMatch(/^repeating_spell-2_/);

  const bless = spellByName('Bless');
  expect(bless).toMatch(/^repeating_spell-1_/);
  expect(byName.get(`${bless}_spellprepared`)?.current).toBe('1');
  expect(byName.get(`${bless}_spellconcentration`)?.current).toBe('{{concentration=1}}');
  expect(byName.get(`${bless}_spellcomp_m`)?.current).toBe('{{m=1}}');
  expect(byName.get(`${bless}_spellclass`)?.current).toBe('Cleric');

  const detectMagic = spellByName('Detect Magic');
  expect(byName.get(`${detectMagic}_spellritual`)?.current).toBe('{{ritual=1}}');

  const sacredFlame = spellByName('Sacred Flame');
  expect(byName.get(`${sacredFlame}_spellsave`)?.current).toBe('Dexterity');
  const fireBolt = spellByName('Fire Bolt');
  expect(byName.get(`${fireBolt}_spellsave`)).toBeUndefined();
  expect(byName.get(`${fireBolt}_spelldescription`)?.current).toContain('PHB 242');

  // VTTES v1 hard requirements: every attrib carries name/current/max.
  for (const a of character.attribs) {
    expect(typeof a.name).toBe('string');
    expect(a.name.length).toBeGreaterThan(0);
    expect(a.current).not.toBeUndefined();
    expect(a.max).not.toBeUndefined();
  }
}

describe('convertPdfToRoll20 (end to end)', () => {
  it('converts a DDB-style export (widgets, no AcroForm) into a VTTES v1 character', async () => {
    const pdf = await buildDdbStylePdf();

    // Precondition: the fixture reproduces the real exports' defining quirk —
    // pdf-lib's form API must see nothing.
    const doc = await PDFDocument.load(pdf);
    expect(() => doc.getForm().getFields()).not.toThrow();
    expect(doc.getForm().getFields()).toHaveLength(0);

    const character = await convertPdfToRoll20(pdf);
    assertSeraphineCharacter(character);
  });

  it('rejects files that are not PDFs', async () => {
    const notAPdf = new TextEncoder().encode('{"character": {"name": "old json"}}');
    await expect(extractSheetFields(notAPdf)).rejects.toBeInstanceOf(PdfExtractionError);
  });

  it('decodes hex strings that PDFsharp wraps with embedded newlines', () => {
    // "Te" in UTF-16BE with a line break inside the hex data — per spec the
    // whitespace must be ignored; pdf-lib's own decodeText() garbles this.
    expect(decodeTextObject(PDFHexString.of('FEFF0054\n0065'))).toBe('Te');
    expect(decodeTextObject(PDFString.of('plain'))).toBe('plain');
  });

  it('rejects PDFs without any widget annotations (flattened/printed exports)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const flat = await doc.save();
    await expect(extractSheetFields(flat)).rejects.toThrow(/no character data/i);
  });
});
