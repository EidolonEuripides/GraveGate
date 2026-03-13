"use strict";

const { SPELL_TARGETING_SHAPES } = require("../constants");

const SUPPORTED_TARGET_TYPES = new Set([
  "self",
  "single_target",
  "single_or_split_target"
]);

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeTargetType(spell) {
  return cleanText(
    spell && spell.targeting && spell.targeting.type
      ? spell.targeting.type
      : spell && spell.targeting_type
  ).toLowerCase();
}

function normalizeCastingTime(spell) {
  return cleanText(spell && spell.casting_time).toLowerCase();
}

function normalizeSpellId(spell) {
  return cleanText(spell && (spell.spell_id || spell.id));
}

function isSupportedAreaTargetType(targetType) {
  return /^(cone|cube|sphere|line)_\d+ft$/.test(String(targetType || ""));
}

function getCombatMapSpellSupport(spell) {
  const spellId = normalizeSpellId(spell);
  const name = cleanText(spell && spell.name, spellId || "Unknown Spell");
  const targetType = normalizeTargetType(spell);
  const castingTime = normalizeCastingTime(spell);

  if (!spellId) {
    return {
      supported: false,
      reason: "missing spell id"
    };
  }

  if (castingTime && castingTime !== "1 action") {
    return {
      supported: false,
      reason: `${name} uses ${castingTime}, and map mode currently supports 1-action combat spells only.`
    };
  }

  if (!targetType) {
    return {
      supported: false,
      reason: `${name} does not expose a supported targeting profile yet.`
    };
  }

  if (targetType === "utility" || targetType === "object") {
    return {
      supported: false,
      reason: `${name} is not a combat targeting spell for map mode.`
    };
  }

  if (SUPPORTED_TARGET_TYPES.has(targetType) || isSupportedAreaTargetType(targetType)) {
    return {
      supported: true,
      reason: ""
    };
  }

  return {
    supported: false,
    reason: `${name} uses ${targetType}, which is not in the current supported map-mode spell slice.`
  };
}

function partitionCombatMapSpells(spells) {
  const safeSpells = Array.isArray(spells) ? spells : [];
  return safeSpells.reduce((accumulator, spell) => {
    const support = getCombatMapSpellSupport(spell);
    if (support.supported) {
      accumulator.supported.push(spell);
    } else {
      accumulator.unsupported.push({
        spell_id: normalizeSpellId(spell),
        name: cleanText(spell && spell.name, normalizeSpellId(spell) || "Unknown Spell"),
        reason: support.reason
      });
    }
    return accumulator;
  }, {
    supported: [],
    unsupported: []
  });
}

function filterSupportedCombatMapSpells(spells) {
  return partitionCombatMapSpells(spells).supported;
}

function isAreaCombatMapSpell(spell) {
  const targetType = normalizeTargetType(spell);
  if (!isSupportedAreaTargetType(targetType)) {
    return false;
  }
  return true;
}

function getSpellShapeHint(spell) {
  const targetType = normalizeTargetType(spell);
  if (targetType === "self") return SPELL_TARGETING_SHAPES.SELF;
  if (targetType === "single_target") return SPELL_TARGETING_SHAPES.SINGLE;
  if (targetType === "single_or_split_target") return SPELL_TARGETING_SHAPES.SPLIT;
  if (targetType.startsWith("cone_")) return SPELL_TARGETING_SHAPES.CONE;
  if (targetType.startsWith("cube_")) return SPELL_TARGETING_SHAPES.CUBE;
  if (targetType.startsWith("sphere_")) return SPELL_TARGETING_SHAPES.SPHERE;
  if (targetType.startsWith("line_")) return SPELL_TARGETING_SHAPES.LINE;
  return SPELL_TARGETING_SHAPES.NONE;
}

module.exports = {
  getCombatMapSpellSupport,
  partitionCombatMapSpells,
  filterSupportedCombatMapSpells,
  isAreaCombatMapSpell,
  getSpellShapeHint
};
