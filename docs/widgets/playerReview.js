import { allPulls, getPlayerColor, formatNumber, WOW_CLASS_COLORS, resolveClass } from "./utils.js";

export function renderPlayerReview(container, boss, players) {
  const raiders = players.filter((p) => WOW_CLASS_COLORS[resolveClass(p.class)] || WOW_CLASS_COLORS[p.class]);

  if (!raiders.length) {
    container.innerHTML = "<p class='no-data'>No player data available.</p>";
    return;
  }

  const bossAbilities = boss.playerReviewConfig?.abilities || [];
  const tankIds = new Set(boss.playerReviewConfig?.tanks || []);
  const pulls = allPulls(boss).sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));

  // Per-ability aggregates across ALL raiders: damage taken, hits and early
  // deaths (deaths that occurred among the first 5 deaths of a pull).
  const { perAbility, presentPulls } = buildComparisonData(pulls, raiders, bossAbilities);

  container.innerHTML = `
    <div class="pr-header">
      <label class="pr-player-label">
        <span>Player</span>
        <select id="pr-player-select">
          ${raiders.map((p) => `<option value="${p.id}" style="color:${getPlayerColor(p)}">${p.name}</option>`).join("")}
        </select>
      </label>
    </div>

    <div id="pr-player-content"></div>

    ${bossAbilities.length ? `
    <section class="pr-section pr-comparison">
      <div class="pr-comp-header">
        <h4>Player Comparison — Tracked Abilities</h4>
        <div class="seg" id="pr-norm-seg" role="group" aria-label="Normalization">
          <button type="button" class="seg-btn active" data-norm="total">Total</button>
          <button type="button" class="seg-btn" data-norm="perpull">Ø / pull</button>
        </div>
      </div>
      <div class="comp-grid">
        ${bossAbilities.map((a) => {
          const allData = perAbility[a.id] || [];
          const hasTanks = allData.some((d) => tankIds.has(d.player.id));
          return `
          <div class="comp-ability">
            <div class="comp-ability-header">
              <h5>${a.label}</h5>
              ${hasTanks ? `<label class="tank-toggle-label">
                <input type="checkbox" class="tank-toggle" data-ability="${a.id}" />
                Show Tanks
              </label>` : ""}
            </div>
            <div class="comp-sub">
              <div class="comp-sub-title">Damage taken</div>
              <div class="comp-sub-body" id="pr-cmp-dmg-${a.id}"></div>
            </div>
            <div class="comp-sub">
              <div class="comp-sub-title">Deaths</div>
              <div class="comp-sub-body" id="pr-cmp-deaths-${a.id}"></div>
            </div>
          </div>`;
        }).join("")}
      </div>
    </section>` : ""}
  `;

  const select = container.querySelector("#pr-player-select");
  const content = container.querySelector("#pr-player-content");

  // Shared comparison state.
  let selectedId = raiders[0].id;
  let normalize = false;
  const showTanks = {}; // ability.id -> bool
  const registry = {};  // ability.id -> { dmg, deaths } chart instances

  const denom = (playerId) => Math.max(1, presentPulls.get(playerId) || 0);

  function buildRows(entries, metric) {
    return entries
      .map((e) => {
        const pp = denom(e.player.id);
        const base = metric === "deaths" ? e.deaths : e.dmgTotal;
        return {
          player: e.player,
          dmgTotal: e.dmgTotal,
          hits: e.hits,
          deaths: e.deaths,
          presentPulls: pp,
          value: normalize ? base / pp : base
        };
      })
      .sort((a, b) => b.value - a.value);
  }

  function drawAbility(ability) {
    const entries = perAbility[ability.id] || [];
    // Tank filtering: hidden by default, unless every non-tank has no data.
    const nonTank = entries.filter((e) => !tankIds.has(e.player.id));
    const useEntries = showTanks[ability.id]
      ? entries
      : (nonTank.length ? nonTank : entries);

    const dmgRows   = buildRows(useEntries, "dmg");
    const deathRows = buildRows(useEntries, "deaths");

    const reg = registry[ability.id];
    if (reg) { reg.dmg?.destroy(); reg.deaths?.destroy(); }

    registry[ability.id] = {
      dmg:    fillCompBody(container.querySelector(`#pr-cmp-dmg-${ability.id}`), dmgRows, "dmg", selectedId, normalize),
      deaths: fillCompBody(container.querySelector(`#pr-cmp-deaths-${ability.id}`), deathRows, "deaths", selectedId, normalize)
    };
  }

  function redrawComparison() {
    for (const ability of bossAbilities) drawAbility(ability);
  }

  function update(playerId) {
    selectedId = playerId;
    const player = raiders.find((p) => p.id === playerId);
    if (player) renderPlayerContent(content, pulls, player, bossAbilities, raiders, boss);
    redrawComparison(); // re-color bars to highlight the selected player
  }

  select.addEventListener("change", (e) => update(e.target.value));

  // Normalization segmented control.
  const seg = container.querySelector("#pr-norm-seg");
  if (seg) {
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      normalize = btn.dataset.norm === "perpull";
      seg.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
      redrawComparison();
    });
  }

  // Per-ability "Show Tanks" toggles.
  for (const ability of bossAbilities) {
    const toggle = container.querySelector(`.tank-toggle[data-ability="${ability.id}"]`);
    if (toggle) {
      toggle.addEventListener("change", (e) => {
        showTanks[ability.id] = e.target.checked;
        drawAbility(ability);
      });
    }
  }

  update(raiders[0].id);
}

