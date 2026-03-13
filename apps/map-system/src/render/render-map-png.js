"use strict";

const fs = require("fs");
const path = require("path");
const { Jimp, loadFont, rgbaToInt } = require("jimp");
const { SANS_16_BLACK, SANS_16_WHITE } = require("@jimp/plugin-print/fonts");
const { assertValidMapState } = require("../schema/map-state.schema");
const { OVERLAY_KINDS } = require("../constants");
const { buildTokenVisualProfile } = require("../tokens/token-catalog");
const { resolveAssetPath } = require("../core/asset-path-utils");

function readPngDimensions(absolutePath) {
  const header = fs.readFileSync(absolutePath);
  if (header.length < 24) {
    return null;
  }

  const pngSignature = "89504e470d0a1a0a";
  if (header.subarray(0, 8).toString("hex") !== pngSignature) {
    return null;
  }

  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20)
  };
}

function readImageDimensions(absolutePath) {
  if (path.extname(absolutePath).toLowerCase() !== ".png") {
    return null;
  }

  return readPngDimensions(absolutePath);
}

function getRenderMetrics(map) {
  const fallbackWidth = map.grid.width * map.grid.tile_size;
  const fallbackHeight = map.grid.height * map.grid.tile_size;
  const resolvedBaseImagePath = map.asset && map.asset.base_image_path
    ? resolveAssetPath(map.asset.base_image_path)
    : "";
  const absoluteBaseImagePath = resolvedBaseImagePath
    ? path.resolve(process.cwd(), resolvedBaseImagePath)
    : "";
  const imageDimensions = absoluteBaseImagePath && fs.existsSync(absoluteBaseImagePath)
    ? readImageDimensions(absoluteBaseImagePath)
    : null;
  const widthPx = map.asset && Number.isFinite(map.asset.render_width_px)
    ? Number(map.asset.render_width_px)
    : (imageDimensions && Number.isFinite(imageDimensions.width) ? imageDimensions.width : fallbackWidth);
  const heightPx = map.asset && Number.isFinite(map.asset.render_height_px)
    ? Number(map.asset.render_height_px)
    : (imageDimensions && Number.isFinite(imageDimensions.height) ? imageDimensions.height : fallbackHeight);
  const gridOriginX = map.asset && Number.isFinite(map.asset.grid_origin_x)
    ? Number(map.asset.grid_origin_x)
    : 0;
  const gridOriginY = map.asset && Number.isFinite(map.asset.grid_origin_y)
    ? Number(map.asset.grid_origin_y)
    : 0;
  const gridWidthPx = map.asset && Number.isFinite(map.asset.grid_width_px)
    ? Number(map.asset.grid_width_px)
    : widthPx;
  const gridHeightPx = map.asset && Number.isFinite(map.asset.grid_height_px)
    ? Number(map.asset.grid_height_px)
    : heightPx;

  return {
    width_px: widthPx,
    height_px: heightPx,
    tile_width_px: gridWidthPx / map.grid.width,
    tile_height_px: gridHeightPx / map.grid.height,
    grid_origin_x: gridOriginX,
    grid_origin_y: gridOriginY,
    base_image_path: absoluteBaseImagePath
  };
}

function parseHexColor(hex, opacity) {
  const normalized = String(hex || "#000000").replace("#", "").trim();
  const safe = normalized.length === 6 ? normalized : "000000";
  const r = Number.parseInt(safe.slice(0, 2), 16);
  const g = Number.parseInt(safe.slice(2, 4), 16);
  const b = Number.parseInt(safe.slice(4, 6), 16);
  const a = Math.max(0, Math.min(255, Math.round((typeof opacity === "number" ? opacity : 1) * 255)));
  return rgbaToInt(r, g, b, a);
}

function fileExists(assetPath) {
  return assetPath && fs.existsSync(assetPath);
}

async function createCanvas(width, height, color) {
  return new Jimp({
    width,
    height,
    color
  });
}

async function loadFonts() {
  const [fontBlack, fontWhite] = await Promise.all([
    loadFont(SANS_16_BLACK),
    loadFont(SANS_16_WHITE)
  ]);

  return { fontBlack, fontWhite };
}

