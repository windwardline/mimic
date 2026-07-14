import { describe, expect, it } from 'vitest';
import type { ExtractedSheet } from './pdf-extractor';
import {
  parseAbilityName,
  parseCharacterSheet,
  parseClassLevel,
  parseNumber,
} from './sheet-parser';

const emptySheet = (): ExtractedSheet => ({ text: new Map(), checked: new Map() });

describe('parseNumber', () => {
  it('parses plain integers', () => {
    expect(parseNumber('17')).toBe(17);
  });

  it('parses signed bonuses like "+7" and "-1"', () => {
    expect(parseNumber('+7')).toBe(7);
    expect(parseNumber('-1')).toBe(-1);
  });

  it('extracts the number from "30 ft."', () => {
    expect(parseNumber('30 ft.')).toBe(30);
  });

  it('returns null for empty or non-numeric values', () => {
    expect(parseNumber(undefined)).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('N/A')).toBeNull();
  });
});

describe('parseClassLevel', () => {
  it('parses a single class', () => {
    expect(parseClassLevel('Wizard 5')).toEqual([{ name: 'Wizard', level: 5 }]);
  });

  it('parses multiclass with slashes', () => {
    expect(parseClassLevel('Fighter 3 / Rogue 2')).toEqual([
      { name: 'Fighter', level: 3 },
      { name: 'Rogue', level: 2 },
    ]);
  });

  it('parses names with no space before the level', () => {
    expect(parseClassLevel('Barbarian3')).toEqual([{ name: 'Barbarian', level: 3 }]);
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
    expect(parseAbilityName('wis')).toBe('wisdom');
  });

  it('returns null for unknown values', () => {
    expect(parseAbilityName('Luck')).toBeNull();
    expect(parseAbilityName(undefined)).toBeNull();
  });
});

describe('parseCharacterSheet', () => {
  it('derives the ability modifier from the score when the mod box is empty', () => {
    const sheet = emptySheet();
    sheet.text.set('STR', '18');
    const parsed = parseCharacterSheet(sheet);
    expect(parsed.abilities.strength).toEqual({ score: 18, mod: 4 });
  });

  it('prefers the explicit modifier over the derived one', () => {
    const sheet = emptySheet();
    sheet.text.set('DEX', '15');
    sheet.text.set('DEXmod', '+3');
    const parsed = parseCharacterSheet(sheet);
    expect(parsed.abilities.dexterity).toEqual({ score: 15, mod: 3 });
  });

  it('reads save proficiency from the geometry-mapped checkboxes', () => {
    const sheet = emptySheet();
    sheet.text.set('ST Intelligence', '+7');
    sheet.checked.set('Check Box 20', true);
    const parsed = parseCharacterSheet(sheet);
    expect(parsed.saves.intelligence).toEqual({ bonus: 7, proficient: true });
    expect(parsed.saves.strength.proficient).toBe(false);
  });

  it('maps skill fields and proficiency boxes', () => {
    const sheet = emptySheet();
    sheet.text.set('SleightofHand', '+5');
    sheet.checked.set('Check Box 38', true);
    const parsed = parseCharacterSheet(sheet);
    const skill = parsed.skills.find((s) => s.roll20 === 'sleight_of_hand');
    expect(skill).toEqual({ roll20: 'sleight_of_hand', bonus: 5, proficient: true });
  });

  it('collects filled weapon rows and skips empty ones', () => {
    const sheet = emptySheet();
    sheet.text.set('Wpn Name', 'Dagger');
    sheet.text.set('Wpn1 AtkBonus', '+5');
    sheet.text.set('Wpn1 Damage', '1d4+2 piercing');
    const parsed = parseCharacterSheet(sheet);
    expect(parsed.weapons).toEqual([
      { name: 'Dagger', atkBonus: '+5', damage: '1d4+2 piercing' },
    ]);
  });

  it('assigns spells to their level block with prepared state', () => {
    const sheet = emptySheet();
    sheet.text.set('Spells 1014', 'Fire Bolt'); // cantrip block
    sheet.text.set('Spells 1015', 'Magic Missile'); // level-1 block
    sheet.checked.set('Check Box 251', true);
    sheet.text.set('SlotsTotal 19', '4');
    sheet.text.set('SlotsRemaining 19', '3');
    const parsed = parseCharacterSheet(sheet);
    expect(parsed.spells).toEqual([
      { name: 'Fire Bolt', level: 'cantrip', prepared: false },
      { name: 'Magic Missile', level: '1', prepared: true },
    ]);
    expect(parsed.spellSlots).toEqual([{ level: 1, total: 4, remaining: 3 }]);
  });

  it('counts death save pips', () => {
    const sheet = emptySheet();
    sheet.checked.set('Check Box 12', true);
    sheet.checked.set('Check Box 13', true);
    sheet.checked.set('Check Box 15', true);
    const parsed = parseCharacterSheet(sheet);
    expect(parsed.deathSaveSuccesses).toBe(2);
    expect(parsed.deathSaveFailures).toBe(1);
  });

  it('totals multiclass levels', () => {
    const sheet = emptySheet();
    sheet.text.set('ClassLevel', 'Fighter 3 / Rogue 2');
    const parsed = parseCharacterSheet(sheet);
    expect(parsed.totalLevel).toBe(5);
    expect(parsed.classes).toHaveLength(2);
  });
});
