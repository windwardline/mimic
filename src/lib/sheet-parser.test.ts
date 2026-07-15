import { describe, expect, it } from 'vitest';
import type { ExtractedField, ExtractedSheet } from './pdf-extractor';
import {
  parseAbilityName,
  parseCharacterSheet,
  parseClassLevel,
  parseHitDice,
  parseNumber,
  parseSlotTotal,
  parseSpellLevelHeader,
} from './sheet-parser';

type Entry = [name: string, value: string | boolean, page?: number];

/** Builds an ExtractedSheet from ordered entries, mirroring the extractor. */
function sheetOf(entries: Entry[]): ExtractedSheet {
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
  return { fields, text, checked };
}

describe('parseNumber', () => {
  it('parses plain integers', () => {
    expect(parseNumber('17')).toBe(17);
  });

  it('parses signed bonuses like "+7" and "-1"', () => {
    expect(parseNumber('+7')).toBe(7);
    expect(parseNumber('-1')).toBe(-1);
  });

  it('extracts the number from "30 ft. (Walking)"', () => {
    expect(parseNumber('30 ft. (Walking)')).toBe(30);
  });

  it('returns null for empty, placeholder or non-numeric values', () => {
    expect(parseNumber(undefined)).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('--')).toBeNull();
    expect(parseNumber('(Milestone)')).toBeNull();
  });
});

describe('parseClassLevel', () => {
  it('parses a single class', () => {
    expect(parseClassLevel('Wizard 5')).toEqual([{ name: 'Wizard', level: 5 }]);
  });

  it('parses multi-word homebrew classes', () => {
    expect(parseClassLevel('Monster Hunter 7')).toEqual([{ name: 'Monster Hunter', level: 7 }]);
  });

  it('parses multiclass with slashes', () => {
    expect(parseClassLevel('Cleric 10 / Warlock 4')).toEqual([
      { name: 'Cleric', level: 10 },
      { name: 'Warlock', level: 4 },
    ]);
  });

  it('returns empty for free text without levels', () => {
    expect(parseClassLevel('')).toEqual([]);
    expect(parseClassLevel('Wizard')).toEqual([]);
  });
});

describe('parseAbilityName', () => {
  it('accepts full names and abbreviations, case-insensitively', () => {
    expect(parseAbilityName('Intelligence')).toBe('intelligence');
    expect(parseAbilityName('INT')).toBe('intelligence');
    expect(parseAbilityName('wis ')).toBe('wisdom');
  });

  it('returns null for unknown values', () => {
    expect(parseAbilityName('Luck')).toBeNull();
    expect(parseAbilityName(undefined)).toBeNull();
  });
});

describe('parseHitDice', () => {
  it('parses a single-class pool', () => {
    expect(parseHitDice('5d6', '')).toMatchObject({ total: 5, dieType: 'd6', remaining: null });
  });

  it('sums multiclass pools and keeps the primary die', () => {
    expect(parseHitDice('10d8 + 4d8', '')).toMatchObject({ total: 14, dieType: 'd8' });
    expect(parseHitDice('5d8 + 2d6', '')).toMatchObject({ total: 7, dieType: 'd8' });
  });

  it('reads the remaining count when present', () => {
    expect(parseHitDice('7d10', '3')).toMatchObject({ total: 7, remaining: 3 });
  });

  it('returns nulls for empty input', () => {
    expect(parseHitDice('', '')).toMatchObject({ total: null, dieType: null });
  });
});

describe('parseSpellLevelHeader', () => {
  it('recognizes the cantrip and numbered level blocks', () => {
    expect(parseSpellLevelHeader('=== CANTRIPS ===')).toBe('cantrip');
    expect(parseSpellLevelHeader('=== 1st LEVEL ===')).toBe('1');
    expect(parseSpellLevelHeader('=== 2nd LEVEL ===')).toBe('2');
    expect(parseSpellLevelHeader('=== 9th LEVEL ===')).toBe('9');
  });

  it('returns null for anything else', () => {
    expect(parseSpellLevelHeader('')).toBeNull();
    expect(parseSpellLevelHeader('(At Will)')).toBeNull();
  });
});

