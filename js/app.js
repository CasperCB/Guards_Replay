let manifest;
let replayBundle;
let currentFrameIndex = 0;

function heroAssetData(assetId) {
  const hero = manifest.heroes[assetId];
  if (!hero) {
    throw new Error(`Unknown hero asset id: ${assetId}`);
  }
  return hero;
}

function replayHeroMeta(heroId) {
  const hero = replayBundle.heroes[heroId];
  if (!hero) {
    throw new Error(`Unknown replay hero id: ${heroId}`);
  }
  return hero;
}

function cardData(assetId, code) {
  if (!code) return null;
  return heroAssetData(assetId).cards[code] || null;
}

function makeUnknownCard(assetId, code, extraClass = "") {
  const hero = heroAssetData(assetId);
  const card = document.createElement("button");
  card.type = "button";
  card.className = `card-image card-placeholder ${extraClass}`.trim();
  card.dataset.heroId = assetId;
  card.dataset.cardCode = code;
  card.innerHTML = `<span>${code}</span><small>${hero.display_name}</small>`;
  card.title = `${hero.display_name} ${code} — artwork unavailable`;
  return card;
}

function makeCardImage(assetId, code, extraClass = "") {
  const hero = heroAssetData(assetId);
  const card = cardData(assetId, code);

  if (!card) {
    return makeUnknownCard(assetId, code, extraClass);
  }

  const image = document.createElement("img");
  image.className = `card-image ${extraClass}`.trim();
  image.src = card.image;
  image.alt = `${hero.display_name} ${code}: ${card.name}`;
  image.tabIndex = 0;
  image.dataset.heroId = assetId;
  image.dataset.cardCode = code;
  image.addEventListener("click", () => openCard(assetId, code));
  image.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCard(assetId, code);
    }
  });
  return image;
}

function renderResolvedSlots(assetId, codes) {
  const hero = heroAssetData(assetId);
  const container = document.createElement("div");
  container.className = "resolved-slots";
  container.setAttribute("aria-label", "Resolved cards");

  hero.resolved_slots.forEach((slotDefinition, index) => {
    const slot = document.createElement("div");
    slot.className = "resolved-slot";
    slot.dataset.turn = String(slotDefinition.turn);
    slot.style.left = `${slotDefinition.left_pct}%`;
    slot.style.top = `${slotDefinition.top_pct}%`;
    slot.style.width = `${slotDefinition.width_pct}%`;
    slot.setAttribute("aria-label", `Turn ${slotDefinition.turn} resolved card`);

    const label = document.createElement("div");
    label.className = "resolved-slot__label";
    label.textContent = `TURN ${slotDefinition.turn}`;
    slot.appendChild(label);

    const code = codes[index];
    if (code) {
      slot.appendChild(makeCardImage(assetId, code));
    }
    container.appendChild(slot);
  });

  return container;
}

function makeCardZone(assetId, kind, codes) {
  const zone = document.createElement("section");
  zone.className = `card-zone card-zone--${kind}`;

  const label = document.createElement("div");
  label.className = "zone-label";
  label.textContent = kind.toUpperCase();
  zone.appendChild(label);

  if (kind === "revealed") {
    const revealed = document.createElement("div");
    revealed.className = "revealed-card";
    if (codes[0]) {
      revealed.appendChild(makeCardImage(assetId, codes[0]));
    }
    zone.appendChild(revealed);
    return zone;
  }

  const stack = document.createElement("div");
  stack.className = "discard-stack";
  const visible = codes.slice(-4);
  visible.forEach((code, index) => {
    const card = makeCardImage(assetId, code);
    card.style.zIndex = String(index + 1);
    stack.appendChild(card);
  });

  if (codes.length) {
    const count = document.createElement("div");
    count.className = "discard-count";
    count.textContent = String(codes.length);
    count.title = `${codes.length} discarded card${codes.length === 1 ? "" : "s"}`;
    stack.appendChild(count);
  }

  zone.appendChild(stack);
  return zone;
}

