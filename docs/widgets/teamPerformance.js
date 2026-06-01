import { phaseLabel } from "./utils.js";

// Regular phases: blue → purple → cyan → emerald → pink
// Intermissions:  amber → orange  (visually distinct from regular phases)
const PHASE_COLORS        = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f472b6"];
const INTERMISSION_COLORS = ["#f59e0b", "#f97316"];

export function renderTeamPerformance(container, boss, players) {
  // Keep the report code on each pull so the best pull can deep-link to WCL.
  const pulls = (boss.reports || [])
    .flatMap((r) => (r.pulls || []).map((p) => ({ ...p, reportCode: r.code })))
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
  if (!pulls.length) { container.innerHTML = "<p class='no-data'>No pull data available.</p>"; return; }

  const phaseMap = boss.phaseMap || [];
  const bestPull  = findBestPull(pulls);
  const reportCount = boss.reports?.length || 0;

  const bestPhase = phaseLabel(bestPull.phase, phaseMap);
  const bestHp    = bestPull.bossHpPercent != null ? bestPull.bossHpPercent + "%" : "—";

  const pullLabel = `Pull #${bestPull.fightId}`;
  const pullHtml  = bestPull.reportCode
    ? `<a class="tp-best-link" href="https://www.warcraftlogs.com/reports/${bestPull.reportCode}#fight=${bestPull.fightId}" target="_blank" rel="noopener noreferrer">${pullLabel}</a>`
    : pullLabel;

  container.innerHTML = `
    <div class="tp-best-card">
      <div class="tp-best-label">Best Pull</div>
      <div class="tp-best-main">
        <span class="tp-best-phase">${bestPhase}</span>
        <span class="tp-best-sep">·</span>
        <span class="tp-best-hp">${bestHp} HP</span>
      </div>
      <div class="tp-best-meta">${pullHtml} · ${pulls.length} pulls across ${reportCount} report${reportCount !== 1 ? "s" : ""}</div>
    </div>
    <h4 class="tp-chart-title">Phase Distribution</h4>
    <div class="chart-container chart-phase"><canvas id="tp-phase-chart"></canvas></div>
    <div class="tp-trend" id="tp-trend"></div>
  `;

  // Shared phase ordering + colors so chart and trend line up exactly.
  const { phases } = computePhaseOrder(pulls);
  const labels = phases.map(p => p == null ? "?" : phaseLabel(p, phaseMap));
  const colors = phaseColors(phases, phaseMap);

  renderPhaseDistribution(container.querySelector("#tp-phase-chart"), pulls, phases, labels, colors);

  // Trend only makes sense when comparing multiple reports.
  const reports = boss.reports || [];
  if (reports.length > 1) {
    renderPhaseTrend(container.querySelector("#tp-trend"), reports, phases, labels, colors);
  } else {
    container.querySelector("#tp-trend").remove();
  }
}

// Best pull = highest phase first; within same phase, lowest boss HP% wins.
function findBestPull(pulls) {
  return pulls.reduce((best, pull) => {
    if (!best) return pull;
    const pa = pull.phase ?? -1;
    const pb = best.phase ?? -1;
    if (pa !== pb) return pa > pb ? pull : best;
    const ha = pull.bossHpPercent ?? 100;
    const hb = best.bossHpPercent ?? 100;
    return ha < hb ? pull : best;
  }, null);
}

// Ordered list of phases that occur in the given pulls (null/unknown first).
function computePhaseOrder(pulls) {
  const phaseCounts = new Map();
  for (const pull of pulls) {
    const p = pull.phase ?? null;
    phaseCounts.set(p, (phaseCounts.get(p) || 0) + 1);
  }
  const phases = [...phaseCounts.keys()].sort((a, b) => {
    if (a == null) return -1;
    if (b == null) return 1;
    return a - b;
  });
  return { phases, phaseCounts };
}

function phaseColors(phases, phaseMap) {
  let phaseIdx = 0, intermIdx = 0;
  return phases.map(p => {
    if (p == null) return "#6b7280";
    const entry = phaseMap.find(e => e.id === p);
    if (entry?.isIntermission) return INTERMISSION_COLORS[intermIdx++ % INTERMISSION_COLORS.length];
    return PHASE_COLORS[phaseIdx++ % PHASE_COLORS.length];
  });
}

