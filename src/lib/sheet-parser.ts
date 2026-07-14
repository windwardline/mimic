import type { ExtractedSheet } from './pdf-extractor';
import {
  ABILITIES,
  AbilityKey,
  DEATH_SAVE_BOXES,
  FIELDS,
  SAVES,
  SKILLS,
  SPELL_LEVELS,
  SPELL_PREPARED_BOXES,
  WEAPON_ROWS,
} from './wotc-fields';

export interface ClassEntry {
  name: string;
  level: number;
}

export interface SkillEntry {
  roll20: string;
  bonus: number | null;
  proficient: boolean;
}

export interface WeaponEntry {
  name: string;
  atkBonus: string;
  damage: string;
}

export interface SpellEntry {
  name: string;
  level: string; // "cantrip" | "1".."9"
  prepared: boolean;
}

export interface SpellSlots {
  level: number;
  total: number | null;
  remaining: number | null;
}

export interface CharacterSheet {
  name: string;
  playerName: string;
  classes: ClassEntry[];
  classLevelRaw: string;
  totalLevel: number | null;
  background: string;
  race: string;
  alignment: string;
  xp: number | null;
  inspiration: boolean;
  profBonus: number | null;

  abilities: Record<AbilityKey, { score: number | null; mod: number | null }>;
  saves: Record<AbilityKey, { bonus: number | null; proficient: boolean }>;
  skills: SkillEntry[];

  ac: number | null;
  initiative: number | null;
  speed: number | null;
  hpMax: number | null;
  hpCurrent: number | null;
  hpTemp: number | null;
  hitDice: string;
  hitDiceTotal: string;
  passivePerception: number | null;
  deathSaveSuccesses: number;
  deathSaveFailures: number;

  weapons: WeaponEntry[];
  attacksText: string;

  currency: { cp: number | null; sp: number | null; ep: number | null; gp: number | null; pp: number | null };
  equipment: string;
  proficienciesAndLanguages: string;

  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  featuresAndTraits: string;

  appearance: { age: string; height: string; weight: string; eyes: string; skin: string; hair: string };
  allies: string;
  factionName: string;
  backstory: string;
  additionalFeatures: string;
  treasure: string;

  spellcastingClass: string;
  spellcastingAbility: AbilityKey | null;
  spellSaveDc: number | null;
  spellAtkBonus: number | null;
  spells: SpellEntry[];
  spellSlots: SpellSlots[];
}

/** First signed integer in a string ("+7" → 7, "30 ft." → 30), else null. */
export function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/-?\d+/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * "Wizard 5", "Fighter 3 / Rogue 2", "Barbarian3" → class entries.
 * Class names may contain letters, spaces, apostrophes and hyphens.
 */