const ITEM_DISPLAY_ORDER = ["I", "A", "D", "Rng", "Rad", "Spd"];

function aggregateItems(items) {
  const counts = new Map();
  items.forEach(item => counts.set(item, (counts.get(item) || 0) + 1));

  const knownItems = ITEM_DISPLAY_ORDER
    .filter(item => counts.has(item))
    .map(item => [item, counts.get(item)]);

  // Keep the viewer future-proof if a new item code reaches the replay before
  // the web UI is updated: known Guards stats stay in canonical order and any
  // unknown codes follow alphabetically rather than disappearing.
  const unknownItems = [...counts.entries()]
    .filter(([item]) => !ITEM_DISPLAY_ORDER.includes(item))
    .sort(([left], [right]) => left.localeCompare(right));

  return [...knownItems, ...unknownItems];
}

function makeHeaderStats(heroState) {
  const wrapper = document.createElement("div");
  wrapper.className = "player-station__header-meta";

  const stats = document.createElement("div");
  stats.className = "player-stats";

  const level = document.createElement("span");
  level.className = "player-stat-chip";
  level.innerHTML = `<span class="player-stat-label">LV</span><strong>${heroState.level}</strong>`;

  const gold = document.createElement("span");
  gold.className = "player-stat-chip";
  gold.innerHTML = `<span class="player-stat-label">GOLD</span><strong>${heroState.gold}</strong>`;

  stats.append(level, gold);

  aggregateItems(heroState.items).forEach(([item, count]) => {
    const itemChip = document.createElement("span");
    itemChip.className = "player-stat-chip player-stat-chip--item";
    itemChip.title = `${count} ${item} upgrade${count === 1 ? "" : "s"}`;
    itemChip.innerHTML = `<strong>${count > 1 ? `+${count} ${item}` : `+${item}`}</strong>`;
    stats.appendChild(itemChip);
  });

  wrapper.appendChild(stats);
  return wrapper;
}

function makePlayerStation(heroId, frame) {
  const heroState = frame.heroes[heroId];
  const heroMeta = replayHeroMeta(heroId);
  const heroAsset = heroAssetData(heroState.asset_id);

  const station = document.createElement("article");
  station.className = "player-station";
  station.dataset.team = heroState.team;
  station.dataset.heroId = heroId;
  station.classList.toggle(
    "is-active",
    frame.active_card?.hero_id === heroId
  );
  station.classList.toggle("is-defeated", !heroState.alive);
  station.setAttribute("aria-label", `${heroState.display_name} player station`);

  const header = document.createElement("header");
  header.className = "player-station__header";
  header.innerHTML = `
    <div class="identity">
      <span class="team-dot" aria-hidden="true"></span>
      <div>
        <div class="hero-name">${heroState.display_name.toUpperCase()}</div>
        <div class="player-name">${heroMeta.player_name}</div>
      </div>
    </div>
  `;
  header.appendChild(makeHeaderStats(heroState));

  const body = document.createElement("div");
  body.className = "player-station__body";

  const revealedZone = makeCardZone(
    heroState.asset_id,
    "revealed",
    heroState.revealed ? [heroState.revealed] : []
  );
  const discardZone = makeCardZone(heroState.asset_id, "discard", heroState.discard);

  const boardRegion = document.createElement("section");
  boardRegion.className = "hero-board-region";
  const board = document.createElement("div");
  board.className = "hero-board";
  const boardImage = document.createElement("img");
  boardImage.className = "hero-board__image";
  boardImage.src = heroAsset.board_image;
  boardImage.alt = `${heroState.display_name} hero board`;
  board.append(boardImage, renderResolvedSlots(heroState.asset_id, heroState.resolved_by_turn));

  if (!heroState.alive) {
    const defeated = document.createElement("div");
    defeated.className = "defeated-overlay";
    defeated.textContent = "DEFEATED";
    board.appendChild(defeated);
  }

  boardRegion.appendChild(board);

  // Mirror the left team so every revealed-card zone faces inward toward the
  // central board, matching the tabletop arrangement.
  if (heroState.team === "blue") {
    body.append(discardZone, boardRegion, revealedZone);
  } else {
    body.append(revealedZone, boardRegion, discardZone);
  }

  station.append(header, body);
  return station;
}

