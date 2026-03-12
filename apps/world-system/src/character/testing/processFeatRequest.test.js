"use strict";

const assert = require("assert");
const { createInMemoryAdapter } = require("../../../../database/src/adapters/inMemoryAdapter");
const { CharacterPersistenceBridge } = require("../character.persistence");
const { createCharacterRecord } = require("../character.schema");
const { processFeatRequest } = require("../flow/processFeatRequest");

function runTest(name, fn, results) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, reason: error.message });
  }
}

function createContext(overrides) {
  const adapter = createInMemoryAdapter();
  const characterPersistence = new CharacterPersistenceBridge({ adapter });
  const character = createCharacterRecord(Object.assign({
    character_id: "char-feat-001",
    player_id: "player-feat-001",
    name: "Feat Tester",
    level: 4,
    initiative: 1,
    hitpoint_max: 18,
    current_hitpoints: 18,
    hp_summary: {
      current: 18,
      max: 18,
      temporary: 0
    }
  }, overrides || {}));
  characterPersistence.saveCharacter(character);

  return {
    characterPersistence,
    loadContentBundle() {
      return {
        ok: true,
        payload: {
          content: {
            feats: [
              {
                feat_id: "alert",
                name: "Alert",
                description: "Init edge.",
                prerequisites: {},
                effects: [{ type: "initiative_bonus", value: 5 }],
                metadata: {}
              },
              {
                feat_id: "tough",
                name: "Tough",
                description: "HP edge.",
                prerequisites: {},
                effects: [{ type: "hitpoint_max_per_level", value: 2 }],
                metadata: {}
              },
              {
                feat_id: "war_caster",
                name: "War Caster",
                description: "Concentration edge.",
                prerequisites: { spellcasting_required: true },
                effects: [{ type: "feature_flag", key: "war_caster", value: true }],
                metadata: {}
              },
              {
                feat_id: "mobile",
                name: "Mobile",
                description: "Speed edge.",
                prerequisites: {},
                effects: [{ type: "movement_speed_bonus", value: 10 }],
                metadata: {}
              },
              {
                feat_id: "resilient",
                name: "Resilient",
                description: "Save edge.",
                prerequisites: {},
                effects: [{ type: "resilient_ability_choice" }],
                metadata: { requires_ability_choice: true }
              }
            ]
          }
        }
      };
    }
  };
}

function runProcessFeatRequestTests() {
  const results = [];

  runTest("list_available_feats_for_character", () => {
    const context = createContext();
    const out = processFeatRequest({
      context,
      player_id: "player-feat-001",
      action: "list"
    });

    assert.equal(out.ok, true);
    assert.equal(out.payload.action, "list");
    assert.equal(Array.isArray(out.payload.feats), true);
    assert.equal(out.payload.feat_slots.total_slots, 1);
    assert.equal(out.payload.feat_slots.remaining_slots, 1);
  }, results);

  runTest("take_alert_feat_applies_initiative_bonus", () => {
    const context = createContext();
    const out = processFeatRequest({
      context,
      player_id: "player-feat-001",
      action: "take",
      feat_id: "alert"
    });

    assert.equal(out.ok, true);
    assert.equal(out.payload.feat.feat_id, "alert");
    assert.equal(out.payload.character.initiative, 6);
    assert.deepEqual(out.payload.character.feats, ["alert"]);
    assert.equal(out.payload.feat_slots.remaining_slots, 0);
  }, results);

  runTest("take_tough_feat_applies_hitpoint_bonus_by_level", () => {
    const context = createContext();
    const out = processFeatRequest({
      context,
      player_id: "player-feat-001",
      action: "take",
      feat_id: "tough"
    });

    assert.equal(out.ok, true);
    assert.equal(out.payload.character.hitpoint_max, 26);
    assert.equal(out.payload.character.current_hitpoints, 26);
    assert.equal(out.payload.character.hp_summary.max, 26);
    assert.equal(out.payload.character.hp_summary.current, 26);
  }, results);

  runTest("spellcasting_prerequisite_blocks_war_caster_without_spellcasting", () => {
    const context = createContext({ spellcasting_ability: null });
    const out = processFeatRequest({
      context,
      player_id: "player-feat-001",
      action: "take",
      feat_id: "war_caster"
    });

    assert.equal(out.ok, false);
    assert.equal(out.error, "feat requires spellcasting");
  }, results);

  runTest("duplicate_feat_take_is_rejected", () => {
    const context = createContext({ feats: ["alert"] });
    const out = processFeatRequest({
      context,
      player_id: "player-feat-001",
      action: "take",
      feat_id: "alert"
    });

    assert.equal(out.ok, false);
    assert.equal(out.error, "feat is already known");
  }, results);

  runTest("take_mobile_feat_applies_speed_bonus", () => {
    const context = createContext({ speed: 30 });
    const out = processFeatRequest({
      context,
      player_id: "player-feat-001",
      action: "take",
      feat_id: "mobile"
    });

    assert.equal(out.ok, true);
    assert.equal(out.payload.character.speed, 40);
    assert.deepEqual(out.payload.character.feats, ["mobile"]);
  }, results);

  runTest("resilient_requires_ability_choice", () => {
    const context = createContext();
    const out = processFeatRequest({
      context,
      player_id: "player-feat-001",
      action: "take",
      feat_id: "resilient"
    });

    assert.equal(out.ok, false);
    assert.equal(out.error, "feat requires ability_id");
  }, results);

  runTest("resilient_applies_ability_increase_and_save_proficiency", () => {
    const context = createContext({
      stats: {
        strength: 10,
        dexterity: 10,
        constitution: 14,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      },
      proficiency_bonus: 2
    });
    const out = processFeatRequest({
      context,
      player_id: "player-feat-001",
      action: "take",
      feat_id: "resilient",
      ability_id: "wisdom"
    });

    assert.equal(out.ok, true);
    assert.equal(out.payload.character.stats.wisdom, 11);
    assert.equal(out.payload.character.saving_throws.wisdom, 2);
    assert.equal(out.payload.character.wisdom_save_modifier, 2);
    assert.equal(out.payload.feat_choice.ability_id, "wisdom");
  }, results);

  const passed = results.filter((entry) => entry.ok).length;
  const failed = results.length - passed;
  return {
    ok: failed === 0,
    totals: { total: results.length, passed, failed },
    results
  };
}

if (require.main === module) {
  const summary = runProcessFeatRequestTests();
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

module.exports = {
  runProcessFeatRequestTests
};
