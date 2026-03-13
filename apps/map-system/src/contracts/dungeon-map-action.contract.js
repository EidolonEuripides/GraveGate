"use strict";

const DUNGEON_MAP_ACTION_TYPES = Object.freeze({
  PREVIEW_MOVE: "preview_move",
  MOVE_DIRECTION: "move_direction",
  BACK: "back"
});

function createDungeonMapAction(type, payload, context) {
  const safePayload = payload || {};
  const safeContext = context || {};

  return {
    action_id: safeContext.action_id || `dungeon-map-action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action_type: type,
    actor_id: safeContext.actor_id || "unknown",
    instance_id: safeContext.instance_id || "unknown",
    instance_type: safeContext.instance_type || "dungeon",
    map_id: safeContext.map_id || "",
    source: safeContext.source || "map_system.dungeon",
    payload: safePayload
  };
}

function createDungeonMapPreviewMoveAction(context) {
  return createDungeonMapAction(DUNGEON_MAP_ACTION_TYPES.PREVIEW_MOVE, {}, context);
}

function createDungeonMapMoveDirectionAction(context, direction) {
  return createDungeonMapAction(DUNGEON_MAP_ACTION_TYPES.MOVE_DIRECTION, {
    direction: String(direction || "").trim().toLowerCase() || null
  }, context);
}

function createDungeonMapBackAction(context) {
  return createDungeonMapAction(DUNGEON_MAP_ACTION_TYPES.BACK, {}, context);
}

module.exports = {
  DUNGEON_MAP_ACTION_TYPES,
  createDungeonMapAction,
  createDungeonMapPreviewMoveAction,
  createDungeonMapMoveDirectionAction,
  createDungeonMapBackAction
};