// Fill a comparison sub-chart body with a horizontal bar chart (or a hint when
// there's no data). Returns the Chart instance (or null).
function fillCompBody(bodyEl, rows, metric, selectedId, normalize) {
  if (!bodyEl) return null;
  if (!rows.length) {
    bodyEl.innerHTML = `<p class="no-data">${metric === "deaths" ? "No early deaths recorded." : "No damage recorded."}</p>`;
    return null;
  }
  const h = Math.max(82, rows.length * 22 + 43);
  bodyEl.innerHTML = `<div class="chart-container comp-chart-wrap" style="height:${h}px"><canvas></canvas></div>`;
  return renderCompChart(bodyEl.querySelector("canvas"), rows, metric, selectedId, normalize);
}

// ── Per-player content ───────────────────────────────────────────────────────

function renderPlayerContent(container, pulls, player, bossAbilities, raiders, boss) {
  const playerId = player.id;
  const potionWindows = boss.playerReviewConfig?.potionWindows || [];

  const trackedIds = new Set(bossAbilities.map((a) => a.abilityId != null ? String(a.abilityId) : null).filter(Boolean));
  const trackedNames = new Set(bossAbilities.map((a) => a.label?.toLowerCase()).filter(Boolean));

  const damageTotals = new Map();
  const deathsByPull = [];
  const potUsage = [];

  for (const [i, pull] of pulls.entries()) {
    // Damage accumulation (all pulls, presence doesn't matter for trend data)
    for (const dt of pull.damageTaken || []) {
      if (dt.playerId !== playerId) continue;
      // If this ability matches a tracked ability (by ID or name), use the
      // tracked ability's canonical id as key so different game-ID variants
      // of the same ability (e.g. rank 1 vs rank 2) are merged into one bar.
      const matched = bossAbilities.find((a) =>
        (a.abilityId != null && String(dt.abilityId) === String(a.abilityId)) ||
        (a.label && dt.abilityName?.toLowerCase() === a.label.toLowerCase())
      );
      const key = matched ? matched.id : (dt.abilityId != null ? String(dt.abilityId) : dt.abilityName);
      const ex = damageTotals.get(key) || { abilityId: dt.abilityId, abilityName: matched?.label || dt.abilityName, totalDamage: 0, hits: 0, pullCount: 0 };
      ex.totalDamage += dt.total || 0;
      ex.hits += dt.hits || 0;
      ex.pullCount += 1;
      damageTotals.set(key, ex);
    }

    // Deaths: only the first 5 of the fight, sorted by time
    const first5 = [...(pull.deaths || [])]
      .sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity))
      .slice(0, 5);

    const inPull = !pull.participants?.length || pull.participants.includes(playerId);

    const pullDeaths = new Map();
    for (const death of first5) {
      if (death.playerId !== playerId) continue;
      const matched = bossAbilities.find((a) =>
        (a.abilityId != null && String(death.abilityId) === String(a.abilityId)) ||
        (a.label && death.abilityName?.toLowerCase() === a.label.toLowerCase())
      );
      if (!matched) continue;
      pullDeaths.set(matched.id, (pullDeaths.get(matched.id) || 0) + 1);
    }
    deathsByPull.push({ pullIndex: i + 1, deaths: pullDeaths, notPresent: !inPull });

    const pot = inPull ? (pull.potionUsage?.find((p) => p.playerId === playerId)) : null;
    potUsage.push({
      pullIndex: i + 1,
      used: pot?.used || false,
      potionName: pot?.potionName || null,
      phase: pull.phase,
      count: pot?.count || 0,
      notPresent: !inPull,
      duration: pull.duration || 0
    });
  }

  const allDamage = [...damageTotals.values()].sort((a, b) => b.totalDamage - a.totalDamage);
  const trackedDamage = bossAbilities.length
    ? allDamage.filter((d) => trackedIds.has(String(d.abilityId)) || trackedNames.has(d.abilityName?.toLowerCase()))
    : allDamage.slice(0, 10);

  const hasDeaths = deathsByPull.some((p) => p.deaths.size > 0);
  const playerColor = getPlayerColor(player);

  container.innerHTML = `
    <div class="pr-grid">
      <section class="pr-section">
        <h4>Damage Taken${bossAbilities.length ? " — Tracked Abilities" : " — Top 10"}</h4>
        ${trackedDamage.length
          ? `<div class="chart-container" style="height:${Math.max(160, trackedDamage.length * 36 + 40)}px"><canvas id="pr-dmg-chart"></canvas></div>`
          : `<p class="no-data">No damage data for ${player.name}.</p>`}
      </section>

      <section class="pr-section pr-deaths-section">
        <div class="pr-deaths-header">
          <h4>Deaths from Tracked Abilities</h4>
          ${bossAbilities.length > 1 ? `
          <label>
            Filter
            <select id="pr-death-filter">
              <option value="">All abilities</option>
              ${bossAbilities.map((a) => `<option value="${a.id}">${a.label}</option>`).join("")}
            </select>
          </label>` : ""}
        </div>
        ${hasDeaths
          ? `<div class="chart-container chart-deaths"><canvas id="pr-deaths-chart"></canvas></div>`
          : `<p class="no-data">No deaths from tracked abilities recorded.</p>`}
      </section>

      <section class="pr-section">
        <h4>Potion Usage — Pull by Pull</h4>
        ${renderPotInfo(boss)}
        ${renderPotGrid(potUsage, potionWindows)}
      </section>
    </div>
  `;

  if (trackedDamage.length) {
    renderDmgChart(container.querySelector("#pr-dmg-chart"), trackedDamage, playerColor);
  }

  if (hasDeaths) {
    const canvas = container.querySelector("#pr-deaths-chart");
    let chart = renderDeathsChart(canvas, deathsByPull, bossAbilities);

    const filter = container.querySelector("#pr-death-filter");
    if (filter) {
      filter.addEventListener("change", (e) => {
        if (chart) chart.destroy();
        const filtered = e.target.value
          ? bossAbilities.filter((a) => a.id === e.target.value)
          : bossAbilities;
        chart = renderDeathsChart(canvas, deathsByPull, filtered);
      });
    }
  }
}

