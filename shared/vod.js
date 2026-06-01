// Twitch VOD helpers.
//
// A report optionally stores a full Twitch VOD URL that points at the *first
// pull* of that report, e.g.
//   https://www.twitch.tv/videos/2774378456?t=00h28m25s
// From it we parse the base video URL + the start offset (seconds). For any
// other pull we add its log-time offset relative to the first pull, so the
// link jumps to that exact pull in the VOD.

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

// Accepts "00h28m25s", "28m25s", "1705s" or a plain number of seconds.
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

// Earliest pull of a report (the "first pull" used as the time reference).
export function firstPullOf(report) {
  const pulls = report?.pulls || [];
  if (!pulls.length) return null;
  return pulls.reduce((a, b) => (new Date(a.startedAt) <= new Date(b.startedAt) ? a : b));
}

// Build the VOD deep-link for a specific pull. Returns null when there is no
// valid VOD URL or the timing data is missing.
export function buildPullVodUrl(vodUrl, pull, firstPull) {
  const parsed = parseTwitchVod(vodUrl);
  if (!parsed || !pull?.startedAt || !firstPull?.startedAt) return null;
  const offsetSec = (new Date(pull.startedAt) - new Date(firstPull.startedAt)) / 1000;
  if (!Number.isFinite(offsetSec)) return null;
  const total = parsed.startSeconds + Math.max(0, offsetSec);
  return `${parsed.baseUrl}?t=${formatTwitchTime(total)}`;
}