function renderTeam(team, frame) {
  const target = document.getElementById(`${team}-team-stations`);
  target.replaceChildren();
  replayBundle.game.teams[team].forEach(heroId => {
    target.appendChild(makePlayerStation(heroId, frame));
  });
}

function renderActiveCard(frame) {
  ["blue", "red"].forEach(team => {
    const host = document.getElementById(`${team}-active-card`);
    host.replaceChildren();
    host.removeAttribute("data-active-hero");
  });

  if (!frame.active_card) return;

  const { hero_id: heroId, asset_id: assetId, card: cardCode } = frame.active_card;
  const heroMeta = replayHeroMeta(heroId);
  const card = cardData(assetId, cardCode);
  const team = heroMeta.team;

  const panel = document.createElement("section");
  panel.className = "active-card-panel";
  panel.dataset.team = team;
  panel.dataset.heroId = heroId;
  panel.innerHTML = `<div class="active-card-kicker">ACTIVE CARD · ${heroMeta.display_name.toUpperCase()}</div>`;

  const image = makeCardImage(assetId, cardCode, "active-card-image");
  const caption = document.createElement("div");
  caption.className = "active-card-caption";
  caption.textContent = card
    ? `${cardCode} · ${card.name}`
    : `${cardCode} · artwork unavailable`;
  panel.append(image, caption);

  const host = document.getElementById(`${team}-active-card`);
  host.dataset.activeHero = heroId;
  host.appendChild(panel);
}

function positionActiveCard(frame) {
  if (!frame.active_card) return;

  const heroId = frame.active_card.hero_id;
  const team = replayHeroMeta(heroId).team;
  const host = document.getElementById(`${team}-active-card`);
  const panel = host.querySelector(".active-card-panel");
  const station = document.querySelector(
    `#${team}-team-stations .player-station[data-hero-id="${heroId}"]`
  );

  if (!panel || !station) return;

  const hostRect = host.getBoundingClientRect();
  const stationRect = station.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const desiredCenter = stationRect.top - hostRect.top + stationRect.height / 2;
  const halfPanel = panelRect.height / 2;
  const padding = 5;
  const minCenter = halfPanel + padding;
  const maxCenter = Math.max(minCenter, hostRect.height - halfPanel - padding);
  const clampedCenter = Math.min(maxCenter, Math.max(minCenter, desiredCenter));

  panel.style.top = `${clampedCenter}px`;
}

function makeBoardMarker(piece) {
  const marker = document.createElement("div");
  marker.className = `map-piece map-piece--${piece.kind}`;
  marker.dataset.pieceId = piece.id;
  marker.style.left = `${piece.x_pct}%`;
  marker.style.top = `${piece.y_pct}%`;
  marker.textContent = piece.label;
  marker.title = piece.id;

  if (piece.team) {
    marker.dataset.team = piece.team;
  }
  if (piece.heavy) {
    marker.classList.add("is-heavy");
  }
  if (piece.object_type) {
    marker.dataset.objectType = piece.object_type;
    marker.title = `${piece.id} · ${piece.object_type.replaceAll("_", " ")}`;
  }

  return marker;
}

function renderBoard(frame) {
  const layer = document.getElementById("map-pieces");
  layer.replaceChildren();

  frame.board.minions.forEach(piece => layer.appendChild(makeBoardMarker(piece)));
  frame.board.objects.forEach(piece => layer.appendChild(makeBoardMarker(piece)));
  frame.board.heroes.forEach(piece => layer.appendChild(makeBoardMarker(piece)));
}

