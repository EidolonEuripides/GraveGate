"use strict";

const {
  getFeatData,
  listAvailableFeats,
  getRemainingFeatSlots,
  validateFeatPrerequisites,
  featRequiresAbilityChoice
} = require("../rules/featRules");
const {
  SAVE_ABILITIES,
  normalizeAbilityId,
  collectSavingThrowProficiencies,
  applyDerivedSavingThrowState
} = require("../rules/saveRules");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function success(eventType, payload) {
  return {
    ok: true,
    event_type: eventType,
    payload: payload || {},
    error: null
  };
}

function failure(eventType, message, payload) {
  return {
    ok: false,
    event_type: eventType,
    payload: payload || {},
    error: message
  };
}

function loadCharacters(context) {
  if (!context.characterPersistence || typeof context.characterPersistence.listCharacters !== "function") {
    return failure("player_feat_failed", "characterPersistence.listCharacters is required");
  }
  const listed = context.characterPersistence.listCharacters();
  if (!listed.ok) {
    return failure("player_feat_failed", listed.error || "failed to load characters");
  }
  return success("player_feat_characters_loaded", {
    characters: Array.isArray(listed.payload.characters) ? listed.payload.characters : []
  });
}

function saveCharacter(context, character) {
  if (!context.characterPersistence || typeof context.characterPersistence.saveCharacter !== "function") {
    return { ok: false, error: "characterPersistence.saveCharacter is required" };
  }
  return context.characterPersistence.saveCharacter(character);
}

function resolveFeatEntries(context) {
  if (!context || typeof context.loadContentBundle !== "function") {
    return null;
  }
  const loaded = context.loadContentBundle();
  if (!loaded || loaded.ok !== true) {
    return null;
  }
  const content = loaded.payload && loaded.payload.content ? loaded.payload.content : {};
  return Array.isArray(content.feats) ? content.feats : null;
}

function normalizeFeatList(value) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean)
    : [];
}

