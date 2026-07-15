import type { ExtractedSheet } from './pdf-extractor';
import {
  ABILITIES,
  AbilityKey,
  ATTUNED_NAME_PATTERN,
  DEATH_SAVE_BOXES,
  EQUIPMENT_NAME_PATTERN,
  equipmentQtyField,
  equipmentWeightField,
  FEATURES_TRAITS_PATTERN,
  FIELDS,
  parseProfMarker,
  SKILLS,
  SPELL_HEADER_PATTERN,
  SPELL_ROW_PATTERN,
  SPELL_SLOT_HEADER_PATTERN,
  SPELLCASTING_FIELDS,
  SpellRowColumn,
  WEAPON_ROWS,
} from './ddb-fields';

export interface ClassEntry {
  name: string;
  level: number;
}

export interface SkillEntry {
  roll20: string;
  bonus: number | null;
  proficient: boolean;
  expertise: boolean;
}

export interface WeaponEntry {
  name: string;
  atkBonus: string;
  damage: string;
  notes: string;
}

export interface EquipmentItem {
  name: string;
  qty: number | null;
  /** Raw weight text for the whole stack, e.g. "1.5 lb." or "--". */
  weight: string;
}

export interface SpellEntry {
  name: string;
  level: string; // "cantrip" | "1".."9"
  /** True when DDB marks the spell "always prepared" (marker "P"). */
  prepared: boolean;
  ritual: boolean;
  source: string;
  saveHit: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  pageRef: string;
  notes: string;
}

export interface SpellSlots {
  level: number;
  total: number | null;
}

export interface HitDice {
  /** Raw text, e.g. "10d8 + 4d8". */
  raw: string;
  total: number | null;
  remaining: number | null;
  /** Die of the primary (first-listed) class, e.g. "d8". */
  dieType: string | null;
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
  speedRaw: string;
  hpMax: number | null;
  hpCurrent: number | null;
  hpTemp: number | null;
  hitDice: HitDice;
  passivePerception: number | null;
  passiveInsight: number | null;
  passiveInvestigation: number | null;
  senses: string;
  defenses: string;
  saveModifiers: string;
  deathSaveSuccesses: number;
  deathSaveFailures: number;

  weapons: WeaponEntry[];
  actionsText: string;

  currency: { cp: number | null; sp: number | null; ep: number | null; gp: number | null; pp: number | null };
  equipmentItems: EquipmentItem[];
  attunedItems: string[];
  proficienciesAndLanguages: string;

  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  featuresAndTraits: string;

  appearance: {
    gender: string;
    age: string;
    size: string;
    height: string;
    weight: string;
    faith: string;
    eyes: string;
    skin: string;
    hair: string;
  };
  appearanceDescription: string;
  allies: string;
  backstory: string;
  additionalNotes: string;

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
 * "Wizard 5", "Cleric 10 / Warlock 4", "Barbarian3" → class entries.
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

/** "10d8 + 4d8" → { total: 14, dieType: "d8" }. */
export function parseHitDice(raw: string, remainingRaw: string): HitDice {
  const terms = [...raw.matchAll(/(\d+)\s*d\s*(\d+)/gi)];
  const total = terms.length > 0 ? terms.reduce((sum, t) => sum + parseInt(t[1], 10), 0) : null;
  const dieType = terms.length > 0 ? `d${terms[0][2]}` : null;
  return { raw, total, remaining: parseNumber(remainingRaw), dieType };
}

/** "=== CANTRIPS ===" → "cantrip"; "=== 3rd LEVEL ===" → "3"; else null. */
export function parseSpellLevelHeader(header: string): string | null {
  if (/cantrip/i.test(header)) return 'cantrip';
  const match = header.match(/(\d)\s*(?:st|nd|rd|th)?\s*level/i);
  return match ? match[1] : null;
}

/** "4 Slots OOOO" → 4; "3 Slots OOO | 2 Pact OO" → 5; "(At Will)" → null. */
export function parseSlotTotal(header: string): number | null {
  const slots = header.match(/(\d+)\s*slots?/i);
  const pact = header.match(/(\d+)\s*pact/i);
  if (!slots && !pact) return null;
  return (slots ? parseInt(slots[1], 10) : 0) + (pact ? parseInt(pact[1], 10) : 0);
}

interface SpellRow {
  level: string;
  cells: Partial<Record<SpellRowColumn, string>>;
}

function parseSpellPages(extracted: ExtractedSheet): {
  spells: SpellEntry[];
  spellSlots: SpellSlots[];
} {
  // Spell rows are numbered per page and level blocks carry across page
  // breaks, so walk every field in reading order tracking the current level.
  const rows = new Map<string, SpellRow>();
  const slotTotals = new Map<number, number>();
  let currentLevel = 'cantrip'; // the first block on the spell page is always cantrips

  for (const field of extracted.fields) {
    if (typeof field.value !== 'string') continue;
    const value = field.value.trim();

    const header = field.name.match(SPELL_HEADER_PATTERN);
    if (header) {
      const level = value === '' ? null : parseSpellLevelHeader(value);
      if (level !== null) currentLevel = level;
      continue;
    }

    const slotHeader = field.name.match(SPELL_SLOT_HEADER_PATTERN);
    if (slotHeader && value !== '') {
      const level = parseInt(slotHeader[1], 10);
      const total = parseSlotTotal(value);
      if (level >= 1 && level <= 9 && total !== null) slotTotals.set(level, total);
      continue;
    }

    const cell = field.name.match(SPELL_ROW_PATTERN);
    if (!cell) continue;
    const key = `${field.page}:${cell[2]}`;
    let row = rows.get(key);
    if (!row) {
      row = { level: currentLevel, cells: {} };
      rows.set(key, row);
    }
    row.cells[cell[1] as SpellRowColumn] = value;
  }

  const spells: SpellEntry[] = [];
  const seen = new Map<string, SpellEntry>();
  for (const row of rows.values()) {
    const rawName = row.cells.Name?.trim() ?? '';
    if (rawName === '') continue;
    const ritual = /\[R\]\s*$/.test(rawName);
    const name = rawName.replace(/\s*\[R\]\s*$/, '');
    const entry: SpellEntry = {
      name,
      level: row.level,
      prepared: (row.cells.Prepared ?? '').trim().toUpperCase() === 'P',
      ritual,
      source: row.cells.Source ?? '',
      saveHit: row.cells.SaveHit ?? '',
      castingTime: row.cells.CastingTime ?? '',
      range: row.cells.Range ?? '',
      components: row.cells.Components ?? '',
      duration: row.cells.Duration ?? '',
      pageRef: row.cells.Page ?? '',
      notes: row.cells.Notes ?? '',
    };
    // DDB lists some spells more than once (e.g. class list + prepared list);
    // keep one entry per (level, name), preferring the prepared marker.
    const dedupeKey = `${entry.level}|${entry.name.toLowerCase()}`;
    const existing = seen.get(dedupeKey);
    if (existing) {
      existing.prepared = existing.prepared || entry.prepared;
    } else {
      seen.set(dedupeKey, entry);
      spells.push(entry);
    }
  }

  const spellSlots = [...slotTotals.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, total]) => ({ level, total }));

  return { spells, spellSlots };
}

