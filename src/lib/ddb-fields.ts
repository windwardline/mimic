/**
 * Field-name maps for D&D Beyond's "Export to PDF" character sheets.
 *
 * These names were extracted from real DDB exports (PDFsharp-generated,
 * 2018-template layout still used in 2026). Several fields carry trailing or
 * doubled spaces in the raw PDF ("DEXmod ", "CLASS  LEVEL", "Wpn3 AtkBonus  ");
 * all lookups happen against whitespace-normalized names (see pdf-extractor.ts).
 *
 * Notable quirks of the format:
 * - Proficiency is NOT stored in checkboxes. Saves use a text field
 *   ("StrProf") holding "•" when proficient; skills use "{Skill}Prof"
 *   holding "P" (proficient) or "E" (expertise).
 * - The only real checkboxes are the death-save pips ("Check Box 12"-"17")
 *   and "Inspiration".
 * - Spell pages repeat the same field names ("spellName0"…) on every page;
 *   level blocks are delimited by "spellHeaderN" values like
 *   "=== 1st LEVEL ===" and continue across page breaks.
 */

export const ABILITIES = [
  { key: 'strength', scoreField: 'STR', modField: 'STRmod', saveField: 'ST Strength', saveProfField: 'StrProf' },
  { key: 'dexterity', scoreField: 'DEX', modField: 'DEXmod', saveField: 'ST Dexterity', saveProfField: 'DexProf' },
  { key: 'constitution', scoreField: 'CON', modField: 'CONmod', saveField: 'ST Constitution', saveProfField: 'ConProf' },
  { key: 'intelligence', scoreField: 'INT', modField: 'INTmod', saveField: 'ST Intelligence', saveProfField: 'IntProf' },
  { key: 'wisdom', scoreField: 'WIS', modField: 'WISmod', saveField: 'ST Wisdom', saveProfField: 'WisProf' },
  { key: 'charisma', scoreField: 'CHA', modField: 'CHamod', saveField: 'ST Charisma', saveProfField: 'ChaProf' },
] as const;

export type AbilityKey = (typeof ABILITIES)[number]['key'];

export interface SkillFieldDef {
  /** Normalized text-field name holding the skill bonus (e.g. "+5"). */
  pdfField: string;
  /** Text field holding the proficiency marker: "" | "P" | "E". */
  profField: string;
  /** Attribute prefix on the "D&D 5th Edition by Roll20" sheet. */
  roll20: string;
}

export const SKILLS: SkillFieldDef[] = [
  { pdfField: 'Acrobatics', profField: 'AcrobaticsProf', roll20: 'acrobatics' },
  { pdfField: 'Animal', profField: 'AnimalHandlingProf', roll20: 'animal_handling' },
  { pdfField: 'Arcana', profField: 'ArcanaProf', roll20: 'arcana' },
  { pdfField: 'Athletics', profField: 'AthleticsProf', roll20: 'athletics' },
  { pdfField: 'Deception', profField: 'DeceptionProf', roll20: 'deception' },
  { pdfField: 'History', profField: 'HistoryProf', roll20: 'history' },
  { pdfField: 'Insight', profField: 'InsightProf', roll20: 'insight' },
  { pdfField: 'Intimidation', profField: 'IntimidationProf', roll20: 'intimidation' },
  { pdfField: 'Investigation', profField: 'InvestigationProf', roll20: 'investigation' },
  { pdfField: 'Medicine', profField: 'MedicineProf', roll20: 'medicine' },
  { pdfField: 'Nature', profField: 'NatureProf', roll20: 'nature' },
  { pdfField: 'Perception', profField: 'PerceptionProf', roll20: 'perception' },
  { pdfField: 'Performance', profField: 'PerformanceProf', roll20: 'performance' },
  { pdfField: 'Persuasion', profField: 'PersuasionProf', roll20: 'persuasion' },
  { pdfField: 'Religion', profField: 'ReligionProf', roll20: 'religion' },
  // Note the capital "O" in the prof field but lowercase in the bonus field.
  { pdfField: 'SleightofHand', profField: 'SleightOfHandProf', roll20: 'sleight_of_hand' },
  { pdfField: 'Stealth', profField: 'StealthProf', roll20: 'stealth' },
  { pdfField: 'Survival', profField: 'SurvivalProf', roll20: 'survival' },
];

/**
 * "" → untrained; "E" → expertise; anything else ("P" for skills, "•" for
 * saves, defensively any other mark) → proficient.
 */
export function parseProfMarker(value: string | undefined): {
  proficient: boolean;
  expertise: boolean;
} {
  const marker = (value ?? '').trim();
  if (marker === '') return { proficient: false, expertise: false };
  if (marker.toUpperCase() === 'E') return { proficient: true, expertise: true };
  return { proficient: true, expertise: false };
}

export const DEATH_SAVE_BOXES = {
  successes: ['Check Box 12', 'Check Box 13', 'Check Box 14'],
  failures: ['Check Box 15', 'Check Box 16', 'Check Box 17'],
};

export interface WeaponRowDef {
  name: string;
  atkBonus: string;
  damage: string;
  notes: string;
}

