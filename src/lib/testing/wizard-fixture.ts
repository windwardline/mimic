import { PDFDocument } from 'pdf-lib';

/**
 * A level-5 wizard expressed as raw WotC/D&D Beyond PDF field values.
 * Field names are exactly as they appear in the template, including the
 * trailing and doubled spaces several of them carry.
 */
export const WIZARD_FIELDS: Record<string, string> = {
  CharacterName: 'Elaria Moonwhisper',
  ClassLevel: 'Wizard 5',
  Background: 'Sage',
  PlayerName: 'Michael',
  'Race ': 'High Elf',
  Alignment: 'Neutral Good',
  XP: '6500',
  Inspiration: '1',
  ProfBonus: '+3',
  AC: '12',
  Initiative: '+2',
  Speed: '30 ft.',
  HPMax: '32',
  HPCurrent: '28',
  HPTemp: '5',
  HDTotal: '5d6',
  HD: '4',
  Passive: '13',
  STR: '8',
  STRmod: '-1',
  DEX: '14',
  'DEXmod ': '+2',
  CON: '14',
  CONmod: '+2',
  INT: '18',
  INTmod: '+4',
  WIS: '12',
  WISmod: '+1',
  CHA: '10',
  CHamod: '+0',
  'ST Strength': '-1',
  'ST Dexterity': '+2',
  'ST Constitution': '+2',
  'ST Intelligence': '+7',
  'ST Wisdom': '+4',
  'ST Charisma': '+0',
  Arcana: '+7',
  'History ': '+7',
  'Investigation ': '+7',
  'Stealth ': '+2',
  'Wpn Name': 'Dagger',
  'Wpn1 AtkBonus': '+5',
  'Wpn1 Damage': '1d4+2 piercing',
  'Wpn Name 2': 'Fire Bolt',
  'Wpn2 AtkBonus ': '+7',
  'Wpn2 Damage ': '2d10 fire',
  GP: '125',
  SP: '30',
  Equipment: 'Spellbook, component pouch, backpack',
  ProficienciesLang: 'Common, Elvish, Draconic',
  'PersonalityTraits ': 'Endlessly curious',
  Ideals: 'Knowledge above all',
  Bonds: 'My old academy',
  Flaws: 'Easily distracted by mysteries',
  'Features and Traits': 'Arcane Recovery, Fey Ancestry',
  'Spellcasting Class 2': 'Wizard',
  'SpellcastingAbility 2': 'Intelligence',
  'SpellSaveDC  2': '15',
  'SpellAtkBonus 2': '+7',
  'Spells 1014': 'Fire Bolt',
  'Spells 1016': 'Mage Hand',
  'Spells 1015': 'Magic Missile',
  'Spells 1023': 'Shield',
  'SlotsTotal 19': '4',
  'SlotsRemaining 19': '3',
  'Spells 1046': 'Misty Step',
  'SlotsTotal 20': '3',
  'SlotsRemaining 20': '3',
  'Spells 1048': 'Fireball',
  'SlotsTotal 21': '2',
  'SlotsRemaining 21': '1',
  Age: '124',
  Eyes: 'Violet',
  Backstory: 'Fled the Feywild to study mortal magic.',
};

export const WIZARD_BOXES = [
  'Check Box 20', // INT save proficiency
  'Check Box 21', // WIS save proficiency
  'Check Box 25', // Arcana
  'Check Box 28', // History
  'Check Box 31', // Investigation
  'Check Box 12', // death save success 1
  'Check Box 251', // Magic Missile prepared
  'Check Box 309', // Shield prepared
  'Check Box 313', // Misty Step prepared
];

/**
 * Builds an in-memory PDF that mimics a D&D Beyond export: same AcroForm
 * field names as the official WotC template.
 */
export async function buildDdbStylePdf(
  textFields: Record<string, string> = WIZARD_FIELDS,
  checkedBoxes: string[] = WIZARD_BOXES
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();

  let y = 750;
  const nextPos = () => {
    y -= 14;
    if (y < 20) y = 750;
    return y;
  };

  for (const [name, value] of Object.entries(textFields)) {
    const field = form.createTextField(name);
    field.addToPage(page, { x: 20, y: nextPos(), width: 250, height: 12 });
    field.setText(value);
  }
  for (const name of checkedBoxes) {
    const box = form.createCheckBox(name);
    box.addToPage(page, { x: 300, y: nextPos(), width: 10, height: 10 });
    box.check();
  }

  return doc.save();
}

/**
 * Fills a real (blank) WotC template with the wizard fixture, the same way
 * D&D Beyond populates it server-side.
 */
export async function fillRealTemplate(templateBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = doc.getForm();
  for (const [name, value] of Object.entries(WIZARD_FIELDS)) {
    form.getTextField(name).setText(value);
  }
  for (const name of WIZARD_BOXES) {
    form.getCheckBox(name).check();
  }
  return doc.save();
}