function dedupeStrings(values) {
  const safe = Array.isArray(values) ? values : [];
  const seen = new Set();
  const out = [];
  for (let index = 0; index < safe.length; index += 1) {
    const normalized = String(safe[index] || "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function applyFeatEffects(character, featData, options) {
  const nextCharacter = clone(character);
  const cfg = options || {};
  const effects = Array.isArray(featData && featData.effects) ? featData.effects : [];
  const appliedEffects = [];

  for (let index = 0; index < effects.length; index += 1) {
    const effect = effects[index] && typeof effects[index] === "object" ? effects[index] : {};
    const type = String(effect.type || "").trim().toLowerCase();
    if (!type) {
      continue;
    }

    if (type === "initiative_bonus") {
      const delta = Number.isFinite(Number(effect.value)) ? Number(effect.value) : 0;
      nextCharacter.initiative = Number.isFinite(Number(nextCharacter.initiative))
        ? Number(nextCharacter.initiative) + delta
        : delta;
      appliedEffects.push({ type, value: delta });
      continue;
    }

    if (type === "hitpoint_max_per_level") {
      const perLevel = Number.isFinite(Number(effect.value)) ? Number(effect.value) : 0;
      const safeLevel = Number.isFinite(Number(nextCharacter.level)) ? Number(nextCharacter.level) : 1;
      const delta = perLevel * safeLevel;
      nextCharacter.hitpoint_max = Number.isFinite(Number(nextCharacter.hitpoint_max))
        ? Number(nextCharacter.hitpoint_max) + delta
        : delta;
      nextCharacter.current_hitpoints = Number.isFinite(Number(nextCharacter.current_hitpoints))
        ? Number(nextCharacter.current_hitpoints) + delta
        : delta;
      const hpSummary = nextCharacter.hp_summary && typeof nextCharacter.hp_summary === "object"
        ? clone(nextCharacter.hp_summary)
        : {};
      hpSummary.max = Number.isFinite(Number(hpSummary.max)) ? Number(hpSummary.max) + delta : nextCharacter.hitpoint_max;
      hpSummary.current = Number.isFinite(Number(hpSummary.current)) ? Number(hpSummary.current) + delta : nextCharacter.current_hitpoints;
      hpSummary.temporary = Number.isFinite(Number(hpSummary.temporary)) ? Number(hpSummary.temporary) : 0;
      nextCharacter.hp_summary = hpSummary;
      appliedEffects.push({ type, value: delta, per_level: perLevel });
      continue;
    }

    if (type === "feature_flag") {
      const flagKey = String(effect.key || "").trim();
      if (!flagKey) {
        continue;
      }
      const metadata = nextCharacter.metadata && typeof nextCharacter.metadata === "object"
        ? clone(nextCharacter.metadata)
        : {};
      const featFlags = metadata.feat_flags && typeof metadata.feat_flags === "object"
        ? clone(metadata.feat_flags)
        : {};
      featFlags[flagKey] = effect.value === undefined ? true : effect.value;
      metadata.feat_flags = featFlags;
      nextCharacter.metadata = metadata;
      appliedEffects.push({ type, key: flagKey, value: featFlags[flagKey] });
      continue;
    }

    if (type === "movement_speed_bonus") {
      const delta = Number.isFinite(Number(effect.value)) ? Number(effect.value) : 0;
      nextCharacter.speed = Number.isFinite(Number(nextCharacter.speed))
        ? Number(nextCharacter.speed) + delta
        : 30 + delta;
      appliedEffects.push({ type, value: delta });
      continue;
    }

    if (type === "resilient_ability_choice") {
      const selectedAbility = normalizeAbilityId(cfg.ability_id);
      if (!selectedAbility) {
        throw new Error("resilient requires a valid ability choice");
      }
      const nextStats = nextCharacter.stats && typeof nextCharacter.stats === "object"
        ? clone(nextCharacter.stats)
        : {};
      const currentScore = Number.isFinite(Number(nextStats[selectedAbility])) ? Number(nextStats[selectedAbility]) : 10;
      nextStats[selectedAbility] = currentScore + 1;
      nextCharacter.stats = nextStats;

      const appliedProficiencies = nextCharacter.applied_proficiencies && typeof nextCharacter.applied_proficiencies === "object"
        ? clone(nextCharacter.applied_proficiencies)
        : {};
      appliedProficiencies.saving_throws = dedupeStrings(
        (Array.isArray(appliedProficiencies.saving_throws) ? appliedProficiencies.saving_throws : []).concat([selectedAbility])
      );
      nextCharacter.applied_proficiencies = appliedProficiencies;

      const metadata = nextCharacter.metadata && typeof nextCharacter.metadata === "object"
        ? clone(nextCharacter.metadata)
        : {};
      const featSelections = metadata.feat_selections && typeof metadata.feat_selections === "object"
        ? clone(metadata.feat_selections)
        : {};
      featSelections.resilient = selectedAbility;
      metadata.feat_selections = featSelections;
      nextCharacter.metadata = metadata;
      appliedEffects.push({ type, ability_id: selectedAbility, stat_increase: 1, gained_save_proficiency: true });
    }
  }

  return {
    character: nextCharacter,
    applied_effects: appliedEffects
  };
}

function processFeatRequest(input) {
  const data = input || {};
  const context = data.context || {};
  const playerId = String(data.player_id || "").trim();
  const action = String(data.action || "list").trim().toLowerCase();
  const featId = String(data.feat_id || "").trim().toLowerCase();
  const abilityId = normalizeAbilityId(data.ability_id);

  if (!playerId) {
    return failure("player_feat_failed", "player_id is required");
  }

  if (action !== "list" && action !== "take") {
    return failure("player_feat_failed", "unsupported feat action", {
      action
    });
  }

  const loadedCharacters = loadCharacters(context);
  if (!loadedCharacters.ok) {
    return failure("player_feat_failed", loadedCharacters.error);
  }

  const character = loadedCharacters.payload.characters.find((entry) => String(entry.player_id || "") === playerId);
  if (!character) {
    return failure("player_feat_failed", "character not found for player", {
      player_id: playerId
    });
  }

  const featEntries = resolveFeatEntries(context);
  const slots = getRemainingFeatSlots(character);
  const listedFeats = listAvailableFeats(featEntries);
  if (!listedFeats.ok) {
    return failure("player_feat_failed", listedFeats.error || "failed to list feats");
  }

  if (action === "list") {
    return success("player_feat_listed", {
      action: "list",
      character_id: character.character_id || null,
      taken_feat_ids: normalizeFeatList(character.feats),
      feat_slots: slots,
      feats: listedFeats.payload.feats.map((entry) => ({
        feat_id: entry.feat_id,
        name: entry.name,
        description: entry.description,
        prerequisites: clone(entry.prerequisites || {}),
        metadata: clone(entry.metadata || {})
      }))
    });
  }

  if (!featId) {
    return failure("player_feat_failed", "take requires feat_id");
  }

  const featOut = getFeatData(featId, featEntries);
  if (!featOut.ok) {
    return failure("player_feat_failed", featOut.error || "feat data not found", {
      feat_id: featId
    });
  }

  const normalizedFeats = normalizeFeatList(character.feats);
  if (normalizedFeats.includes(featId)) {
    return failure("player_feat_failed", "feat is already known", {
      feat_id: featId
    });
  }

  if (slots.remaining_slots <= 0) {
    return failure("player_feat_failed", "no feat slots available", {
      feat_slots: slots
    });
  }

  const prerequisiteCheck = validateFeatPrerequisites(character, featOut.payload.feat_data);
  if (!prerequisiteCheck.ok) {
    return failure("player_feat_failed", prerequisiteCheck.error || "feat prerequisites not met", {
      feat_id: featId,
      details: prerequisiteCheck.details || {}
    });
  }

  if (featRequiresAbilityChoice(featOut.payload.feat_data)) {
    if (!abilityId) {
      return failure("player_feat_failed", "feat requires ability_id", {
        feat_id: featId,
        valid_abilities: SAVE_ABILITIES.slice()
      });
    }
    if (featId === "resilient") {
      const proficientSaves = collectSavingThrowProficiencies(character);
      if (proficientSaves.includes(abilityId)) {
        return failure("player_feat_failed", "resilient requires an ability without existing save proficiency", {
          feat_id: featId,
          ability_id: abilityId
        });
      }
    }
  }

  const applied = applyFeatEffects(character, featOut.payload.feat_data, {
    ability_id: abilityId
  });
  const nextCharacter = applyDerivedSavingThrowState(applied.character);
  nextCharacter.feats = normalizedFeats.concat([featId]);
  nextCharacter.updated_at = new Date().toISOString();

  const saved = saveCharacter(context, nextCharacter);
  if (!saved.ok) {
    return failure("player_feat_failed", saved.error || "failed to save character feat state", {
      feat_id: featId
    });
  }

  return success("player_feat_taken", {
    action: "take",
    character: clone(saved.payload.character),
    feat: {
      feat_id: featOut.payload.feat_data.feat_id,
      name: featOut.payload.feat_data.name,
      description: featOut.payload.feat_data.description
    },
    feat_choice: abilityId ? { ability_id: abilityId } : null,
    feat_slots: getRemainingFeatSlots(saved.payload.character),
    applied_effects: applied.applied_effects
  });
}

module.exports = {
  processFeatRequest
};
