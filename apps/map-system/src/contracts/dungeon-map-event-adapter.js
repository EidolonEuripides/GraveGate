"use strict";

const { createEvent } = require("../../../../packages/shared-types/event-schema");
const { EVENT_TYPES } = require("../../../../packages/shared-types/event-types");
const { DUNGEON_MAP_ACTION_TYPES } = require("./dungeon-map-action.contract");

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function success(action, event, metadata) {
  return {
    ok: true,
    event_type: "dungeon_map_action_adapted",
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
    event_type: "dungeon_map_action_local_only",
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
    event_type: "dungeon_map_action_adaptation_failed",
    payload: {
      action,
      event: null,
      dispatch_required: false
    },
    error
  };
}

function buildEventContext(action, options) {
  const safeOptions = options || {};
  const playerId = normalizeString(safeOptions.player_id || safeOptions.playerId || safeOptions.user_id);
  const sessionId = normalizeString(action && action.instance_id) || normalizeString(safeOptions.session_id || safeOptions.sessionId);

  return {
    source: normalizeString(safeOptions.source) || "map_system.dungeon.adapter",
    target_system: "session_system",
    player_id: playerId,
    session_id: sessionId,
    combat_id: null
  };
}

function adaptMoveDirectionAction(action, options) {
  const direction = normalizeString(action && action.payload && action.payload.direction);
  if (!direction) {
    return failure(action, "dungeon move action requires direction");
  }

  const context = buildEventContext(action, options);
  return success(action, createEvent(EVENT_TYPES.PLAYER_MOVE, {
    command_name: "move",
    direction,
    session_id: context.session_id,
    map_id: normalizeString(action && action.map_id),
    map_action_id: normalizeString(action && action.action_id)
  }, context), {
    target_system: "session_system"
  });
}

function adaptDungeonMapActionToCanonicalEvent(action, options) {
  if (!action || !action.action_type) {
    return failure(action, "dungeon map action is required");
  }

  if (action.action_type === DUNGEON_MAP_ACTION_TYPES.PREVIEW_MOVE) {
    return localOnly(action, "preview move is a local dungeon-map presentation action", {
      target_system: "session_system"
    });
  }

  if (action.action_type === DUNGEON_MAP_ACTION_TYPES.BACK) {
    return localOnly(action, "back is a local dungeon-map presentation action", {
      target_system: "session_system"
    });
  }

  if (action.action_type === DUNGEON_MAP_ACTION_TYPES.MOVE_DIRECTION) {
    return adaptMoveDirectionAction(action, options);
  }

  return failure(action, `unsupported dungeon map action type: ${action.action_type}`);
}

module.exports = {
  adaptDungeonMapActionToCanonicalEvent
};
