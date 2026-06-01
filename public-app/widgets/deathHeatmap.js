import { allPulls } from "./utils.js";

const COORD_SCALE = 100; // raw centiYards → yards (matches WCL replay units)
const CELL_SIZE = 14;    // fixed display-pixel cell size

// Renderer signature: returns false if the widget should not be displayed
// (no data). The parent app removes the widget section in that case.
export function renderDeathHeatmap(container, boss, players) {
  const cfg = boss.deathMapConfig || {};
  const positions = allPulls(boss).flatMap((p) => p.deathPositions || []);
  if (!positions.length || !cfg.imageUrl) return false;

  // Allowed phase ids (empty config = all phases from phaseMap)
  const allowedPhaseIds = (cfg.publicPhases?.length ? cfg.publicPhases : (boss.phaseMap || []).map((p) => p.id));
  const allowedSet = new Set(allowedPhaseIds.map((id) => String(id)));

  // Player dropdown only lists raiders with at least one stored death
  const playerIdsWithDeaths = new Set(positions.map((p) => p.playerId).filter(Boolean));
  const filteredPlayers = players.filter((p) => playerIdsWithDeaths.has(p.id));
  const visiblePhases = (boss.phaseMap || []).filter((p) => allowedSet.has(String(p.id)));

  container.innerHTML = `
    <div class="dhm-controls">
      <label class="dhm-field">
        <span>Player</span>
        <select id="dhm-player">
          <option value="">All players</option>
          ${filteredPlayers.map((p) => `<option value="${p.id}">${p.name}</option>`).join("")}
        </select>
      </label>
      <label class="dhm-field">
        <span>Phase</span>
        <select id="dhm-phase">
          <option value="">All phases</option>
          ${visiblePhases.map((ph) => `<option value="${ph.id}">${ph.title}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="dhm-stage">
      <canvas id="dhm-canvas"></canvas>
      <div id="dhm-empty" class="dhm-empty" hidden>No deaths match the current filter.</div>
    </div>
  `;

  const canvas = container.querySelector("#dhm-canvas");
  const stage  = container.querySelector(".dhm-stage");
  const empty  = container.querySelector("#dhm-empty");
  const playerSel = container.querySelector("#dhm-player");
  const phaseSel  = container.querySelector("#dhm-phase");

  let mapImage = null;
  let mapImageFailed = false;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function boundsForPhase(phase) {
    const key = String(phase);
    const perPhase = cfg.mapBoundsByPhase?.[key];
    if (perPhase && Number.isFinite(perPhase.minX) && Number.isFinite(perPhase.maxX)
        && Number.isFinite(perPhase.minY) && Number.isFinite(perPhase.maxY)) return perPhase;
    const def = cfg.mapBounds;
    if (def && Number.isFinite(def.minX) && Number.isFinite(def.maxX)
        && Number.isFinite(def.minY) && Number.isFinite(def.maxY)) return def;
    return null;
  }

  function render() {
    if (!mapImage) return;

    // Canvas size = container width × (image aspect ratio)
    const displayWidth = stage.clientWidth || 800;
    const aspect = mapImage.naturalWidth / mapImage.naturalHeight;
    canvas.width  = Math.max(50, Math.round(displayWidth));
    canvas.height = Math.max(50, Math.round(canvas.width / aspect));

    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(mapImage, 0, 0, W, H);

    // Filter deaths by UI selection + allowed phases from config
    const playerFilter = playerSel.value;
    const phaseFilter  = phaseSel.value;
    const deaths = positions.filter((d) => {
      if (!allowedSet.has(String(d.phase))) return false;
      if (playerFilter && d.playerId !== playerFilter) return false;
      if (phaseFilter !== "" && String(d.phase) !== phaseFilter) return false;
      return true;
    });

    // Map to pixel positions using per-phase bounds
    const pts = [];
    for (const d of deaths) {
      const b = boundsForPhase(d.phase);
      if (!b) continue;
      const px = (d.x / COORD_SCALE - b.minX) / (b.maxX - b.minX) * W;
      const py = (d.y / COORD_SCALE - b.minY) / (b.maxY - b.minY) * H;
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      pts.push({ px, py });
    }

    empty.hidden = pts.length > 0;
    if (!pts.length) return;

    // 14px grid binning
    const cols = Math.ceil(W / CELL_SIZE);
    const rows = Math.ceil(H / CELL_SIZE);
    const grid = new Uint32Array(cols * rows);
    for (const p of pts) {
      const cx = Math.floor(p.px / CELL_SIZE);
      const cy = Math.floor(p.py / CELL_SIZE);
      if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue;
      grid[cy * cols + cx]++;
    }
    let maxCount = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i] > maxCount) maxCount = grid[i];
    const effectiveMax = Math.max(maxCount, 4);

    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const count = grid[cy * cols + cx];
        if (count === 0) continue;
        const t = Math.min(1, count / effectiveMax);
        const g = Math.round(255 * Math.max(0, 1 - t * 1.5));
        const a = 0.35 + 0.55 * t;
        ctx.fillStyle = `rgba(255, ${g}, 0, ${a})`;
        ctx.fillRect(cx * CELL_SIZE, cy * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
  }

  playerSel.addEventListener("change", render);
  phaseSel.addEventListener("change", render);

  // Re-render whenever the stage resizes (responsive width)
  const ro = new ResizeObserver(() => { if (!mapImageFailed) render(); });
  ro.observe(stage);

  loadImage(cfg.imageUrl)
    .then((img) => { mapImage = img; render(); })
    .catch((err) => {
      mapImageFailed = true;
      console.error("Death heatmap map image failed to load:", err);
      stage.innerHTML = `<p class="no-data">Map image could not be loaded.</p>`;
    });

  return true;
}
