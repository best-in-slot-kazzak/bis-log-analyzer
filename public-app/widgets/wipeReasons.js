import { resolvePullReason, allPulls, getPlayerColor } from "./utils.js";

export function renderWipeReasons(container, boss, players) {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const phaseMap  = boss.phaseMap || [];

  // Reasons that have at least one player assignment (manual or auto)
  const reasonsWithPlayers = new Set();
  for (const pull of allPulls(boss)) {
    const r = resolvePullReason(pull);
    const playerId = pull.manualWipeReason?.playerId || pull.autoWipeReason?.playerId;
    if (playerId) reasonsWithPlayers.add(r.reasonId);
  }
  const filterableReasons = (boss.wipeReasons || []).filter((r) => reasonsWithPlayers.has(r.id));

  // Build phase options from phaseMap (sorted by absoluteIndex)
  const phaseOptions = [...phaseMap].sort((a, b) => a.id - b.id);

  container.innerHTML = `
    <div class="wr-layout">
      <div class="wr-left">
        <div class="chart-container chart-sm"><canvas id="wr-chart"></canvas></div>
        <div class="wr-legend"></div>
      </div>
      <div class="wr-right">
        <div class="wr-filter">
          <label>Reason
            <select id="wr-reason-filter">
              <option value="">All reasons</option>
              ${filterableReasons.map((r) => `<option value="${r.id}">${r.label}</option>`).join("")}
            </select>
          </label>
          ${phaseOptions.length ? `
          <label>Phase
            <select id="wr-phase-filter">
              <option value="">All phases</option>
              ${phaseOptions.map((p) => `<option value="${p.id}">${p.title}</option>`).join("")}
            </select>
          </label>` : ""}
        </div>
        <table class="reason-table">
          <thead id="wr-thead"></thead>
          <tbody id="wr-table-body"></tbody>
        </table>
      </div>
    </div>
  `;

  let chart = null;
  const filterSelect = container.querySelector("#wr-reason-filter");
  const phaseSelect  = container.querySelector("#wr-phase-filter");
  const canvas = container.querySelector("#wr-chart");
  const legend = container.querySelector(".wr-legend");
  const thead  = container.querySelector("#wr-thead");
  const tbody  = container.querySelector("#wr-table-body");

  function getBasePulls(phaseId) {
    const all = allPulls(boss);
    if (phaseId === "" || phaseId == null) return all;
    return all.filter((p) => p.phase != null && String(p.phase) === String(phaseId));
  }

  function update(reasonId, phaseId = phaseSelect?.value ?? "") {
    const basePulls = getBasePulls(phaseId);

    if (reasonId && reasonsWithPlayers.has(reasonId)) {
      // ── Player distribution view ──────────────────────────────────────────
      const reasonPulls = basePulls.filter((p) => resolvePullReason(p).reasonId === reasonId);
      const playerData = buildPlayerData(reasonPulls, playerMap);
      const counts = playerData.map((d) => d.count);
      const totalCount = counts.reduce((s, v) => s + v, 0);

      if (chart) {
        chart.data.labels = playerData.map((d) => d.player.name);
        chart.data.datasets[0].data = counts;
        chart.data.datasets[0].backgroundColor = playerData.map((d) => playerColor(d) + "cc");
        chart.data.datasets[0].borderColor = playerData.map((d) => playerColor(d));
        chart.options.onClick = null;
        chart.options.onHover = (e) => { e.native.target.style.cursor = "default"; };
        chart.options.plugins.tooltip.callbacks.label =
          (item) => `${item.label}: ${item.raw} (${Math.round(item.raw / totalCount * 100)}%)`;
        chart.reset();
        chart.update();
      } else {
        chart = renderPlayerChart(canvas, playerData);
        if (chart) {
          const thisChart = chart;
          thisChart.options.animation = { duration: 0 };
          thisChart.update("none");
          new IntersectionObserver((entries, obs) => {
            if (entries[0].isIntersecting) {
              obs.disconnect();
              if (Chart.getChart(canvas) !== thisChart) return;
              delete thisChart.options.animation;
              thisChart.reset();
              thisChart.update();
            }
          }, { threshold: 0.2 }).observe(canvas);
        }
      }

      renderPlayerLegend(legend, playerData);
      thead.innerHTML = `<tr><th>Player</th><th>Count</th><th>%</th></tr>`;
      renderPlayerTable(tbody, playerData);
    } else {
      // ── Reason distribution view ──────────────────────────────────────────
      const { total, reasons } = calcReasons(basePulls, boss.wipeReasons);
      const onSliceClick = (clickedId) => {
        if (!filterableReasons.some((r) => r.id === clickedId)) return;
        const next = filterSelect.value === clickedId ? "" : clickedId;
        filterSelect.value = next;
        update(next);
      };

      if (chart) {
        chart.data.labels = reasons.map((r) => r.label);
        chart.data.datasets[0].data = reasons.map((r) => r.count);
        chart.data.datasets[0].backgroundColor = reasons.map((r) => r.color + "cc");
        chart.data.datasets[0].borderColor = reasons.map((r) => r.color);
        chart.options.onClick = (_, elements) => { if (elements.length) onSliceClick(reasons[elements[0].index].id); };
        chart.options.onHover = (e, elements) => {
          const idx = elements[0]?.index;
          e.native.target.style.cursor =
            elements.length && filterableReasons.some((r) => r.id === reasons[idx]?.id) ? "pointer" : "default";
        };
        chart.options.plugins.tooltip.callbacks.label =
          (item) => `${item.label}: ${item.raw} pulls (${Math.round(item.raw / total * 100)}%)`;
        chart.reset();
        chart.update();
      } else {
        chart = renderReasonChart(canvas, reasons, total, onSliceClick);
        if (chart) {
          const thisChart = chart;
          thisChart.options.animation = { duration: 0 };
          thisChart.update("none");
          new IntersectionObserver((entries, obs) => {
            if (entries[0].isIntersecting) {
              obs.disconnect();
              if (Chart.getChart(canvas) !== thisChart) return;
              delete thisChart.options.animation;
              thisChart.reset();
              thisChart.update();
            }
          }, { threshold: 0.2 }).observe(canvas);
        }
      }

      renderReasonLegend(legend, reasons);
      thead.innerHTML = `<tr><th>Reason</th><th>Count</th><th>%</th></tr>`;
      renderReasonTable(tbody, reasons, total);
    }
  }

  filterSelect.addEventListener("change", (e) => update(e.target.value));
  phaseSelect?.addEventListener("change", () => update(filterSelect.value));
  update("");
}

