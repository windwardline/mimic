import { describe, expect, it } from 'vitest';
import { convertPdfToRoll20 } from './converter';
import { extractSheetFields } from './pdf-extractor';
import { buildFlattenedPdf } from './testing/flattened-fixture';

describe('flattened export fallback (end to end)', () => {
  it('converts a flattened (print-to-PDF) copy via the text-layer path', async () => {
    const pdf = await buildFlattenedPdf();
    const character = await convertPdfToRoll20(pdf);

    expect(character.name).toBe('Tobias Quickstep');
    const byName = new Map(character.attribs.map((a) => [a.name, a]));

    expect(byName.get('class')?.current).toBe('Rogue');
    expect(byName.get('level')?.current).toBe(4);
    expect(byName.get('race')?.current).toBe('Halfling');
    expect(byName.get('background')?.current).toBe('Urchin');
    expect(byName.get('alignment')?.current).toBe('Chaotic Good');
    expect(byName.get('experience')?.current).toBe(2900);

    expect(byName.get('dexterity')?.current).toBe(18);
    expect(byName.get('dexterity_mod')?.current).toBe(4);
    expect(byName.get('dexterity_save_prof')?.current).toBe('(@{pb})');
    expect(byName.get('strength_save_prof')).toBeUndefined();

    expect(byName.get('acrobatics_prof')?.current).toBe('(@{pb}*@{acrobatics_type})');
    expect(byName.get('stealth_type')?.current).toBe('2');
    expect(byName.get('stealth_bonus')?.current).toBe(8);

    expect(byName.get('ac')?.current).toBe(15);
    expect(byName.get('speed')?.current).toBe(25);
    expect(byName.get('hp')).toMatchObject({ current: 20, max: 27 });
    expect(byName.get('hit_dice')).toMatchObject({ current: '4', max: '4' });
    expect(byName.get('hitdietype')?.current).toBe('d8');
    expect(byName.get('passive_wisdom')?.current).toBe(12);

    // Template labels must not leak into extracted values.
    for (const attr of character.attribs) {
      expect(String(attr.current)).not.toContain('SAVING THROWS');
      expect(String(attr.current)).not.toContain('PROFICIENCY BONUS');
    }
    expect(byName.get('other_proficiencies_and_languages')?.current).toBe(
      '=== LANGUAGES ===\nCommon, Halfling'
    );

    const attacks = character.attribs.filter((a) => a.name.endsWith('_atkname'));
    expect(attacks.map((a) => a.current)).toEqual(['Shortsword']);

    const items = character.attribs.filter((a) => a.name.endsWith('_itemname'));
    expect(items.map((a) => a.current).sort()).toEqual(['Caltrops', 'Thieves’ Tools']);
    const caltrops = items.find((a) => a.current === 'Caltrops')!;
    const caltropsPrefix = caltrops.name.replace(/_itemname$/, '');
    expect(byName.get(`${caltropsPrefix}_itemcount`)?.current).toBe(20);

    // Spell rows come from column parsing; the wrapped duration line must
    // merge into the Charm Person row and set the concentration flag.
    const spellNames = character.attribs.filter((a) => a.name.endsWith('_spellname'));
    expect(spellNames.map((a) => a.current).sort()).toEqual(['Charm Person', 'Mage Hand']);
    const mageHand = spellNames.find((a) => a.current === 'Mage Hand')!;
    expect(mageHand.name).toMatch(/^repeating_spell-cantrip_/);
    const charm = spellNames.find((a) => a.current === 'Charm Person')!;
    expect(charm.name).toMatch(/^repeating_spell-1_/);
    const charmPrefix = charm.name.replace(/_spellname$/, '');
    expect(byName.get(`${charmPrefix}_spellprepared`)?.current).toBe('1');
    expect(byName.get(`${charmPrefix}_spellduration`)?.current).toBe('Concentration, up to 1 hour');
    expect(byName.get(`${charmPrefix}_spellconcentration`)?.current).toBe('{{concentration=1}}');
    expect(byName.get(`${charmPrefix}_spellsave`)?.current).toBe('Wisdom');
    expect(byName.get('lvl1_slots_total')?.current).toBe(2);

    expect(byName.get('spell_save_dc')?.current).toBe(11);
    expect(byName.get('spellcasting_ability')?.current).toBe('@{intelligence_mod}+');

    expect(character.bio).toContain('Waterdeep');

    for (const a of character.attribs) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.current).not.toBeUndefined();
      expect(a.max).not.toBeUndefined();
    }
  });

  it('extracts through extractSheetFields transparently (widgets absent)', async () => {
    const pdf = await buildFlattenedPdf();
    const extracted = await extractSheetFields(pdf);
    expect(extracted.text.get('CharacterName')).toBe('Tobias Quickstep');
    expect(extracted.text.get('StealthProf')).toBe('E');
    expect(extracted.checked.size).toBe(0); // checkbox state is not recoverable
  });
});