function renderStatus(frame) {
  document.getElementById("red-life").textContent = frame.status.red_life;
  document.getElementById("blue-life").textContent = frame.status.blue_life;
  document.getElementById("wave-number").textContent = frame.status.wave;
  document.getElementById("battle-zone").textContent = frame.status.battle_zone;
  document.getElementById("push-count").textContent = frame.status.push_count;

  const badge = document.getElementById("game-result-badge");
  if (frame.status.game_result) {
    const winner = frame.status.game_result.winner.toUpperCase();
    badge.textContent = `${winner} TEAM WINS`;
    badge.dataset.team = frame.status.game_result.winner;
    badge.hidden = false;
  } else {
    badge.hidden = true;
    badge.removeAttribute("data-team");
  }
}

function frameHeading(frame) {
  if (frame.kind === "initial") {
    return `ROUND ${frame.round} · SETUP`;
  }
  if (frame.turn !== null && frame.turn !== undefined) {
    return `ROUND ${frame.round} · TURN ${frame.turn}`;
  }
  return `ROUND ${frame.round} · END OF ROUND`;
}

function currentResolutionText(frame) {
  if (!frame.active_card) return "";

  const heroMeta = replayHeroMeta(frame.active_card.hero_id);
  const card = cardData(frame.active_card.asset_id, frame.active_card.card);
  const cardName = card ? card.name : frame.active_card.card;
  return `${heroMeta.display_name.toUpperCase()} resolving ${cardName}`;
}

function renderHeaderContext(frame) {
  const description = document.getElementById("action-description");
  const history = document.getElementById("previous-description");
  const separator = document.getElementById("action-context-separator");
  const resolution = document.getElementById("current-resolution");

  if (frame.kind === "action" && frame.active_card) {
    description.dataset.mode = "decision";
    history.textContent = frame.previous_description || "Cards revealed";
    separator.hidden = false;
    resolution.textContent = currentResolutionText(frame);
    return;
  }

  description.dataset.mode = "result";
  history.textContent = frame.display_description || frame.description;
  separator.hidden = true;
  resolution.textContent = "";
}

function frameKindLabel(frame) {
  const labels = {
    initial: "SETUP",
    action: "ACTION",
    end_of_turn: "END OF TURN",
    lane_push: "LANE PUSH",
    level_up: "LEVEL UP",
    round_end: "END OF ROUND",
    game_end: "GAME END"
  };
  return labels[frame.kind] || frame.kind.replaceAll("_", " ").toUpperCase();
}

function renderNavigation(frame) {
  const previous = document.getElementById("previous-frame");
  const next = document.getElementById("next-frame");
  const slider = document.getElementById("frame-slider");

  previous.disabled = currentFrameIndex === 0;
  next.disabled = currentFrameIndex === replayBundle.frames.length - 1;
  slider.max = String(replayBundle.frames.length);
  slider.value = String(currentFrameIndex + 1);

  document.getElementById("frame-kind").textContent = frameKindLabel(frame);
  document.getElementById("frame-position").textContent = `${frame.number} / ${frame.frame_count}`;
}

function renderFrame(index) {
  if (!replayBundle) return;

  currentFrameIndex = Math.max(0, Math.min(index, replayBundle.frames.length - 1));
  const frame = replayBundle.frames[currentFrameIndex];

  document.getElementById("round-turn").textContent = frameHeading(frame);
  renderHeaderContext(frame);

  renderTeam("blue", frame);
  renderTeam("red", frame);
  renderActiveCard(frame);
  renderBoard(frame);
  renderStatus(frame);
  renderNavigation(frame);
  requestAnimationFrame(() => positionActiveCard(frame));
}

function setFrame(index) {
  renderFrame(index);
}

