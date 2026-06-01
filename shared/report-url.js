const WCL_BASE = "https://www.warcraftlogs.com";

export function parseWarcraftLogsReportUrl(url) {
  const match = String(url).match(/warcraftlogs\.com\/reports\/([A-Za-z0-9]+)/);
  const reportCode = match?.[1] || url.trim();
  return { reportCode, url: `${WCL_BASE}/reports/${reportCode}` };
}

export function buildFightUrl(reportCode, fightId) {
  return `${WCL_BASE}/reports/${reportCode}#fight=${fightId}`;
}

export function buildReportUrl(reportCode) {
  return `${WCL_BASE}/reports/${reportCode}`;
}
