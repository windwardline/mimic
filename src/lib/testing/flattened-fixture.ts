import { PDFDocument, PDFFont, PDFPage, StandardFonts } from 'pdf-lib';
import { PAGE_FIELD_RECTS, PAGE_LABELS, TemplatePageType } from '../ddb-geometry';

/**
 * Builds an in-memory PDF that mimics a FLATTENED copy of a D&D Beyond
 * export — what a browser's print-to-PDF produces: no widgets at all, every
 * template label AND every character value baked into the text layer at the
 * positions the template dictates.
 *
 * Values are drawn inside the widget rectangles recorded in ddb-geometry.ts;
 * all static labels for each page type are drawn at their exact template
 * positions so the extractor's label-dropping is exercised realistically.
 */

const VALUES: Record<TemplatePageType, Record<string, string>> = {
  core: {
    CharacterName: 'Tobias Quickstep',
    'CLASS LEVEL': 'Rogue 4',
    'PLAYER NAME': 'DrnknBear',
    RACE: 'Halfling',
    BACKGROUND: 'Urchin',
    'EXPERIENCE POINTS': '2900',
    STR: '10',
    STRmod: '+0',
    DEX: '18',
    DEXmod: '+4',
    CON: '12',
    CONmod: '+1',
    INT: '13',
    INTmod: '+1',
    WIS: '14',
    WISmod: '+2',
    CHA: '11',
    CHamod: '+0',
    DexProf: '•',
    'ST Dexterity': '+6',
    IntProf: '•',
    'ST Intelligence': '+3',
    'ST Strength': '+0',
    AcrobaticsProf: 'P',
    Acrobatics: '+6',
    StealthProf: 'E',
    Stealth: '+8',
    Perception: '+2',
    Passive1: '12',
    Passive2: '12',
    Passive3: '11',
    Init: '+4',
    AC: '15',
    ProfBonus: '+2',
    Speed: '25 ft. (Walking)',
    MaxHP: '27',
    CurrentHP: '20',
    TempHP: '--',
    Total: '4d8',
    Defenses: 'Resistances - Poison',
    AdditionalSenses: 'Darkvision 60 ft.',
    ProficienciesLang: '=== LANGUAGES ===\nCommon, Halfling',
    Actions1: '=== ACTIONS ===\nCunning Action',
    'Wpn Name': 'Shortsword',
    'Wpn1 AtkBonus': '+6',
    'Wpn1 Damage': '1d6+4 Piercing',
    'Wpn Notes 1': 'Finesse, Light',
  },
  equipment: {
    FeaturesTraits1: '=== ROGUE FEATURES ===\n* Sneak Attack',
    CP: '12',
    GP: '47',
    'Eq Name0': 'Thieves' + String.fromCharCode(0x2019) + ' Tools',
    'Eq Qty0': '1',
    'Eq Weight0': '1 lb.',
    'Eq Name1': 'Caltrops',
    'Eq Qty1': '20',
    'Eq Weight1': '2 lb.',
  },
  equipmentExtra: {},
  details: {
    ALIGNMENT: 'Chaotic Good',
    'PersonalityTraits': 'Quick fingers, quicker wit',
    Backstory: 'Grew up on the streets of Waterdeep.',
  },
  spells: {
    spellCastingClass0: 'Rogue (Arcane Trickster)',
    spellCastingAbility0: 'INT',
    spellSaveDC0: '11',
    spellAtkBonus0: '+3',
  },
};

/** Spell rows drawn by column position (x from the template's column grid). */
const SPELL_COLUMN_X: Record<string, number> = {
  prepared: 31,
  name: 44,
  source: 151,
  saveHit: 234,
  time: 260,
  range: 280,
  comp: 322,
  duration: 345,
  page: 391,
  notes: 425,
};

function drawSpellRow(
  page: PDFPage,
  font: PDFFont,
  y: number,
  cells: Partial<Record<keyof typeof SPELL_COLUMN_X, string>>
): void {
  for (const [column, text] of Object.entries(cells)) {
    if (!text) continue;
    page.drawText(text, { x: SPELL_COLUMN_X[column], y, size: 7, font });
  }
}

export async function buildFlattenedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const addPage = (type: TemplatePageType) => {
    const page = doc.addPage([612, 792]);
    for (const [text, x, y] of PAGE_LABELS[type]) {
      // Multi-line label runs never occur; draw each run at its position.
      page.drawText(text.replace(/\n/g, ' '), { x, y, size: 6, font });
    }
    for (const [name, value] of Object.entries(VALUES[type])) {
      const rect = PAGE_FIELD_RECTS[type][name];
      if (!rect) throw new Error(`fixture value for unknown ${type} field: ${name}`);
      const [x0, y0, , y1] = rect;
      const lines = value.split('\n');
      // Draw top-down inside the box so multi-line blocks keep their order.
      lines.forEach((line, i) => {
        const y = Math.max(y0 + 2, y1 - 9 * (i + 1));
        page.drawText(line, { x: x0 + 2, y, size: 7, font });
      });
    }
    return page;
  };

  addPage('core');
  addPage('equipment');
  addPage('details');
  const spellsPage = addPage('spells');

  // Cantrip block, then a 1st-level block whose second row's duration wraps
  // onto a continuation line (no name cell) — the parser must merge it.
  drawSpellRow(spellsPage, font, 632, { name: '=== CANTRIPS ===', source: '(At Will)' });
  drawSpellRow(spellsPage, font, 620, {
    prepared: 'O',
    name: 'Mage Hand',
    source: 'Arcane Trickster',
    saveHit: '--',
    time: '1A',
    range: '30 ft.',
    comp: 'V,S',
    duration: '1 minute',
    page: 'PHB 256',
  });
  drawSpellRow(spellsPage, font, 608, { name: '=== 1st LEVEL ===', source: '2 Slots OO' });
  drawSpellRow(spellsPage, font, 596, {
    prepared: 'P',
    name: 'Charm Person',
    source: 'Arcane Trickster',
    saveHit: 'WIS 11',
    time: '1A',
    range: '30 ft.',
    comp: 'V,S',
    duration: 'Concentration,',
  });
  drawSpellRow(spellsPage, font, 588, { duration: 'up to 1 hour' });

  return doc.save();
}