function jumpToRoundTurn(text) {
  const match = text.match(/^\s*R?\s*(\d+)\s*(?:T|[.,:/-])?\s*(\d+)?\s*$/i);
  if (!match) return false;

  const round = Number(match[1]);
  const turn = match[2] === undefined ? null : Number(match[2]);
  const index = replayBundle.frames.findIndex(frame => {
    if (frame.round !== round) return false;
    if (turn !== null && frame.turn !== turn) return false;
    return true;
  });

  if (index < 0) return false;
  setFrame(index);
  return true;
}

function openCard(assetId, code) {
  const hero = heroAssetData(assetId);
  const card = cardData(assetId, code);
  if (!card) return;

  const dialog = document.getElementById("card-dialog");
  const image = document.getElementById("dialog-image");
  const caption = document.getElementById("dialog-caption");
  image.src = card.image;
  image.alt = `${hero.display_name} ${code}: ${card.name}`;
  caption.textContent = `${hero.display_name} ${code} — ${card.name}`;
  dialog.showModal();
}

function wireNavigation() {
  document.getElementById("previous-frame").addEventListener("click", () => setFrame(currentFrameIndex - 1));
  document.getElementById("next-frame").addEventListener("click", () => setFrame(currentFrameIndex + 1));

  document.getElementById("frame-slider").addEventListener("input", event => {
    setFrame(Number(event.target.value) - 1);
  });

  document.getElementById("jump-form").addEventListener("submit", event => {
    event.preventDefault();
    const input = document.getElementById("jump-input");
    const found = jumpToRoundTurn(input.value);
    input.classList.toggle("is-invalid", !found);
  });

  window.addEventListener("keydown", event => {
    if (document.activeElement?.matches("input")) return;

    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      setFrame(currentFrameIndex + 1);
    } else if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      setFrame(currentFrameIndex - 1);
    } else if (event.key === "Home") {
      setFrame(0);
    } else if (event.key === "End") {
      setFrame(replayBundle.frames.length - 1);
    }
  });
}

function inferLayoutMode() {
  const teamSizes = Object.values(replayBundle.game.teams).map(team => team.length);
  return Math.max(...teamSizes) >= 3 ? "3v3" : "2v2";
}

async function fetchJson(path) {
  // During active development and after a newly published replay, stale JSON
  // is more confusing than the tiny cost of revalidating these small files.
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${path} (${response.status})`);
  }
  return response.json();
}

function requestedGameId(catalog) {
  const requested = new URLSearchParams(window.location.search).get("game");
  if (!requested) return catalog.default_game;
  if (!catalog.games[requested]) {
    throw new Error(`Unknown replay: ${requested}`);
  }
  return requested;
}

async function init() {
  const [loadedManifest, catalog] = await Promise.all([
    fetchJson("assets/manifest.json"),
    fetchJson("data/replays.json")
  ]);

  const gameId = requestedGameId(catalog);
  const replayEntry = catalog.games[gameId];

  manifest = loadedManifest;
  replayBundle = await fetchJson(replayEntry.replay_file);

  document.title = `Guards of Atlantis II Replay — ${replayBundle.game.name}`;
  document.getElementById("game-name").textContent = replayBundle.game.name;
  document.getElementById("map-image").src = manifest.maps[replayBundle.game.map_id].image;
  document.getElementById("replay-layout").dataset.layout = inferLayoutMode();

  const dialog = document.getElementById("card-dialog");
  document.getElementById("close-dialog").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  wireNavigation();
  window.addEventListener("resize", () => {
    const frame = replayBundle.frames[currentFrameIndex];
    requestAnimationFrame(() => positionActiveCard(frame));
  });

  renderFrame(0);
}

init().catch(error => {
  console.error(error);
  document.getElementById("round-turn").textContent = "REPLAY FAILED TO LOAD";
  document.getElementById("action-description").textContent = error.message;
  const help = document.getElementById("replay-help");
  help.textContent = "The replay could not load. For local use, launch web\\run_local.bat; for a hosted copy, check that the selected replay was published.";
  help.classList.add("load-error");
});
