import { phaseLabel } from "./utils.js";

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
  `;

  renderPhaseDistribution(container.querySelector("#tp-phase-chart"), pulls, phaseMap);
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

function renderPhaseDistribution(canvas, pulls, phaseMap) {
  // Count how many pulls ended in each phase
  const phaseCounts = new Map();
  for (const pull of pulls) {
    const p = pull.phase ?? null;
    phaseCounts.set(p, (phaseCounts.get(p) || 0) + 1);
  }

  // Sort by absoluteIndex value; null (unknown) goes to front
  const phases = [...phaseCounts.keys()].sort((a, b) => {
    if (a == null) return -1;
    if (b == null) return 1;
    return a - b;
  });

  const total  = pulls.length;
  const labels = phases.map(p => p == null ? "?" : phaseLabel(p, phaseMap));
  const counts = phases.map(p => phaseCounts.get(p));
  const data   = counts.map(c => Math.round(c / total * 1000) / 10); // one decimal

  // Regular phases: blue → purple → cyan → emerald → pink
  // Intermissions:  amber → orange  (visually distinct from regular phases)
  const PHASE_COLORS        = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f472b6"];
  const INTERMISSION_COLORS = ["#f59e0b", "#f97316"];
  let phaseIdx = 0, intermIdx = 0;
  const colors = phases.map(p => {
    if (p == null) return "#6b7280";
    const entry = phaseMap.find(e => e.id === p);
    if (entry?.isIntermission) return INTERMISSION_COLORS[intermIdx++ % INTERMISSION_COLORS.length];
    return PHASE_COLORS[phaseIdx++ % PHASE_COLORS.length];
  });

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
