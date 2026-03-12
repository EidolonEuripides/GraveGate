"use strict";

function toNumberOrDefault(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveSaveModifier(character, abilityId) {
  const explicit = character && typeof character === "object"
    ? character[abilityId + "_save_modifier"]
    : undefined;
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    return explicit;
  }
  const savingThrows = character && character.saving_throws && typeof character.saving_throws === "object"
    ? character.saving_throws
    : {};
  const fallback = savingThrows[abilityId];
  return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : null;
}

function toObjectOrDefault(value, fallback) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return fallback;
}

function toArrayOrDefault(value, fallback) {
  return Array.isArray(value) ? value.slice() : fallback;
}

function buildPosition(inputPosition, characterPosition) {
  if (inputPosition && typeof inputPosition.x === "number" && typeof inputPosition.y === "number") {
    return { x: inputPosition.x, y: inputPosition.y };
  }

  if (
    characterPosition &&
    typeof characterPosition.x === "number" &&
    typeof characterPosition.y === "number"
  ) {
    return { x: characterPosition.x, y: characterPosition.y };
  }

  return { x: 0, y: 0 };
}

function toCombatParticipant(input) {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      event_type: "combat_participant_conversion_failed",
      payload: { participant: null },
      error: "input object is required"
    };
  }

  const character = input.character;
  if (!character || typeof character !== "object") {
    return {
      ok: false,
      event_type: "combat_participant_conversion_failed",
      payload: { participant: null },
      error: "character object is required"
    };
  }

  if (!character.character_id) {
    return {
      ok: false,
      event_type: "combat_participant_conversion_failed",
      payload: { participant: null },
      error: "character.character_id is required"
    };
  }

  const hpSummary = character.hp_summary && typeof character.hp_summary === "object"
    ? character.hp_summary
    : {};

  const participant = {
    participant_id: character.character_id,
    name: character.name || "Unknown Character",
    team: input.team || character.team || "team_a",
    armor_class: toNumberOrDefault(character.armor_class, 10),
    current_hp: toNumberOrDefault(character.current_hitpoints, toNumberOrDefault(hpSummary.current, 10)),
    max_hp: toNumberOrDefault(character.hitpoint_max, toNumberOrDefault(hpSummary.max, 10)),
    attack_bonus: toNumberOrDefault(input.attack_bonus, toNumberOrDefault(character.attack_bonus, 0)),
    damage: toNumberOrDefault(input.damage, toNumberOrDefault(character.damage, 1)),
    position: buildPosition(input.position, character.position),
    movement_speed: toNumberOrDefault(character.speed, 30),
    stats: toObjectOrDefault(character.stats, {}),
    feats: toArrayOrDefault(character.feats, []),
    feat_flags: toObjectOrDefault(character.metadata && character.metadata.feat_flags, {}),
    spellbook: toObjectOrDefault(character.spellbook, null),
    spellcasting_ability: character.spellcasting_ability || null,
    spellsave_dc: toNumberOrDefault(character.spellsave_dc, null),
    spell_attack_bonus: toNumberOrDefault(character.spell_attack_bonus, null),
    proficiency_bonus: toNumberOrDefault(character.proficiency_bonus, null),
    strength_save_modifier: resolveSaveModifier(character, "strength"),
    dexterity_save_modifier: resolveSaveModifier(character, "dexterity"),
    constitution_save_modifier: resolveSaveModifier(character, "constitution"),
    intelligence_save_modifier: resolveSaveModifier(character, "intelligence"),
    wisdom_save_modifier: resolveSaveModifier(character, "wisdom"),
    charisma_save_modifier: resolveSaveModifier(character, "charisma"),
    vulnerabilities: toArrayOrDefault(character.vulnerabilities, []),
    resistances: toArrayOrDefault(character.resistances, []),
    immunities: toArrayOrDefault(character.immunities, []),
    equipped_loadout: toObjectOrDefault(character.equipped_item_profiles, {}),
    readiness: {
      race_id: character.race_id || character.race || null,
      class_id: character.class_id || character.class || null,
      armor_profile: toObjectOrDefault(
        character.equipped_item_profiles && character.equipped_item_profiles.body,
        null
      ),
      shield_profile: toObjectOrDefault(
        character.equipped_item_profiles && character.equipped_item_profiles.off_hand,
        null
      ),
      weapon_profile: toObjectOrDefault(
        character.equipped_item_profiles && character.equipped_item_profiles.main_hand,
        null
      )
    }
  };

  return {
    ok: true,
    event_type: "combat_participant_converted",
    payload: { participant },
    error: null
  };
}

module.exports = {
  toCombatParticipant
};
