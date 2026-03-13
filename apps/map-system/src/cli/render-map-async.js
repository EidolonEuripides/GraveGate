"use strict";

const path = require("path");
const { loadMapWithProfile, normalizeProfilePaths } = require("../core/map-profile-loader");
const { renderMapAsync } = require("../render/map-render-service");

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
    : path.resolve(repoRoot, "apps/map-system/output/map.snapshot.png");

  const map = loadMapWithProfile({
    map_path: mapPath,
    profile_path: normalizeProfilePaths(profilePathArg).map((profilePath) => path.resolve(repoRoot, profilePath))
  });

  const result = await renderMapAsync({
    map,
    output_path: outputPath,
    show_grid: hideGrid ? false : undefined
  });

  console.log(JSON.stringify({
    ok: true,
    event_type: "map_render_async_completed",
    payload: {
      map_path: mapPath,
      profile_path: normalizeProfilePaths(profilePathArg).length > 0
        ? normalizeProfilePaths(profilePathArg).map((profilePath) => path.resolve(repoRoot, profilePath))
        : null,
      output_path: result.payload.output_path,
      format: result.payload.format
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
