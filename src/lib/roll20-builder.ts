import { ABILITIES } from './ddb-fields';
import type { CharacterSheet, SpellEntry } from './sheet-parser';

/**
 * VTT Enhancement Suite character import file, schema_version 1.
 * The v1 importer reads name/avatar/bio/attribs from the TOP level of the
 * JSON (only schema 3 nests them under a "character" key) and requires
 * name+current+max on every attribute.
 */
export interface Vttes1Character {
  schema_version: 1;
  name: string;
  avatar: string;
  bio: string;
  attribs: Roll20Attrib[];
}

export interface Roll20Attrib {
  name: string;
  current: string | number;
  max: string | number;
}

/** Proficiency values used by the "D&D 5th Edition by Roll20" sheet. */
const SAVE_PROF_VALUE = '(@{pb})';
const skillProfValue = (skill: string) => `(@{pb}*@{${skill}_type})`;

const ROW_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Roll20-style repeating-section row id: "-" followed by 19 characters. */
export function generateRowId(random: () => number = Math.random): string {
  let id = '-';
  for (let i = 0; i < 19; i++) {
    id += ROW_ID_CHARS[Math.floor(random() * ROW_ID_CHARS.length)];
  }
  return id;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildBio(sheet: CharacterSheet): string {
  const sections: string[] = [];
  const add = (title: string, body: string) => {
    if (body.trim()) sections.push(`<h3>${title}</h3><p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>`);
  };

  add('Backstory', sheet.backstory);
  add('Appearance', sheet.appearanceDescription);
  add(
    'Details',
    [
      sheet.appearance.gender && `Gender: ${sheet.appearance.gender}`,
      sheet.appearance.faith && `Faith: ${sheet.appearance.faith}`,
      sheet.appearance.size && `Size: ${sheet.appearance.size}`,
    ]
      .filter(Boolean)
      .join('\n')
  );
  add('Allies & Organizations', sheet.allies);
  add('Defenses', [sheet.defenses, sheet.saveModifiers].filter(Boolean).join('\n'));
  add('Senses', sheet.senses);
  add('Actions', sheet.actionsText);
  add('Attuned Magic Items', sheet.attunedItems.join('\n'));
  add('Additional Notes', sheet.additionalNotes);
  if (sheet.playerName) add('Player', sheet.playerName);
  return sections.join('\n');
}

/** "1.5 lb." stack weight over 20 bolts → 0.075 per item (Roll20 multiplies by count). */
function perItemWeight(weightRaw: string, qty: number | null): number | null {
  const match = weightRaw.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const total = parseFloat(match[0]);
  if (qty && qty > 1) return Math.round((total / qty) * 1000) / 1000;
  return total;
}

/** "WIS 19" → "Wisdom" for the sheet's save dropdown; attack rolls ("+9") → null. */
const SAVE_ABILITY_NAMES: Record<string, string> = {
  STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution',
  INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma',
};
function spellSaveAbility(saveHit: string): string | null {
  const match = saveHit.trim().match(/^(STR|DEX|CON|INT|WIS|CHA)/i);
  return match ? SAVE_ABILITY_NAMES[match[1].toUpperCase()] : null;
}

export function buildRoll20Character(
  sheet: CharacterSheet,
  rowId: () => string = generateRowId
): Vttes1Character {
  const attribs: Roll20Attrib[] = [];
  const set = (name: string, current: string | number | null, max: string | number = '') => {
    if (current === null || current === '') return;
    attribs.push({ name, current, max });
  };

  // The OGL sheet's sheet workers do not run during a VTTES import, so both
  // the raw scores and every derived value the sheet displays or rolls with
  // must be written explicitly.
  for (const { key } of ABILITIES) {
    const { score, mod } = sheet.abilities[key];
    set(key, score);
    set(`${key}_base`, score);
    set(`${key}_mod`, mod);
    const save = sheet.saves[key];
    set(`${key}_save_bonus`, save.bonus);
    if (save.proficient) set(`${key}_save_prof`, SAVE_PROF_VALUE);
  }

  for (const skill of sheet.skills) {
    set(`${skill.roll20}_bonus`, skill.bonus);
    if (skill.proficient) set(`${skill.roll20}_prof`, skillProfValue(skill.roll20));
    if (skill.expertise) set(`${skill.roll20}_type`, '2');
  }

  set('ac', sheet.ac);
  set('initiative_bonus', sheet.initiative);
  set('speed', sheet.speed);
  if (sheet.hpMax !== null) {
    attribs.push({ name: 'hp', current: sheet.hpCurrent ?? sheet.hpMax, max: sheet.hpMax });
  }
  set('hp_temp', sheet.hpTemp);
  set('pb', sheet.profBonus);
  set('passive_wisdom', sheet.passivePerception);

  if (sheet.hitDice.total !== null) {
    attribs.push({
      name: 'hit_dice',
      current: String(sheet.hitDice.remaining ?? sheet.hitDice.total),
      max: String(sheet.hitDice.total),
    });
  }
  if (sheet.hitDice.dieType) set('hitdietype', sheet.hitDice.dieType);

  for (let i = 0; i < sheet.deathSaveSuccesses && i < 3; i++) set(`deathsave_succ${i + 1}`, 'on');
  for (let i = 0; i < sheet.deathSaveFailures && i < 3; i++) set(`deathsave_fail${i + 1}`, 'on');

  if (sheet.classes.length > 0) set('class', sheet.classes[0].name);
  if (sheet.classes.length > 1) set('class_display', sheet.classLevelRaw);
  set('level', sheet.totalLevel);
  set('base_level', sheet.classes[0]?.level ?? null);
  set('race', sheet.race);
  set('race_display', sheet.race);
  set('background', sheet.background);
  set('alignment', sheet.alignment);
  set('experience', sheet.xp);
  if (sheet.inspiration) set('inspiration', 'on');
  set('npc', 0);

  set('cp', sheet.currency.cp);
  set('sp', sheet.currency.sp);
  set('ep', sheet.currency.ep);
  set('gp', sheet.currency.gp);
  set('pp', sheet.currency.pp);

  set('other_proficiencies_and_languages', sheet.proficienciesAndLanguages);
  set('personality_traits', sheet.personalityTraits);
  set('ideals', sheet.ideals);
  set('bonds', sheet.bonds);
  set('flaws', sheet.flaws);

  // "simple" mode swaps the compendium-driven traits section for a plain
  // textarea, which is the only faithful representation of the PDF's
  // free-text feature blocks.
  if (sheet.featuresAndTraits) {
    set('simpletraits', 'simple');
    set('features_and_traits', sheet.featuresAndTraits);
  }

  const attuned = new Set(sheet.attunedItems.map((name) => name.toLowerCase()));
  for (const item of sheet.equipmentItems) {
    const prefix = `repeating_inventory_${rowId()}`;
    set(`${prefix}_itemname`, item.name);
    set(`${prefix}_itemcount`, item.qty ?? 1);
    const weight = perItemWeight(item.weight, item.qty);
    if (weight !== null) set(`${prefix}_itemweight`, weight);
    if (attuned.has(item.name.toLowerCase())) set(`${prefix}_itemmodifiers`, 'Attuned');
  }

  set('additional_feature_and_traits', sheet.additionalNotes);

  set('age', sheet.appearance.age);
  set('height', sheet.appearance.height);
  set('weight', sheet.appearance.weight);
  set('eyes', sheet.appearance.eyes);
  set('skin', sheet.appearance.skin);
  set('hair', sheet.appearance.hair);
  set('character_backstory', sheet.backstory);
  set('allies_and_organizations', sheet.allies);

  for (const weapon of sheet.weapons) {
    const id = rowId();
    const prefix = `repeating_attack_${id}`;
    set(`${prefix}_atkname`, weapon.name);
    set(`${prefix}_atkbonus`, weapon.atkBonus);
    const damageMatch = weapon.damage.match(/^\s*(\d*d\d+(?:\s*[+-]\s*\d+)?|\d+)\s*(.*)$/i);
    if (damageMatch) {
      set(`${prefix}_dmgbase`, damageMatch[1].replace(/\s+/g, ''));
      if (damageMatch[2]) set(`${prefix}_dmgtype`, damageMatch[2].trim());
    } else if (weapon.damage) {
      set(`${prefix}_dmgbase`, weapon.damage);
    }
    if (weapon.notes) set(`${prefix}_atk_desc`, weapon.notes);
    set(`${prefix}_atkflag`, '{{attack=1}}');
    set(`${prefix}_dmgflag`, '{{damage=1}} {{dmg1flag=1}}');
  }

  if (sheet.spellcastingAbility) {
    set('spellcasting_ability', `@{${sheet.spellcastingAbility}_mod}+`);
  }
  set('spell_save_dc', sheet.spellSaveDc);
  set('spell_attack_bonus', sheet.spellAtkBonus);

  for (const slot of sheet.spellSlots) {
    set(`lvl${slot.level}_slots_total`, slot.total);
    // The PDF does not carry expended slots; import with everything available.
    set(`lvl${slot.level}_slots_expended`, slot.total);
  }

  for (const spell of sheet.spells) {
    addSpell(sheet, spell, `repeating_spell-${spell.level}_${rowId()}`, set);
  }

  return {
    schema_version: 1,
    name: sheet.name || 'Unnamed Character',
    avatar: '',
    bio: buildBio(sheet),
    attribs,
  };
}

function addSpell(
  sheet: CharacterSheet,
  spell: SpellEntry,
  prefix: string,
  set: (name: string, current: string | number | null, max?: string | number) => void
): void {
  set(`${prefix}_spellname`, spell.name);
  set(`${prefix}_spelllevel`, spell.level);
  if (spell.prepared) set(`${prefix}_spellprepared`, '1');
  set(`${prefix}_spellclass`, spell.source || sheet.spellcastingClass);
  set(`${prefix}_spellcastingtime`, spell.castingTime);
  set(`${prefix}_spellrange`, spell.range);
  set(`${prefix}_spellduration`, spell.duration);
  if (/^concentration/i.test(spell.duration)) {
    set(`${prefix}_spellconcentration`, '{{concentration=1}}');
  }
  if (spell.ritual) set(`${prefix}_spellritual`, '{{ritual=1}}');

  if (spell.components) {
    const comps = spell.components.toUpperCase();
    set(`${prefix}_spellcomp_v`, comps.includes('V') ? '{{v=1}}' : '0');
    set(`${prefix}_spellcomp_s`, comps.includes('S') ? '{{s=1}}' : '0');
    set(`${prefix}_spellcomp_m`, comps.includes('M') ? '{{m=1}}' : '0');
  }

  const saveAbility = spellSaveAbility(spell.saveHit);
  if (saveAbility) set(`${prefix}_spellsave`, saveAbility);

  const description = [spell.notes, spell.pageRef && `Source: ${spell.pageRef}`]
    .filter(Boolean)
    .join('\n');
  set(`${prefix}_spelldescription`, description);
}