// ── Charts ───────────────────────────────────────────────────────────────────

const ABILITY_COLORS = ["#ef4444", "#f59e0b", "#06b6d4", "#8b5cf6", "#3fb950", "#ff8000", "#ec4899"];

function renderDeathsChart(canvas, deathsByPull, abilities) {
  const datasets = abilities
    .map((ability, i) => ({
      label: ability.label,
      data: deathsByPull.map((p) => p.deaths.get(ability.id) || 0),
      backgroundColor: ABILITY_COLORS[i % ABILITY_COLORS.length] + "cc",
      borderColor: ABILITY_COLORS[i % ABILITY_COLORS.length],
      borderWidth: 1,
      borderRadius: 2,
      stack: "deaths"
    }))
    .filter((ds) => ds.data.some((v) => v > 0));

  if (!datasets.length) return null;

  const labels = deathsByPull.map((p) => `#${p.pullIndex}`);

  return new Chart(canvas, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { color: "#e6edf3", font: { size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { title: (items) => `Pull ${items[0].label}` } }
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            color: (ctx) => deathsByPull[ctx.index]?.notPresent ? "#333" : "#7d8590",
            font: { size: 10 },
            maxTicksLimit: 60
          },
          grid: { color: "#21262d" }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { color: "#7d8590", stepSize: 1, precision: 0 },
          grid: { color: "#21262d" }
        }
      }
    }
  });
}

