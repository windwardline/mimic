import { PDFDocument, PDFName, PDFPage, PDFString } from 'pdf-lib';

/**
 * Builds an in-memory PDF that mimics a real D&D Beyond "Export to PDF"
 * file, as produced by DDB's PDFsharp pipeline:
 *
 * - character data lives in form-field *widget annotations* (/T, /V, /FT),
 * - the document catalog has NO usable /AcroForm entry (we delete it), so
 *   pdf-lib's high-level form API sees zero fields — exactly like the real
 *   exports,
 * - spell pages repeat the same field names ("spellName0"…) on every page,
 * - several field names carry the trailing/doubled spaces of the template.
 *
 * The character is a Cleric 5 / Wizard 2 modeled on the shapes observed in
 * real exports (multiclass, expertise, always-prepared spells, rituals,
 * itemized equipment, a spell level block continuing across a page break).
 */

type FieldSpec = Record<string, string>;

const PAGE1_FIELDS: FieldSpec = {
  CharacterName: 'Seraphine Duskwhisper',
  'CLASS  LEVEL': 'Cleric 5 / Wizard 2',
  'PLAYER NAME': 'DrnknBear',
  RACE: 'High Elf',
  BACKGROUND: 'Sage',
  'EXPERIENCE POINTS': '(Milestone)',
  STR: '8',
  STRmod: '-1',
  DEX: '14',
  'DEXmod ': '+2',
  CON: '14',
  CONmod: '+2',
  INT: '16',
  INTmod: '+3',
  WIS: '18',
  WISmod: '+4',
  CHA: '10',
  CHamod: '+0',
  StrProf: '',
  'ST Strength': '-1',
  DexProf: '',
  'ST Dexterity': '+2',
  ConProf: '',
  'ST Constitution': '+2',
  IntProf: '•',
  'ST Intelligence': '+6',
  WisProf: '•',
  'ST Wisdom': '+7',
  ChaProf: '',
  'ST Charisma': '+0',
  AcrobaticsProf: '',
  Acrobatics: '+2',
  ArcanaProf: 'P',
  Arcana: '+6',
  HistoryProf: 'E',
  History: '+9',
  InsightProf: 'P',
  Insight: '+7',
  PerceptionProf: 'P',
  Perception: '+7',
  SleightOfHandProf: '',
  SleightofHand: '+2',
  StealthProf: '',
  'Stealth ': '+2',
  Passive1: '17',
  Passive2: '17',
  Passive3: '13',
  AdditionalSenses: 'Darkvision 60 ft.',
  Init: '+2',
  AC: '18',
  ProfBonus: '+3',
  Speed: '30 ft. (Walking)',
  MaxHP: '45',
  CurrentHP: '38',
  TempHP: '--',
  Total: '5d8 + 2d6',
  HD: '',
  Defenses: 'Resistances - Necrotic',
  SaveModifiers: 'Advantage against being charmed',
  ProficienciesLang: '=== ARMOR ===\nLight Armor\n=== LANGUAGES ===\nCommon, Elvish',
  Actions1: '=== ACTIONS ===\nStandard Actions\nAttack, Dash, Disengage',
  Actions2: 'Channel Divinity: Turn Undead',
  'Wpn Name': 'Mace',
  'Wpn1 AtkBonus': '+2',
  'Wpn1 Damage': '1d6-1 Bludgeoning',
  'Wpn Notes 1': 'Simple',
  'Wpn Name 2': 'Fire Bolt',
  'Wpn2 AtkBonus ': '+6',
  'Wpn2 Damage ': '2d10 Fire',
  'Wpn Notes 2': 'Range (120)',
  'Wpn Name 3': 'Unarmed Strike',
  'Wpn3 AtkBonus  ': '+2',
  'Wpn3 Damage ': '1 Bludgeoning',
};

const PAGE1_CHECKBOXES: Record<string, boolean> = {
  'Check Box 12': true, // death save success 1
  'Check Box 13': true, // death save success 2
  'Check Box 15': true, // death save failure 1
  Inspiration: true,
};

