"use strict";

const fs = require("fs");
const path = require("path");
const { renderMapSvg } = require("../render/render-map-svg");
const { renderMapPng } = require("../render/render-map-png");
const { loadMapWithProfile, normalizeProfilePaths } = require("../core/map-profile-loader");

function parseArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
}

async function main() {
  const mapPathArg = parseArg("map");
  const profilePathArg = parseArg("profile");
  const outputPathArg = parseArg("output");
  const hideGrid = parseArg("hide-grid") === "true";

  if (!mapPathArg) {
    console.error("Missing --map=<path-to-map-json>");
    process.exit(1);
  }

  const repoRoot = process.cwd();
  const mapPath = path.resolve(repoRoot, mapPathArg);
  const outputPath = outputPathArg
    ? path.resolve(repoRoot, outputPathArg)
    : path.resolve(repoRoot, "apps/map-system/output/map.snapshot.svg");

  const map = loadMapWithProfile({
    map_path: mapPath,
    profile_path: normalizeProfilePaths(profilePathArg).map((profilePath) => path.resolve(repoRoot, profilePath))
  });
  const renderOptions = {
    output_path: outputPath
  };
  if (hideGrid) {
    renderOptions.show_grid = false;
  }

  const extension = path.extname(outputPath).toLowerCase();
  if (extension === ".png") {
    await renderMapPng(map, renderOptions);
  } else {
    renderMapSvg(map, renderOptions);
  }

  console.log(JSON.stringify({
    ok: true,
    event_type: extension === ".png" ? "map_png_rendered" : "map_svg_rendered",
    payload: {
      map_path: mapPath,
      profile_path: normalizeProfilePaths(profilePathArg).length > 0
        ? normalizeProfilePaths(profilePathArg).map((profilePath) => path.resolve(repoRoot, profilePath))
        : null,
      output_path: outputPath
    }
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}

module.exports = {
  main
};
