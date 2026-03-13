"use strict";

const fs = require("fs");
const path = require("path");
const { ActionRowBuilder, ButtonBuilder } = require("discord.js");
const {
  TOKEN_TYPES,
  loadMapWithProfile,
  validateMapStateShape,
  renderMapAsync,
  buildMapActionRows,
  createIdleState,
  handleButtonAction,
  adaptMapActionToCanonicalEvent,
  loadPlayerTokenCatalog
} = require("../../map-system/src");

const DEFAULT_COMBAT_MAP_PATH = "apps/map-system/data/maps/combat/map-12x12.base-map.json";
const DEFAULT_COMBAT_MAP_PROFILE_PATH = "";
const DEFAULT_COMBAT_MAP_OUTPUT_DIR = "apps/map-system/output/live/combat";
const PLAYER_TOKEN_CATALOG_PATH = "apps/map-system/data/tokens/player-token-catalog.json";

function cleanText(value, fallback) {
  const safe = String(value || "").trim();
  return safe === "" ? (fallback || "") : safe;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeTeam(team) {
  const safe = cleanText(team, "neutral").toLowerCase();
  if (safe === "heroes" || safe === "players" || safe === "party") {
    return "heroes";
  }
  if (safe === "monsters" || safe === "enemies") {
    return "monsters";
  }
  return safe || "neutral";
}

function resolveTokenType(team) {
  return normalizeTeam(team) === "heroes" ? TOKEN_TYPES.PLAYER : TOKEN_TYPES.ENEMY;
}

function resolveCombatMapConfig(data) {
  const explicit = data && data.combat_map && typeof data.combat_map === "object" ? data.combat_map : {};
  const mapPath = cleanText(explicit.map_path, cleanText(process.env.COMBAT_MAP_PATH, DEFAULT_COMBAT_MAP_PATH));
  if (!mapPath) {
    return null;
  }

  return {
    map_path: path.resolve(process.cwd(), mapPath),
    profile_path: cleanText(explicit.profile_path, cleanText(process.env.COMBAT_MAP_PROFILE_PATH, DEFAULT_COMBAT_MAP_PROFILE_PATH)),
    output_dir: path.resolve(
      process.cwd(),
      cleanText(process.env.COMBAT_MAP_OUTPUT_DIR, DEFAULT_COMBAT_MAP_OUTPUT_DIR)
    )
  };
}

function resolveCombatActorId(combatSummary, userId) {
  const participants = Array.isArray(combatSummary && combatSummary.participants) ? combatSummary.participants : [];
  const safeUserId = String(userId || "");

  const owned = participants.find((entry) => String(entry && entry.player_id || "") === safeUserId);
  if (owned && owned.participant_id) {
    return String(owned.participant_id);
  }

  const heroParticipants = participants.filter((entry) => normalizeTeam(entry && entry.team) === "heroes");
  if (heroParticipants.length === 1 && heroParticipants[0].participant_id) {
    return String(heroParticipants[0].participant_id);
  }

  return cleanText(combatSummary && combatSummary.active_participant_id, null);
}

function buildBadgeText(participant, index, heroIndexRef, enemyIndexRef) {
  if (normalizeTeam(participant && participant.team) === "heroes") {
    heroIndexRef.count += 1;
    return String(heroIndexRef.count);
  }
  enemyIndexRef.count += 1;
  return String(enemyIndexRef.count);
}

function applyTokenOverrides(tokens, tokenOverrides) {
  const overrides = Array.isArray(tokenOverrides) ? tokenOverrides : [];
  const byId = new Map();
  overrides.forEach((entry) => {
    if (entry && entry.token_id) {
      byId.set(String(entry.token_id), entry);
    }
  });

  return tokens.map((token) => {
    const override = byId.get(String(token.token_id));
    if (!override) {
      return token;
    }
    return Object.assign({}, token, override, {
      token_id: token.token_id,
      actor_id: token.actor_id,
      position: token.position,
      team: token.team,
      token_type: token.token_type,
      label: token.label
    });
  });
}

function buildMapTokensFromCombatSummary(combatSummary, tokenOverrides) {
  const participants = Array.isArray(combatSummary && combatSummary.participants) ? combatSummary.participants : [];
  const heroIndexRef = { count: 0 };
  const enemyIndexRef = { count: 0 };

  const tokens = participants
    .filter((entry) => entry && entry.position && Number.isFinite(Number(entry.position.x)) && Number.isFinite(Number(entry.position.y)))
    .map((entry, index) => ({
      token_id: cleanText(entry.participant_id, `token-${index + 1}`),
      actor_id: cleanText(entry.participant_id, `token-${index + 1}`),
      token_type: resolveTokenType(entry.team),
      label: cleanText(entry.participant_id, `token-${index + 1}`),
      badge_text: buildBadgeText(entry, index, heroIndexRef, enemyIndexRef),
      position: {
        x: Math.floor(Number(entry.position.x)),
        y: Math.floor(Number(entry.position.y))
      },
      team: normalizeTeam(entry.team),
      player_id: cleanText(entry.player_id, null),
      known_spell_ids: Array.isArray(entry.known_spell_ids)
        ? entry.known_spell_ids.map((spellId) => String(spellId || "")).filter(Boolean)
        : [],
      movement_remaining: Number.isFinite(Number(entry.movement_remaining)) ? Number(entry.movement_remaining) : null,
      movement_speed_feet: Number.isFinite(Number(entry.movement_remaining)) ? Number(entry.movement_remaining) : null
    }));

  return applyTokenOverrides(tokens, tokenOverrides);
}

function buildCombatMapState(options) {
  const combatSummary = options.combat_summary;
  const mapConfig = options.map_config;
  if (!combatSummary || !mapConfig) {
    return {
      ok: false,
      error: "combat summary and map config are required"
    };
  }

  const map = loadMapWithProfile({
    map_path: mapConfig.map_path,
    profile_path: mapConfig.profile_path
  });
  map.tokens = buildMapTokensFromCombatSummary(combatSummary, options.token_overrides);

  const validation = validateMapStateShape(map);
  if (!validation.ok) {
    return {
      ok: false,
      error: `invalid combat map state: ${validation.errors.join("; ")}`
    };
  }

  const actorId = resolveCombatActorId(combatSummary, options.user_id);
  return {
    ok: true,
    payload: {
      map,
      actor_id: actorId,
      combat_id: cleanText(combatSummary.combat_id, options.combat_id || "combat"),
      turn_label: cleanText(combatSummary.active_participant_id, actorId || "(none)")
    }
  };
}

function buildCombatMapOutputPath(options) {
  const mapConfig = options.map_config;
  ensureDirectory(mapConfig.output_dir);
  const suffix = cleanText(options.suffix, "view");
  const format = cleanText(options.format, "png").toLowerCase();
  const combatId = cleanText(options.combat_id, "combat");
  const userId = cleanText(options.user_id, "user");
  return path.join(mapConfig.output_dir, `${combatId}.${userId}.${suffix}.${format}`);
}

function convertApiButton(button) {
  return new ButtonBuilder()
    .setCustomId(button.custom_id)
    .setLabel(button.label || "Action")
    .setStyle(button.style || 2)
    .setDisabled(button.disabled === true);
}

function convertApiRowsToDiscordComponents(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows
    .filter((row) => row && Array.isArray(row.components) && row.components.length > 0)
    .map((row) => (
      new ActionRowBuilder().addComponents(
        ...row.components
          .filter((component) => component && component.type === 2)
          .slice(0, 5)
          .map((component) => convertApiButton(component))
      )
    ))
    .filter((row) => Array.isArray(row.components) ? row.components.length > 0 : true);
}

function buildTokenVisualOverrides(tokens) {
  return (Array.isArray(tokens) ? tokens : []).map((token) => ({
    token_id: token.token_id,
    asset_path: token.asset_path || null,
    border_color: token.border_color || null,
    image_rim_color: token.image_rim_color || null,
    badge_text: token.badge_text || null,
    badge_text_color: token.badge_text_color || null,
    shape: token.shape || null
  }));
}

function loadPlayerTokenCatalogSafe() {
  const catalogPath = path.resolve(process.cwd(), PLAYER_TOKEN_CATALOG_PATH);
  if (!fs.existsSync(catalogPath)) {
    return [];
  }
  try {
    return loadPlayerTokenCatalog(catalogPath);
  } catch (error) {
    return [];
  }
}

async function renderCombatMapAttachments(options) {
  const outputPath = buildCombatMapOutputPath(options);
  await renderMapAsync({
    map: options.map,
    format: "png",
    output_path: outputPath
  });
  return [outputPath];
}

async function buildCombatMapView(options) {
  const data = options.data && typeof options.data === "object" ? options.data : {};
  const combatSummary = data.combat_summary && typeof data.combat_summary === "object" ? data.combat_summary : null;
  if (!combatSummary) {
    return {
      ok: false,
      error: "combat summary is required"
    };
  }

  const mapConfig = options.map_config || resolveCombatMapConfig(data);
  if (!mapConfig || !fs.existsSync(mapConfig.map_path)) {
    return {
      ok: false,
      error: "combat map config is unavailable"
    };
  }

  const mapOut = buildCombatMapState({
    combat_summary: combatSummary,
    map_config: mapConfig,
    token_overrides: options.token_overrides,
    user_id: options.user_id
  });
  if (!mapOut.ok) {
    return mapOut;
  }

  const payload = mapOut.payload;
  const interactionState = options.interaction_state || createIdleState({
    actor_id: payload.actor_id,
    instance_id: payload.combat_id,
    instance_type: "combat",
    map: payload.map
  });
  const content = cleanText(
    options.content,
    `Combat map ready.\nTurn: ${payload.turn_label}\nMode: ${interactionState.mode || "idle"}`
  );
  const componentRows = options.component_rows && options.component_rows.length > 0
    ? options.component_rows
    : (payload.actor_id
      ? buildMapActionRows({
          actor_id: payload.actor_id,
          instance_id: payload.combat_id,
          instance_type: "combat"
        })
      : []);
  const files = await renderCombatMapAttachments({
    map_config: mapConfig,
    map: options.map_override || payload.map,
    combat_id: payload.combat_id,
    user_id: options.user_id,
    suffix: options.suffix || interactionState.mode || "combat"
  });

  return {
    ok: true,
    payload: {
      map: payload.map,
      actor_id: payload.actor_id,
      combat_id: payload.combat_id,
      turn_label: payload.turn_label,
      interaction_state: interactionState,
      token_overrides: buildTokenVisualOverrides((options.map_override || payload.map).tokens),
      files,
      content,
      components: convertApiRowsToDiscordComponents(componentRows),
      map_config: mapConfig,
      token_catalog: loadPlayerTokenCatalogSafe()
    }
  };
}

function buildMapInteractionContext(options) {
  const view = options.view || {};
  const data = options.data || {};
  const built = buildCombatMapState({
    combat_summary: data.combat_summary,
    map_config: view.map_config || resolveCombatMapConfig(data),
    token_overrides: view.token_overrides || [],
    user_id: options.user_id
  });
  if (!built.ok) {
    return built;
  }

  const payload = built.payload;
  return {
    ok: true,
    payload: {
      actor_id: payload.actor_id,
      instance_id: payload.combat_id,
      instance_type: "combat",
      map: payload.map,
      state: view.interaction_state || createIdleState({
        actor_id: payload.actor_id,
        instance_id: payload.combat_id,
        instance_type: "combat",
        map: payload.map
      }),
      token_catalog: view.token_catalog || loadPlayerTokenCatalogSafe(),
      spells: Array.isArray(data.actor_spells) ? clone(data.actor_spells) : [],
      message_id: options.message_id || "",
      files: []
    }
  };
}

module.exports = {
  resolveCombatMapConfig,
  buildCombatMapState,
  buildCombatMapView,
  buildMapInteractionContext,
  buildTokenVisualOverrides,
  convertApiRowsToDiscordComponents,
  handleButtonAction,
  adaptMapActionToCanonicalEvent
};
