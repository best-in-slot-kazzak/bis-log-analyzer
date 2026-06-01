export const WOW_CLASS_COLORS = {
  "Death Knight": "#c41e3a", "Demon Hunter": "#a330c9", Druid: "#ff7c0a", Evoker: "#33937f",
  Hunter: "#aad372", Mage: "#3fc7eb", Monk: "#00ff98", Paladin: "#f48cba",
  Priest: "#ffffff", Rogue: "#fff468", Shaman: "#0070dd", Warlock: "#8788ee", Warrior: "#c69b6d"
};

// Handles both API format ("DeathKnight") and display format ("Death Knight")
export function resolveClass(cls) {
  return cls?.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export const UNKNOWN_REASON_ID = "unknown";

export function resolvePullReason(pull) {
  return pull?.manualWipeReason || pull?.autoWipeReason || { reasonId: UNKNOWN_REASON_ID, playerId: null, source: "default" };
}

export function allPulls(boss) {
  return (boss.reports || []).flatMap((r) => r.pulls || []);
}

export function getPlayerColor(player) {
  return WOW_CLASS_COLORS[resolveClass(player?.class)] || WOW_CLASS_COLORS[player?.class] || "#d1d5db";
}

export function phaseLabel(phase, phaseMap) {
  if (phase == null) return "?";
  if (phaseMap?.length) {
    const idx = phaseMap.findIndex((p) => p.id === phase);
    if (idx !== -1) {
      const entry = phaseMap[idx];
      const rank = phaseMap.slice(0, idx + 1).filter((p) => p.isIntermission === entry.isIntermission).length;
      return entry.isIntermission ? `I${rank}` : `P${rank}`;
    }
  }
  return `P${phase + 1}`;
}

export function formatNumber(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

// ── Twitch VOD helpers ────────────────────────────────────────────────────────
// A report optionally stores a full Twitch URL pointing at its first pull, e.g.
// https://www.twitch.tv/videos/2774378456?t=00h28m25s — we parse base URL +
// start offset, then add each pull's offset relative to the first pull.

export function parseTwitchVod(url) {
  if (!url) return null;
  const trimmed = String(url).trim();
  const idMatch = trimmed.match(/twitch\.tv\/videos\/(\d+)/i);
  if (!idMatch) return null;
  const videoId = idMatch[1];
  const tMatch = trimmed.match(/[?&]t=([^&]+)/i);
  return {
    videoId,
    baseUrl: `https://www.twitch.tv/videos/${videoId}`,
    startSeconds: tMatch ? parseTwitchTime(tMatch[1]) : 0
  };
}

export function parseTwitchTime(t) {
  if (t == null) return 0;
  const s = String(t).trim();
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (m && (m[1] || m[2] || m[3])) {
    return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
  }
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

export function formatTwitchTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}m${String(s).padStart(2, "0")}s`;
}

export function firstPullOf(report) {
  const pulls = report?.pulls || [];
  if (!pulls.length) return null;
  return pulls.reduce((a, b) => (new Date(a.startedAt) <= new Date(b.startedAt) ? a : b));
}

export function buildPullVodUrl(vodUrl, pull, firstPull) {
  const parsed = parseTwitchVod(vodUrl);
  if (!parsed || !pull?.startedAt || !firstPull?.startedAt) return null;
  const offsetSec = (new Date(pull.startedAt) - new Date(firstPull.startedAt)) / 1000;
  if (!Number.isFinite(offsetSec)) return null;
  const total = parsed.startSeconds + Math.max(0, offsetSec);
  return `${parsed.baseUrl}?t=${formatTwitchTime(total)}`;
}
