import { ABILITIES } from './wotc-fields';
import type { CharacterSheet } from './sheet-parser';

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

/** Proficiency checkbox values used by the "D&D 5th Edition by Roll20" sheet. */
const SAVE_PROF_VALUE = '(@{pb})';
const SKILL_PROF_VALUE = '(@{pb}*@{athletics_type})';

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
  add('Allies & Organizations', [sheet.factionName, sheet.allies].filter(Boolean).join('\n'));
  add('Attacks & Spellcasting Notes', sheet.attacksText);
  if (sheet.playerName) add('Player', sheet.playerName);
  return sections.join('\n');
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
    if (skill.proficient) {
      set(`${skill.roll20}_prof`, SKILL_PROF_VALUE.replace('athletics', skill.roll20));
    }
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

  const hitDiceCurrent = sheet.hitDice.match(/\d+/)?.[0] ?? '';
  const hitDiceMax = sheet.hitDiceTotal.match(/\d+/)?.[0] ?? '';
  if (hitDiceCurrent || hitDiceMax) {
    attribs.push({
      name: 'hit_dice',
      current: hitDiceCurrent || hitDiceMax,
      max: hitDiceMax || hitDiceCurrent,
    });
  }
  const hitDieType = sheet.hitDiceTotal.match(/d\d+/i)?.[0] ?? sheet.hitDice.match(/d\d+/i)?.[0];
  if (hitDieType) set('hitdietype', hitDieType.toLowerCase());

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

  // "simple" mode swaps the compendium-driven repeating sections for plain
  // textareas, which is the only faithful representation of the PDF's
  // free-text feature/equipment blocks.
  if (sheet.featuresAndTraits) {
    set('simpletraits', 'simple');
    set('features_and_traits', sheet.featuresAndTraits);
  }
  if (sheet.equipment) {
    set('simpleinventory', 'simple');
    set('equipment', sheet.equipment);
  }
  set('additional_feature_and_traits', sheet.additionalFeatures);
  set('treasure', sheet.treasure);

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
    const damageMatch = weapon.damage.match(/^\s*(\d*d\d+(?:\s*[+-]\s*\d+)?)\s*(.*)$/i);
    if (damageMatch) {
      set(`${prefix}_dmgbase`, damageMatch[1].replace(/\s+/g, ''));
      if (damageMatch[2]) set(`${prefix}_dmgtype`, damageMatch[2].trim());
    } else {
      set(`${prefix}_dmgbase`, weapon.damage);
    }
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
    set(`lvl${slot.level}_slots_expended`, slot.remaining ?? slot.total);
  }

  for (const spell of sheet.spells) {
    const prefix = `repeating_spell-${spell.level}_${rowId()}`;
    set(`${prefix}_spellname`, spell.name);
    set(`${prefix}_spelllevel`, spell.level);
    if (spell.prepared) set(`${prefix}_spellprepared`, '1');
    if (sheet.spellcastingClass) set(`${prefix}_spellclass`, sheet.spellcastingClass);
  }

  return {
    schema_version: 1,
    name: sheet.name || 'Unnamed Character',
    avatar: '',
    bio: buildBio(sheet),
    attribs,
  };
}
