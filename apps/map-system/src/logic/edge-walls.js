"use strict";

const { EDGE_WALL_SIDES } = require("../constants");

const CANONICAL_SIDES = new Set([
  EDGE_WALL_SIDES.NORTH,
  EDGE_WALL_SIDES.SOUTH,
  EDGE_WALL_SIDES.EAST,
  EDGE_WALL_SIDES.WEST
]);

function normalizeSide(side) {
  const normalized = String(side || "").trim().toLowerCase();
  return CANONICAL_SIDES.has(normalized) ? normalized : "";
}

function normalizeEdgeWall(entry, grid) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const x = Number(entry.x);
  const y = Number(entry.y);
  const side = normalizeSide(entry.side);

  if (!Number.isInteger(x) || !Number.isInteger(y) || !side) {
    return null;
  }

  if (side === EDGE_WALL_SIDES.SOUTH && grid && y + 1 < grid.height) {
    return normalizeEdgeWall({
      ...entry,
      x,
      y: y + 1,
      side: EDGE_WALL_SIDES.NORTH
    }, grid);
  }

  if (side === EDGE_WALL_SIDES.EAST && grid && x + 1 < grid.width) {
    return normalizeEdgeWall({
      ...entry,
      x: x + 1,
      y,
      side: EDGE_WALL_SIDES.WEST
    }, grid);
  }

  return {
    x,
    y,
    side,
    blocks_movement: entry.blocks_movement !== false,
    blocks_sight: entry.blocks_sight !== false,
    edge_generated: entry.edge_generated === true,
    mask_generated: entry.mask_generated === true,
    mask_color: entry.mask_color || "",
    terrain_type: entry.terrain_type || "wall"
  };
}

function buildEdgeWallKey(entry, grid) {
  const normalized = normalizeEdgeWall(entry, grid);
  if (!normalized) {
    return "";
  }

  return `${normalized.x},${normalized.y},${normalized.side}`;
}

function buildEdgeWallIndex(map) {
  const index = new Map();

  (map.edge_walls || []).forEach((entry) => {
    const normalized = normalizeEdgeWall(entry, map.grid);
    if (!normalized) {
      return;
    }

    index.set(buildEdgeWallKey(normalized, map.grid), normalized);
  });

  return index;
}

function getCardinalEdgeForPoints(fromPoint, toPoint, grid) {
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;

  if (Math.abs(dx) + Math.abs(dy) !== 1) {
    return null;
  }

  if (dx === 1) {
    return normalizeEdgeWall({ x: toPoint.x, y: toPoint.y, side: EDGE_WALL_SIDES.WEST }, grid);
  }

  if (dx === -1) {
    return normalizeEdgeWall({ x: fromPoint.x, y: fromPoint.y, side: EDGE_WALL_SIDES.WEST }, grid);
  }

  if (dy === 1) {
    return normalizeEdgeWall({ x: toPoint.x, y: toPoint.y, side: EDGE_WALL_SIDES.NORTH }, grid);
  }

  return normalizeEdgeWall({ x: fromPoint.x, y: fromPoint.y, side: EDGE_WALL_SIDES.NORTH }, grid);
}

function edgeWallBlocksCardinalTraversal(map, fromPoint, toPoint, kind) {
  const edge = getCardinalEdgeForPoints(fromPoint, toPoint, map.grid);
  if (!edge) {
    return false;
  }

  const indexed = buildEdgeWallIndex(map).get(buildEdgeWallKey(edge, map.grid));
  if (!indexed) {
    return false;
  }

  if (kind === "sight") {
    return indexed.blocks_sight === true;
  }

  return indexed.blocks_movement === true;
}