export function parseCharacterSheet(extracted: ExtractedSheet): CharacterSheet {
  const get = (name: string) => extracted.text.get(name) ?? '';
  const isChecked = (name: string) => extracted.checked.get(name) === true;

  const abilities = {} as CharacterSheet['abilities'];
  const saves = {} as CharacterSheet['saves'];
  for (const def of ABILITIES) {
    const score = parseNumber(extracted.text.get(def.scoreField));
    let mod = parseNumber(extracted.text.get(def.modField));
    if (mod === null && score !== null) mod = Math.floor((score - 10) / 2);
    abilities[def.key] = { score, mod };
    saves[def.key] = {
      bonus: parseNumber(extracted.text.get(def.saveField)),
      proficient: parseProfMarker(extracted.text.get(def.saveProfField)).proficient,
    };
  }

  const skills: SkillEntry[] = SKILLS.map((def) => {
    const marker = parseProfMarker(extracted.text.get(def.profField));
    return {
      roll20: def.roll20,
      bonus: parseNumber(extracted.text.get(def.pdfField)),
      proficient: marker.proficient,
      expertise: marker.expertise,
    };
  });

  const weapons: WeaponEntry[] = [];
  for (const row of WEAPON_ROWS) {
    const name = get(row.name);
    if (!name) continue;
    weapons.push({
      name,
      atkBonus: get(row.atkBonus),
      damage: get(row.damage),
      notes: get(row.notes),
    });
  }

  // Itemized equipment ("Eq Name0"…). Indices are unique per page but
  // flattened continuation pages reuse them, so pair qty/weight by page too.
  const samePageValue = (name: string, page: number): string => {
    const field = extracted.fields.find(
      (f) => f.name === name && f.page === page && typeof f.value === 'string'
    );
    return field ? (field.value as string).trim() : '';
  };
  const equipmentItems: EquipmentItem[] = [];
  for (const field of extracted.fields) {
    if (typeof field.value !== 'string' || field.value.trim() === '') continue;
    const match = field.name.match(EQUIPMENT_NAME_PATTERN);
    if (!match) continue;
    const qty = samePageValue(equipmentQtyField(match[1]), field.page);
    equipmentItems.push({
      name: field.value.trim(),
      qty: qty === '' ? null : parseNumber(qty),
      weight: samePageValue(equipmentWeightField(match[1]), field.page),
    });
  }

  const attunedItems: string[] = [];
  for (const field of extracted.fields) {
    if (typeof field.value !== 'string' || field.value.trim() === '') continue;
    if (ATTUNED_NAME_PATTERN.test(field.name)) attunedItems.push(field.value.trim());
  }

  // Feature text flows across "FeaturesTraits1"…"FeaturesTraits6" columns,
  // and continuation pages REUSE names 4-6 — so order page-first, then index.
  const featureParts: { page: number; index: number; text: string }[] = [];
  for (const field of extracted.fields) {
    if (typeof field.value !== 'string' || field.value.trim() === '') continue;
    const match = field.name.match(FEATURES_TRAITS_PATTERN);
    if (match) {
      featureParts.push({ page: field.page, index: parseInt(match[1], 10), text: field.value.trim() });
    }
  }
  featureParts.sort((a, b) => a.page - b.page || a.index - b.index);
  const featuresAndTraits = featureParts.map((p) => p.text).join('\n');

  const { spells, spellSlots } = parseSpellPages(extracted);

  const classLevelRaw = get(FIELDS.classLevel);
  const classes = parseClassLevel(classLevelRaw);
  const totalLevel = classes.length > 0 ? classes.reduce((sum, c) => sum + c.level, 0) : null;

  const countChecked = (boxes: string[]) => boxes.filter((b) => isChecked(b)).length;

  const actionsText = [get(FIELDS.actions1), get(FIELDS.actions2)]
    .filter((t) => t.trim() !== '')
    .join('\n');

  const additionalNotes = [get(FIELDS.additionalNotes1), get(FIELDS.additionalNotes2)]
    .filter((t) => t.trim() !== '')
    .join('\n');

  const spellcastingAbilityRaw = get(SPELLCASTING_FIELDS.spellcastingAbility);

  return {
    name: get(FIELDS.characterName),
    playerName: get(FIELDS.playerName),
    classes,
    classLevelRaw,
    totalLevel,
    background: get(FIELDS.background),
    race: get(FIELDS.race),
    alignment: get(FIELDS.alignment),
    xp: parseNumber(extracted.text.get(FIELDS.xp)), // "(Milestone)" → null
    inspiration: isChecked(FIELDS.inspiration),
    profBonus: parseNumber(extracted.text.get(FIELDS.profBonus)),

    abilities,
    saves,
    skills,

    ac: parseNumber(extracted.text.get(FIELDS.ac)),
    initiative: parseNumber(extracted.text.get(FIELDS.initiative)),
    speed: parseNumber(extracted.text.get(FIELDS.speed)),
    speedRaw: get(FIELDS.speed),
    hpMax: parseNumber(extracted.text.get(FIELDS.hpMax)),
    hpCurrent: parseNumber(extracted.text.get(FIELDS.hpCurrent)),
    hpTemp: parseNumber(extracted.text.get(FIELDS.hpTemp)),
    hitDice: parseHitDice(get(FIELDS.hitDiceTotal), get(FIELDS.hitDiceRemaining)),
    passivePerception: parseNumber(extracted.text.get(FIELDS.passivePerception)),
    passiveInsight: parseNumber(extracted.text.get(FIELDS.passiveInsight)),
    passiveInvestigation: parseNumber(extracted.text.get(FIELDS.passiveInvestigation)),
    senses: get(FIELDS.additionalSenses),
    defenses: get(FIELDS.defenses),
    saveModifiers: get(FIELDS.saveModifiers),
    deathSaveSuccesses: countChecked(DEATH_SAVE_BOXES.successes),
    deathSaveFailures: countChecked(DEATH_SAVE_BOXES.failures),

    weapons,
    actionsText,

    currency: {
      cp: parseNumber(extracted.text.get(FIELDS.cp)),
      sp: parseNumber(extracted.text.get(FIELDS.sp)),
      ep: parseNumber(extracted.text.get(FIELDS.ep)),
      gp: parseNumber(extracted.text.get(FIELDS.gp)),
      pp: parseNumber(extracted.text.get(FIELDS.pp)),
    },
    equipmentItems,
    attunedItems,
    proficienciesAndLanguages: get(FIELDS.proficienciesLang),

    personalityTraits: get(FIELDS.personalityTraits),
    ideals: get(FIELDS.ideals),
    bonds: get(FIELDS.bonds),
    flaws: get(FIELDS.flaws),
    featuresAndTraits,

    appearance: {
      gender: get(FIELDS.gender),
      age: get(FIELDS.age),
      size: get(FIELDS.size),
      height: get(FIELDS.height),
      weight: get(FIELDS.weight),
      faith: get(FIELDS.faith),
      eyes: get(FIELDS.eyes),
      skin: get(FIELDS.skin),
      hair: get(FIELDS.hair),
    },
    appearanceDescription: get(FIELDS.appearance),
    allies: get(FIELDS.allies),
    backstory: get(FIELDS.backstory),
    additionalNotes,

    spellcastingClass: get(SPELLCASTING_FIELDS.spellcastingClass),
    // Multiclass casters show "WIS / CHA" — the first entry is the primary class.
    spellcastingAbility: parseAbilityName(spellcastingAbilityRaw.split('/')[0]),
    spellSaveDc: parseNumber(extracted.text.get(SPELLCASTING_FIELDS.spellSaveDc)),
    spellAtkBonus: parseNumber(extracted.text.get(SPELLCASTING_FIELDS.spellAtkBonus)),
    spells,
    spellSlots,
  };
}
