"use strict";

const path = require("path");
const { buildDungeonMapView } = require("../dungeonMapView");

async function main() {
  const out = await buildDungeonMapView({
    user_id: "player-dungeon-preview-001",
    suffix: "dungeon-placement-preview",
    content: "Dungeon placement preview ready.",
    data: {
      session_id: "session-dungeon-preview-001",
      session: {
        session_id: "session-dungeon-preview-001",
        leader_id: "player-dungeon-preview-001"
      },
      room: {
        room_id: "room-preview-001",
        name: "Preview Hall",
        room_type: "encounter",
        encounter: {
          encounter_id: "enc-preview-001",
          name: "Mask Driven Preview"
        },
        exits: [],
        visible_objects: [],
        dungeon_map: {
            map_path: "apps/map-system/data/maps/dungeon/map-26x24.base-map.json",
            profile_path: "apps/map-system/data/profiles/dungeon/map-26x24.dungeon-profile.json",
          party_token: {
            label: "Party",
            badge_text: "P",
            asset_path: "apps/map-system/assets/tokens/players/processed/party-token.cleaned.png"
          },
            output_dir: "apps/map-system/output/live/dungeon"
        }
      }
    }
  });

  if (!out.ok) {
    console.error(JSON.stringify(out, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({
    ok: true,
    files: out.payload.files.map((filePath) => path.resolve(filePath)),
    content: out.payload.content
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  main
};