describe('parseSlotTotal', () => {
  it('parses plain slot counts', () => {
    expect(parseSlotTotal('4 Slots OOOO')).toBe(4);
  });

  it('adds pact magic slots to the total', () => {
    expect(parseSlotTotal('3 Slots OOO | 2 Pact OO')).toBe(5);
  });

  it('returns null for at-will and free text', () => {
    expect(parseSlotTotal('(At Will)')).toBeNull();
    expect(parseSlotTotal('')).toBeNull();
  });
});

describe('parseCharacterSheet', () => {
  it('derives the ability modifier from the score when the mod box is empty', () => {
    const parsed = parseCharacterSheet(sheetOf([['STR', '18']]));
    expect(parsed.abilities.strength).toEqual({ score: 18, mod: 4 });
  });

  it('prefers the explicit modifier over the derived one', () => {
    const parsed = parseCharacterSheet(
      sheetOf([
        ['DEX', '15'],
        ['DEXmod', '+3'],
      ])
    );
    expect(parsed.abilities.dexterity).toEqual({ score: 15, mod: 3 });
  });

  it('reads save proficiency from the "•" marker fields', () => {
    const parsed = parseCharacterSheet(
      sheetOf([
        ['ST Intelligence', '+7'],
        ['IntProf', '•'],
        ['ST Strength', '-1'],
        ['StrProf', ''],
      ])
    );
    expect(parsed.saves.intelligence).toEqual({ bonus: 7, proficient: true });
    expect(parsed.saves.strength.proficient).toBe(false);
  });

  it('maps skill "P"/"E" markers to proficiency and expertise', () => {
    const parsed = parseCharacterSheet(
      sheetOf([
        ['SleightofHand', '+5'],
        ['SleightOfHandProf', 'P'],
        ['Stealth', '+8'],
        ['StealthProf', 'E'],
        ['Arcana', '+1'],
        ['ArcanaProf', ''],
      ])
    );
    const byKey = new Map(parsed.skills.map((s) => [s.roll20, s]));
    expect(byKey.get('sleight_of_hand')).toMatchObject({ bonus: 5, proficient: true, expertise: false });
    expect(byKey.get('stealth')).toMatchObject({ bonus: 8, proficient: true, expertise: true });
    expect(byKey.get('arcana')).toMatchObject({ bonus: 1, proficient: false, expertise: false });
  });

  it('treats "(Milestone)" experience as no XP value', () => {
    const parsed = parseCharacterSheet(sheetOf([['EXPERIENCE POINTS', '(Milestone)']]));
    expect(parsed.xp).toBeNull();
  });

  it('collects filled weapon rows with notes and skips empty ones', () => {
    const parsed = parseCharacterSheet(
      sheetOf([
        ['Wpn Name', 'Dagger'],
        ['Wpn1 AtkBonus', '+5'],
        ['Wpn1 Damage', '1d4+2 Piercing'],
        ['Wpn Notes 1', 'Finesse, Light'],
      ])
    );
    expect(parsed.weapons).toEqual([
      { name: 'Dagger', atkBonus: '+5', damage: '1d4+2 Piercing', notes: 'Finesse, Light' },
    ]);
  });

  it('collects itemized equipment with quantity and stack weight', () => {
    const parsed = parseCharacterSheet(
      sheetOf([
        ['Eq Name0', 'Rations'],
        ['Eq Qty0', '10'],
        ['Eq Weight0', '20 lb.'],
        ['Eq Name1', ''],
      ])
    );
    expect(parsed.equipmentItems).toEqual([{ name: 'Rations', qty: 10, weight: '20 lb.' }]);
  });

  it('joins the FeaturesTraits columns in numeric order', () => {
    const parsed = parseCharacterSheet(
      sheetOf([
        ['FeaturesTraits2', 'second block'],
        ['FeaturesTraits1', 'first block'],
      ])
    );
    expect(parsed.featuresAndTraits).toBe('first block\nsecond block');
  });

  it('orders FeaturesTraits page-first when continuation pages reuse indices', () => {
    // Real multi-page exports repeat FeaturesTraits4-6 on every overflow page.
    const parsed = parseCharacterSheet(
      sheetOf([
        ['FeaturesTraits4', 'p3 col1', 1],
        ['FeaturesTraits5', 'p3 col2', 1],
        ['FeaturesTraits4', 'p4 col1', 2],
      ])
    );
    expect(parsed.featuresAndTraits).toBe('p3 col1\np3 col2\np4 col1');
  });

  it('counts death save pips', () => {
    const parsed = parseCharacterSheet(
      sheetOf([
        ['Check Box 12', true],
        ['Check Box 13', true],
        ['Check Box 15', true],
      ])
    );
    expect(parsed.deathSaveSuccesses).toBe(2);
    expect(parsed.deathSaveFailures).toBe(1);
  });

  it('totals multiclass levels from the CLASS LEVEL field', () => {
    const parsed = parseCharacterSheet(sheetOf([['CLASS LEVEL', 'Fighter 3 / Rogue 2']]));
    expect(parsed.totalLevel).toBe(5);
    expect(parsed.classes).toHaveLength(2);
  });

  it('assigns spell rows to the current level block, carrying it across pages', () => {
    const parsed = parseCharacterSheet(
      sheetOf([
        ['spellHeader0', '=== CANTRIPS ===', 0],
        ['spellName0', 'Fire Bolt', 0],
        ['spellPrepared0', 'O', 0],
        ['spellHeader1', '=== 1st LEVEL ===', 0],
        ['spellSlotHeader1', '4 Slots OOOO', 0],
        ['spellName1', 'Bless', 0],
        ['spellPrepared1', 'P', 0],
        // Page 2 restarts row numbering with NO header: still 1st level.
        ['spellName0', 'Magic Missile', 1],
        ['spellPrepared0', 'O', 1],
        ['spellHeader2', '=== 2nd LEVEL ===', 1],
        ['spellSlotHeader2', '3 Slots OOO | 2 Pact OO', 1],
        ['spellName1', 'Misty Step', 1],
        ['spellPrepared1', 'O', 1],
      ])
    );
    expect(parsed.spells).toMatchObject([
      { name: 'Fire Bolt', level: 'cantrip', prepared: false },
      { name: 'Bless', level: '1', prepared: true },
      { name: 'Magic Missile', level: '1', prepared: false },
      { name: 'Misty Step', level: '2', prepared: false },
    ]);
    expect(parsed.spellSlots).toEqual([
      { level: 1, total: 4 },
      { level: 2, total: 5 },
    ]);
  });

  it('strips the ritual tag from spell names and dedupes repeated spells', () => {
    const parsed = parseCharacterSheet(
      sheetOf([
        ['spellHeader1', '=== 1st LEVEL ===', 0],
        ['spellName0', 'Detect Magic [R]', 0],
        ['spellPrepared0', 'O', 0],
        ['spellName1', 'Detect Magic [R]', 0],
        ['spellPrepared1', 'P', 0],
      ])
    );
    expect(parsed.spells).toHaveLength(1);
    expect(parsed.spells[0]).toMatchObject({
      name: 'Detect Magic',
      ritual: true,
      prepared: true, // merged from the duplicate row
    });
  });

  it('uses the primary class for multiclass spellcasting headers', () => {
    const parsed = parseCharacterSheet(
      sheetOf([
        ['spellCastingClass0', 'Cleric / Warlock'],
        ['spellCastingAbility0', 'WIS / CHA'],
        ['spellSaveDC0', '19 / 17'],
        ['spellAtkBonus0', '+11 / +9'],
      ])
    );
    expect(parsed.spellcastingClass).toBe('Cleric / Warlock');
    expect(parsed.spellcastingAbility).toBe('wisdom');
    expect(parsed.spellSaveDc).toBe(19);
    expect(parsed.spellAtkBonus).toBe(11);
  });
});