function tileRect(metrics, tile) {
  return {
    x: Math.round(metrics.grid_origin_x + (tile.x * metrics.tile_width_px)),
    y: Math.round(metrics.grid_origin_y + (tile.y * metrics.tile_height_px)),
    width: Math.round(metrics.tile_width_px),
    height: Math.round(metrics.tile_height_px)
  };
}

async function drawFilledRect(image, rect, hex, opacity) {
  const overlay = await createCanvas(rect.width, rect.height, parseHexColor(hex, opacity));
  image.composite(overlay, rect.x, rect.y);
}

async function drawRectBorder(image, rect, hex, thickness) {
  const safeThickness = Math.max(1, Math.round(thickness || 2));
  await drawFilledRect(image, { x: rect.x, y: rect.y, width: rect.width, height: safeThickness }, hex, 1);
  await drawFilledRect(image, { x: rect.x, y: rect.y + rect.height - safeThickness, width: rect.width, height: safeThickness }, hex, 1);
  await drawFilledRect(image, { x: rect.x, y: rect.y, width: safeThickness, height: rect.height }, hex, 1);
  await drawFilledRect(image, { x: rect.x + rect.width - safeThickness, y: rect.y, width: safeThickness, height: rect.height }, hex, 1);
}

async function renderGridLines(image, map, metrics) {
  const stroke = parseHexColor("#000000", 0.18);

  for (let x = 0; x <= map.grid.width; x += 1) {
    const position = Math.round(metrics.grid_origin_x + (x * metrics.tile_width_px));
    const line = await createCanvas(1, metrics.height_px, stroke);
    image.composite(line, position, 0);
  }

  for (let y = 0; y <= map.grid.height; y += 1) {
    const position = Math.round(metrics.grid_origin_y + (y * metrics.tile_height_px));
    const line = await createCanvas(metrics.width_px, 1, stroke);
    image.composite(line, 0, position);
  }
}

async function renderFilledOverlays(image, map, metrics) {
  for (const overlay of (map.overlays || []).filter((entry) => entry.kind !== OVERLAY_KINDS.SELECTION)) {
    const fill = overlay.color || "#34c759";
    const opacity = typeof overlay.opacity === "number" ? overlay.opacity : 0.3;

    for (const tile of overlay.tiles || []) {
      await drawFilledRect(image, tileRect(metrics, tile), fill, opacity);
    }
  }
}

async function renderSelectionOverlays(image, map, metrics, fonts) {
  for (const overlay of (map.overlays || []).filter((entry) => entry.kind === OVERLAY_KINDS.SELECTION)) {
    const stroke = overlay.color || "#ffd60a";

    for (const tile of overlay.tiles || []) {
      const rect = tileRect(metrics, tile);
      const inset = 5;
      const selectionRect = {
        x: rect.x + inset,
        y: rect.y + inset,
        width: Math.max(1, rect.width - (inset * 2)),
        height: Math.max(1, rect.height - (inset * 2))
      };

      await drawFilledRect(image, selectionRect, stroke, typeof overlay.opacity === "number" ? overlay.opacity : 0.18);
      await drawRectBorder(image, selectionRect, stroke, 3);

      if (tile.label) {
        image.print({
          font: fonts.fontBlack,
          x: selectionRect.x + 6,
          y: selectionRect.y + Math.max(0, Math.round((selectionRect.height - 16) / 2)),
          text: String(tile.label),
          maxWidth: Math.max(1, selectionRect.width - 12),
          maxHeight: 20
        });
      }
    }
  }
}

async function buildCircularTokenImage(assetPath, tokenSize, ringHex) {
  const source = await Jimp.read(assetPath);
  source.cover({ w: tokenSize - 6, h: tokenSize - 6 });
  source.circle();

  const framed = await createCanvas(tokenSize, tokenSize, 0x00000000);
  const ring = await createCanvas(tokenSize, tokenSize, parseHexColor(ringHex, 1));
  ring.circle();
  framed.composite(ring, 0, 0);
  framed.composite(source, 3, 3);
  return framed;
}

