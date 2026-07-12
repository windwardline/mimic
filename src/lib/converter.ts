export function convertDDBtoRoll20(ddbJson: any) {
  // Validate input
  if (!ddbJson || !ddbJson.character) {
    throw new Error('Invalid D&D Beyond JSON format');
  }

  const char = ddbJson.character;

  // Helper to calculate total ability score
  const getAbilityScore = (id: number) => {
    // 1: STR, 2: DEX, 3: CON, 4: INT, 5: WIS, 6: CHA
    const base = char.stats.find((s: any) => s.id === id)?.value || 10;
    const bonus = char.bonusStats.find((s: any) => s.id === id)?.value || 0;
    const override = char.overrideStats.find((s: any) => s.id === id)?.value || 0;
    
    // Add racial modifiers, etc.
    let modifier = 0;
    if (char.modifiers) {
      const typeStr = ['', 'strength-score', 'dexterity-score', 'constitution-score', 'intelligence-score', 'wisdom-score', 'charisma-score'][id];
      ['race', 'class', 'background', 'item', 'feat'].forEach(source => {
        if (char.modifiers[source]) {
          char.modifiers[source].forEach((mod: any) => {
            if (mod.type === 'bonus' && mod.subType === typeStr) {
              modifier += mod.value;
            }
          });
        }
      });
    }

    if (override > 0) return override;
    return base + bonus + modifier;
  };

  const str = getAbilityScore(1);
  const dex = getAbilityScore(2);
  const con = getAbilityScore(3);
  const int = getAbilityScore(4);
  const wis = getAbilityScore(5);
  const cha = getAbilityScore(6);

  const getMod = (score: number) => Math.floor((score - 10) / 2);

  const level = char.classes.reduce((acc: number, c: any) => acc + c.level, 0);
  const pb = Math.ceil(level / 4) + 1;

  // HP Calc
  const baseHp = char.baseHitPoints || 10;
  const hpBonus = (char.bonusHitPoints || 0) + (level * getMod(con));
  const hpMax = baseHp + hpBonus;
  const hpCurrent = hpMax - (char.removedHitPoints || 0);

  // Speed
  const walkSpeed = char.race?.weightSpeeds?.normal?.walk || 30;

  // Format into VTTES Roll20 JSON Structure
  const attribs = [
    { name: "strength", current: str, max: "" },
    { name: "dexterity", current: dex, max: "" },
    { name: "constitution", current: con, max: "" },
    { name: "intelligence", current: int, max: "" },
    { name: "wisdom", current: wis, max: "" },
    { name: "charisma", current: cha, max: "" },
    
    { name: "strength_mod", current: getMod(str), max: "" },
    { name: "dexterity_mod", current: getMod(dex), max: "" },
    { name: "constitution_mod", current: getMod(con), max: "" },
    { name: "intelligence_mod", current: getMod(int), max: "" },
    { name: "wisdom_mod", current: getMod(wis), max: "" },
    { name: "charisma_mod", current: getMod(cha), max: "" },

    { name: "hp", current: hpCurrent, max: hpMax },
    { name: "hp_temp", current: char.temporaryHitPoints || 0, max: "" },
    { name: "speed", current: walkSpeed, max: "" },
    { name: "level", current: level, max: "" },
    { name: "pb", current: pb, max: "" },
    { name: "ac", current: 10 + getMod(dex), max: "" }, // Base AC, proper calculation requires parsing armor
    
    { name: "class", current: char.classes.map((c: any) => `${c.definition.name} ${c.level}`).join(', '), max: "" },
    { name: "race", current: char.race.fullName || "", max: "" },
    { name: "background", current: char.background?.definition?.name || "", max: "" },
    { name: "alignment", current: "", max: "" },
    
    // Passives
    { name: "passive_wisdom", current: 10 + getMod(wis), max: "" },
  ];

  return {
    schema_version: 1,
    type: "character",
    character: {
      name: char.name || "Unknown Character",
      avatar: char.decorations?.avatarUrl || "",
      bio: char.notes?.personalMe || "",
      attribs: attribs
    }
  };
}