const PAGE2_FIELDS: FieldSpec = {
  FeaturesTraits1: '=== CLERIC FEATURES ===\n* Channel Divinity',
  FeaturesTraits2: '=== WIZARD FEATURES ===\n* Arcane Recovery',
  CP: '15',
  SP: '30',
  EP: '0',
  GP: '125',
  PP: '2',
  'Weight Carried': '58 lb.',
  Encumbered: '120 lb.',
  PushDragLift: '240 lb.',
  'Eq Name0': 'Stone of Good Luck (Luckstone)',
  'Eq Qty0': '1',
  'Eq Weight0': '--',
  'Eq Name1': 'Bolts',
  'Eq Qty1': '20',
  'Eq Weight1': '1.5 lb.',
  'Eq Name2': 'Spellbook',
  'Eq Qty2': '1',
  'Eq Weight2': '3 lb.',
  'Attuned Name1': 'Stone of Good Luck (Luckstone)',
  'Attuned Qty1': '1',
  'Attuned Weight1': '--',
};

const PAGE3_FIELDS: FieldSpec = {
  CharacterName4: 'Seraphine Duskwhisper',
  GENDER: 'She/Her',
  AGE: '124',
  SIZE: 'Medium',
  HEIGHT: "5'6\"",
  WEIGHT: '128 lb.',
  ALIGNMENT: 'Neutral Good',
  FAITH: 'Sehanine',
  SKIN: 'Pale',
  EYES: 'Violet',
  HAIR: 'Silver',
  AlliesOrganizations: 'The Silver Athenaeum',
  'PersonalityTraits ': 'Endlessly curious',
  Ideals: 'Knowledge above all',
  Bonds: 'My old academy',
  Appearance: 'Slight, with ink-stained fingers.',
  Flaws: 'Easily distracted by mysteries',
  Backstory: 'Fled the Feywild to study mortal magic.',
  AdditionalNotes1: 'Keeps a raven named Quill.',
};

/**
 * Spell page A: cantrips block plus the start of the 1st-level block.
 * Spell page B: 1st level continues (no header before the first rows!),
 * then the 2nd-level block. Field names deliberately restart at index 0 on
 * page B, exactly like the real exports.
 */
const SPELL_HEADER_FIELDS: FieldSpec = {
  spellCastingClass0: 'Cleric / Wizard',
  spellCastingAbility0: 'WIS / INT',
  spellSaveDC0: '15 / 14',
  spellAtkBonus0: '+7 / +6',
};

interface SpellRowSpec {
  Prepared?: string;
  Name: string;
  Source?: string;
  SaveHit?: string;
  CastingTime?: string;
  Range?: string;
  Components?: string;
  Duration?: string;
  Page?: string;
  Notes?: string;
}

const PAGE4_BLOCKS: { header?: [string, string, string?]; rows: SpellRowSpec[] }[] = [
  {
    header: ['spellHeader0', '=== CANTRIPS ===', '(At Will)'],
    rows: [
      {
        Prepared: 'O',
        Name: 'Sacred Flame',
        Source: 'Cleric',
        SaveHit: 'DEX 15',
        CastingTime: '1A',
        Range: '60 ft.',
        Components: 'V,S',
        Duration: 'Instantaneous',
        Page: 'PHB 272',
        Notes: 'V/S',
      },
      {
        Prepared: 'O',
        Name: 'Fire Bolt',
        Source: 'Wizard',
        SaveHit: '+6',
        CastingTime: '1A',
        Range: '120 ft.',
        Components: 'V,S',
        Duration: 'Instantaneous',
        Page: 'PHB 242',
      },
    ],
  },
  {
    header: ['spellHeader1', '=== 1st LEVEL ===', '4 Slots OOOO'],
    rows: [
      {
        Prepared: 'P',
        Name: 'Bless',
        Source: 'Cleric',
        CastingTime: '1A',
        Range: '30 ft.',
        Components: 'V,S,M',
        Duration: 'Concentration, up to 1 minute',
        Page: 'PHB 219',
      },
      {
        Prepared: 'O',
        Name: 'Detect Magic [R]',
        Source: 'Cleric',
        CastingTime: '1A',
        Range: 'Self',
        Components: 'V,S',
        Duration: 'Concentration, up to 10 minutes',
        Page: 'PHB 231',
      },
    ],
  },
];

