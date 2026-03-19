"use strict";

const { generateDungeonMapPackage } = require("../procedural/dungeon-generator");

function parseArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
}

async function main() {
  const result = await generateDungeonMapPackage({
    id: parseArg("id"),
    map_id: parseArg("map-id"),
    seed: parseArg("seed"),
    theme: parseArg("theme"),
    width: parseArg("width"),
    height: parseArg("height"),
    room_count: parseArg("rooms"),
    tile_size: parseArg("tile-size"),
    output_root: parseArg("output-root")
  });

  console.log(JSON.stringify(result, null, 2));
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