export const WEAPON_ROWS: WeaponRowDef[] = [
  { name: 'Wpn Name', atkBonus: 'Wpn1 AtkBonus', damage: 'Wpn1 Damage', notes: 'Wpn Notes 1' },
  { name: 'Wpn Name 2', atkBonus: 'Wpn2 AtkBonus', damage: 'Wpn2 Damage', notes: 'Wpn Notes 2' },
  { name: 'Wpn Name 3', atkBonus: 'Wpn3 AtkBonus', damage: 'Wpn3 Damage', notes: 'Wpn Notes 3' },
  { name: 'Wpn Name 4', atkBonus: 'Wpn4 AtkBonus', damage: 'Wpn4 Damage', notes: 'Wpn Notes 4' },
  { name: 'Wpn Name 5', atkBonus: 'Wpn5 AtkBonus', damage: 'Wpn5 Damage', notes: 'Wpn Notes 5' },
  { name: 'Wpn Name 6', atkBonus: 'Wpn6 AtkBonus', damage: 'Wpn6 Damage', notes: 'Wpn Notes 6' },
];

/** Identity / combat / text fields (normalized names). */
export const FIELDS = {
  characterName: 'CharacterName',
  classLevel: 'CLASS LEVEL',
  playerName: 'PLAYER NAME',
  race: 'RACE',
  background: 'BACKGROUND',
  xp: 'EXPERIENCE POINTS',
  inspiration: 'Inspiration',
  profBonus: 'ProfBonus',
  ac: 'AC',
  initiative: 'Init',
  speed: 'Speed',
  hpMax: 'MaxHP',
  hpCurrent: 'CurrentHP',
  hpTemp: 'TempHP',
  hitDiceTotal: 'Total',
  hitDiceRemaining: 'HD',
  passivePerception: 'Passive1',
  passiveInsight: 'Passive2',
  passiveInvestigation: 'Passive3',
  additionalSenses: 'AdditionalSenses',
  defenses: 'Defenses',
  saveModifiers: 'SaveModifiers',
  proficienciesLang: 'ProficienciesLang',
  actions1: 'Actions1',
  actions2: 'Actions2',
  cp: 'CP',
  sp: 'SP',
  ep: 'EP',
  gp: 'GP',
  pp: 'PP',
  weightCarried: 'Weight Carried',
  // Details page
  gender: 'GENDER',
  age: 'AGE',
  size: 'SIZE',
  height: 'HEIGHT',
  weight: 'WEIGHT',
  alignment: 'ALIGNMENT',
  faith: 'FAITH',
  skin: 'SKIN',
  eyes: 'EYES',
  hair: 'HAIR',
  allies: 'AlliesOrganizations',
  personalityTraits: 'PersonalityTraits',
  ideals: 'Ideals',
  bonds: 'Bonds',
  flaws: 'Flaws',
  appearance: 'Appearance',
  backstory: 'Backstory',
  additionalNotes1: 'AdditionalNotes1',
  additionalNotes2: 'AdditionalNotes2',
} as const;

/** "FeaturesTraits1" … "FeaturesTraits6" — feature text flows across columns/pages. */
export const FEATURES_TRAITS_PATTERN = /^FeaturesTraits(\d+)$/;

/** Itemized equipment rows: "Eq Name0" / "Eq Qty0" / "Eq Weight0" …  */
export const EQUIPMENT_NAME_PATTERN = /^Eq Name(\d+)$/;
export const equipmentQtyField = (index: string): string => `Eq Qty${index}`;
export const equipmentWeightField = (index: string): string => `Eq Weight${index}`;

/** Attuned magic item rows: "Attuned Name1" … "Attuned Name3". */
export const ATTUNED_NAME_PATTERN = /^Attuned Name(\d+)$/;

/**
 * Spell pages. The header block repeats on every spell page; row fields are
 * numbered per page and must be grouped by (page, index). Level blocks are
 * announced by "spellHeaderN" ("=== CANTRIPS ===", "=== 3rd LEVEL ===") and
 * carry over page breaks. "spellSlotHeaderN" holds slot info like
 * "4 Slots OOOO" or "3 Slots OOO | 2 Pact OO" — N matches the spell level.
 * Fields containing "Header" other than these two are column headings or
 * blank-row filler and carry no character data.
 */
export const SPELLCASTING_FIELDS = {
  spellcastingClass: 'spellCastingClass0',
  spellcastingAbility: 'spellCastingAbility0',
  spellSaveDc: 'spellSaveDC0',
  spellAtkBonus: 'spellAtkBonus0',
} as const;

export const SPELL_HEADER_PATTERN = /^spellHeader(\d+)$/;
export const SPELL_SLOT_HEADER_PATTERN = /^spellSlotHeader(\d+)$/;
export const SPELL_ROW_PATTERN =
  /^spell(Prepared|Name|Source|SaveHit|CastingTime|Range|Components|Duration|Page|Notes)(\d+)$/;

export type SpellRowColumn =
  | 'Prepared'
  | 'Name'
  | 'Source'
  | 'SaveHit'
  | 'CastingTime'
  | 'Range'
  | 'Components'
  | 'Duration'
  | 'Page'
  | 'Notes';