const PAGE5_BLOCKS: typeof PAGE4_BLOCKS = [
  {
    // No header — this block continues 1st level across the page break.
    rows: [
      {
        Prepared: 'O',
        Name: 'Magic Missile',
        Source: 'Wizard',
        CastingTime: '1A',
        Range: '120 ft.',
        Components: 'V,S',
        Duration: 'Instantaneous',
        Page: 'PHB 257',
      },
      // Duplicate of a page-4 spell: the converter must dedupe it.
      { Prepared: 'O', Name: 'Bless', Source: 'Cleric' },
    ],
  },
  {
    header: ['spellHeader2', '=== 2nd LEVEL ===', '3 Slots OOO | 2 Pact OO'],
    rows: [
      {
        Prepared: 'O',
        Name: 'Misty Step',
        Source: 'Wizard',
        CastingTime: '1BA',
        Range: 'Self',
        Components: 'V',
        Duration: 'Instantaneous',
        Page: 'PHB 260',
      },
    ],
  },
];

interface FixtureBuilder {
  doc: PDFDocument;
  usedNames: Set<string>;
}

/**
 * pdf-lib refuses duplicate field names, but real DDB exports reuse names
 * across spell pages. Create the field under a unique placeholder, then
 * rewrite its /T entry to the desired (possibly duplicate) name.
 */
function addTextField(
  builder: FixtureBuilder,
  page: PDFPage,
  name: string,
  value: string,
  x: number,
  y: number
): void {
  const form = builder.doc.getForm();
  const placeholder = builder.usedNames.has(name) ? `__dup${builder.usedNames.size}__${name}` : name;
  builder.usedNames.add(name);
  const field = form.createTextField(placeholder);
  field.addToPage(page, { x, y, width: 160, height: 12 });
  if (value !== '') field.setText(value);
  if (placeholder !== name) {
    field.acroField.dict.set(PDFName.of('T'), PDFString.of(name));
  }
}

function addCheckBox(
  builder: FixtureBuilder,
  page: PDFPage,
  name: string,
  checked: boolean,
  x: number,
  y: number
): void {
  const box = builder.doc.getForm().createCheckBox(name);
  box.addToPage(page, { x, y, width: 10, height: 10 });
  if (checked) box.check();
}

const SPELL_COLUMNS = [
  'Prepared',
  'Name',
  'Source',
  'SaveHit',
  'CastingTime',
  'Range',
  'Components',
  'Duration',
  'Page',
  'Notes',
] as const;

function addSpellPage(builder: FixtureBuilder, blocks: typeof PAGE4_BLOCKS): void {
  const page = builder.doc.addPage([612, 792]);
  let y = 700;
  for (const [name, value] of Object.entries(SPELL_HEADER_FIELDS)) {
    addTextField(builder, page, name, value, 40, y);
    y -= 14;
  }
  let rowIndex = 0;
  for (const block of blocks) {
    if (block.header) {
      const [headerField, headerValue, slotValue] = block.header;
      addTextField(builder, page, headerField, headerValue, 40, y);
      addTextField(
        builder,
        page,
        headerField.replace('spellHeader', 'spellSlotHeader'),
        slotValue ?? '',
        260,
        y
      );
      y -= 14;
    }
    for (const row of block.rows) {
      let x = 20;
      for (const column of SPELL_COLUMNS) {
        addTextField(builder, page, `spell${column}${rowIndex}`, row[column] ?? '', x, y);
        x += 55;
      }
      rowIndex++;
      y -= 14;
    }
  }
}

export async function buildDdbStylePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const builder: FixtureBuilder = { doc, usedNames: new Set() };

  const addFieldsPage = (fields: FieldSpec, checkboxes: Record<string, boolean> = {}) => {
    const page = doc.addPage([612, 792]);
    let y = 760;
    const nextY = () => {
      y -= 14;
      if (y < 20) y = 760;
      return y;
    };
    for (const [name, value] of Object.entries(fields)) {
      addTextField(builder, page, name, value, 20, nextY());
    }
    for (const [name, checked] of Object.entries(checkboxes)) {
      addCheckBox(builder, page, name, checked, 400, nextY());
    }
  };

  addFieldsPage(PAGE1_FIELDS, PAGE1_CHECKBOXES);
  addFieldsPage(PAGE2_FIELDS);
  addFieldsPage(PAGE3_FIELDS);
  addSpellPage(builder, PAGE4_BLOCKS);
  addSpellPage(builder, PAGE5_BLOCKS);

  // The defining quirk of DDB's exports: widgets exist on the pages, but the
  // catalog exposes no AcroForm, so form-level APIs find nothing.
  doc.catalog.delete(PDFName.of('AcroForm'));

  return doc.save({ updateFieldAppearances: false });
}