export function parseClassLevel(raw: string): ClassEntry[] {
  const entries: ClassEntry[] = [];
  const pattern = /([A-Za-z][A-Za-z' -]*?)\s*(\d+)/g;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    const name = match[1].replace(/[/,|]+/g, ' ').trim();
    if (!name) continue;
    entries.push({ name, level: parseInt(match[2], 10) });
  }
  return entries;
}

const ABILITY_NAME_LOOKUP: Record<string, AbilityKey> = {
  str: 'strength', strength: 'strength',
  dex: 'dexterity', dexterity: 'dexterity',
  con: 'constitution', constitution: 'constitution',
  int: 'intelligence', intelligence: 'intelligence',
  wis: 'wisdom', wisdom: 'wisdom',
  cha: 'charisma', charisma: 'charisma',
};

export function parseAbilityName(raw: string | undefined): AbilityKey | null {
  if (!raw) return null;
  return ABILITY_NAME_LOOKUP[raw.trim().toLowerCase()] ?? null;
}

export function parseCharacterSheet(sheet: ExtractedSheet): CharacterSheet {
  const get = (name: string) => sheet.text.get(name) ?? '';
  const isChecked = (name: string) => sheet.checked.get(name) === true;

  const abilities = {} as CharacterSheet['abilities'];
  for (const { key, scoreField, modField } of ABILITIES) {
    const score = parseNumber(sheet.text.get(scoreField));
    let mod = parseNumber(sheet.text.get(modField));
    if (mod === null && score !== null) mod = Math.floor((score - 10) / 2);
    abilities[key] = { score, mod };
  }

  const saves = {} as CharacterSheet['saves'];
  for (const key of Object.keys(SAVES) as AbilityKey[]) {
    const def = SAVES[key];
    saves[key] = {
      bonus: parseNumber(sheet.text.get(def.pdfField)),
      proficient: isChecked(def.pdfProfBox),
    };
  }

  const skills: SkillEntry[] = SKILLS.map((def) => ({
    roll20: def.roll20,
    bonus: parseNumber(sheet.text.get(def.pdfField)),
    proficient: isChecked(def.pdfProfBox),
  }));

  const weapons: WeaponEntry[] = [];
  for (const row of WEAPON_ROWS) {
    const name = get(row.name);
    if (!name) continue;
    weapons.push({ name, atkBonus: get(row.atkBonus), damage: get(row.damage) });
  }

  const spells: SpellEntry[] = [];
  const spellSlots: SpellSlots[] = [];
  for (const levelDef of SPELL_LEVELS) {
    for (const field of levelDef.nameFields) {
      const name = get(field);
      if (!name) continue;
      const preparedBox = SPELL_PREPARED_BOXES[field];
      spells.push({
        name,
        level: levelDef.level,
        prepared: preparedBox ? isChecked(preparedBox) : false,
      });
    }
    if (levelDef.level !== 'cantrip') {
      const total = parseNumber(sheet.text.get(levelDef.slotsTotalField!));
      const remaining = parseNumber(sheet.text.get(levelDef.slotsRemainingField!));
      if (total !== null || remaining !== null) {
        spellSlots.push({ level: parseInt(levelDef.level, 10), total, remaining });
      }
    }
  }

  const classLevelRaw = get(FIELDS.classLevel);
  const classes = parseClassLevel(classLevelRaw);
  const totalLevel = classes.length > 0 ? classes.reduce((sum, c) => sum + c.level, 0) : null;

  const countChecked = (boxes: string[]) => boxes.filter((b) => isChecked(b)).length;

  return {
    name: get(FIELDS.characterName),
    playerName: get(FIELDS.playerName),
    classes,
    classLevelRaw,
    totalLevel,
    background: get(FIELDS.background),
    race: get(FIELDS.race),
    alignment: get(FIELDS.alignment),
    xp: parseNumber(sheet.text.get(FIELDS.xp)),
    inspiration: get(FIELDS.inspiration) !== '' && get(FIELDS.inspiration) !== '0',
    profBonus: parseNumber(sheet.text.get(FIELDS.profBonus)),

    abilities,
    saves,
    skills,

    ac: parseNumber(sheet.text.get(FIELDS.ac)),
    initiative: parseNumber(sheet.text.get(FIELDS.initiative)),
    speed: parseNumber(sheet.text.get(FIELDS.speed)),
    hpMax: parseNumber(sheet.text.get(FIELDS.hpMax)),
    hpCurrent: parseNumber(sheet.text.get(FIELDS.hpCurrent)),
    hpTemp: parseNumber(sheet.text.get(FIELDS.hpTemp)),
    hitDice: get(FIELDS.hd),
    hitDiceTotal: get(FIELDS.hdTotal),
    passivePerception: parseNumber(sheet.text.get(FIELDS.passivePerception)),
    deathSaveSuccesses: countChecked(DEATH_SAVE_BOXES.successes),
    deathSaveFailures: countChecked(DEATH_SAVE_BOXES.failures),

    weapons,
    attacksText: get(FIELDS.attacksText),

    currency: {
      cp: parseNumber(sheet.text.get(FIELDS.cp)),
      sp: parseNumber(sheet.text.get(FIELDS.sp)),
      ep: parseNumber(sheet.text.get(FIELDS.ep)),
      gp: parseNumber(sheet.text.get(FIELDS.gp)),
      pp: parseNumber(sheet.text.get(FIELDS.pp)),
    },
    equipment: get(FIELDS.equipment),
    proficienciesAndLanguages: get(FIELDS.proficienciesLang),

    personalityTraits: get(FIELDS.personalityTraits),
    ideals: get(FIELDS.ideals),
    bonds: get(FIELDS.bonds),
    flaws: get(FIELDS.flaws),
    featuresAndTraits: get(FIELDS.featuresAndTraits),

    appearance: {
      age: get(FIELDS.age),
      height: get(FIELDS.height),
      weight: get(FIELDS.weight),
      eyes: get(FIELDS.eyes),
      skin: get(FIELDS.skin),
      hair: get(FIELDS.hair),
    },
    allies: get(FIELDS.allies),
    factionName: get(FIELDS.factionName),
    backstory: get(FIELDS.backstory),
    additionalFeatures: get(FIELDS.additionalFeatures),
    treasure: get(FIELDS.treasure),

    spellcastingClass: get(FIELDS.spellcastingClass),
    spellcastingAbility: parseAbilityName(sheet.text.get(FIELDS.spellcastingAbility)),
    spellSaveDc: parseNumber(sheet.text.get(FIELDS.spellSaveDc)),
    spellAtkBonus: parseNumber(sheet.text.get(FIELDS.spellAtkBonus)),
    spells,
    spellSlots,
  };
}
