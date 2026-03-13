"use strict";

const { coordinateKey, isWithinBounds } = require("../coordinates/grid");
const { expandTerrainZones } = require("./zones");
const { normalizeTerrainType, resolveTerrainDefinition } = require("./terrain-catalog");
const { buildEdgeWallIndex } = require("./edge-walls");

function resolveTerrainFlags(entry) {
  const definition = resolveTerrainDefinition(entry);
  const terrainType = definition
    ? definition.terrain_type
    : normalizeTerrainType(entry && entry.terrain_type);
  const defaultBlocksMovement = definition ? definition.blocks_movement : false;
  const defaultBlocksSight = definition ? definition.blocks_sight : false;
  const defaultMovementCost = definition && typeof definition.movement_cost === "number"
    ? definition.movement_cost
    : 1;

  return {
    terrain_type: terrainType || "open",
    movement_cost: entry && typeof entry.movement_cost === "number" ? entry.movement_cost : defaultMovementCost,
    blocks_movement: entry && entry.blocks_movement !== undefined
      ? entry.blocks_movement === true
      : defaultBlocksMovement,
    blocks_sight: entry && entry.blocks_sight !== undefined
      ? entry.blocks_sight === true
      : defaultBlocksSight,
    cover_level: entry && typeof entry.cover_level === "string"
      ? entry.cover_level
      : (definition && definition.cover_level) || "",
    is_hazard: entry && entry.is_hazard !== undefined
      ? entry.is_hazard === true
      : Boolean(definition && definition.is_hazard),
    hazard_kind: entry && entry.hazard_kind
      ? String(entry.hazard_kind)
      : (definition && definition.hazard_kind) || "",
    damages_on_enter: entry && entry.damages_on_enter !== undefined
      ? entry.damages_on_enter === true
      : Boolean(definition && definition.damages_on_enter),
    damages_on_turn_start: entry && entry.damages_on_turn_start !== undefined
      ? entry.damages_on_turn_start === true
      : Boolean(definition && definition.damages_on_turn_start)
  };
}

function buildTerrainIndex(map) {
  const index = new Map();

  const terrainEntries = [].concat(map.terrain || [], expandTerrainZones(map));
  terrainEntries.forEach((entry) => {
    index.set(coordinateKey(entry), entry);
  });

  return index;
}

function buildBlockedTileSet(map) {
  const blocked = new Set();

  (map.blocked_tiles || []).forEach((point) => {
    blocked.add(coordinateKey(point));
  });

  [].concat(map.terrain || [], expandTerrainZones(map)).forEach((entry) => {
    if (resolveTerrainFlags(entry).blocks_movement) {
      blocked.add(coordinateKey(entry));
    }
  });

  return blocked;
}

function buildSightBlockingSet(map) {
  const blocked = new Set();

  [].concat(map.terrain || [], expandTerrainZones(map)).forEach((entry) => {
    if (resolveTerrainFlags(entry).blocks_sight) {
      blocked.add(coordinateKey(entry));
    }
  });

  return blocked;
}

function buildSightBlockingEdgeSet(map) {
  return buildEdgeWallIndex(map);
}

function buildHazardTileList(map) {
  return [].concat(map.terrain || [], expandTerrainZones(map))
    .map((entry) => ({
      x: entry.x,
      y: entry.y,
      ...resolveTerrainFlags(entry)
    }))
    .filter((entry) => entry.is_hazard === true);
}

function getTileProperties(map, point) {
  if (!isWithinBounds(map.grid, point)) {
    return {
      ok: false,
      blocks_movement: true,
      blocks_sight: true,
      movement_cost: Number.POSITIVE_INFINITY
    };
  }

  const terrainIndex = buildTerrainIndex(map);
  const terrain = terrainIndex.get(coordinateKey(point));
  const flags = resolveTerrainFlags(terrain);

  return {
    ok: true,
    terrain_type: flags.terrain_type,
    movement_cost: flags.movement_cost,
    blocks_movement: flags.blocks_movement,
    blocks_sight: flags.blocks_sight,
    cover_level: flags.cover_level,
    is_hazard: flags.is_hazard,
    hazard_kind: flags.hazard_kind,
    damages_on_enter: flags.damages_on_enter,
    damages_on_turn_start: flags.damages_on_turn_start
  };
}

module.exports = {
  buildTerrainIndex,
  buildBlockedTileSet,
  buildSightBlockingSet,
  buildSightBlockingEdgeSet,
  buildHazardTileList,
  getTileProperties,
  resolveTerrainFlags
};