async function renderTokens(image, map, metrics, fonts) {
  for (const token of (map.tokens || [])) {
    const visualProfile = buildTokenVisualProfile(token);
    const x = metrics.grid_origin_x + (token.position.x * metrics.tile_width_px);
    const y = metrics.grid_origin_y + (token.position.y * metrics.tile_height_px);
    const insetRatio = visualProfile.asset_path ? 0.04 : 0.1;
    const baseTileSize = Math.min(metrics.tile_width_px, metrics.tile_height_px);
    const inset = Math.round(baseTileSize * insetRatio);
    const tokenSize = Math.max(1, Math.round(baseTileSize - (inset * 2)));
    const fill = visualProfile.color || (token.token_type === "enemy" ? "#c62828" : "#1e88e5");
    const borderColor = visualProfile.border_color || "#ffffff";
    const imageBorderColor = visualProfile.image_border_color || "#d4af37";
    const badgeColor = visualProfile.badge_color || "#4aa3ff";
    const badgeText = visualProfile.badge_text ? String(visualProfile.badge_text) : "";
    const label = visualProfile.label ? String(visualProfile.label) : "";
    const tokenX = Math.round(x + ((metrics.tile_width_px - tokenSize) / 2));
    const tokenY = Math.round(y + ((metrics.tile_height_px - tokenSize) / 2));
    const resolvedAssetPath = visualProfile.asset_path
      ? path.resolve(process.cwd(), resolveAssetPath(visualProfile.asset_path))
      : "";

    if (fileExists(resolvedAssetPath)) {
      const tokenImage = await buildCircularTokenImage(resolvedAssetPath, tokenSize, imageBorderColor);
      image.composite(tokenImage, tokenX, tokenY);
    } else {
      const fallback = await createCanvas(tokenSize, tokenSize, parseHexColor(fill, 0.92));
      fallback.circle();
      image.composite(fallback, tokenX, tokenY);
      const border = await createCanvas(tokenSize, tokenSize, parseHexColor(borderColor, 1));
      border.circle();
      border.composite(fallback, 3, 3);
      image.composite(border, tokenX, tokenY);
    }

    if (badgeText) {
      image.print({
        font: fonts.fontWhite,
        x: Math.round(x + metrics.tile_width_px - 18),
        y: Math.round(y + 6),
        text: badgeText,
        maxWidth: 16,
        maxHeight: 16
      });
    }

    if (label) {
      image.print({
        font: fonts.fontBlack,
        x: Math.round(x + 6),
        y: Math.round(y + metrics.tile_height_px - 18),
        text: label,
        maxWidth: Math.max(1, Math.round(metrics.tile_width_px) - 12),
        maxHeight: 18
      });
    }
  }
}

async function renderMapPng(mapState, options) {
  assertValidMapState(mapState);
  const map = mapState;
  const metrics = getRenderMetrics(map);
  const outputPath = options && options.output_path
    ? path.resolve(options.output_path)
    : path.resolve(process.cwd(), "apps/map-system/output/map.snapshot.png");
  const fonts = await loadFonts();
  const canvas = fileExists(metrics.base_image_path)
    ? await Jimp.read(metrics.base_image_path)
    : await createCanvas(metrics.width_px, metrics.height_px, 0xf2f2f2ff);

  if (canvas.bitmap.width !== metrics.width_px || canvas.bitmap.height !== metrics.height_px) {
    canvas.resize({ w: metrics.width_px, h: metrics.height_px });
  }

  await renderFilledOverlays(canvas, map, metrics);

  const shouldShowGrid = options && options.show_grid === false
    ? false
    : !(map.asset && map.asset.has_embedded_grid === true);
  if (shouldShowGrid) {
    await renderGridLines(canvas, map, metrics);
  }

  await renderTokens(canvas, map, metrics, fonts);
  await renderSelectionOverlays(canvas, map, metrics, fonts);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await canvas.write(outputPath);
  return outputPath;
}

module.exports = {
  renderMapPng
};
