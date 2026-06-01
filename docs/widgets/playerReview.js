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

  const compData = buildComparisonData(pulls, raiders, bossAbilities);

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
      <h4>Player Comparison — Tracked Abilities</h4>
      <div class="comp-grid">
        ${bossAbilities.map((a) => {
          const allData = compData[a.id] || [];
          const noTankData = allData.filter((d) => !tankIds.has(d.player.id));
          const initData = noTankData.length ? noTankData : allData;
          const chartH = Math.max(120, initData.length * 30 + 40);
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
            ${allData.length
              ? `<div class="chart-container comp-chart-wrap" id="pr-cmp-wrap-${a.id}" style="height:${chartH}px"><canvas id="pr-cmp-${a.id}"></canvas></div>`
              : `<p class="no-data">No data for this ability.</p>`}
          </div>`;
        }).join("")}
      </div>
    </section>` : ""}
  `;

  const select = container.querySelector("#pr-player-select");
  const content = container.querySelector("#pr-player-content");

  function update(playerId) {
    const player = raiders.find((p) => p.id === playerId);
    if (player) renderPlayerContent(content, pulls, player, bossAbilities, raiders, boss);
  }

  select.addEventListener("change", (e) => update(e.target.value));
  update(raiders[0].id);

  // Render comparison charts with tank filtering
  for (const ability of bossAbilities) {
    const allData = compData[ability.id] || [];
    if (!allData.length) continue;

    const noTankData = allData.filter((d) => !tankIds.has(d.player.id));
    const canvas = container.querySelector(`#pr-cmp-${ability.id}`);
    const wrap   = container.querySelector(`#pr-cmp-wrap-${ability.id}`);
    if (!canvas || !wrap) continue;

    const initData = noTankData.length ? noTankData : allData;
    const chart = renderComparisonChart(canvas, initData, ability);

    const toggle = container.querySelector(`.tank-toggle[data-ability="${ability.id}"]`);
    if (toggle && chart) {
      toggle.addEventListener("change", (e) => {
        const data = e.target.checked ? allData : (noTankData.length ? noTankData : allData);
        const h = Math.max(120, data.length * 30 + 40);

        wrap.style.height = h + "px";
        requestAnimationFrame(() => {
          chart.data.labels = data.map((d) => d.player.name);
          chart.data.datasets[0].data = data.map((d) => d.total);
          chart.data.datasets[0].backgroundColor = data.map((d) => getPlayerColor(d.player) + "99");
          chart.data.datasets[0].borderColor = data.map((d) => getPlayerColor(d.player));
          // Keep tooltip in sync with new data
          chart.options.plugins.tooltip.callbacks.label = (item) => {
            const d = data[item.dataIndex];
            return d ? `Total: ${formatNumber(d.total)}` : `Total: ${formatNumber(item.raw)}`;
          };
          chart.resize();
          chart.update();
        });
      });
    }
  }
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

function renderComparisonChart(canvas, playerData, ability) {
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: playerData.map((d) => d.player.name),
      datasets: [{
        label: "Total damage taken",
        data: playerData.map((d) => d.total),
        backgroundColor: playerData.map((d) => getPlayerColor(d.player) + "99"),
        borderColor: playerData.map((d) => getPlayerColor(d.player)),
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
              const d = playerData[item.dataIndex];
              return `Total: ${formatNumber(d.total)}`;
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildComparisonData(pulls, raiders, bossAbilities) {
  const result = {};
  for (const ability of bossAbilities) {
    const keyId = ability.abilityId != null ? String(ability.abilityId) : null;
    const keyName = ability.label?.toLowerCase();

    const byPlayer = [];
    for (const player of raiders) {
      let total = 0, hits = 0;
      for (const pull of pulls) {
        for (const dt of pull.damageTaken || []) {
          if (dt.playerId !== player.id) continue;
          if ((keyId && String(dt.abilityId) === keyId) || (keyName && dt.abilityName?.toLowerCase() === keyName)) {
            total += dt.total || 0;
            hits += dt.hits || 0;
          }
        }
      }
      byPlayer.push({ player, total, hits });
    }
    result[ability.id] = byPlayer.sort((a, b) => b.total - a.total);
  }
  return result;
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
