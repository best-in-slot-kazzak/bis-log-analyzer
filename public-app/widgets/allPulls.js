import { resolvePullReason, phaseLabel, getPlayerColor, buildPullVodUrl, firstPullOf, UNKNOWN_REASON_ID } from "./utils.js";

// "All Pulls" widget — a grid of every pull, showing the wipe reason, how far
// the raid got (phase + boss HP%), and a deep-link to the WCL log for that pull.
export function renderAllPulls(container, boss, players) {
  // Keep report code/name + VOD link on each pull so we can deep-link to WCL
  // and (if a VOD is configured for the report) to the exact pull in the VOD.
  const pulls = (boss.reports || [])
    .flatMap((r) => {
      const firstPull = firstPullOf(r);
      return (r.pulls || []).map((p) => ({
        ...p,
        reportCode: r.code,
        reportName: r.name,
        vodUrl: r.vodUrl ? buildPullVodUrl(r.vodUrl, p, firstPull) : null
      }));
    })
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));

  // Hide the widget entirely when there is nothing to show.
  if (!pulls.length) return false;

  const phaseMap   = boss.phaseMap || [];
  const reasonMap  = new Map((boss.wipeReasons || []).map((r) => [r.id, r]));
  const playerMap  = new Map((players || []).map((p) => [p.id, p]));
  const unknown    = reasonMap.get(UNKNOWN_REASON_ID) || { label: "Unknown", color: "#6b7280" };

  // Number the pulls 1..N in chronological order (independent of WCL fight id).
  const cards = pulls.map((pull, idx) => {
    const resolved = resolvePullReason(pull);
    const reason  = reasonMap.get(resolved.reasonId) || unknown;
    const phase   = phaseLabel(pull.phase, phaseMap);

    // The player blamed for this wipe (manual assignment wins over auto), if any.
    const player  = resolved.playerId ? playerMap.get(resolved.playerId) : null;
    const playerHtml = player
      ? `<div class="ap-player" style="color:${getPlayerColor(player)}">${player.name}</div>`
      : "";
    const hp      = pull.bossHpPercent != null ? `${pull.bossHpPercent}%` : "—";
    const url     = pull.reportCode
      ? `https://www.warcraftlogs.com/reports/${pull.reportCode}#fight=${pull.fightId}`
      : null;
    const linkBtn = url
      ? `<a class="ap-wcl" href="${url}" target="_blank" rel="noopener noreferrer" title="Open fight #${pull.fightId} on Warcraft Logs">WCL ↗</a>`
      : `<span class="ap-wcl ap-wcl-disabled" title="No report link available">WCL</span>`;
    const vodBtn = pull.vodUrl
      ? `<a class="ap-vod" href="${pull.vodUrl}" target="_blank" rel="noopener noreferrer" title="Diesen Pull im VOD öffnen">▶ VOD</a>`
      : "";

    return `
      <div class="ap-card">
        <div class="ap-card-top">
          <span class="ap-num">#${idx + 1}</span>
          <span class="ap-links">${vodBtn}${linkBtn}</span>
        </div>
        <div class="ap-reason">
          <span class="ap-dot" style="background:${reason.color}"></span>
          <span class="ap-reason-label">${reason.label}</span>
        </div>
        ${playerHtml}
        <div class="ap-progress">
          <span class="ap-phase">${phase}</span>
          <span class="ap-sep">·</span>
          <span class="ap-hp">${hp} HP</span>
        </div>
      </div>`;
  }).join("");

  container.innerHTML = `
    <div class="ap-summary">${pulls.length} pull${pulls.length !== 1 ? "s" : ""}</div>
    <div class="ap-grid">${cards}</div>
  `;
}
