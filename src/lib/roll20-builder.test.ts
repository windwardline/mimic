import { describe, expect, it } from 'vitest';
import type { ExtractedField, ExtractedSheet } from './pdf-extractor';
import { parseCharacterSheet } from './sheet-parser';
import { buildRoll20Character, generateRowId, Vttes1Character } from './roll20-builder';

type Entry = [name: string, value: string | boolean, page?: number];

function sheetFrom(entries: Entry[]) {
  const fields: ExtractedField[] = entries.map(([name, value, page], i) => ({
    name,
    value,
    page: page ?? 0,
    x: 0,
    y: 100000 - i,
  }));
  const text = new Map<string, string>();
  const checked = new Map<string, boolean>();
  for (const field of fields) {
    if (typeof field.value === 'boolean') {
      checked.set(field.name, (checked.get(field.name) ?? false) || field.value);
    } else if (field.value.trim() !== '' && !text.has(field.name)) {
      text.set(field.name, field.value.trim());
    }
  }
  const extracted: ExtractedSheet = { fields, text, checked };
  return parseCharacterSheet(extracted);
}

function attrib(character: Vttes1Character, name: string) {
  return character.attribs.find((a) => a.name === name);
}

let rowCounter = 0;
const stableRowId = () => `-TESTROW${String(rowCounter++).padStart(11, '0')}`;

