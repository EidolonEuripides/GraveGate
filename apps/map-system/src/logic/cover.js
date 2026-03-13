"use strict";

const { COVER_LEVELS } = require("../constants");
const { expandTerrainZones } = require("./zones");
const { resolveTerrainFlags } = require("./terrain");
const { hasLineOfSight } = require("./range");

function getCoverRank(level) {
  if (level === COVER_LEVELS.HALF) return 1;
  if (level === COVER_LEVELS.THREE_QUARTERS) return 2;
  if (level === COVER_LEVELS.TOTAL) return 3;
  return 0;
}

function getHigherCover(left, right) {
  return getCoverRank(left) >= getCoverRank(right) ? left : right;
}

function getCoverBonusAc(level) {
  if (level === COVER_LEVELS.HALF) return 2;
  if (level === COVER_LEVELS.THREE_QUARTERS) return 5;
  return 0;
}

function getTileCorners(point) {
  return [
    { x: point.x, y: point.y },
    { x: point.x + 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x + 1, y: point.y + 1 }
  ];
}

function pointInRect(point, rect) {
  return (
    point.x >= rect.min_x &&
    point.x <= rect.max_x &&
    point.y >= rect.min_y &&
    point.y <= rect.max_y
  );
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

function segmentIntersectsRect(start, end, rect) {
  if (pointInRect(start, rect) || pointInRect(end, rect)) {
    return true;
  }

  const corners = [
    { x: rect.min_x, y: rect.min_y },
    { x: rect.max_x, y: rect.min_y },
    { x: rect.max_x, y: rect.max_y },
    { x: rect.min_x, y: rect.max_y }
  ];

  for (let index = 0; index < corners.length; index += 1) {
    const nextIndex = (index + 1) % corners.length;
    if (segmentsIntersect(start, end, corners[index], corners[nextIndex])) {
      return true;
    }
  }

  return false;
}

function getCoverObstacleTiles(map, options) {
  const origin = options.origin;
  const target = options.target;

  return [].concat(map.terrain || [], expandTerrainZones(map))
    .map((entry) => ({ entry, flags: resolveTerrainFlags(entry) }))
    .filter(({ entry, flags }) => {
      if (!entry || entry.x === undefined || entry.y === undefined) {
        return false;
      }

      if (entry.x === origin.x && entry.y === origin.y) {
        return false;
      }

      if (entry.x === target.x && entry.y === target.y) {
        return false;
      }

      return Boolean(flags.cover_level);
    });
}

function getCoverBetween(map, origin, target) {
  if (!hasLineOfSight(map, origin, target)) {
    return {
      level: COVER_LEVELS.TOTAL,
      ac_bonus: 999,
      blocked_corner_count: 4
    };
  }

  const attackerCorners = getTileCorners(origin);
  const targetCorners = getTileCorners(target);
  const coverTiles = getCoverObstacleTiles(map, { map, origin, target });

  let bestBlockedCount = Number.POSITIVE_INFINITY;
  let bestLevel = COVER_LEVELS.NONE;

  attackerCorners.forEach((attackerCorner) => {
    let blockedCount = 0;
    let highestCover = COVER_LEVELS.NONE;

    targetCorners.forEach((targetCorner) => {
      const start = attackerCorner;
      const end = targetCorner;
      const blockingTile = coverTiles.find(({ entry }) => segmentIntersectsRect(start, end, {
        min_x: entry.x,
        min_y: entry.y,
        max_x: entry.x + 1,
        max_y: entry.y + 1
      }));

      if (blockingTile) {
        blockedCount += 1;
        highestCover = getHigherCover(highestCover, blockingTile.flags.cover_level || COVER_LEVELS.NONE);
      }
    });

    if (blockedCount < bestBlockedCount) {
      bestBlockedCount = blockedCount;
      bestLevel = highestCover;
    } else if (blockedCount === bestBlockedCount) {
      bestLevel = getHigherCover(bestLevel, highestCover);
    }
  });

  let resolvedLevel = bestLevel;
  if (bestBlockedCount >= 3 && resolvedLevel === COVER_LEVELS.NONE) {
    resolvedLevel = COVER_LEVELS.THREE_QUARTERS;
  } else if (bestBlockedCount >= 1 && resolvedLevel === COVER_LEVELS.NONE) {
    resolvedLevel = COVER_LEVELS.HALF;
  }

  return {
    level: resolvedLevel,
    ac_bonus: getCoverBonusAc(resolvedLevel),
    blocked_corner_count: Number.isFinite(bestBlockedCount) ? bestBlockedCount : 0
  };
}

module.exports = {
  getCoverBetween,
  getCoverBonusAc,
  getCoverRank
};
