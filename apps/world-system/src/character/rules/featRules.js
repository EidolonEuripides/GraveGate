"use strict";

const { loadFeatContent } = require("../../content/contentLoader");

let cachedFeatMap = null;

const FEAT_SLOT_LEVELS = [4, 8, 12, 16, 19];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

function buildFeatMap(entries) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  return safeEntries.reduce((map, entry) => {
    const featId = normalizeId(entry && (entry.feat_id || entry.id));
    if (featId) {
      map[featId] = clone(entry);
    }
    return map;
  }, {});
}

function getFeatRulesMap() {
  if (cachedFeatMap) {
    return cachedFeatMap;
  }
  const loaded = loadFeatContent();
  if (loaded.ok) {
    cachedFeatMap = buildFeatMap(loaded.payload.entries);
    return cachedFeatMap;
  }
  cachedFeatMap = {};
  return cachedFeatMap;
}

function getFeatData(featId, entries) {
  const normalizedFeatId = normalizeId(featId);
  if (!normalizedFeatId) {
    return {
      ok: false,
      event_type: "feat_data_lookup_failed",
      payload: { feat_data: null },
      error: "feat_id is required"
    };
  }
  const featMap = Array.isArray(entries) ? buildFeatMap(entries) : getFeatRulesMap();
  const featData = featMap[normalizedFeatId] || null;
  if (!featData) {
    return {
      ok: false,
      event_type: "feat_data_lookup_failed",
      payload: { feat_data: null },
      error: "feat data not found"
    };
  }
  return {
    ok: true,
    event_type: "feat_data_found",
    payload: { feat_data: clone(featData) },
    error: null
  };
}

function listAvailableFeats(entries) {
  const featMap = Array.isArray(entries) ? buildFeatMap(entries) : getFeatRulesMap();
  return {
    ok: true,
    event_type: "feat_rules_listed",
    payload: {
      feats: Object.values(featMap).map((entry) => clone(entry))
    },
    error: null
  };
}

function getFeatSlotsForLevel(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level || 1)));
  return FEAT_SLOT_LEVELS.filter((entry) => safeLevel >= entry).length;
}

function getRemainingFeatSlots(character) {
  const safeCharacter = character && typeof character === "object" ? character : {};
  const taken = Array.isArray(safeCharacter.feats) ? safeCharacter.feats.length : 0;
  const total = getFeatSlotsForLevel(safeCharacter.level);
  return {
    total_slots: total,
    used_slots: taken,
    remaining_slots: Math.max(0, total - taken)
  };
}

function isFeatSlotAvailable(character) {
  return getRemainingFeatSlots(character).remaining_slots > 0;
}

function getAbilityScore(character, abilityId) {
  const safeCharacter = character && typeof character === "object" ? character : {};
  const stats = safeCharacter.stats && typeof safeCharacter.stats === "object" ? safeCharacter.stats : {};
  const raw = stats[abilityId];
  return Number.isFinite(Number(raw)) ? Number(raw) : 10;
}

function validateFeatPrerequisites(character, featData) {
  const safeFeat = featData && typeof featData === "object" ? featData : {};
  const prerequisites = safeFeat.prerequisites && typeof safeFeat.prerequisites === "object"
    ? safeFeat.prerequisites
    : {};

  const minimumLevel = Number.isFinite(Number(prerequisites.minimum_level))
    ? Math.max(1, Math.floor(Number(prerequisites.minimum_level)))
    : null;
  if (minimumLevel !== null && Number(character && character.level || 1) < minimumLevel) {
    return {
      ok: false,
      error: "feat minimum level not met",
      details: { required_level: minimumLevel }
    };
  }

  const abilityMinimums = prerequisites.ability_score_minimums && typeof prerequisites.ability_score_minimums === "object"
    ? prerequisites.ability_score_minimums
    : {};
  const abilityKeys = Object.keys(abilityMinimums);
  for (let index = 0; index < abilityKeys.length; index += 1) {
    const abilityId = abilityKeys[index];
    const requiredScore = Number(abilityMinimums[abilityId]);
    if (!Number.isFinite(requiredScore)) {
      continue;
    }
    if (getAbilityScore(character, abilityId) < requiredScore) {
      return {
        ok: false,
        error: "feat ability prerequisite not met",
        details: {
          ability_id: abilityId,
          required_score: requiredScore
        }
      };
    }
  }

  if (prerequisites.spellcasting_required === true) {
    const spellcastingAbility = character && character.spellcasting_ability
      ? String(character.spellcasting_ability).trim()
      : "";
    if (!spellcastingAbility) {
      return {
        ok: false,
        error: "feat requires spellcasting",
        details: {}
      };
    }
  }

  return {
    ok: true,
    error: null,
    details: {}
  };
}

function featRequiresAbilityChoice(featData) {
  const metadata = featData && featData.metadata && typeof featData.metadata === "object"
    ? featData.metadata
    : {};
  return metadata.requires_ability_choice === true;
}

module.exports = {
  FEAT_SLOT_LEVELS,
  getFeatData,
  listAvailableFeats,
  getFeatSlotsForLevel,
  getRemainingFeatSlots,
  isFeatSlotAvailable,
  validateFeatPrerequisites,
  featRequiresAbilityChoice
};