describe('buildRoll20Character', () => {
  it('emits the VTTES schema_version 1 shape with top-level fields', () => {
    const character = buildRoll20Character(sheetFrom([['CharacterName', 'Elaria']]));
    expect(character.schema_version).toBe(1);
    expect(character.name).toBe('Elaria');
    expect(character).toHaveProperty('avatar');
    expect(character).toHaveProperty('bio');
    expect(Array.isArray(character.attribs)).toBe(true);
    // v1 importer rejects any attrib missing one of these three keys.
    for (const a of character.attribs) {
      expect(a).toHaveProperty('name');
      expect(a).toHaveProperty('current');
      expect(a).toHaveProperty('max');
    }
  });

  it('falls back to a placeholder name so the import never fails validation', () => {
    const character = buildRoll20Character(sheetFrom([['STR', '10']]));
    expect(character.name).toBe('Unnamed Character');
  });

  it('writes ability scores, bases and modifiers', () => {
    const character = buildRoll20Character(
      sheetFrom([
        ['INT', '18'],
        ['INTmod', '+4'],
      ])
    );
    expect(attrib(character, 'intelligence')?.current).toBe(18);
    expect(attrib(character, 'intelligence_base')?.current).toBe(18);
    expect(attrib(character, 'intelligence_mod')?.current).toBe(4);
  });

  it('marks save proficiency from the "•" marker with the sheet formula', () => {
    const character = buildRoll20Character(
      sheetFrom([
        ['ST Intelligence', '+7'],
        ['IntProf', '•'],
      ])
    );
    expect(attrib(character, 'intelligence_save_bonus')?.current).toBe(7);
    expect(attrib(character, 'intelligence_save_prof')?.current).toBe('(@{pb})');
  });

  it('marks skill proficiency and expertise with the per-skill formula', () => {
    const character = buildRoll20Character(
      sheetFrom([
        ['Arcana', '+7'],
        ['ArcanaProf', 'P'],
        ['Stealth', '+9'],
        ['StealthProf', 'E'],
      ])
    );
    expect(attrib(character, 'arcana_bonus')?.current).toBe(7);
    expect(attrib(character, 'arcana_prof')?.current).toBe('(@{pb}*@{arcana_type})');
    expect(attrib(character, 'arcana_type')).toBeUndefined();
    expect(attrib(character, 'stealth_prof')?.current).toBe('(@{pb}*@{stealth_type})');
    expect(attrib(character, 'stealth_type')?.current).toBe('2');
  });

  it('stores hp with current and max on one attribute', () => {
    const character = buildRoll20Character(
      sheetFrom([
        ['MaxHP', '32'],
        ['CurrentHP', '28'],
      ])
    );
    expect(attrib(character, 'hp')).toEqual({ name: 'hp', current: 28, max: 32 });
  });

  it('defaults hp current to max when the current box is blank', () => {
    const character = buildRoll20Character(sheetFrom([['MaxHP', '32']]));
    expect(attrib(character, 'hp')).toEqual({ name: 'hp', current: 32, max: 32 });
  });

  it('parses multiclass hit dice into count and primary die type', () => {
    const character = buildRoll20Character(sheetFrom([['Total', '5d8 + 2d6']]));
    expect(attrib(character, 'hit_dice')).toEqual({ name: 'hit_dice', current: '7', max: '7' });
    expect(attrib(character, 'hitdietype')?.current).toBe('d8');
  });

  it('maps identity fields and marks the character as a PC', () => {
    const character = buildRoll20Character(
      sheetFrom([
        ['CLASS LEVEL', 'Wizard 5'],
        ['RACE', 'High Elf'],
        ['BACKGROUND', 'Sage'],
        ['ALIGNMENT', 'Neutral Good'],
        ['EXPERIENCE POINTS', '6500'],
      ])
    );
    expect(attrib(character, 'class')?.current).toBe('Wizard');
    expect(attrib(character, 'level')?.current).toBe(5);
    expect(attrib(character, 'race')?.current).toBe('High Elf');
    expect(attrib(character, 'background')?.current).toBe('Sage');
    expect(attrib(character, 'alignment')?.current).toBe('Neutral Good');
    expect(attrib(character, 'experience')?.current).toBe(6500);
    expect(attrib(character, 'npc')?.current).toBe(0);
  });

  it('creates repeating attack rows with parsed damage and notes', () => {
    rowCounter = 0;
    const character = buildRoll20Character(
      sheetFrom([
        ['Wpn Name', 'Dagger'],
        ['Wpn1 AtkBonus', '+5'],
        ['Wpn1 Damage', '1d4 + 2 Piercing'],
        ['Wpn Notes 1', 'Finesse, Light'],
      ]),
      stableRowId
    );
    const nameAttr = character.attribs.find((a) =>
      /^repeating_attack_-[\w-]+_atkname$/.test(a.name)
    );
    expect(nameAttr?.current).toBe('Dagger');
    const prefix = nameAttr!.name.replace(/_atkname$/, '');
    expect(attrib(character, `${prefix}_atkbonus`)?.current).toBe('+5');
    expect(attrib(character, `${prefix}_dmgbase`)?.current).toBe('1d4+2');
    expect(attrib(character, `${prefix}_dmgtype`)?.current).toBe('Piercing');
    expect(attrib(character, `${prefix}_atk_desc`)?.current).toBe('Finesse, Light');
  });

  it('handles flat weapon damage like an unarmed strike', () => {
    rowCounter = 0;
    const character = buildRoll20Character(
      sheetFrom([
        ['Wpn Name', 'Unarmed Strike'],
        ['Wpn1 AtkBonus', '+7'],
        ['Wpn1 Damage', '5 Bludgeoning'],
      ]),
      stableRowId
    );
    const nameAttr = character.attribs.find((a) => a.name.endsWith('_atkname'));
    const prefix = nameAttr!.name.replace(/_atkname$/, '');
    expect(attrib(character, `${prefix}_dmgbase`)?.current).toBe('5');
    expect(attrib(character, `${prefix}_dmgtype`)?.current).toBe('Bludgeoning');
  });

  it('creates repeating inventory rows with per-item weight', () => {
    rowCounter = 0;
    const character = buildRoll20Character(
      sheetFrom([
        ['Eq Name0', 'Bolts'],
        ['Eq Qty0', '20'],
        ['Eq Weight0', '1.5 lb.'],
      ]),
      stableRowId
    );
    const nameAttr = character.attribs.find((a) => a.name.endsWith('_itemname'));
    expect(nameAttr?.current).toBe('Bolts');
    const prefix = nameAttr!.name.replace(/_itemname$/, '');
    expect(attrib(character, `${prefix}_itemcount`)?.current).toBe(20);
    expect(attrib(character, `${prefix}_itemweight`)?.current).toBe(0.075);
  });

  it('creates repeating spell rows with details in the right level section', () => {
    rowCounter = 0;
    const character = buildRoll20Character(
      sheetFrom([
        ['spellCastingClass0', 'Wizard'],
        ['spellCastingAbility0', 'INT'],
        ['spellSaveDC0', '15'],
        ['spellAtkBonus0', '+7'],
        ['spellHeader0', '=== CANTRIPS ==='],
        ['spellName0', 'Fire Bolt'],
        ['spellPrepared0', 'O'],
        ['spellHeader1', '=== 1st LEVEL ==='],
        ['spellSlotHeader1', '4 Slots OOOO'],
        ['spellName1', 'Bless'],
        ['spellPrepared1', 'P'],
        ['spellComponents1', 'V,S,M'],
        ['spellDuration1', 'Concentration, up to 1 minute'],
        ['spellSaveHit1', 'WIS 15'],
      ]),
      stableRowId
    );
    const cantrip = character.attribs.find(
      (a) => a.name.startsWith('repeating_spell-cantrip_') && a.name.endsWith('_spellname')
    );
    expect(cantrip?.current).toBe('Fire Bolt');
    const lvl1 = character.attribs.find(
      (a) => a.name.startsWith('repeating_spell-1_') && a.name.endsWith('_spellname')
    );
    expect(lvl1?.current).toBe('Bless');
    const lvl1Prefix = lvl1!.name.replace(/_spellname$/, '');
    expect(attrib(character, `${lvl1Prefix}_spellprepared`)?.current).toBe('1');
    expect(attrib(character, `${lvl1Prefix}_spellconcentration`)?.current).toBe(
      '{{concentration=1}}'
    );
    expect(attrib(character, `${lvl1Prefix}_spellcomp_v`)?.current).toBe('{{v=1}}');
    expect(attrib(character, `${lvl1Prefix}_spellcomp_m`)?.current).toBe('{{m=1}}');
    expect(attrib(character, `${lvl1Prefix}_spellsave`)?.current).toBe('Wisdom');
    expect(attrib(character, 'lvl1_slots_total')?.current).toBe(4);
    expect(attrib(character, 'lvl1_slots_expended')?.current).toBe(4);
    expect(attrib(character, 'spellcasting_ability')?.current).toBe('@{intelligence_mod}+');
    expect(attrib(character, 'spell_save_dc')?.current).toBe(15);
    expect(attrib(character, 'spell_attack_bonus')?.current).toBe(7);
  });

  it('switches traits to simple mode when feature text is present', () => {
    const character = buildRoll20Character(
      sheetFrom([['FeaturesTraits1', '=== WIZARD FEATURES ===\n* Arcane Recovery']])
    );
    expect(attrib(character, 'simpletraits')?.current).toBe('simple');
    expect(attrib(character, 'features_and_traits')?.current).toContain('Arcane Recovery');
  });

  it('escapes HTML in the generated bio', () => {
    const character = buildRoll20Character(
      sheetFrom([['Backstory', 'Raised by <wolves> & wizards']])
    );
    expect(character.bio).toContain('Raised by &lt;wolves&gt; &amp; wizards');
  });

  it('never emits attribs with empty names or missing values', () => {
    const character = buildRoll20Character(
      sheetFrom([
        ['CharacterName', 'Elaria'],
        ['STR', '8'],
        ['AC', '12'],
        ['GP', '125'],
      ])
    );
    for (const a of character.attribs) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.current).not.toBeNull();
      expect(a.current).not.toBe('');
      expect(a.max).not.toBeNull();
    }
  });
});

describe('generateRowId', () => {
  it('produces Roll20-style row ids', () => {
    const id = generateRowId();
    expect(id).toMatch(/^-[A-Za-z0-9]{19}$/);
  });
});