function edgeWallBlocksTraversal(map, fromPoint, toPoint, kind) {
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;

  if (Math.abs(dx) + Math.abs(dy) === 1) {
    return edgeWallBlocksCardinalTraversal(map, fromPoint, toPoint, kind);
  }

  if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
    const sideA = { x: toPoint.x, y: fromPoint.y };
    const sideB = { x: fromPoint.x, y: toPoint.y };

    return (
      edgeWallBlocksCardinalTraversal(map, fromPoint, sideA, kind) ||
      edgeWallBlocksCardinalTraversal(map, fromPoint, sideB, kind) ||
      edgeWallBlocksCardinalTraversal(map, sideA, toPoint, kind) ||
      edgeWallBlocksCardinalTraversal(map, sideB, toPoint, kind)
    );
  }

  return false;
}

function getEdgeWallSegments(map, kind) {
  return Array.from(buildEdgeWallIndex(map).values())
    .filter((entry) => kind === "sight" ? entry.blocks_sight === true : entry.blocks_movement === true)
    .map((entry) => {
      if (entry.side === EDGE_WALL_SIDES.NORTH) {
        return {
          side: entry.side,
          start: { x: entry.x, y: entry.y },
          end: { x: entry.x + 1, y: entry.y }
        };
      }

      if (entry.side === EDGE_WALL_SIDES.WEST) {
        return {
          side: entry.side,
          start: { x: entry.x, y: entry.y },
          end: { x: entry.x, y: entry.y + 1 }
        };
      }

      if (entry.side === EDGE_WALL_SIDES.SOUTH) {
        return {
          side: entry.side,
          start: { x: entry.x, y: entry.y + 1 },
          end: { x: entry.x + 1, y: entry.y + 1 }
        };
      }

      return {
        side: entry.side,
        start: { x: entry.x + 1, y: entry.y },
        end: { x: entry.x + 1, y: entry.y + 1 }
      };
    });
}

function orientation(a, b, c) {
  const value = ((b.y - a.y) * (c.x - b.x)) - ((b.x - a.x) * (c.y - b.y));
  if (Math.abs(value) < 1e-9) {
    return 0;
  }

  return value > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
  return (
    b.x <= Math.max(a.x, c.x) + 1e-9 &&
    b.x >= Math.min(a.x, c.x) - 1e-9 &&
    b.y <= Math.max(a.y, c.y) + 1e-9 &&
    b.y >= Math.min(a.y, c.y) - 1e-9
  );
}

function segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd) {
  const o1 = orientation(leftStart, leftEnd, rightStart);
  const o2 = orientation(leftStart, leftEnd, rightEnd);
  const o3 = orientation(rightStart, rightEnd, leftStart);
  const o4 = orientation(rightStart, rightEnd, leftEnd);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  if (o1 === 0 && onSegment(leftStart, rightStart, leftEnd)) return true;
  if (o2 === 0 && onSegment(leftStart, rightEnd, leftEnd)) return true;
  if (o3 === 0 && onSegment(rightStart, leftStart, rightEnd)) return true;
  if (o4 === 0 && onSegment(rightStart, leftEnd, rightEnd)) return true;

  return false;
}

function buildTileCenter(point) {
  return {
    x: point.x + 0.5,
    y: point.y + 0.5
  };
}

function edgeWallBlocksLine(map, origin, target, kind) {
  const segmentStart = buildTileCenter(origin);
  const segmentEnd = buildTileCenter(target);

  return getEdgeWallSegments(map, kind).some((segment) =>
    segmentsIntersect(segmentStart, segmentEnd, segment.start, segment.end)
  );
}

function mergeUniqueEdgeWalls(primaryList, secondaryList, grid) {
  const merged = new Map();

  [].concat(primaryList || [], secondaryList || []).forEach((entry) => {
    const normalized = normalizeEdgeWall(entry, grid);
    if (!normalized) {
      return;
    }

    merged.set(buildEdgeWallKey(normalized, grid), normalized);
  });

  return Array.from(merged.values());
}

module.exports = {
  normalizeEdgeWall,
  buildEdgeWallKey,
  buildEdgeWallIndex,
  getCardinalEdgeForPoints,
  edgeWallBlocksTraversal,
  edgeWallBlocksLine,
  mergeUniqueEdgeWalls
};
