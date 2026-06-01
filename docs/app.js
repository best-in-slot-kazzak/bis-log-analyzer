import { renderTeamPerformance } from "./widgets/teamPerformance.js";
import { renderWipeReasons } from "./widgets/wipeReasons.js";
import { renderPlayerReview } from "./widgets/playerReview.js";
import { renderDeathHeatmap } from "./widgets/deathHeatmap.js";
import { renderAllPulls } from "./widgets/allPulls.js";
import { renderTimeline } from "./timeline.js";
import { initBackground } from "./backgrounds.js";

const WIDGET_RENDERERS = {
  teamPerformance: renderTeamPerformance,
  wipeReasons: renderWipeReasons,
  playerReview: renderPlayerReview,
  deathHeatmap: renderDeathHeatmap,
  allPulls: renderAllPulls
};

function init() {
  initBackground();

  if (window.__dataLoadError || !window.WCL_DASHBOARD_DATA) {
    document.getElementById("app").innerHTML = `
      <div class="error-state">
        <h2>No data found</h2>
        <p>Export <code>data.js</code> from the admin app and place it next to <code>index.html</code>.</p>
      </div>`;
    return;
  }

  const data = window.WCL_DASHBOARD_DATA;
  const bosses = data.bosses || [];
  const players = data.players || [];

  if (!bosses.length) {
    document.getElementById("app").innerHTML = "<p class='no-data'>No boss data found.</p>";
    return;
  }

  const bossSelect = document.getElementById("boss-select");
  for (const boss of bosses) {
    const opt = document.createElement("option");
    opt.value = boss.id;
    opt.textContent = `${boss.name} ${boss.difficulty}`;
    bossSelect.appendChild(opt);
  }

  const timelineEl = document.getElementById("report-timeline");

  function renderBoss(bossId) {
    const boss = bosses.find((b) => b.id === bossId);
    if (!boss) return;
    document.title = `${boss.name} — BISWCL`;
    renderTimeline(timelineEl, boss, (selectedReports) => {
      const savedScroll = window.scrollY;
      renderWidgets({ ...boss, reports: selectedReports }, players);
      window.scrollTo({ top: savedScroll, behavior: "instant" });
    });
  }

  bossSelect.addEventListener("change", (e) => renderBoss(e.target.value));
  renderBoss(bosses[0].id);
}

function renderWidgets(boss, players) {
  const app = document.getElementById("app");
  // Destroy all active Chart.js instances before clearing the DOM
  app.querySelectorAll("canvas").forEach((c) => { const ch = Chart.getChart(c); if (ch) ch.destroy(); });
  app.innerHTML = "";

  // Boss hero header
  const hero = document.createElement("div");
  hero.className = "boss-hero";
  hero.innerHTML = boss.imageUrl
    ? `<img src="${boss.imageUrl}" class="boss-hero-img" alt="${boss.name}">`
    : `<div class="boss-hero-placeholder"><span>${boss.name[0]}</span></div>`;
  hero.innerHTML += `<div class="boss-hero-info"><h2 class="boss-hero-name">${boss.name}</h2><span class="boss-hero-diff">${boss.difficulty}</span></div>`;
  app.appendChild(hero);

  const widgets = [...(boss.widgets || [])].filter((w) => w.enabled).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  if (!widgets.length) {
    app.innerHTML += "<p class='no-data'>No widgets enabled for this boss.</p>";
    return;
  }

  for (const widget of widgets) {
    const renderer = WIDGET_RENDERERS[widget.type];
    if (!renderer) continue;

    // Some widgets (e.g. the long "All Pulls" list) start collapsed by default.
    const startCollapsed = widget.type === "allPulls";

    const section = document.createElement("section");
    section.className = "widget-section" + (startCollapsed ? " collapsed" : "");
    section.innerHTML = `
      <button class="widget-header" type="button" aria-expanded="${startCollapsed ? "false" : "true"}">
        <h2 class="widget-title">${widget.title}</h2>
        <span class="widget-chevron" aria-hidden="true"></span>
      </button>
      <div class="widget-body"></div>
    `;
    app.appendChild(section);

    // Collapsible: clicking the header toggles the widget body.
    const header = section.querySelector(".widget-header");
    header.addEventListener("click", () => {
      const collapsed = section.classList.toggle("collapsed");
      header.setAttribute("aria-expanded", String(!collapsed));
    });

    try {
      const result = renderer(section.querySelector(".widget-body"), boss, players);
      // Renderers may return false to signal "no data — hide me entirely"
      if (result === false) section.remove();
    } catch (err) {
      section.querySelector(".widget-body").innerHTML = `<p class="error-msg">Widget error: ${err.message}</p>`;
      console.error(`Widget "${widget.type}" error:`, err);
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
