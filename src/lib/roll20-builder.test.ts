import { describe, expect, it } from 'vitest';
import type { ExtractedSheet } from './pdf-extractor';
import { parseCharacterSheet } from './sheet-parser';
import { buildRoll20Character, generateRowId, Vttes1Character } from './roll20-builder';

function sheetFrom(text: Record<string, string>, checked: string[] = []) {
  const extracted: ExtractedSheet = {
    text: new Map(Object.entries(text)),
    checked: new Map(checked.map((name) => [name, true])),
  };
  return parseCharacterSheet(extracted);
}

function attrib(character: Vttes1Character, name: string) {
  return character.attribs.find((a) => a.name === name);
}

let rowCounter = 0;
const stableRowId = () => `-TESTROW${String(rowCounter++).padStart(11, '0')}`;

describe('buildRoll20Character', () => {
  it('emits the VTTES schema_version 1 shape with top-level fields', () => {
    const character = buildRoll20Character(sheetFrom({ CharacterName: 'Elaria' }));
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
    const character = buildRoll20Character(sheetFrom({ STR: '10' }));
    expect(character.name).toBe('Unnamed Character');
  });

  it('writes ability scores, bases and modifiers', () => {
    const character = buildRoll20Character(sheetFrom({ INT: '18', INTmod: '+4' }));
    expect(attrib(character, 'intelligence')?.current).toBe(18);
    expect(attrib(character, 'intelligence_base')?.current).toBe(18);
    expect(attrib(character, 'intelligence_mod')?.current).toBe(4);
  });

  it('marks save proficiency with the sheet checkbox formula', () => {
    const character = buildRoll20Character(
      sheetFrom({ 'ST Intelligence': '+7' }, ['Check Box 20'])
    );
    expect(attrib(character, 'intelligence_save_bonus')?.current).toBe(7);
    expect(attrib(character, 'intelligence_save_prof')?.current).toBe('(@{pb})');
  });

  it('marks skill proficiency with the per-skill formula', () => {
    const character = buildRoll20Character(sheetFrom({ Arcana: '+7' }, ['Check Box 25']));
    expect(attrib(character, 'arcana_bonus')?.current).toBe(7);
    expect(attrib(character, 'arcana_prof')?.current).toBe('(@{pb}*@{arcana_type})');
  });

  it('stores hp with current and max on one attribute', () => {
    const character = buildRoll20Character(sheetFrom({ HPMax: '32', HPCurrent: '28' }));
    expect(attrib(character, 'hp')).toEqual({ name: 'hp', current: 28, max: 32 });
  });

  it('defaults hp current to max when the current box is blank', () => {
    const character = buildRoll20Character(sheetFrom({ HPMax: '32' }));
    expect(attrib(character, 'hp')).toEqual({ name: 'hp', current: 32, max: 32 });
  });

  it('parses hit dice into count and die type', () => {
    const character = buildRoll20Character(sheetFrom({ HD: '3', HDTotal: '5d6' }));
    expect(attrib(character, 'hit_dice')).toEqual({ name: 'hit_dice', current: '3', max: '5' });
    expect(attrib(character, 'hitdietype')?.current).toBe('d6');
  });

  it('maps identity fields and marks the character as a PC', () => {
    const character = buildRoll20Character(
      sheetFrom({
        ClassLevel: 'Wizard 5',
        Race: 'High Elf',
        Background: 'Sage',
        Alignment: 'Neutral Good',
        XP: '6500',
      })
    );
    expect(attrib(character, 'class')?.current).toBe('Wizard');
    expect(attrib(character, 'level')?.current).toBe(5);
    expect(attrib(character, 'race')?.current).toBe('High Elf');
    expect(attrib(character, 'background')?.current).toBe('Sage');
    expect(attrib(character, 'alignment')?.current).toBe('Neutral Good');
    expect(attrib(character, 'experience')?.current).toBe(6500);
    expect(attrib(character, 'npc')?.current).toBe(0);
  });

  it('creates repeating attack rows with parsed damage', () => {
    rowCounter = 0;
    const character = buildRoll20Character(
      sheetFrom({
        'Wpn Name': 'Dagger',
        'Wpn1 AtkBonus': '+5',
        'Wpn1 Damage': '1d4 + 2 piercing',
      }),
      stableRowId
    );
    const nameAttr = character.attribs.find(
      (a) => /^repeating_attack_-[\w-]+_atkname$/.test(a.name)
    );
    expect(nameAttr?.current).toBe('Dagger');
    const prefix = nameAttr!.name.replace(/_atkname$/, '');
    expect(attrib(character, `${prefix}_atkbonus`)?.current).toBe('+5');
    expect(attrib(character, `${prefix}_dmgbase`)?.current).toBe('1d4+2');
    expect(attrib(character, `${prefix}_dmgtype`)?.current).toBe('piercing');
  });

  it('creates repeating spell rows in the right level section', () => {
    rowCounter = 0;
    const character = buildRoll20Character(
      sheetFrom(
        {
          'Spells 1014': 'Fire Bolt',
          'Spells 1015': 'Magic Missile',
          'SlotsTotal 19': '4',
          'SlotsRemaining 19': '3',
          'SpellcastingAbility 2': 'INT',
          'SpellSaveDC 2': '15',
          'SpellAtkBonus 2': '+7',
        },
        ['Check Box 251']
      ),
      stableRowId
    );
    const cantrip = character.attribs.find(
      (a) => a.name.startsWith('repeating_spell-cantrip_') && a.name.endsWith('_spellname')
    );
    expect(cantrip?.current).toBe('Fire Bolt');
    const lvl1 = character.attribs.find(
      (a) => a.name.startsWith('repeating_spell-1_') && a.name.endsWith('_spellname')
    );
    expect(lvl1?.current).toBe('Magic Missile');
    const lvl1Prefix = lvl1!.name.replace(/_spellname$/, '');
    expect(attrib(character, `${lvl1Prefix}_spellprepared`)?.current).toBe('1');
    expect(attrib(character, 'lvl1_slots_total')?.current).toBe(4);
    expect(attrib(character, 'lvl1_slots_expended')?.current).toBe(3);
    expect(attrib(character, 'spellcasting_ability')?.current).toBe('@{intelligence_mod}+');
    expect(attrib(character, 'spell_save_dc')?.current).toBe(15);
    expect(attrib(character, 'spell_attack_bonus')?.current).toBe(7);
  });

  it('switches traits and inventory to simple mode when free text is present', () => {
    const character = buildRoll20Character(
      sheetFrom({
        'Features and Traits': 'Arcane Recovery',
        Equipment: 'Spellbook, component pouch',
      })
    );
    expect(attrib(character, 'simpletraits')?.current).toBe('simple');
    expect(attrib(character, 'features_and_traits')?.current).toBe('Arcane Recovery');
    expect(attrib(character, 'simpleinventory')?.current).toBe('simple');
    expect(attrib(character, 'equipment')?.current).toBe('Spellbook, component pouch');
  });

  it('escapes HTML in the generated bio', () => {
    const character = buildRoll20Character(
      sheetFrom({ Backstory: 'Raised by <wolves> & wizards' })
    );
    expect(character.bio).toContain('Raised by &lt;wolves&gt; &amp; wizards');
  });

  it('never emits attribs with empty names or missing values', () => {
    const character = buildRoll20Character(
      sheetFrom({
        CharacterName: 'Elaria',
        STR: '8',
        AC: '12',
        GP: '125',
      })
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