// ── Data helpers ─────────────────────────────────────────────────────────────

function calcReasons(pulls, wipeReasons) {
  const total = pulls.length;
  const counts = new Map();
  for (const pull of pulls) {
    const r = resolvePullReason(pull);
    counts.set(r.reasonId, (counts.get(r.reasonId) || 0) + 1);
  }
  const reasons = (wipeReasons || [])
    .map((r) => ({
      ...r,
      count: counts.get(r.id) || 0,
      percent: total > 0 ? Math.round((counts.get(r.id) || 0) / total * 1000) / 10 : 0
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  return { total, reasons };
}

function buildPlayerData(reasonPulls, playerMap) {
  const byPlayer = new Map();
  let unassigned = 0;
  for (const pull of reasonPulls) {
    const playerId = pull.manualWipeReason?.playerId || pull.autoWipeReason?.playerId;
    if (!playerId) { unassigned++; continue; }
    byPlayer.set(playerId, (byPlayer.get(playerId) || 0) + 1);
  }
  const base = reasonPulls.length;
  const result = [...byPlayer.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      player: playerMap.get(id) || { id, name: id, class: null },
      count,
      percent: Math.round(count / base * 1000) / 10
    }));
  if (unassigned > 0) {
    result.push({
      player: { id: "unassigned", name: "Unknown", class: null },
      count: unassigned,
      percent: Math.round(unassigned / base * 1000) / 10,
      isUnassigned: true
    });
  }
  return result;
}

// ── Reason view ───────────────────────────────────────────────────────────────

function renderReasonChart(canvas, reasons, total, onSliceClick) {
  if (!reasons.length) return null;
  return new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: reasons.map((r) => r.label),
      datasets: [{ data: reasons.map((r) => r.count), backgroundColor: reasons.map((r) => r.color + "cc"), borderColor: reasons.map((r) => r.color), borderWidth: 2 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: (_, elements) => { if (elements.length) onSliceClick(reasons[elements[0].index].id); },
      onHover: (e, elements) => { e.native.target.style.cursor = elements.length ? "pointer" : "default"; },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (item) => `${item.label}: ${item.raw} pulls (${Math.round(item.raw / total * 100)}%)` } }
      },
      cutout: "65%"
    }
  });
}

function renderReasonLegend(container, reasons) {
  container.innerHTML = reasons
    .map((r) => `<span class="legend-item"><span class="legend-dot" style="background:${r.color}"></span>${r.label} <span class="legend-pct">${r.percent}%</span></span>`)
    .join("");
}

function renderReasonTable(tbody, reasons, total) {
  tbody.innerHTML = reasons.map((r) => `
    <tr>
      <td><span class="dot" style="background:${r.color}"></span> ${r.label}</td>
      <td>${r.count}</td>
      <td class="pct-cell">${r.percent}%</td>
    </tr>`).join("") || `<tr><td colspan="3" class="no-data">No data</td></tr>`;
}

// ── Player view ───────────────────────────────────────────────────────────────

function playerColor(d) {
  return d.isUnassigned ? "#6b7280" : getPlayerColor(d.player);
}

function renderPlayerChart(canvas, playerData) {
  if (!playerData.length) return null;
  const totalCount = playerData.reduce((s, d) => s + d.count, 0);
  return new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: playerData.map((d) => d.player.name),
      datasets: [{
        data: playerData.map((d) => d.count),
        backgroundColor: playerData.map((d) => playerColor(d) + "cc"),
        borderColor: playerData.map((d) => playerColor(d)),
        borderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (item) => `${item.label}: ${item.raw} (${Math.round(item.raw / totalCount * 100)}%)` } }
      },
      cutout: "65%"
    }
  });
}

function renderPlayerLegend(container, playerData) {
  container.innerHTML = playerData
    .map((d) => `<span class="legend-item"><span class="legend-dot" style="background:${playerColor(d)}"></span>${d.player.name} <span class="legend-pct">${d.percent}%</span></span>`)
    .join("");
}

function renderPlayerTable(tbody, playerData) {
  tbody.innerHTML = playerData.map((d) => `
    <tr>
      <td><span class="class-dot" style="background:${playerColor(d)}"></span> ${d.player.name}</td>
      <td>${d.count}</td>
      <td class="pct-cell">${d.percent}%</td>
    </tr>`).join("") || `<tr><td colspan="3" class="no-data">No player assignments for this reason.</td></tr>`;
}
