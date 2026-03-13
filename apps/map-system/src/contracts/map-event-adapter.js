"use strict";

const { createEvent } = require("../../../../packages/shared-types/event-schema");
const { EVENT_TYPES } = require("../../../../packages/shared-types/event-types");
const { MAP_ACTION_TYPES } = require("./map-action.contract");

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function buildEventContext(action, options) {
  const safeOptions = options || {};
  const payload = action && action.payload ? action.payload : {};
  const instanceType = normalizeString(action && action.instance_type) || "combat";
  const instanceId = normalizeString(action && action.instance_id);
  const playerId = normalizeString(safeOptions.player_id || safeOptions.playerId || safeOptions.user_id);

  return {
    source: normalizeString(safeOptions.source) || "map_system.adapter",
    player_id: playerId,
    session_id: instanceType === "dungeon" ? instanceId : normalizeString(safeOptions.session_id || safeOptions.sessionId),
    combat_id: instanceType === "combat" ? instanceId : normalizeString(payload.combat_id || safeOptions.combat_id || safeOptions.combatId)
  };
}

function success(action, event, metadata) {
  return {
    ok: true,
    event_type: "map_action_adapted",
    payload: {
      action,
      event,
      dispatch_required: true,
      ...metadata
    }
  };
}

function localOnly(action, reason, metadata) {
  return {
    ok: true,
    event_type: "map_action_local_only",
    payload: {
      action,
      event: null,
      dispatch_required: false,
      reason,
      ...metadata
    }
  };
}

function failure(action, error) {
  return {
    ok: false,
    event_type: "map_action_adaptation_failed",
    payload: {
      action,
      event: null,
      dispatch_required: false
    },
    error
  };
}

function adaptMoveAction(action, options) {
  const target = action.payload && action.payload.target_position;
  if (!target || !Number.isInteger(target.x) || !Number.isInteger(target.y)) {
    return failure(action, "move action requires target_position");
  }

  const instanceType = normalizeString(action.instance_type) || "combat";
  const context = buildEventContext(action, options);

  return success(action, createEvent(EVENT_TYPES.PLAYER_MOVE, {
    target_x: target.x,
    target_y: target.y,
    map_id: normalizeString(action.map_id),
    map_action_id: normalizeString(action.action_id),
    command_name: "move",
    command_options: []
  }, {
    ...context,
    target_system: instanceType === "combat" ? "combat_system" : "session_system"
  }), {
    target_system: instanceType === "combat" ? "combat_system" : "session_system"
  });
}

function adaptAttackTargetTokenAction(action, options) {
  const payload = action.payload || {};
  const targetId = normalizeString(payload.target_token_id);
  if (!targetId) {
    return failure(action, "attack target-token action requires target_token_id");
  }

  const context = buildEventContext(action, options);
  return success(action, createEvent(EVENT_TYPES.PLAYER_ATTACK, {
    target_id: targetId,
    target_x: payload.target_position && Number.isInteger(payload.target_position.x) ? payload.target_position.x : null,
    target_y: payload.target_position && Number.isInteger(payload.target_position.y) ? payload.target_position.y : null,
    attack_profile: payload.attack_profile || null,
    map_id: normalizeString(action.map_id),
    map_action_id: normalizeString(action.action_id),
    command_name: "attack",
    command_options: []
  }, {
    ...context,
    target_system: "combat_system"
  }), {
    target_system: "combat_system"
  });
}

function adaptAttackTargetCoordinateAction(action) {
  return localOnly(action, "coordinate-only attack actions are not yet canonical combat events", {
    target_system: "combat_system"
  });
}

function adaptCastSpellAction(action, options) {
  const payload = action.payload || {};
  const spellId = normalizeString(payload.spell_id);
  if (!spellId) {
    return failure(action, "cast spell action requires spell_id");
  }

  const selectedTargets = Array.isArray(payload.selected_targets) ? payload.selected_targets : [];
  const selectedTargetIds = selectedTargets
    .map((entry) => normalizeString(entry && entry.token_id ? entry.token_id : entry))
    .filter(Boolean);
  const targetPosition = payload.target_position || null;
  const context = buildEventContext(action, options);

  return success(action, createEvent(EVENT_TYPES.PLAYER_CAST_SPELL, {
    spell_id: spellId,
    target_id: selectedTargetIds[0] || null,
    selected_target_ids: selectedTargetIds,
    target_x: targetPosition && Number.isInteger(targetPosition.x) ? targetPosition.x : null,
    target_y: targetPosition && Number.isInteger(targetPosition.y) ? targetPosition.y : null,
    confirmed_area_tiles: Array.isArray(payload.confirmed_area_tiles) ? payload.confirmed_area_tiles : [],
    spell_profile: payload.profile || null,
    map_id: normalizeString(action.map_id),
    map_action_id: normalizeString(action.action_id),
    command_name: "cast",
    command_options: []
  }, {
    ...context,
    target_system: "combat_system"
  }), {
    target_system: "combat_system"
  });
}

function adaptSelectTokenAction(action) {
  return localOnly(action, "token selection is a local map presentation choice");
}

function adaptMapActionToCanonicalEvent(action, options) {
  if (!action || !action.action_type) {
    return failure(action, "map action is required");
  }

  if (action.action_type === MAP_ACTION_TYPES.MOVE_TO_COORDINATE) {
    return adaptMoveAction(action, options);
  }

  if (action.action_type === MAP_ACTION_TYPES.ATTACK_TARGET_TOKEN) {
    return adaptAttackTargetTokenAction(action, options);
  }

  if (action.action_type === MAP_ACTION_TYPES.ATTACK_TARGET_COORDINATE) {
    return adaptAttackTargetCoordinateAction(action, options);
  }

  if (action.action_type === MAP_ACTION_TYPES.CAST_SPELL) {
    return adaptCastSpellAction(action, options);
  }

  if (action.action_type === MAP_ACTION_TYPES.SELECT_TOKEN) {
    return adaptSelectTokenAction(action, options);
  }

  return failure(action, `unsupported map action type: ${action.action_type}`);
}

module.exports = {
  adaptMapActionToCanonicalEvent
};