function renderDmgChart(canvas, data, playerColor) {
  new Chart(canvas, {
    type: "bar",
    data: {
      labels: data.map((d) => d.abilityName),
      datasets: [{
        label: "Total damage taken",
        data: data.map((d) => d.totalDamage),
        backgroundColor: playerColor + "99",
        borderColor: playerColor,
        borderWidth: 1,
        borderRadius: 3
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => {
              const d = data[item.dataIndex];
              return [`Total: ${formatNumber(d.totalDamage)}`, `Hits: ${d.hits}`, `Avg/hit: ${formatNumber(d.hits > 0 ? Math.round(d.totalDamage / d.hits) : 0)}`, `Pulls hit: ${d.pullCount}`];
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: "#7d8590", callback: (v) => formatNumber(v) }, grid: { color: "#21262d" } },
        y: { ticks: { color: "#e6edf3", font: { size: 11 } }, grid: { color: "#21262d" } }
      }
    }
  });
}

function renderCompChart(canvas, rows, metric, selectedId, normalize) {
  const isDeaths = metric === "deaths";

  // Highlight the selected player without dimming the rest: full-colour bars,
  // and a bold + italic accent axis label (handled in the y-scale ticks below).
  const bg = rows.map((r) => getPlayerColor(r.player) + "99");
  const border = rows.map((r) => getPlayerColor(r.player));

  // Dashed reference line at the team average, so it's obvious who sits
  // above / below the mean for this ability.
  const avg = rows.length ? rows.reduce((s, r) => s + r.value, 0) / rows.length : 0;
  const avgLinePlugin = {
    id: "avgLine",
    // Line goes behind the bars so it doesn't appear to cut through them —
    // it's only visible in the empty area past each bar.
    beforeDatasetsDraw(chart) {
      if (!rows.length) return;
      const x = chart.scales.x.getPixelForValue(avg);
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#8b949e";
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.restore();
    },
    // Label drawn in the top padding gap, just above the first bar.
    afterDatasetsDraw(chart) {
      if (!rows.length) return;
      const x = chart.scales.x.getPixelForValue(avg);
      const { top } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = "600 12px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#8b949e";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("Ø", x, top - 2);
      ctx.restore();
    }
  };

  return new Chart(canvas, {
    type: "bar",
    plugins: [avgLinePlugin],
    data: {
      labels: rows.map((r) => r.player.name),
      datasets: [{
        data: rows.map((r) => r.value),
        backgroundColor: bg,
        borderColor: border,
        borderWidth: 1,
        borderRadius: 3,
        // Keep the bar colour identical on hover — the tooltip is enough.
        hoverBackgroundColor: bg,
        hoverBorderColor: border,
        hoverBorderWidth: 1
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 17 } }, // room above the first bar for the Ø label
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => {
              const r = rows[item.dataIndex];
              if (isDeaths) {
                return [
                  `Deaths: ${r.deaths}`,
                  `Ø/pull: ${(r.deaths / r.presentPulls).toFixed(2)}`,
                  `Pulls present: ${r.presentPulls}`
                ];
              }
              return [
                `Total: ${formatNumber(r.dmgTotal)}`,
                `Hits: ${r.hits}`,
                `Ø/pull: ${formatNumber(Math.round(r.dmgTotal / r.presentPulls))}`,
                `Pulls present: ${r.presentPulls}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#7d8590",
            font: { size: 10 },
            stepSize: isDeaths && !normalize ? 1 : undefined,
            precision: isDeaths && !normalize ? 0 : undefined,
            callback: (v) => isDeaths ? v : formatNumber(v)
          },
          grid: { color: "#21262d" }
        },
        y: {
          ticks: {
            padding: 6,
            color: (ctx) => rows[ctx.index]?.player.id === selectedId ? "#58a6ff" : "#e6edf3",
            font: (ctx) => {
              const sel = rows[ctx.index]?.player.id === selectedId;
              return { size: 10, weight: sel ? "700" : "400", style: sel ? "italic" : "normal" };
            }
          },
          grid: { color: "#21262d", tickLength: 0 }
        }
      }
    }
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildComparisonData(pulls, raiders, bossAbilities) {
  const raiderIds = new Set(raiders.map((p) => p.id));
  // ability.id -> Map(playerId -> { player, dmgTotal, hits, deaths })
  const perAbilityMap = {};
  for (const a of bossAbilities) {
    perAbilityMap[a.id] = new Map(raiders.map((p) => [p.id, { player: p, dmgTotal: 0, hits: 0, deaths: 0 }]));
  }
  const presentPulls = new Map(raiders.map((p) => [p.id, 0]));

  const matchAbility = (abilityId, abilityName) => bossAbilities.find((a) =>
    (a.abilityId != null && String(abilityId) === String(a.abilityId)) ||
    (a.label && abilityName?.toLowerCase() === a.label.toLowerCase())
  );

  for (const pull of pulls) {
    // Presence (denominator for per-pull normalization). Empty participants
    // list = unknown → treat everyone as present.
    const participants = pull.participants?.length ? pull.participants : null;
    for (const p of raiders) {
      if (!participants || participants.includes(p.id)) {
        presentPulls.set(p.id, presentPulls.get(p.id) + 1);
      }
    }

    // Damage taken from tracked abilities.
    for (const dt of pull.damageTaken || []) {
      if (!raiderIds.has(dt.playerId)) continue;
      const matched = matchAbility(dt.abilityId, dt.abilityName);
      if (!matched) continue;
      const e = perAbilityMap[matched.id].get(dt.playerId);
      if (!e) continue;
      e.dmgTotal += dt.total || 0;
      e.hits += dt.hits || 0;
    }

    // Deaths: only the first 5 of the fight (sorted by time), same gating as
    // the per-player deaths chart.
    const first5 = [...(pull.deaths || [])]
      .sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity))
      .slice(0, 5);
    for (const death of first5) {
      if (!raiderIds.has(death.playerId)) continue;
      const matched = matchAbility(death.abilityId, death.abilityName);
      if (!matched) continue;
      const e = perAbilityMap[matched.id].get(death.playerId);
      if (e) e.deaths += 1;
    }
  }

  const perAbility = {};
  for (const a of bossAbilities) perAbility[a.id] = [...perAbilityMap[a.id].values()];
  return { perAbility, presentPulls };
}

function getPotState(p, potionWindows) {
  if (p.notPresent) return "not-present";
  if (!potionWindows.length) return p.used ? "used" : "missed";
  const durationSecs = p.duration / 1000;
  const expected = potionWindows.filter((w) => durationSecs >= (w.afterSeconds ?? 0)).length;
  if (expected === 0) return "na";
  if (p.count >= expected) return "used";
  if (p.count > 0) return "partial";
  return "missed";
}

function renderPotInfo(boss) {
  const config = boss.playerReviewConfig || {};
  const auras = config.potionAuras || [];
  const windows = config.potionWindows || [];
  if (!auras.length && !windows.length) return "";

  const windowStr = windows.map((w, i) => {
    const s = w.afterSeconds ?? 0;
    const min = Math.floor(s / 60);
    const sec = String(s % 60).padStart(2, "0");
    return `Pot ${i + 1}${w.label ? ` (${w.label})` : ""} from ${min}:${sec}`;
  }).join(" · ");

  return `<div class="pot-info">
    ${auras.length ? `<span>Tracked: <strong>${auras.join(", ")}</strong></span>` : ""}
    ${windows.length ? `<span>${windowStr}</span>` : ""}
  </div>`;
}

function renderPotGrid(potUsage, potionWindows) {
  if (!potUsage.length) return "<p class='no-data'>No pot data.</p>";

  const states = potUsage.map((p) => ({ ...p, state: getPotState(p, potionWindows) }));
  const relevant = states.filter((p) => p.state !== "not-present" && p.state !== "na");
  const full = relevant.filter((p) => p.state === "used").length;
  const partial = relevant.filter((p) => p.state === "partial").length;
  const missed = relevant.filter((p) => p.state === "missed").length;
  const total = relevant.length;

  const icons = { used: "✓", partial: "~", missed: "✗", "not-present": "—", na: "·" };

  const summary = total
    ? `${full}/${total} pulls (${Math.round(full / total * 100)}%)${partial ? `, ${partial} partial` : ""}${missed ? `, ${missed} missed` : ""}`
    : "No relevant pulls";

  return `
    <div class="pot-summary">${summary}</div>
    <div class="pot-grid">
      ${states.map((p) => {
        const tip = p.state === "not-present" ? `Pull #${p.pullIndex} — Not in raid`
          : p.state === "na" ? `Pull #${p.pullIndex} — Fight too short`
          : p.state === "used" ? `Pull #${p.pullIndex}${p.potionName ? " — " + p.potionName : ""}`
          : p.state === "partial" ? `Pull #${p.pullIndex} — ${p.count} pot(s), expected more`
          : `Pull #${p.pullIndex} — No pot`;
        return `<div class="pot-cell pot-${p.state}" title="${tip}">
          <span class="pot-num">${p.pullIndex}</span>
          <span class="pot-icon">${icons[p.state]}</span>
        </div>`;
      }).join("")}
    </div>`;
}