// Share (%) of pulls that ended in each phase, for a single set of pulls.
function phaseShares(pulls, phases) {
  const total = pulls.length;
  return phases.map((p) => {
    if (!total) return 0;
    const c = pulls.filter((pull) => (pull.phase ?? null) === p).length;
    return Math.round(c / total * 1000) / 10;
  });
}

function renderPhaseDistribution(canvas, pulls, phases, labels, colors) {
  const total  = pulls.length;
  const counts = phases.map(p => pulls.filter(pull => (pull.phase ?? null) === p).length);
  const data   = phaseShares(pulls, phases);

  new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "% of pulls",
        data,
        backgroundColor: colors.map(c => c + "bb"),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => {
              const count = counts[item.dataIndex];
              return `${item.raw}% of pulls — ${count} of ${total}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#7d8590", font: { size: 13, weight: "600" } },
          grid:  { color: "#21262d" }
        },
        y: {
          title: { display: true, text: "% of pulls", color: "#7d8590" },
          min: 0,
          max: 100,
          ticks: {
            color: "#7d8590",
            callback: v => v + "%"
          },
          grid: { color: "#21262d" }
        }
      }
    }
  });
}

// Per-report phase-share trend across the selected reports (oldest → newest).
// One chip per phase: label, sparkline, and the net delta first→last report.
function renderPhaseTrend(container, reports, phases, labels, colors) {
  // series[phaseIdx] = [share in report 0, share in report 1, ...]
  const series = phases.map(() => []);
  for (const report of reports) {
    const shares = phaseShares(report.pulls || [], phases);
    shares.forEach((s, i) => series[i].push(s));
  }

  const NEUTRAL = 1; // percentage points considered "no real change"

  const chips = phases.map((p, i) => {
    const s = series[i];
    const first = s[0] ?? 0;
    const last  = s[s.length - 1] ?? 0;
    const delta = Math.round((last - first) * 10) / 10;

    let dir, dirCls;
    if (delta > NEUTRAL)       { dir = "▲"; dirCls = "up"; }
    else if (delta < -NEUTRAL) { dir = "▼"; dirCls = "down"; }
    else                       { dir = "→"; dirCls = "flat"; }
    const sign = delta > 0 ? "+" : "";
    const deltaLabel = `${dir} ${sign}${delta}%`;

    // Tooltip: per-report values so the auto-scaled sparkline isn't misleading.
    const tip = reports
      .map((r, ri) => `${r.name || "Report " + (ri + 1)}: ${s[ri]}%`)
      .join("\n");

    return `
      <div class="tp-trend-chip" title="${escapeAttr(tip)}">
        <span class="tp-trend-label" style="color:${colors[i]}">${labels[i]}</span>
        ${sparkline(s, colors[i])}
        <span class="tp-trend-delta ${dirCls}">${deltaLabel}</span>
      </div>`;
  });

  container.innerHTML = `
    <div class="tp-trend-caption">Trend across ${reports.length} reports · oldest → newest</div>
    <div class="tp-trend-row">${chips.join("")}</div>`;
}

// Responsive inline sparkline. Uses a fixed logical viewBox stretched to the
// chip's width (preserveAspectRatio="none"); a non-scaling stroke keeps the
// line crisp regardless of how wide the chip gets. Auto-scaled to its own
// min/max so small changes stay visible.
function sparkline(values, color) {
  const W = 200, H = 38, pad = 4;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = hi - lo || 1;
  const n = values.length;

  const coords = values.map((v, i) => {
    const x = n === 1 ? W / 2 : pad + (i / (n - 1)) * (W - 2 * pad);
    const y = H - pad - ((v - lo) / range) * (H - 2 * pad);
    return [x, y];
  });
  const points = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = coords[coords.length - 1];

  return `
    <svg class="tp-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"
                stroke-linejoin="round" stroke-linecap="round" opacity="0.9"
                vector-effect="non-scaling-stroke"/>
      <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.6" fill="${color}"
              vector-effect="non-scaling-stroke"/>
    </svg>`;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "&#10;");
}
